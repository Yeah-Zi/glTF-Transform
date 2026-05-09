# 三维数据处理管线设计文档

## 1. 概述

本文档描述一个通用的三维数据处理管线，支持将任意来源的三维数据解析为统一的内部场景表示，并最终生成优化后的 3D Tiles 数据集。管线共分为五个阶段：输入解析、模型拆解、LOD 生成、索引树构建、3D Tiles 生成。

---

## 2. 第一阶段：输入解析

### 2.1 目标

将任意来源的三维数据解析为统一的内部场景表示。

### 2.2 支持的输入格式

| 格式 | 说明 |
|------|------|
| OBJ | Wavefront OBJ 几何格式 |
| FBX | Autodesk FBX 交换格式 |
| COLLADA | DAE 数字资产交换格式 |
| glTF | GL Transmission Format (2.0) |
| 点云 | LAS/LAZ、PLY、XYZ 等点云格式 |
| BIM IFC | Industry Foundation Classes |

### 2.3 解析策略

- **解析多源格式**（OBJ / FBX / glTF 等）为**统一中间表示**，语义模型对齐 **glTF 2.0 规范**。
- **输入灵活性**：支持单个模型文件，也支持具有多个节点及模型的场景文件。
- **语义映射**：
  - 网格（Mesh）→ glTF `mesh`
  - 节点层级（Node Hierarchy）→ glTF `node`
  - 材质与贴图（Material & Texture）→ glTF `material` / `texture`
  - 场景结构（Scene Graph）→ glTF `scene`

### 2.4 统一中间表示结构

```
UnifiedScene
├── scenes[]          // 场景列表
├── nodes[]           // 节点层级树
│   ├── mesh          // 引用的网格索引
│   ├── children[]    // 子节点
│   └── transform     // 变换矩阵 (TRS)
├── meshes[]          // 网格列表
│   ├── primitives[]  // 图元列表
│   └── material      // 材质引用
├── materials[]       // 材质列表
├── textures[]        // 贴图列表
├── images[]          // 图像引用
├── samplers[]        // 采样器配置
└── accessors[]       // 数据访问器
```

---

## 3. 第二阶段：模型拆解

### 3.1 目标

将输入模型拆解为最小可复用单元，实现资源共享。

### 3.2 拆解规则

- **单网格约束**：拆解后的每个模型只具有**单个 mesh 网格**以及相关的材质贴图引用资源。
- **外链存储**：所有数据（几何、贴图、材质）均以**外链形式**保存。
- **Hash 命名**：使用内容的哈希值作为文件名，实现跨模型的**资源共享**与去重。
  - 几何数据 → `{geometry_hash}.bin`
  - 贴图数据 → `{texture_hash}.png` / `{texture_hash}.jpg`

### 3.3 拆解流程

```
输入场景
  │
  ├── 遍历所有节点
  │     │
  │     ├── 提取关联的 mesh
  │     │     │
  │     │     └── 拆分 mesh 中的每个 primitive 为独立单元
  │     │
  │     └── 提取关联的 material / texture
  │
  ├── 哈希计算与去重
  │
  └── 输出：独立模型单元集合
        ├── model_001.{uid}.gltf
        ├── data_{hash}.bin
        ├── texture_{hash}.png
        └── ...
```

---

## 4. 第三阶段：LOD 生成

### 4.1 目标

为每个拆解后的模型生成多级 LOD（Level of Detail），供后续 3D Tiles 构建时选择合适的细节层次。

### 4.2 LOD 生成策略

#### 4.2.1 几何简化

- 通过网格简化算法（如二次误差度量 QEM、边折叠等）逐级降低顶点数和三角形数。
- 每级 LOD 的简化比例可配置（如 50%、25%、12.5% ...）。

#### 4.2.2 贴图简化

- 对关联贴图进行降分辨率处理。

### 4.3 几何误差计算

每个 LOD 对象需要携带其**几何误差**（geometricError）元信息，公式如下：

