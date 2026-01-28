## 目标
- 当某页纹理图集仅使用了部分区域时，将图集尺寸缩减到“最小覆盖范围”，并据此重新计算并写入 KHR_texture_transform 的 offset/scale/rotation。
- 保留现有类型拆分与 MaxRects 打包流程，兼容 PNG/WebP/AVIF 与 .gltf 外链模式。

## 设计要点
- 每页图集在打包完成后，统计 placed 列表的使用边界：
  - usedW = max(drawX + drawW)
  - usedH = max(drawY + drawH)
  - 额外确保外边框安全：finalW = usedW + outerPadding，finalH = usedH + outerPadding（outerPadding 默认沿用 options.padding）。
- 构建底图与合成：
  - 以 finalW/finalH 创建 Sharp base；overlays 仍采用已计算的 left/top；无需平移。
  - 若 options.pow2=true，则对 finalW/finalH 应用 ceil POT（不再用 maxSize）。
- 重映射：
  - computeUV 统一改用 per-page 的 atlasW/atlasH=finalW/finalH；offset/scale 与 rotation（若旋转）一起写入。
- 选项
  - 新增 shrink:boolean（默认 true），控制是否最小化图集；保留 pow2/padding/rotate 等既有选项。
  - 保留当前图集 URI 命名策略，.gltf 模式下将按 URI 写出裁剪后的图像文件。

## 代码改动点
- packages/functions/src/texture-atlas.ts：
  1) 在每页 placed 计算结束后新增 usedW/usedH 统计与 finalW/finalH 决策（含 POT 操作）。
  2) 合成时用最终尺寸创建 base，并按该尺寸导出 buffer。
  3) computeUV 传入最终尺寸；保持 rotation=π/2 逻辑。
  4) 增加 shrink 选项默认值；文档注释补充说明。
- packages/cli/src/cli.ts：
  1) atlas 命令新增 --shrink <bool>，默认 true，传入 functions 变换。
- docs/functions.md：
  1) textureAtlas 使用指南补充“最小化图集”与 POT 行为说明。

## 测试与验证
- 单元测试（packages/functions/src/__tests__/texture-atlas.spec.ts）：
  - 构造多尺寸纹理输入，验证 per-page atlas 输出尺寸 < maxSize 且正确；offset/scale 与 rotation 写入正确。
  - 金丝雀：旋转项存在时 UV 显示正确；pow2=true 时最终尺寸为 POT；pow2=false 时为紧致尺寸。
- CLI 验证：
  - 运行 atlas 命令生成 .gltf 外链模式，确认 atlas 尺寸缩减且原始图像不再写出。

## 回退与兼容
- shrink=false 时行为与当前实现一致（使用固定画布大小）。
- 仍遵守类型拆分与色彩空间不混合的约束；图集资源命名与清理逻辑不变。

## 参考
- 变换实现：[texture-atlas.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/functions/src/texture-atlas.ts)
- CLI 命令：[cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts)
