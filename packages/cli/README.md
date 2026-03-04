# @gltf-transform/cli

[![Latest NPM release](https://img.shields.io/npm/v/@gltf-transform/cli.svg)](https://www.npmjs.com/package/@gltf-transform/cli)
[![License](https://img.shields.io/npm/l/@gltf-transform/core.svg)](https://github.com/donmccurdy/glTF-Transform/blob/main/LICENSE.md)

Part of the glTF Transform project.

- GitHub: https://github.com/donmccurdy/glTF-Transform
- Project Documentation: https://gltf-transform.dev/
- CLI Documentation: https://gltf-transform.dev/cli

## Quickstart

Install the CLI, supported in Node.js LTS versions.

```bash
npm install --global @gltf-transform/cli
```

List available CLI commands:

```bash
gltf-transform --help
```

Optimize everything all at once:

```bash
gltf-transform optimize input.glb output.glb --texture-compress webp
```

Or pick and choose your optimizations, building a custom pipeline.

Compress mesh geometry with [Draco](https://github.com/google/draco) or [Meshoptimizer](https://meshoptimizer.org/):

```bash
# Draco (compresses geometry).
gltf-transform draco input.glb output.glb --method edgebreaker

# Meshopt (compresses geometry, morph targets, and keyframe animation).
gltf-transform meshopt input.glb output.glb --level medium
```

Resize and compress textures with [Sharp](https://sharp.pixelplumbing.com/), or improve VRAM usage and performance with KTX2 and [Basis Universal](https://github.com/BinomialLLC/basis_universal):

```bash
# Resize textures.
gltf-transform resize input.glb output.glb --width 1024 --height 1024

# Compress textures with WebP.
gltf-transform webp input.glb output.glb --slots "baseColor"

# Compress textures with KTX2 + Basis Universal codecs, UASTC and ETC1S.
gltf-transform uastc input.glb output1.glb \
    --slots "{normalTexture,occlusionTexture,metallicRoughnessTexture}" \
    --level 4 --rdo --rdo-lambda 4 --zstd 18 --verbose
gltf-transform etc1s output1.glb output2.glb --quality 255 --verbose
```

... [and much more](https://gltf-transform.dev/cli).

## Credits

See [*Credits*](https://gltf-transform.dev/credits).

## 打包分发（caxa）

使用 caxa 将 CLI 打包为可执行文件，便于在目标平台直接运行，无需预装 Node.js。

- 依赖与脚本修改（packages/cli/package.json）：
  - devDependencies 增加：caxa@^3.0.1
  - 新增脚本：
    - package:win：caxa --input . --output ./dist/gltf-transform.exe -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/bin/cli.js"
    - package:linux：caxa --input . --output ./dist/gltf-transform -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/bin/cli.js"
    - package:mac：caxa --input . --output ./dist/glTF-Transform.app -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/bin/cli.js"

- 准备（在仓库根目录）：
  - yarn install
  - yarn build

- 准备（在 packages/cli 目录）：
  - 生成 node_modules：npm install --workspaces=false --omit=dev
  - 为避免 Windows 上符号链接与本地源码版本差异问题，建议将本地构建包以 tgz 安装：
    - 在 packages/functions、packages/core、packages/extensions 分别执行 npm pack
    - 在 packages/cli 执行：
      - npm install ..\\functions\\gltf-transform-functions-4.3.0.tgz ..\\core\\gltf-transform-core-4.3.0.tgz ..\\extensions\\gltf-transform-extensions-4.3.0.tgz --workspaces=false --omit=dev

- 打包：
  - Windows：
    - npx caxa --input . --output ./dist/gltf-transform.exe -- "{{caxa}}/node_modules/.bin/node" "{{caxa}}/bin/cli.js"
    - 或 npm run package:win
  - Linux：
    - npm run package:linux（在 Linux 环境下执行）
  - macOS：
    - npm run package:mac（在 macOS 环境下执行）

- 验证：
  - Windows：./packages/cli/dist/gltf-transform.exe --help
  - 其他平台运行对应产物并查看帮助输出

- 注意事项：
  - 原生模块（如 sharp）存在平台差异，需在目标 OS 上打包，不能跨平台生成二进制。
  - caxa 会将调用时的 Node.js 可执行文件一并打包，建议使用 Node.js ≥ 20（与本包 engines 对齐）。
  - Yarn PnP 默认不生成 node_modules；打包输入必须包含 node_modules，故在子包内使用 npm 生成依赖目录。
  - 可用 --exclude 排除非必要文件（如 .git、test 等）以减小产物体积（谨慎排除，确保 CLI 运行完整）。

<h2>Commercial Use</h2>

<p>
	<b>Using glTF Transform for a personal project?</b> That's great! Sponsorship is neither expected nor required. Feel
	free to share screenshots if you've made something you're excited about — I enjoy seeing those!
</p>

<p>
	<b>Using glTF Transform in for-profit work?</b> That's wonderful! Your support is important to keep glTF Transform
	maintained, independent, and open source under MIT License. Please consider a
	<a href="https://gltf-transform.dev/pro" target="_blank">subscription</a>
	or
	<a href="https://github.com/sponsors/donmccurdy" target="_blank">GitHub sponsorship</a>.
</p>

<p>
	<i>
		Learn more in the
		<a href="https://gltf-transform.dev/pro" target="_blank"> glTF Transform Pro </a> FAQs</i
	>.
</p>

## License

Copyright 2023, MIT License.