```
totalError = geometryErrorWeight × geometryError + textureErrorWeight × textureError
```

其中：

- **geometryErrorWeight**：几何误差权重（可配置参数）
- **geometryError**：几何简化引入的几何偏差（由简化算法输出）
- **textureErrorWeight**：贴图误差权重（可配置参数）
- **textureError**：贴图简化引入的误差，计算公式为：

```
textureError = (B / (2 × Rsimp)) - (B / (2 × Rorig))
```

| 符号 | 说明 |
|------|------|
| B | 包围盒最长直径（或最长边） |
| Rorig | 原始纹理最大分辨率 |
| Rsimp | 简化后纹理分辨率 |

### 4.4 LOD 对象元数据结构

每个 LOD 对象需包含：

```
LODObject
├── lodLevel: number              // LOD 层级索引 (0 = 最精细)
├── model: Model                  // 模型数据引用
├── geometricError: number        // 总几何误差
├── boundingBox:                  // 包围盒信息
│   ├── fullBoundingBox           // 包含所有节点的最大包围盒
│   └── tightBoundingBox          // 纯模型包围盒（紧密包围）
└── nodes: Node[]                 // 关联的节点列表
```

### 4.5 LOD 数据存储结构

使用以下结构存储 LOD 层级与模型/节点的映射关系：

```
Map<int, Array<Tuple<Model, Array<Node>>>>
```

- **Key**（int）：LOD 层级
- **Value**（Array）：该层级下所有 (模型, 节点列表) 的元组集合

---

## 5. 第四阶段：索引树构建

### 5.1 目标

构建空间索引树，通过均匀分割、合理的 LOD 绑定和合适的瓦片粒度，确保最终数据集的加载性能和渲染帧率。

### 5.2 全局包围盒计算

对第二阶段输出的所有网格包围盒取**并集**，得到场景的世界空间总包围盒（根节点包围盒）。

```
globalBoundingBox = Union(all mesh bounding boxes)
```

### 5.3 分割策略

通过参数选择空间分割策略：

| 策略 | 适用场景 | 说明 |
|------|----------|------|
| **四叉树（Quadtree）** | 2.5D 场景（城市、地形） | 沿 XZ 平面等分，忽略 Y 轴分割 |
| **八叉树（Octree）** | 全 3D 场景（点云、建筑群） | 沿 X、Y、Z 三轴同时等分 |

### 5.4 递归空间分割与分配算法

#### 5.4.1 算法参数

| 参数 | 说明 |
|------|------|
| `maxGeometryPerNode` | 单节点最大容纳的几何总量（顶点数/三角形数） |
| `splitStrategy` | 分割策略：`quadtree` / `octree` |
| `lodLevels` | 多级 LOD 数据（来自第三阶段） |

#### 5.4.2 分配优先级规则

- **纵向优先级**：逐 LOD 对象独立确定候选层级，从最粗糙层级向最精细层级递进。粗糙层级节点未完全使用时优先使用；全部已使用则递进到下一精细层级。
- **横向优先级**：所有候选 LOD 对象（可能来自不同层级）按 **密度**（顶点数 / 空间包围盒体积）进行**升序排序**，密度越小的越优先分配。

```
density = vertexCount / boundingBoxVolume
```

#### 5.4.3 递归分配流程

从根节点开始递归，每层执行以下判断：

