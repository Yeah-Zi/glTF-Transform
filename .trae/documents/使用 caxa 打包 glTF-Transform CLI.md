**目标**

* 将 @gltf-transform/cli 打包为可分发的可执行文件，先完成 Windows（.exe），后续支持 macOS（.app/二进制）与 Linux（二进制）。

**当前结构与入口**

* CLI 包位置：packages/cli（构建与分发均在此目录进行）。

* 入口链路：bin/cli.js → dist/cli.mjs（TypeScript 源码在 [cli.ts](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/src/cli.ts)，入口脚本在 [cli.js](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/bin/cli.js)）。

* 构建工具：tsdown（脚本在 [packages/cli/package.json](file:///d:/MEGAHUB/gltf-transform-TextureAtlas/glTF-Transform/packages/cli/package.json#L19-L25)）。

* 依赖包含原生模块（如 sharp），必须在目标操作系统上打包；不支持跨平台打包。

**打包方案（Windows 优先）**

* 准备：

  * Node.js ≥ 20（与 CLI engines 一致）。

  * 在 packages/cli 中安装生产依赖并构建：

    * npm ci（在子包内安装依赖到 packages/cli/node\_modules，确保打包输入目录包含依赖）。

    * npm run build（生成 dist/cli.mjs）。

* 引入 caxa：在 packages/cli 添加 devDependency，并新增打包脚本：

  * package:win：caxa --input . --output ./dist/gltf-transform.exe -- "{{caxa}}/node\_modules/.bin/node" "{{caxa}}/bin/cli.js"

  * package:linux：caxa --input . --output ./dist/gltf-transform -- "{{caxa}}/node\_modules/.bin/node" "{{caxa}}/bin/cli.js"

  * package:mac：caxa --input . --output ./dist/glTF-Transform.app -- "{{caxa}}/node\_modules/.bin/node" "{{caxa}}/bin/cli.js"

* 说明：

  * \--input 设为 packages/cli 目录，确保包含 bin/ 与 dist/ 以及 node\_modules（caxa 会在构建目录中自动执行 npm dedupe --production）。

  * \-- 命令部分使用 {{caxa}} 占位符，运行打包内的 node 执行 bin/cli.js；运行时传入的参数会被原样转发到 CLI。

**体积与内容优化（可选）**

* 使用 --exclude 排除无关文件（如 .git、test、示例、README 等），在确保 CLI 运行完整的前提下尽量减小输出大小。

* 如需自定义图标/元数据，后续可结合 rcedit（Windows）与 .plist（macOS）实现；caxa 本身不内置该功能。

**产物与目录**

* Windows：packages/cli/dist/gltf-transform.exe。

* Linux：packages/cli/dist/gltf-transform。

* macOS：packages/cli/dist/glTF-Transform.app（或二进制）。

**验证**

* 在对应平台上直接运行产物验证：

  * Windows：.\packages\cli\dist\gltf-transform.exe --help

  * 常规命令示例：bake/optimize/inspect 等（例如 bake）。

* 关注首次运行的解压提示与缓存目录（位于系统临时目录下的 caxa 子目录），后续运行应几乎无启动开销。

**CI 方案（后续可加）**

* 在 GitHub Actions 三平台分别运行打包，产出各平台二进制并作为 Release Asset 上传；每个平台分别执行 npm ci → build → caxa。

**注意事项与风险**

* 原生模块（sharp、draco 等）要求在目标 OS 打包；不要在非目标平台上交叉打包。

* 打包时所嵌入的 Node 版本即运行 caxa 的版本；保持与项目 engines 的兼容（≥20）。

* Monorepo 场景下，务必在 packages/cli 目录内安装依赖，确保打包输入包含 node\_modules；否则运行时会缺少依赖。

**执行计划**

* 在 packages/cli 添加 caxa 及脚本，按“准备 → 打包 → 验证”流程完成 Windows 可执行文件；再复制流程到 Linux/macOS。

