# 纹理图集（Texture Atlas）

将指定材质纹理合并到若干张“纹理图集”并更新引用，减少纹理数量、降低 GPU 绑定与切换成本。支持两种重映射模式：

- texture_transform：不改动几何 UV，写入 KHR_texture_transform 的 offset/scale
- geometry：直接修改几何 UV 到图集位置，不依赖扩展

合并完成后会自动清理未再被引用的原始纹理资源。

## 安装与环境
- Node 环境建议安装 sharp 以获得更快更好的图集生成与编码。
- CLI 已内置 atlas 命令；代码方式通过 @gltf-transform/functions 暴露 textureAtlas。

## 命令行用法
- 基本形式

```bash
node packages/cli/bin/cli.js atlas <input> <output> [options]
```

- 选项
  - `--types <types>`：需要合并的纹理类型，逗号分隔。默认 `baseColor,normal,metallicRoughness,occlusion,emissive`
  - `--max-size <size>`：单页图集最大尺寸（px）。默认 `4096`
  - `--padding <px>`：每个精灵周围的像素留白（px）。默认 `2`
  - `--rotate <bool>`：是否允许旋转打包。默认 `false`（当前实现未启用旋转）
  - `--pow2 <bool>`：图集尺寸按 2 的幂调整，更利于 GPU。默认 `true`
  - `--shrink <bool>`：收缩画布到最小使用区域。默认 `true`
  - `--remap <mode>`：重映射方式，`texture_transform` 或 `geometry`。默认 `texture_transform`
  - `--format <fmt>`：输出图集格式 `png|webp|avif`。默认 `png`

- 示例：写入 KHR_texture_transform，不改动 UV

```bash
node packages/cli/bin/cli.js atlas input/model.gltf output/model.atlas.gltf \
  --types baseColor,normal \
  --max-size 2048 \
  --padding 2 \
  --format webp \
  --remap texture_transform
```

- 示例：几何 UV 重映射（推荐）

```bash
node packages/cli/bin/cli.js atlas input/model.gltf output/model.atlas.geometry.gltf \
  --types baseColor,normal,metallicRoughness,occlusion,emissive \
  --max-size 1024 \
  --padding 2 \
  --format png \
  --shrink true \
  --remap geometry
```

## 代码调用
- texture_transform 模式（保留原始 UV，用扩展记录偏移/缩放）

```ts
import { NodeIO, Document } from '@gltf-transform/core';
import { textureAtlas } from '@gltf-transform/functions';
import sharp from 'sharp';

const io = new NodeIO();
const document: Document = await io.read('input/model.gltf');

await document.transform(
  textureAtlas({
    encoder: sharp,
    types: ['baseColor', 'normal', 'metallicRoughness', 'occlusion', 'emissive'],
    maxSize: 2048,
    padding: 2,
    pow2: true,
    shrink: true,
    remap: 'texture_transform',
    format: { mimeType: 'image/webp' },
  })
);

await io.write('output/model.atlas.gltf', document);
```

- geometry 模式（直接改写几何 UV，移除扩展，引用指向图集）

```ts
import { NodeIO, Document } from '@gltf-transform/core';
import { textureAtlas } from '@gltf-transform/functions';
import sharp from 'sharp';

const io = new NodeIO();
const document: Document = await io.read('input/model.gltf');

await document.transform(
  textureAtlas({
    encoder: sharp,
    types: ['baseColor', 'normal', 'metallicRoughness', 'occlusion', 'emissive'],
    maxSize: 1024,
    padding: 2,
    pow2: true,
    shrink: true,
    remap: 'geometry',
    format: { mimeType: 'image/png' },
  })
);

await io.write('output/model.atlas.geometry.gltf', document);
```

## 行为说明
- 图集生成
  - 每种类型单独生成图集页，尺寸受 `maxSize` 与 `pow2`、`shrink` 控制
  - `padding` 会保留边距以降低采样出血风险
- 引用更新
  - 所有被合并的材质槽位改为引用图集纹理
  - `texture_transform`：对槽位写入 KHR_texture_transform(offset/scale)
  - `geometry`：按图集中位置直接线性变换对应 `TEXCOORD_N`，移除 KHR_texture_transform
- 资源清理
  - 原始纹理在不再被引用时会被从文档中移除，导出只包含图集纹理

## 验证
- 使用 `inspect` 查看材质与纹理摘要、扩展使用情况：

```bash
node packages/cli/bin/cli.js inspect output/model.atlas.geometry.gltf --format md
```

## 源码参考
- 功能实现：[texture-atlas.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/functions/src/texture-atlas.ts)
- CLI 命令与参数：[cli.ts:atlas](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts#L1322-L1365)
- 扩展实现（KHR_texture_transform）：[texture-transform.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/extensions/src/khr-texture-transform/texture-transform.ts)
