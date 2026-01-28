# 目标
- 为每个 Material，将以下因子转换为“仅贴图表达”，并在存在贴图时与因子进行像素级混合后重新烘焙：
  - baseColorFactor → BaseColor Texture
  - emissiveFactor → Emissive Texture
  - metallicFactor/roughnessFactor → MetallicRoughness Texture（G=roughness，B=metallic）
- 默认完成烘焙后将因子重置为默认值（避免双重乘法），也可通过选项保留因子。

# API 设计
- 新增函数文件：packages/functions/src/bake-factors.ts
- 导出 Transform：bakeFactors(options?)，对 Document 中所有 Material 执行烘焙。
- 选项（建议）：
  - targets?: ("baseColor"|"emissive"|"metallicRoughness")[]（默认全部）
  - resolution?: "source" | "max" | {width:number,height:number}（默认：沿用源纹理尺寸；若仅因子无纹理则生成 1×1）
  - keepFactors?: boolean（默认 false，烘焙后重置为默认值）
  - mimeType?: "image/png" | "image/jpeg"（默认 PNG）
  - nameSuffix?: string（默认 "_baked"）

# 实现细节
- 通用像素处理：复用 [utils.ts → rewriteTexture](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/functions/src/utils.ts#L54-L79)
- 颜色空间工具：使用 [ColorUtils](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/core/src/utils/color-utils.ts#L20)
- 材质 API：读取/写入因子与纹理，参考 [material.ts（baseColor）](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/core/src/properties/material.ts#L183-L220)、[material.ts（金属粗糙）](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/core/src/properties/material.ts#L360-L407)
- 纹理元数据：尺寸、像素与类型，参考 [texture.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/core/src/properties/texture.ts#L44-L97) 与 [texture-info.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/core/src/properties/texture-info.ts#L91-L141)

# 混合与颜色空间规则
- baseColor：
  - 若存在 baseColorTexture 与 baseColorFactor（RGBA，线性），将贴图从 sRGB 转线性后按通道乘法，再转回 sRGB 输出；alpha 乘以 factor[3]。
  - 若仅因子存在：生成纯色 RGBA 纹理（sRGB），颜色来自线性→sRGB 的因子转换。
- emissive：
  - emissiveTexture 为 sRGB；emissiveFactor 为线性。处理同 baseColor（sRGB→线性乘法→sRGB）。
  - 若仅因子存在：生成纯色 sRGB 纹理。
- metallicRoughness：
  - 在线性空间处理；将 roughnessFactor 乘 G 通道、metallicFactor 乘 B 通道；保留 R（如有）与 A。
  - 若仅因子存在：生成 RGBA 纹理，像素为 [0, roughness, metallic, 1]。

# 尺寸与生成策略
- resolution:"source"：沿用源纹理尺寸（baseColor/emissive 从各自贴图；metal-rough 从金属粗糙贴图）。
- 若仅因子无源贴图：生成 1×1 纯色贴图，可通过 resolution 覆盖。
- resolution:"max"：当需要从多个来源合成时（一般不需要），选择参与纹理的最大尺寸并进行双线性采样。

# 纹理信息复制
- 若存在源 TextureInfo：复制 UV 通道、wrapS/T、filter、与 KHR_texture_transform（若使用），到新纹理的 TextureInfo。
- 贴图 MIME 类型与采样参数沿用或使用选项覆盖；名称加上 nameSuffix。

# 优化与一致性
- 若烘焙结果为单色，可选择保留贴图以满足“仅贴图表达”的目标；不做 prune 折叠。
- 通过去重：若多个 Material 产生完全相同的新贴图，可共享纹理实例以减少体积。

# 集成与导出
- 在 packages/functions/src/index.ts 中导出 bakeFactors。
- 提供 CLI 使用示例（与现有 transform 风格一致）：
  - gltf-transform bake-factors input.glb output.glb --targets baseColor emissive metallicRoughness --keepFactors=false

# 测试与验证
- 单元测试：
  - baseColor：sRGB 贴图 × 线性因子；验证像素乘法与 sRGB 往返精度。
  - emissive：同上。
  - metallicRoughness：验证 G/B 通道乘法与通道布局。
  - 因子-only：生成 1×1 纯色纹理；验证材质因子被重置或保留（依据 keepFactors）。
- 参考实现/像素通道操作范式：
  - [metal-rough.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/functions/src/metal-rough.ts#L85-L125)
  - [palette.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/functions/src/palette.ts#L220-L260)

# 边界与非目标
- 不覆盖扩展材质模型（如 KHR_materials_specular），仅限 PBR Metallic-Roughness。
- 不改变 UV/纹理坐标；不生成 mipmaps（保持与现有工具一致）。
- JPEG 输出可能引入色偏；默认使用 PNG。

# 交付内容
- 新增 bake-factors.ts（Transform + 像素处理逻辑 + 颜色空间转换）。
- 更新 index.ts 导出。
- 测试用例与文档注释（JSDoc + 简单 CLI 示例）。
