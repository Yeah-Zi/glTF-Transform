# glTF Transform CLI 命令行界面文档

## 工具概述与用途说明

glTF Transform CLI 是一个功能强大的命令行工具，专门用于处理和优化 glTF 2.0 格式的 3D 模型文件。该工具基于 glTF Transform SDK 构建，提供了一系列针对 3D 模型优化的专业功能，包括几何压缩、纹理优化、场景优化等。

**主要用途：**
- 3D 模型文件大小优化
- 几何数据压缩（Draco、Meshopt）
- 纹理压缩和格式转换
- 场景图优化和简化
- 材质系统转换
- 动画数据处理
- 模型验证和检查

## 安装与配置步骤

### 系统要求
- Node.js 20 或更高版本
- Windows、macOS 或 Linux 操作系统

### 安装方法

```bash
# 全局安装
npm install --global @gltf-transform/cli

# 验证安装
gltf-transform --version
```

### 故障排除

**Sharp 安装问题：**
如果遇到 Sharp 相关的安装错误，请参考以下解决方案：

```bash
# 在中国大陆地区使用镜像源
npm config set sharp_binary_host "https://npmmirror.com/mirrors/sharp"
npm config set sharp_libvips_binary_host "https://npmmirror.com/mirrors/sharp-libvips"
npm install --global @gltf-transform/cli
```

## 命令语法规范

### 基本语法
```bash
gltf-transform <command> [ARGUMENTS...] [OPTIONS...]
```

### 获取帮助
```bash
# 查看所有命令
gltf-transform --help

# 查看特定命令帮助
gltf-transform help <command>
# 或
gltf-transform <command> --help
```

## 所有可用命令详细说明

### 🔎 检查命令组

#### `inspect` - 检查模型内容
**功能描述：** 检查模型内容，打印包含场景、网格、材质、纹理和动画的属性和统计信息的表格。

**参数：**
- `<input>`: 输入文件路径（.glb, .gltf）

**选项：**
- `--format <format>`: 表格输出格式（pretty|csv|md），默认：pretty

#### `validate` - 验证模型
**功能描述：** 使用官方 glTF 验证器验证模型是否符合 glTF 规范。

**参数：**
- `<input>`: 输入文件路径

**选项：**
- `--limit <limit>`: 显示问题数量限制，默认：10000000
- `--ignore <CODE>,<CODE>,...`: 要忽略的问题代码列表
- `--format <format>`: 表格输出格式

### 📦 打包命令组

#### `copy` - 复制模型
**功能描述：** 以最小更改复制模型，确保数据布局一致性。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

#### `optimize` - 优化模型
**功能描述：** 使用所有可用方法优化模型，组合了多个优化功能。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**主要选项：**
- `--compress <method>`: 压缩方法（draco|meshopt|quantize|false），默认：meshopt
- `--texture-compress <format>`: 纹理压缩格式（ktx2|webp|avif|auto|false），默认：auto
- `--texture-size <size>`: 最大纹理尺寸（像素），默认：2048
- `--simplify <bool>`: 简化网格几何，默认：true
- `--instance <bool>`: 使用 GPU 实例化，默认：true

#### `merge` - 合并模型
**功能描述：** 将两个或多个模型合并为一个，每个模型在单独的场景中。

**参数：**
- `<path...>`: 输入文件路径列表，最后一个路径用于输出

**选项：**
- `--partition`: 是否为每个输入文件保留单独的缓冲区
- `--merge-scenes`: 是否合并场景

#### `partition` - 分区二进制数据
**功能描述：** 将二进制数据分区到单独的 .bin 文件中。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--animations`: 将每个动画分区到单独的 .bin 文件
- `--meshes`: 将每个网格分区到单独的 .bin 文件

#### `dedup` - 去重访问器和纹理
**功能描述：** 去重访问器、纹理、材质、网格和皮肤。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--accessors`: 移除重复访问器，默认：true
- `--materials`: 移除重复材质，默认：true
- `--meshes`: 移除重复网格，默认：true
- `--skins`: 移除重复皮肤，默认：true
- `--textures`: 移除重复纹理，默认：true

