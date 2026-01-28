## 目标与范围
- 为 glTF-Transform 增加一个函数库级变换：将同一 glTF 中多张纹理按“贴图类型”分别合并为多个图集（baseColor、normal、metallicRoughness、occlusion、emissive 等）。
- 自动更新材质对新图集的引用，并进行 UV 重映射（默认使用 KHR_texture_transform 的 offset/scale，支持几何 UV 改写）。
- 兼容现有函数库与 CLI 执行管线，可选图像格式与压缩策略，保证色彩空间与通道语义正确。

## API 设计
- Node API（与现有 transforms 一致）：
  - export：packages/functions/src/texture-atlas.ts（命名：textureAtlas）并在 functions/index.ts 导出。
  - 调用示例：

    ```ts
    import { textureAtlas } from '@gltf-transform/functions';

    await document.transform(textureAtlas({
      types: ['baseColor', 'normal', 'metallicRoughness', 'occlusion', 'emissive'],
      maxSize: 4096,
      padding: 2,
      rotate: false,
      pow2: true,
      remap: 'texture_transform', // 或 'geometry'
      filter: { include: /.*/, exclude: null },
      format: { mimeType: 'image/png' },
      gutterStrategy: 'duplicate-edge',
    }));
    ```
- 选项说明：
  - types：需要合并的贴图类型集合，按材质槽位拆分 atlas。
  - maxSize / pow2 / padding / rotate：图集尺寸、对齐、留边、旋转策略（默认不旋转）。
  - remap：UV 重映射策略（texture_transform 为默认；geometry 重写 TEXCOORD）。
  - filter：按纹理名称/URI/材质槽位正则过滤要打包的纹理。
  - format：图集输出格式（PNG/WebP/AVIF/KTX2 前置解码→再合成→按需重新压缩）。
  - gutterStrategy：防止 mip 级别串色的边缘处理方式。

## CLI 集成
- 在 packages/cli/src/transforms/ 目录新增 atlas.ts，注册到 CLI：packages/cli/src/transforms/index.ts 与 cli.ts。
- 示例：
  - gltf-transform atlas input.glb output.glb --types baseColor,normal --max-size 4096 --padding 2 --remap texture_transform --format png
- 复用 Session 管线：读取→document.transform(textureAtlas(...))→写出。

## 贴图类型与通道语义
- 分组规则：
  - baseColor / emissive：sRGB；normal / metallicRoughness / occlusion：线性。
  - metallicRoughness：保持 G=Roughness, B=Metallic；若 occlusion 与其共用同一 image，按引用关系一并打包但不混淆通道。
- 纹理选择：以 Texture → Image 归一，基于依赖图父边（材质槽位）与 listTextureChannels/listTextureSlots 判定类型与通道掩码。

## 图像读取与合成
- Node 环境：优先使用现有 sharp 管线（参考 texture-compress），保证跨平台一致性；Web 环境使用 ndarray-pixels + lanczos。
- 打包算法：MaxRects（BestAreaFit/BestShortSideFit）+ 可选旋转，参照 TextureAtlas 子项目实现（MaxRectsBinPack）。
- 合成：按打包结果生成 atlas image（含 padding/gutter），输出为目标格式；更新 Document 中 Image/Texture/Sampler 引用。

## UV 重映射策略
- 默认 remap=texture_transform：
  - 为每个材质槽位开启 KHR_texture_transform 扩展，写入 offset/scale（必要时 rotation=false）。
  - 复用原 texCoord 索引；不修改几何。
- 备选 remap=geometry：
  - 为被影响的 Primitive 写入新的 TEXCOORD 集合，按打包结果归一化坐标；更新各槽位的 texCoord 引用。
  - 与 unwrap.ts 的写入方式保持一致，保证索引/属性同步。

## 采样器与边缘处理
- 统一采样器：优先 CLAMP_TO_EDGE，避免 atlas 边缘串色；如需保留原 sampler，给出警告并自动调整到安全值。
- padding/gutter：复制边缘像素或进行渐变外扩，确保 mip 下无缝。

## 兼容性与扩展管理
- 自动启用/注销：Document.createExtension('KHR_texture_transform')；写入使用标记与扩展清理。
- KTX2：若输入为 BasisU/KTX2，先解压到中间 PNG（参考 ktxdecompress）再合成；或直接跳过并警告使用者。
- 色彩空间：按 getTextureColorSpace 保持 sRGB/Linear，不进行跨空间拼合。

## 失败保护与回退
- 尺寸上限/超出：当合并后超过 maxSize，自动拆分为多页 atlas（atlas_0, atlas_1, ...）。
- 旋转兼容：默认禁用 rotation；如启用，仅在 texture_transform 流程下设置 rotation，否则回退不旋转。
- 保留原纹理：提供 keepOriginal 选项，便于比对/回退。

## 性能与内存
- 批量读取/写入：分类型分批；对大模型启用并行打包（按类型并行）。
- 统计输出：记录 atlas 页数、尺寸、VRAM 估算（getVRAMByteLength）。

## 验证与测试
- 单元测试：
  - 按类型输入多张不同尺寸纹理，验证 atlas 合成与 UV/offset/scale 正确。
  - 金丝雀用例：金属粗糙度通道保持、共享 image 的 occlusion 正确映射。
- 基准：参照 benchmarks/tasks/unwrap.bench.ts 结构新增 atlas 基准，评估时间与内存。
- 可视化：通过 packages/view 加载结果，核对图集与材质显示一致。

## 文档与示例
- 在 docs/functions.md 增加 textureAtlas 使用指南与注意事项（色彩空间/采样器/旋转）。
- 提供最小示例与 CLI 示例，展示分类型合并与 UV 重映射对比图。

## 代码参考与实现锚点
- 变换封装：createTransform（packages/functions/src/utils.ts）。
- 纹理分析：listTextureSlots/listTextureChannels/getTextureColorSpace（packages/functions/src/）。
- 图像处理：image-utils 与 texture-compress 流程（packages/core/src/utils/、packages/functions/src/）。
- UV 写入：unwrap.ts（几何方式对齐）。
- CLI 管线：cli.ts、session.ts、transforms/index.ts。
- 打包算法：TextureAtlas/MaxRectsBinPack 与 AtlasGenerator。

## 交付物
- 新增变换：packages/functions/src/texture-atlas.ts 与导出。
- CLI：packages/cli/src/transforms/atlas.ts 与命令注册。
- 测试与基准：packages/functions/src/__tests__/texture-atlas.spec.ts、benchmarks/tasks/atlas.bench.ts。
- 文档：docs/functions.md 更新与示例素材。