```
function allocateNode(node, allLODs):
    1. 全局空间筛选（跨层级）：
       使用当前节点的包围盒，遍历全部 LOD 层级的所有 LOD 对象，
       进行包围盒相交检测，提取所有落在当前节点空间范围内的 LOD 对象集合。

    2. 纵向优先级拣选（逐 LOD 对象独立确定候选层级）：
       遍历步骤1筛选出的每个 LOD 对象（按模型分组），对每个对象独立执行：
       a. 从该 LOD 对象的最粗糙层级开始查找。
       b. 若当前粗糙层级存在未完全分配的 LOD 对象，则尝试使用该层级：
          使用当前节点的包围盒拣选该层级对象所关联的 Node 节点。
       c. 判断拣选出的这些 Node 节点是否**全部**已被完全使用
          （存在部分节点已被使用、部分未使用的可能）。
       d. 若全部已使用 → 进入该 LOD 对象的**下一精细层级**继续拣选（回到 b）。
       e. 若存在未使用的 Node 节点 → 确定当前层级为该 LOD 对象的候选层级。
       f. 若该 LOD 对象所有层级（含最精细层级）的 Node 节点全被使用，
          则以最精细层级数据作为兜底候选，确保节点无缺失。
       （注意：步骤2仅确定每个 LOD 对象的候选层级，不进行任何标记。
        标记操作延迟到步骤4，只有被实际分配的才标记。）

    3. 横向优先级排序（跨层级统一排序）：
       - 步骤2筛选出的候选 LOD 对象可能来自不同层级，
         对所有候选 LOD 对象按密度（顶点数 / 包围盒体积）升序统一排序，
         密度小的对象优先分配。

    4. 节点分配与标记（仅实际使用的才标记）：
       a. 按步骤3排序后的顺序，依次取出 LOD 对象，
          筛选其节点列表中落在当前节点空间范围内的节点。
       b. 将筛选出的节点标记为"已被使用"（仅当该 LOD 对象被实际分配时）。
       c. 累加几何总量，若超出 maxGeometryPerNode 阈值，
          则停止分配，后续未分配的候选 LOD 对象不做任何标记，
          留待后续迭代或子节点重新拣选。
       d. 若某 LOD 对象在某一层级的所有节点均已被使用，标记该层级 LOD 对象为
          "已被完全使用"，后续任何空间节点均不可再使用该层级数据，
          最精细层级除外（兜底填充场景下可被多节点重复引用）。

    5. 计算已拣选的几何总量：
       accumulatedGeometry += selectedGeometry

       if accumulatedGeometry > maxGeometryPerNode:
           按选定策略划分子空间（四叉树 / 八叉树递归）
           for each childNode:
               allocateNode(childNode, allLODs)

    6. 当前节点的几何误差 = 已分配 LOD 对象中 geometricError 的最大值

    7. 重复步骤 1-6，直到当前节点空间范围内所有层级的 LOD 数据都被分配完全
       （即步骤1筛选出的集合为空，或所有层级均已遍历完毕）
```

#### 5.4.4 分配算法伪代码

