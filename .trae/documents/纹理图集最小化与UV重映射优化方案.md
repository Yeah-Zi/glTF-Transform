## 目标
- 当某页图集只使用了部分区域时，将该页纹理尺寸缩减到最小覆盖范围（含安全边距），并据此重新计算/写入 KHR_texture_transform 的 offset、scale、rotation。
- 保留现有按贴图类型拆分、MaxRects 打包与外链 .gltf 输出模式的兼容性。

## 代码改动
### packages/functions/src/texture-atlas.ts
1) 新增选项 shrink:boolean，默认 true。
2) 每页 placed 计算完成后统计使用边界：
   - usedW = max(drawX + drawW)，usedH = max(drawY + drawH)
   - outerPadding = options.padding
   - finalW = clampMin(4, usedW + outerPadding)，finalH = clampMin(4, usedH + outerPadding)
   - 若 options.pow2=true，finalW/H = ceilPowerOfTwo(finalW/H)
3) 合成：以 finalW/finalH 创建 Sharp 底图；overlays 使用既有 left/top 与旋转逻辑；输出到目标格式。
4) UV 重映射：computeUV 统一使用每页的 finalW/finalH；写入 offset/scale；若旋转则 rotation=π/2 保持一致。
5) URI：沿用现有命名（type-atlas_index.ext），.gltf 模式下写出裁剪后的图像文件。
6) 清理：保留已实现的“替换后无引用纹理 dispose”逻辑，确保原始图像不再写出。

### packages/cli/src/cli.ts
1) atlas 命令新增 --shrink <bool>（默认 true），传入到变换。

## 算法与细节
- “最小覆盖范围”以已放置项的 drawX/drawY/drawW/drawH 采样边界计算，不对项坐标做再平移，避免误差。
- POT 模式下，缩至最近向上 POT；非 POT 模式下使用紧致尺寸。
- 旋转项的 UV 继续使用 rotation=π/2，offset/scale 按缩减后的尺寸重新归一化。
- 安全边距：finalW/H 在 usedW/H 的基础上加 outerPadding，避免边缘采样误差。

## 测试与验证
- 新增/扩展单测：
  - 多尺寸纹理输入，验证每页 finalW/H < maxSize 且正确；offset/scale/rotation 写入正确。
  - pow2=true 时 finalW/H 为 POT；pow2=false 时为紧致尺寸。
  - 启用 shrink=false 行为与当前一致（固定画布）。
- CLI 验证（.gltf 外链）：生成 atlas 后检查输出图集尺寸已缩减，原始图像不再写出。

## 兼容与回退
- shrink=false 时完全保持现有行为。
- 不改变类型分组与色彩空间约束；原生 KTX2 输入仍按现有策略处理/跳过警告。

## 交付物
- 代码：texture-atlas.ts、cli.ts 选项更新。
- 测试：packages/functions/src/__tests__/texture-atlas.spec.ts 扩展用例。
- 文档：在 docs/functions.md 中补充 shrink/pow2 行为说明与示例。