#### `prune` - 移除未引用属性
**功能描述：** 从文件中移除未被场景引用的属性。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--keep-attributes`: 是否保留未使用的顶点属性
- `--keep-indices`: 是否保留未使用的网格索引
- `--keep-leaves`: 是否保留空叶节点
- `--keep-solid-textures`: 是否保留纯色纹理

#### `gzip` - GZIP 压缩
**功能描述：** 使用无损 gzip 压缩模型。

**参数：**
- `<input>`: 输入文件路径

#### `xmp` - XMP 元数据管理
**功能描述：** 添加或修改 XMP 元数据。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--packet <path>`: XMP 数据包路径（.jsonld 或 .json）
- `--reset`: 重置元数据并移除 XMP 扩展

### 🌍 场景命令组

#### `center` - 场景居中
**功能描述：** 将场景居中到原点或其上方/下方。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--pivot <pivot>`: 确定场景枢轴的方法（center|above|below），默认：center

#### `instance` - GPU 实例化
**功能描述：** 从共享网格引用创建 GPU 实例。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--min <count>`: 批次中的最小网格数，默认：2

#### `flatten` - 展平场景图
**功能描述：** 展平场景图，将带有网格、相机和其他附件的节点作为场景的直接子节点。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

#### `join` - 合并网格
**功能描述：** 合并兼容的图元并减少绘制调用。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--keepMeshes`: 防止合并不同的网格和节点
- `--keepNamed`: 防止合并命名的网格和节点

### 🫖 几何命令组

#### `draco` - Draco 几何压缩
**功能描述：** 使用 Draco 库压缩网格几何。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**量化选项：**
- `--quantize-position <bits>`: POSITION 量化位数（1-16），默认：14
- `--quantize-normal <bits>`: NORMAL 量化位数（1-16），默认：10
- `--quantize-color <bits>`: COLOR_* 量化位数（1-16），默认：8
- `--quantize-texcoord <bits>`: TEXCOORD_* 量化位数（1-16），默认：12

#### `meshopt` - Meshopt 压缩
**功能描述：** 使用 Meshopt 压缩几何和动画。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--level <level>`: 压缩级别（medium|high），默认：high

#### `quantize` - 量化几何
**功能描述：** 量化几何，降低精度和内存使用。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--pattern <pattern>`: 顶点属性模式（不区分大小写的 glob），默认：*

#### `dequantize` - 反量化几何
**功能描述：** 从资产中移除量化。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--pattern <pattern>`: 顶点属性模式，默认：!JOINTS_*

#### `weld` - 焊接顶点
**功能描述：** 合并等效顶点以优化几何。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

#### `unweld` - 取消焊接顶点
**功能描述：** 取消索引几何，断开任何共享顶点。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

#### `tangents` - 生成顶点切线
**功能描述：** 生成 MikkTSpace 顶点切线。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--overwrite`: 覆盖现有顶点切线，默认：false

#### `unwrap` - 生成纹理坐标
**功能描述：** 为给定的属性集索引生成纹理坐标。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--texcoord <index>`: 目标纹理坐标索引，默认：0
- `--group-by <type>`: 纹理坐标分组（primitive|mesh|scene），默认：primitive

#### `reorder` - 优化顶点数据
**功能描述：** 优化顶点数据的局部引用。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--target`: 优化目标（size|performance），默认：size

#### `simplify` - 简化网格
**功能描述：** 简化网格，减少顶点数量。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--ratio <ratio>`: 要保留的顶点目标比例（0-1），默认：0.5
- `--error <error>`: 误差限制（网格半径的分数），默认：0.001
- `--lock-border <bool>`: 是否锁定网格的拓扑边界，默认：false

#### `lod` - 生成 LOD 级别
**功能描述：** 为模型生成多个 LOD（细节级别）级别，最多 LOD0（原始）到 LOD7（0.78% 顶点）。每层输出独立的 glTF/GLB 文件（文件名追加 `_lod{n}` 后缀），同时自动生成统计文件。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径（作为基础命名，实际文件为 `<base>_lod0.<ext>` ~ `<base>_lod7.<ext>`）

**选项：**
- `--error <error>`: 误差限制（网格半径的分数），默认：0.001
- `--lock-border <bool>`: 是否锁定网格的拓扑边界，默认：false

**输出统计文件：** `*_lod_stats.json`

命令执行后会在 `<output>` 所在目录自动生成一个统计文件，命名规则为 `<basename>_lod_stats.json`，用于记录每层的顶点/三角形数量与简化误差。