```python
def build_index_tree(all_lod_objects, global_bbox, max_geometry, split_strategy):
    """
    all_lod_objects: Map<int, Array<Tuple<Model, Array<Node>>>>  // {lod_level: [(model, nodes), ...]}
    """
    root = TreeNode(bbox=global_bbox)

    finest_level = min(all_lod_objects.keys())  # 0 = 最精细

    def recursive_allocate(node):
        while True:
            # 步骤1：用当前节点包围盒筛选所有层级的 LOD 对象
            #   - 非最精细层级：is_fully_used 的对象不再参与筛选
            #   - 最精细层级：即使 is_fully_used 也保留（兜底填充）
            candidates_by_model = {}  # {model_id: {level: lod_obj}}
            for level, lod_list in all_lod_objects.items():
                for lod_obj in lod_list:
                    if level != finest_level and lod_obj.is_fully_used:
                        continue
                    if not bbox_intersects(node.bbox, lod_obj.bbox):
                        continue
                    if lod_obj.model_id not in candidates_by_model:
                        candidates_by_model[lod_obj.model_id] = {}
                    candidates_by_model[lod_obj.model_id][level] = lod_obj

            if not candidates_by_model:
                return

            # 步骤2：逐 LOD 对象纵向优先级 —— 每个对象独立确定可用层级
            #   - 从最粗糙层级开始，判断该层级节点是否全部已使用
            #   - 全部已使用 → 递进到下一精细层级
            #   - 存在未使用节点 → 选定该层级
            #   - 所有层级耗尽 → 最精细层级兜底
            selected_candidates = []  # [(lod_obj, is_fallback), ...]

            for model_id, levels_dict in candidates_by_model.items():
                sorted_levels = sorted(levels_dict.keys(), reverse=True)  # 粗→精
                chosen_lod = None
                is_fallback = False

                for level in sorted_levels:
                    lod_obj = levels_dict[level]
                    # 拣选当前节点包围盒内的 Node 节点
                    in_range_nodes = [
                        n for n in lod_obj.nodes
                        if bbox_contains(node.bbox, n.bbox)
                    ]
                    if not in_range_nodes:
                        continue

                    # 判断这些节点是否全部已被使用
                    all_used = all(n.used for n in in_range_nodes)

                    if not all_used:
                        chosen_lod = lod_obj
                        break
                    elif level == finest_level:
                        chosen_lod = lod_obj
                        is_fallback = True
                        break

                if chosen_lod:
                    selected_candidates.append((chosen_lod, is_fallback))

            if not selected_candidates:
                return

            # 步骤3：横向优先级 —— 按密度升序排序
            selected_candidates.sort(
                key=lambda x: x[0].vertex_count / x[0].bbox_volume
            )

            # 步骤4：依次分配
            accumulated = 0
            selected_lods = []

            for lod_obj, is_fallback in selected_candidates:
                matching_nodes = [
                    n for n in lod_obj.nodes
                    if bbox_contains(node.bbox, n.bbox)
                ]
                if not matching_nodes:
                    continue

                for n in matching_nodes:
                    n.used = True
                lod_obj.mark_used_nodes(matching_nodes)

                if lod_obj.all_nodes_used():
                    lod_obj.is_fully_used = True

                selected_lods.append(lod_obj)
                accumulated += lod_obj.geometry_count

                if accumulated >= max_geometry:
                    break

            # 设置当前节点的几何误差
            node.geometric_error = max(
                (lod.geometric_error for lod in selected_lods),
                default=0
            )

            # 步骤5：超出阈值则划分子空间
            if accumulated >= max_geometry:
                children = split_space(node.bbox, split_strategy)
                for child in children:
                    node.add_child(child)
                    recursive_allocate(child)
                return

            # 未超出阈值则继续在当前节点内分配下一批次
            # 循环回到步骤1，重新筛选剩余 LOD

    recursive_allocate(root)
    return root
```

---

## 6. 第五阶段：3D Tiles 生成

### 6.1 目标

基于第四阶段构建的索引树及已分配的数据，生成符合规范的 3D Tiles 数据集。

### 6.2 生成流程

```
索引树
  │
  ├── 遍历树节点
  │     │
  │     ├── 将节点数据写出为 glTF 文件
  │     │     ├── tileset.json（瓦片集描述文件）
  │     │     ├── {tile_id}.gltf / .glb（瓦片内容）
  │     │     └── {tile_id}.bin（几何数据）
  │     │
  │     └── 设置节点属性：
  │           ├── boundingVolume（包围体）
  │           ├── geometricError（几何误差）
  │           ├── refine（细化策略：ADD / REPLACE）
  │           └── content.uri（瓦片内容路径）
  │
  └── 输出：完整的 3D Tiles 数据集
```

### 6.3 数据优化

使用 **gltf-transform** 工具对每个节点的 glTF 文件执行最终优化，包括以下四大功能：

#### 6.3.1 合并材质（Material Merging）

- 分析所有节点内的材质参数（PBR 属性、纹理引用等）
- 将具有相同或相似参数的材质合并为单一材质
- 减少材质切换带来的 Draw Call

#### 6.3.2 合并贴图（Texture Atlas）

- 将多个小型贴图合并为一张纹理图集（Texture Atlas）
- 调整 UV 坐标以适配新的图集坐标
- 减少纹理绑定次数，提升 GPU 效率

#### 6.3.3 合并模型（Mesh Merging）

- 将同一节点/瓦片内的多个独立网格合并为单个网格
- 减少绘制调用（Draw Call），提升渲染性能

#### 6.3.4 模型实例化（Instancing）

