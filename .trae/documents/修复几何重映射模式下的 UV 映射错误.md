## 问题分析
- 同一材质常同时使用多个纹理槽位（如 baseColor、normal、metallicRoughness 等），且多数情况下共享同一 TEXCOORD 集（通常是 0）。
- 现有几何重映射实现为：对该 TEXCOORD 集（如 TEXCOORD_0）按各槽位的图集偏移/缩放依次写入，导致“最后一个槽位的写入覆盖前面的槽位”，从而出现某些槽位采样了错误的图集区域；而使用 KHR_texture_transform 时，每个槽位有独立的 offset/scale，因此不会互相覆盖。
- 另一个隐患是 Wrap 模式（REPEAT/MIRRORED_REPEAT/CLAMP）与 UV 范围的交互：几何烘焙需要在 [0,1] 归一化后再缩放和偏移，否则重复采样可能越过图集分区；而 KHR_texture_transform 在采样器侧处理 Wrap，更稳妥。

## 解决方案
- 默认推荐继续使用 KHR_texture_transform（保持合批前提下更稳健）。保留几何重映射模式，但修复冲突并正确处理 Wrap。
- 几何模式改造：
  1. 槽位独立 UV：对于每个材质槽位（baseColor/normal/...），为其创建独立的 TEXCOORD 集：
     - 复制原始 UV 集为新 Accessor（如 TEXCOORD_1、TEXCOORD_2...）。
     - 将该槽位的 TextureInfo.texCoord 指向新建的 TEXCOORD 索引。
     - 对新 Accessor 的元素应用 uv' = transform(uv) 映射到该槽位对应的图集区域。
     - 保留原始 TEXCOORD_0 不变，避免槽位之间互相覆盖。
  2. Wrap 处理：根据 Sampler 的 wrapS/wrapT：
     - CLAMP_TO_EDGE：uv = clamp(uv, 0, 1)
     - REPEAT：uv = fract(uv)
     - MIRRORED_REPEAT：uv = 1 - fract(abs(uv))（镜像重复，简化版本）
     - 然后应用缩放与偏移：uv' = uv * scale + offset
  3. 旋转（若未来启用）：在几何模式不支持旋转，或统一旋转为 0；若需要旋转则需在几何侧对 UV 做 R(π/2) 变换，当前先不启用旋转。
  4. 规范性：保证若新增 TEXCOORD_N（N>0）则补齐 TEXCOORD_0..N-1（可按 glTF 规范复制同一 Accessor 以满足要求）。
  5. 清理：几何模式下移除各槽位上的 KHR_texture_transform 扩展；处理后 dispose 未引用的原始纹理。

## 代码改动点
- packages/functions/src/texture-atlas.ts：
  - 在 remap==='geometry' 分支：
    - 针对每个材质槽位：检测其使用的 texCoord 索引；创建新 TEXCOORD 索引（若该索引已被另一个槽位占用或将被覆盖，分配下一个可用索引）。
    - 按 Wrap 规则预处理 uv，再按 atlas 的 offset/scale 写入新 Accessor。
    - 更新 TextureInfo.setTexCoord(newIndex)，并清除 TextureInfo 的 KHR_texture_transform。
    - 若新增 N>0 的 TEXCOORD 索引，按规范补齐缺失的低索引。
- packages/cli/src/cli.ts：保持命令与参数不变；文档强调几何模式的限制与行为。

## 测试与验证
- 用例：
  - 基本：同一材质同时存在 baseColor+normal，共用 TEXCOORD_0；几何模式后产生 TEXCOORD_0（原始）与 TEXCOORD_1（normal），两个槽位正确指向各自 atlas 区域。
  - Wrap：构造 REPEAT 与 CLAMP 的 UV 超出 [0,1] 场景，验证 fract/clamp 生效且采样不越界。
  - 规范：新增高索引时补齐低索引，导出校验通过。
- CLI 验证：inspect 检查 TextureInfo.texCoord 索引分配、extensionsUsed 不包含 KHR_texture_transform（几何模式）。

## 文档更新
- packages/docs/src/lib/pages/texture-atlas.md：
  - 补充几何模式的“槽位独立 UV”说明与 Wrap 行为；建议优先使用 KHR_texture_transform。

## 交付
- 修复后的实现代码与单元测试。
- 文档更新，示例展示两种模式差异与注意事项。