字段结构：
```json
{
  "inputFile": "输入的源文件路径",
  "outputDirectory": "输出文件所在目录",
  "lodLevels": 8,
  "generatedLevels": 5,
  "levels": [
    {
      "level": 0,
      "filePath": "xxx_lod0.glb",
      "targetRatio": 1,
      "vertexCount": 2645,
      "triangleCount": 1920,
      "simplificationError": 0
    }
  ]
}
```

字段含义：
- `lodLevels`：计划生成的最大层数（固定 8）
- `generatedLevels`：实际生成的层数（若某层与上一层顶点/三角形无变化则提前停止）
- `levels[]` 中每项：
  - `level`：LOD 层级编号（0=原始 → 7=最粗）
  - `filePath`：输出的文件名（不含目录路径）
  - `targetRatio`：该层的目标简化比率（0.5^level）
  - `vertexCount`：该层顶点总数
  - `triangleCount`：该层三角形总数
  - `simplificationError`：该层简化过程中的最大误差值（meshoptimizer 返回，LOD0 恒为 0）

用途：运行时根据各层几何规模与误差值设定 LOD 切换阈值（相机距离 / 屏幕占比 / 包围盒投影面积等）。

### 🎨 材质命令组

#### `metalrough` - 材质转换
**功能描述：** 将材质从 spec/gloss 转换为 metal/rough。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

#### `palette` - 调色板纹理
**功能描述：** 创建调色板纹理并合并材质。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--block-size <px>`: 调色板纹理中单个块的大小（像素），默认：4
- `--min <count>`: 调色板纹理中的最小块数，默认：5

#### `bake-factors` - 烘焙材质因子
**功能描述：** 将标量材质因子烘焙到纹理中。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--targets <list>`: 要烘焙的插槽（逗号分隔），默认：baseColor,emissive,metallicRoughness
- `--resolution <preset|WxH>`: 分辨率预设（source|max）或显式 WxH，默认：source
- `--keep-factors <bool>`: 烘焙后保留因子，默认：false
- `--mimeType <type>`: 输出图像类型（png|jpeg），默认：png

#### `unlit` - 无光照材质
**功能描述：** 将材质从 metal/rough 转换为 unlit。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

### 🖼 纹理命令组

#### `resize` - 调整纹理大小
**功能描述：** 使用 Lanczos3（锐利）或 Lanczos2（平滑）滤波调整 PNG 或 JPEG 纹理大小。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--pattern <pattern>`: 匹配纹理的模式（glob）
- `--filter`: 重采样滤波器（lanczos3|lanczos2），默认：lanczos3
- `--width <pixels>`: 输出纹理的最大宽度（像素）
- `--height <pixels>`: 输出纹理的最大高度（像素）

#### `texture-compress` - 纹理压缩
**功能描述：** 使用 Sharp 压缩纹理。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--target-format <format>`: 目标格式（ktx2|webp|avif|jpeg|png），默认：webp
- `--quality <quality>`: 质量，1-100
- `--slots <slots>`: 要包含的纹理插槽（glob），默认：*

#### `ktxfix` - KTX 修复
**功能描述：** 修复 KTX 纹理。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--filter <filter>`: 修复过滤器（mipmap|none），默认：mipmap

#### `ktxdecompress` - KTX 解压缩
**功能描述：** 解压缩 KTX 纹理。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

#### `toktx` - 转换为 KTX
**功能描述：** 将纹理转换为 KTX 格式。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--mode <mode>`: 压缩模式（uastc|etc1s），默认：uastc
- `--slots <slots>`: 要包含的纹理插槽（glob），默认：*

### ⏯️ 动画命令组

#### `resample` - 重采样动画
**功能描述：** 无损去重关键帧，重采样动画。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--fps <fps>`: 目标帧率，默认：30
- `--pattern <pattern>`: 动画模式（glob），默认：*

#### `sequence` - 动画序列
**功能描述：** 将动画重新排序为序列。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

**选项：**
- `--fps <fps>`: 目标帧率，默认：30

### 📊 稀疏命令组

#### `sparse` - 稀疏数组优化
**功能描述：** 减少零填充数组的存储。

**参数：**
- `<input>`: 输入文件路径
- `<output>`: 输出文件路径

## 常见使用场景与示例代码

### 基本优化流程

```bash
# 1. 检查模型内容
gltf-transform inspect model.glb