- 检测场景中重复使用的相同几何体
- 使用 GPU Instancing 技术（通过 `EXT_mesh_gpu_instancing` 扩展）
- 大幅减少数据传输量和绘制调用

### 6.4 优化管线集成

```
glTF 单节点文件
  │
  ├── [1] dedup        // 资源去重
  ├── [2] join         // 合并网格
  ├── [3] palette      // 合并材质
  ├── [4] textureAtlas // 合并贴图图集
  └── [5] instance     // 实例化检测
  │
  └── 优化后的 glTF
```

---

## 7. 管线总览

```
┌─────────────┐
│  输入文件     │  OBJ / FBX / COLLADA / glTF / 点云 / IFC
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  第一阶段：输入解析                                    │
│  - 格式统一为 glTF 2.0 中间表示                        │
│  - 支持单模型 & 场景文件                               │
└──────┬──────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  第二阶段：模型拆解                                    │
│  - 拆解为单 mesh 单元                                 │
│  - 外链存储 + Hash 命名                               │
│  - 资源共享                                           │
└──────┬──────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  第三阶段：LOD 生成                                    │
│  - 几何简化 + 贴图简化                                 │
│  - 计算几何误差（含贴图误差因子）                        │
│  - 包围盒信息                                         │
│  - 数据结构：Map<int, Array<Tuple<Model, Array<Node>>>> │
└──────┬──────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  第四阶段：索引树构建                                   │
│  - 全局包围盒计算                                      │
│  - 四叉树 / 八叉树分割                                 │
│  - 密度排序分配 + 递归空间分配                          │
│  - 纵向/横向优先级策略                                 │
└──────┬──────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────┐
│  第五阶段：3D Tiles 生成                               │
│  - tileset.json + glTF 瓦片生成                       │
│  - gltf-transform 优化                               │
│    • 合并材质                                         │
│    • 合并贴图（图集）                                   │
│    • 合并模型                                         │
│    • 模型实例化                                        │
└─────────────────────────────────────────────────────┘
```

---

## 8. 关键公式汇总

### 8.1 贴图误差

```
textureError = (B / (2 × Rsimp)) - (B / (2 × Rorig))
```

### 8.2 总几何误差

```
totalError = geometryErrorWeight × geometryError + textureErrorWeight × textureError
```

### 8.3 密度计算

```
density = vertexCount / boundingBoxVolume
```

---

## 9. 数据结构定义

```typescript
// 包围盒
interface BoundingBox {
  min: [number, number, number]
  max: [number, number, number]
}

// LOD 对象
interface LODObject {
  lodLevel: number
  model: Model
  geometricError: number
  fullBoundingBox: BoundingBox       // 含所有节点的最大包围盒
  tightBoundingBox: BoundingBox      // 纯模型紧密包围盒
  nodes: Node[]
  vertexCount: number
  bboxVolume: number
  isFullyUsed: boolean
}

// LOD 集合存储
type LODCollection = Map<number, Array<{
  model: Model
  nodes: Node[]
}>>

// 索引树节点
interface TreeNode {
  id: string
  boundingBox: BoundingBox
  geometricError: number
  lodObjects: LODObject[]
  children: TreeNode[]
  content?: {
    uri: string
  }
}

// 分割策略
type SplitStrategy = 'quadtree' | 'octree'

// 索引树构建配置
interface IndexTreeConfig {
  maxGeometryPerNode: number
  splitStrategy: SplitStrategy
  geometryErrorWeight: number
  textureErrorWeight: number
}
```

---

## 10. 输出规范

| 输出项 | 格式 | 说明 |
|--------|------|------|
| `tileset.json` | JSON | 3D Tiles 瓦片集描述文件 |
| `{tile_id}.gltf` | glTF 2.0 | 单个瓦片的 glTF 模型（已优化） |
| `{tile_id}.bin` | Binary | 瓦片几何数据 |
| `*.png` / `*.jpg` | Image | 优化后的贴图资源 |

---

*文档版本: v1.0*
