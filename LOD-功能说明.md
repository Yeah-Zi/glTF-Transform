# glTF-Transform LOD 功能说明（详细）

本文档说明 glTF-Transform CLI 中 `lod` 命令的行为、参数含义、输出结构与使用建议。该命令用于为同一模型生成多份不同复杂度的几何版本（LOD0…LOD7），以便在运行时按距离/屏幕占比选择合适版本。

## 1. 功能概览

`gltf-transform lod` 会：

- 以同一份输入模型为基准，最多生成 8 个 LOD 级别：LOD0（原始）到 LOD7（最粗）。
- 从 LOD1 开始对几何进行简化，每一层的目标简化比率固定为上一层的一半。
- 每一层都会输出为一个独立的 glTF/GLB 文件（文件名追加 `_lod{n}` 后缀）。
- 在输出目录额外生成一个统计文件：`*_lod_stats.json`，记录每层的顶点/三角形数量与简化误差。

重要说明：

- 当前实现不会写入 `MSFT_lod` 等 glTF LOD 扩展，只是生成多个独立文件。你需要在引擎/加载器或资源管理层自行实现“按距离选择哪个文件”的逻辑。
- LOD 的“几何简化”基于 meshoptimizer simplifier（与 `simplify` 命令一致），并在简化前自动执行一次 `weld`（合并等效顶点）以提升简化效果。