# 2. 验证模型
gltf-transform validate model.glb

# 3. 一键优化（推荐新手）
gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp

# 4. 高级优化（自定义流程）
gltf-transform draco input.glb intermediate.glb --method edgebreaker
gltf-transform texture-compress intermediate.glb output.glb --target-format webp --quality 80
gltf-transform prune output.glb final.glb
```

### 几何优化示例

```bash
# Draco 压缩
gltf-transform draco input.glb output.glb --method edgebreaker --quantize-position 14

# Meshopt 压缩
gltf-transform meshopt input.glb output.glb --level high

# 网格简化
gltf-transform simplify input.glb output.glb --ratio 0.5 --error 0.001

# 生成 LOD 级别
gltf-transform lod input.glb output/lod.glb --error 0.001
```

### 纹理优化示例

```bash
# WebP 纹理压缩
gltf-transform texture-compress input.glb output.glb --target-format webp --quality 85

# KTX2 纹理压缩
gltf-transform toktx input.glb output.glb --mode uastc --slots "normalTexture,occlusionTexture"

# 纹理大小调整
gltf-transform resize input.glb output.glb --width 1024 --height 1024 --filter lanczos3
```

### 场景优化示例

```bash
# 场景居中
gltf-transform center input.glb output.glb --pivot center

# GPU 实例化
gltf-transform instance input.glb output.glb --min 3

# 合并网格减少绘制调用
gltf-transform join input.glb output.glb --keepNamed false
```

### 材质处理示例

```bash
# 转换为金属粗糙度工作流
gltf-transform metalrough input.glb output.glb

# 创建调色板纹理
gltf-transform palette input.glb output.glb --min 10

# 烘焙材质因子
gltf-transform bake-factors input.glb output.glb --targets baseColor,emissive --resolution 1024x1024
```

## 错误码说明与故障排除指南

### 常见错误类型

#### 文件读取错误
- **症状**: "Error reading file" 或 "File not found"
- **原因**: 文件路径错误、文件损坏或权限问题
- **解决方案**: 检查文件路径、验证文件完整性、检查文件权限

#### 内存不足错误
- **症状**: "Out of memory" 或进程崩溃
- **原因**: 处理大型模型时内存不足
- **解决方案**: 增加 Node.js 内存限制 `--max-old-space-size=4096`

#### Sharp 相关错误
- **症状**: Sharp 模块加载失败
- **原因**: 系统架构不兼容或安装问题
- **解决方案**: 重新安装 Sharp 或使用镜像源

### 调试技巧

```bash
# 启用详细日志
gltf-transform optimize input.glb output.glb --verbose

# 检查 Node.js 版本
node --version

# 检查可用内存
gltf-transform inspect input.glb --format csv
```

### 性能优化建议

1. **处理大型文件**: 使用 `--limit-input-pixels` 限制输入像素
2. **批量处理**: 使用脚本自动化处理多个文件
3. **内存管理**: 对于超大文件，分阶段处理

## 注意事项与最佳实践

### 工作流程建议

1. **备份原始文件**: 始终保留原始文件副本
2. **渐进式优化**: 逐步应用优化，检查每个步骤的结果
3. **测试渲染**: 在目标平台上测试优化后的模型

### 压缩策略

- **几何压缩**: Draco 用于高质量压缩，Meshopt 用于快速解码
- **纹理压缩**: WebP 用于网络传输，KTX2 用于 GPU 性能
- **量化**: 在压缩前应用量化以获得最佳效果

### 兼容性考虑

- **目标平台**: 确保使用的压缩格式在目标平台上受支持
- **扩展支持**: 检查目标引擎是否支持所需的 glTF 扩展
- **功能降级**: 为不支持某些功能的平台提供备选方案

### 性能权衡

- **文件大小 vs 质量**: 更高的压缩率通常意味着更低的质量
- **解码速度 vs 压缩率**: 快速解码的格式可能压缩率较低
- **预处理时间 vs 运行时性能**: 预处理优化可以减少运行时开销

通过遵循本文档中的指南和最佳实践，您可以有效地使用 glTF Transform CLI 工具来优化和管理您的 3D 模型资产。