实现入口见：[cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts#L1185-L1345)。

## 2. 使用方式

### 2.1 基本命令

```bash
gltf-transform lod <input> <output> [--error <error>] [--lock-border <bool>]
```

示例：

```bash
gltf-transform lod input.glb output/lod.glb --error 0.001
```

### 2.2 参数说明

- `<input>`
  - 输入模型路径（.gltf/.glb 均可）。
  - 注意：LOD 每一层都会重新读取该输入文件；如果你希望 LOD 基于“已优化/已压缩”的版本生成，请先把优化后的文件作为 `<input>`。

- `<output>`
  - 仅作为“输出目录 + 基础命名”的锚点使用。
  - 实际输出文件名会变成：`<outputBase>_lod0<ext> … <outputBase>_lod7<ext>`。

- `--error <error>`
  - 误差上限，含义是“相对于网格半径的误差分数（fraction of mesh radius）”。
  - 值越小：允许的形变越小，保真度更高，但可能无法达到目标简化比率（顶点/三角形下降不明显，甚至提前停在较高复杂度）。
  - 值越大：允许的形变越大，更容易降面，但视觉差异更明显。
  - 该参数传递给 meshoptimizer simplifier，行为与 `simplify` 命令一致（参考：[simplify.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/functions/src/simplify.ts#L45-L76)）。

- `--lock-border <bool>`
  - 是否锁定拓扑边界（topological borders）。
  - 当网格由多个“块”拼接且边界必须保持对齐（例如大地形分块、相邻区块共享边缘）时建议开启，以减少边界出现裂缝的风险。
  - 开启后，简化自由度变小，可能导致更早“无法继续降面”。

## 3. LOD 层级与目标比率

固定最多 8 层：

- LOD0：1.0（100%）
- LOD1：0.5（50%）
- LOD2：0.25（25%）
- LOD3：0.125（12.5%）
- LOD4：0.0625（6.25%）
- LOD5：0.03125（3.125%）
- LOD6：0.015625（1.5625%）
- LOD7：0.0078125（0.78125%）

对应实现：`ratio = 0.5^level`，见 [cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts#L1226-L1285)。

## 4. 生成流程（实现细节）

### 4.1 每层都从原始输入生成

每个 level 都会重新读取 `<input>`，并在同一份“原始输入”的基础上做简化（而不是在上一层 LOD 的输出上继续简化），见 [cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts#L1288-L1303)。

影响：

- 优点：每层相互独立、可重复生成，避免“层层累计误差”。
- 缺点：耗时近似按层数线性增长；输入越大生成越慢。

### 4.2 简化算法与误差

LOD1…LOD7 会调用 `simplifyDocumentWithError()` 对整个文档执行简化，并返回一个“该层简化过程中的最大误差值”，见：

- LOD 命令调用：[cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts#L1293-L1303)
- 简化实现：[simplifyDocumentWithError](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/functions/src/simplify.ts#L127-L169)
- 单个 primitive 的误差来源：meshoptimizer `simplifier.simplify(...)` 返回的 `error`，见 [simplifyPrimitiveWithError](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/functions/src/simplify.ts#L178-L250)

简化前会自动执行一次 `weld({ overwrite: false })`，用于合并等效顶点、降低拓扑限制，从而更容易降面，见 [simplify.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/functions/src/simplify.ts#L136-L138)。

### 4.3 何时提前停止生成

在当前源码实现中：如果某一层生成后的“顶点数与三角形数”都与上一层完全相同，则认为无法继续简化，后续更低层将被跳过，见 [cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts#L1307-L1313)。

常见原因：

- 误差阈值过小，简化很快达到“不能再动”的状态。
- 网格拓扑/属性导致的拆分顶点过多（例如大量硬边/UV seam/法线断裂等），可简化空间受限。
- 开启 `--lock-border true` 且边界约束强，导致更早停下。

### 4.4 顶点数与三角形数统计方式

统计逻辑为：

- 顶点数：对所有 primitive 的 `POSITION` accessor 做求和。
- 三角形数：
  - 若存在 indices：`floor(indices.count / 3)`
  - 否则：用 `floor(POSITION.count / 3)` 估算

对应实现：[cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts#L1239-L1260)。

注意：当模型包含非三角形拓扑、或未索引几何时，这个三角形统计是近似值。

## 5. 输出文件命名规则

假设 `<output>` 为：

- `output/lod.glb`

则会输出（同目录）：

- `output/lod_lod0.glb`
- `output/lod_lod1.glb`
- …
- `output/lod_lod7.glb`（若未提前停止）

实现：`lodOutputPath = `${baseName}_lod${level}${ext}``，见 [cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts#L1232-L1286)。

## 6. 统计文件：`*_lod_stats.json`

### 6.1 生成位置与命名

统计文件写入到 `<output>` 的目录下，文件名为：

```text
<basename(output)>_lod_stats.json
```

实现：[cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts#L1339-L1344)。

### 6.2 字段结构（可能包含）

```json
{
  "inputFile": "输入路径",
  "outputDirectory": "输出目录",
  "lodLevels": 8,
  "generatedLevels": 0,
  "levels": [
    {
      "level": 0,
      "filePath": "xxx_lod0.glb",
      "targetRatio": 1,
      "vertexCount": 0,
      "triangleCount": 0,
      "simplificationError": 0
    }
  ]
}
```

字段含义：

- `lodLevels`：计划生成的最大层数（固定 8）。
- `generatedLevels`：可选字段，表示实际生成层数（若提前停止会小于 8）。
- `levels[]`：每层的统计项。
  - `filePath`：写入文件名（不含目录）。
  - `targetRatio`：该层目标比率（0.5^level）。
  - `simplificationError`：该层简化中观测到的最大误差（LOD0 恒为 0）。

提示：你仓库里已有一个示例 stats 文件位于 `input/output/lod_lod_stats.json`，可用于对照理解字段含义。

## 7. 推荐使用流程（资源管线）

1) 确定“要做 LOD 的版本”
   - 如果你会做纹理压缩、meshopt/draco 压缩、材质合并等，建议先对模型做完这些处理，再把“最终版本”作为 `<input>` 去生成 LOD（LOD 每层都会从 `<input>` 重新读）。

2) 生成 LOD
   - 根据你的画质需求调整 `--error`，必要时对地形/拼接网格开启 `--lock-border true`。

3) 运行时选择策略
   - 使用 `*_lod_stats.json` 了解每层几何规模，结合运行时 FPS/设备能力确定切换阈值。
   - 引擎侧通常按“相机距离”“屏幕像素占比”“包围盒投影面积”等策略选择 LOD 文件。

## 8. 常见问题排查

### 8.1 为什么 LOD5/LOD6/LOD7 顶点数不再下降？

当某一层的统计与上一层完全一致时，生成会提前停止；即使继续跑，后续层也可能保持不变或变化很小。常见处理：

- 增大 `--error`（允许更大形变）。
- 关闭或仅在必要时开启 `--lock-border`。
- 先检查模型是否存在大量硬边/UV seam 导致拆点严重（拆点越多可简化空间越小）。

### 8.2 为什么我需要多个文件，而不是一个 glb 内带 LOD？

当前实现不写入 `MSFT_lod` 等扩展，输出为多文件方案，优点是兼容性高、引擎侧实现简单；缺点是需要你的加载系统管理多份资源。

如果你确实需要“单文件携带 LOD”的扩展式工作流，需要另行实现扩展写入与引用组织（仓库当前未提供）。

## 9. 简化误差值实测验证

以下为使用测试模型 `纹理图集测试数据.gltf`（2645 顶点 / 1920 三角形）的实际测试结果。

### 9.1 不同 error 阈值下的行为

| error 阈值 | 生成层级 | LOD1 误差 | 最大误差 | 顶点/三角形变化 |
|-----------|---------|----------|---------|----------------|
| 0.0001 | 2 层 (LOD0-1) | 0.000069 | 0.000069 | 2645→2644 / 1920→1918 |
| 0.01 | 5 层 (LOD0-4) | 0.009947 | 0.009947 | 2645→2321 / 1920→1350 |
| 0.05 | 6 层 (LOD0-5) | 0.049211 | 0.049960 | 2645→2007 / 1920→850 |
| 0.1 | 5 层 (LOD0-4) | 0.070870 | 0.099096 | 2645→1892 / 1920→718 |

对应命令行（Node.js 开发模式下运行）：

```bash
# error=0.0001：高保真、极严格，几乎无法降面
node packages/cli/bin/cli.js lod \
  "input/纹理图集测试数据.gltf" \
  "input/output/test_lod_e0.0001.glb" \
  --error 0.0001

# error=0.01：中等保真，可降面约 30%
node packages/cli/bin/cli.js lod \
  "input/纹理图集测试数据.gltf" \
  "input/output/test_lod_e0.01.glb" \
  --error 0.01

# error=0.05：宽松容差，可降面约 56%
node packages/cli/bin/cli.js lod \
  "input/纹理图集测试数据.gltf" \
  "input/output/test_lod_e0.05.glb" \
  --error 0.05

# error=0.1：大幅容差，可降面约 63%
node packages/cli/bin/cli.js lod \
  "input/纹理图集测试数据.gltf" \
  "input/output/test_lod_e0.1.glb" \
  --error 0.1
```

若通过 `npm link` 或全局安装使用，可直接调用：

```bash
gltf-transform lod input.glb output/lod.glb --error 0.01
```

### 9.2 误差值传递链路

完整的误差值传递路径如下：

1. **meshoptimizer** `simplifier.simplify(indices, positions, 3, targetCount, error, flags)` 返回 `[newIndices, simplifierError]`
2. **simplifyPrimitiveWithError()** 收集每个 primitive 返回的 error，取最大值 `maxError = Math.max(maxError, result.error)`
3. **simplifyDocumentWithError()** 遍历文档中所有 mesh/primitive，返回 `maxError`
4. **CLI lod 命令** 将误差值存入 `*_lod_stats.json` 的 `simplificationError` 字段

链路完整，误差值由 meshoptimizer 原生返回，精度为 IEEE 754 双精度浮点数。

### 9.3 误差值特征

- **LOD0 恒为 0**：原始模型不做简化，误差始终为 0。
- **误差具有累积上限**：随着层级加深（ratio 越小），实际产生的几何误差不会无限增长，而是被 `--error` 参数钳制。当 meshoptimizer 发现达到目标 ratio 前误差已接近阈值时，会提前停止当前 primitive 的简化。
- **不同层级可能返回相同误差值**：当某一层的简化结果与上一层相同时（顶点/三角形数不变），误差值也会相同，之后触发提前停止逻辑。
- **误差值随层级非严格单调**：因为每层都从原始输入独立生成，meshoptimizer 的内部启发式算法可能导致低层级误差偶尔略低于高层级（属正常现象）。

### 9.4 已知注意事项

- **双包危机（Dual Package Hazard）**：CLI 包 (`packages/cli`) 与 functions 包 (`packages/functions`) 各自依赖 `@gltf-transform/core` 的不同副本时，`Document.fromGraph()` 将返回 null（两个 Document 类的 `_GRAPH_DOCUMENTS` WeakMap 不同）。源代码已在 `simplify.ts`、`weld.ts`、`convert-primitive-mode.ts`、`unweld.ts` 的 `Document.fromGraph()` 调用处添加了 null 保护。
- **CLI 中 logger 必须正确初始化**：lod 命令需要调用 `io.setLogger(logger)` 和 `(await io.read(inputPath)).setLogger(logger)` 以确保 document 的 logger 非空。否则 `simplifyDocumentWithError` 在调用 `document.getLogger()` 时会抛出 NPE。
