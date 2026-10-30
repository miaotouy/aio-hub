# 桌面构建与 dev 启动速度调查（2026-10-30）

## 结论

本机 dev 首次打开的主要耗时来自文件监听：`.tmp/` 中积累的排查产物进入了 Vite 的监听范围。只在临时配置中增加 `.tmp/`、`.jj/` 排除项后，真实 Tauri WebView 的首次页面加载从 **198.5 秒降到 22.7 秒**。

生产前端构建的主要耗时在类型检查。本次原配置类型检查 **76.0 秒**，Vite 生产打包 **22.4 秒**。普通 `dev` 启动走 HMR，`dev:static` 则会执行生产前端构建，需分别看待。

已完成 dev 文件监听边界与 tokenizer 按需异步压缩优化。真实 Tauri WebView 复测的首次页面加载为 **14.4 秒**，相较修复前样本下降约 **92.7%**。配置对照、计时脚本和日志位于本机已忽略的 `.tmp/build-speed/`。

## 环境与口径

- Windows，本机工作目录 `E:/rc20/allinweb/aiohub-dev`。
- 当前代码基点 `004487dea`；开始调查时工作区干净。
- 实际运行版本：Bun 1.4.2、Vite 8.1.4、TypeScript 5.6.3、vue-tsc 2.2.12。版本读取自本机安装结果。
- 前端生产打包和类型检查分别计时，避免互相争抢资源；打包输出重定向到临时目录，保留原 `dist/`。
- dev 首开使用隔离数据的真实 Tauri WebView2。A/B 对照直接启动同一已构建桌面程序，分离 Rust 编译耗时。
- A/B 两组使用相同插件计时封装、端口及现有依赖预构建缓存，均新建 WebView profile、重启 Vite。唯一配置差异为监听排除 `.tmp/`、`.jj/`。
- 页面加载耗时取 Navigation Timing 的 `loadEventEnd`；监听条目统计 `watcher.getWatched()` 返回的各目录条目数，含子目录；内存取 Vite 所在进程的 RSS。
- 下列数据为单机单轮定位样本，体现当前环境的瓶颈及对照差异。

## 分段实测

| 阶段                             | 耗时 / 规模 | 依据                                                                      |
| -------------------------------- | ----------- | ------------------------------------------------------------------------- |
| 生成插件 shim                    | 0.23 秒     | `bun run generate:shims`                                                  |
| 原配置类型检查                   | 76.01 秒    | `bun run build:tsc`，通过                                                 |
| Vite 生产打包，含进程启动        | 22.45 秒    | `bun run build:vite --outDir .tmp/build-speed/dist --emptyOutDir`，通过   |
| Vite 报告的内部打包耗时          | 20.80 秒    | 转换 13,815 个模块                                                        |
| 首次 Tauri dev 的 Vite ready     | 1.06 秒     | CLI ready 日志；此时页面模块尚待转换                                      |
| 开发实例配置变化触发的 Rust 编译 | 32.95 秒    | Cargo timings，应用库阶段 22.7 秒，二进制阶段 7.5 秒，build script 0.3 秒 |
| 初次采样页面加载                 | 163.18 秒   | 原配置、独立 WebView profile                                              |
| 同一 Vite 服务内刷新             | 2.89 秒     | 约 4,037 个页面请求，已预先扩大 Resource Timing 缓冲区                    |

普通 `dev` 调用链为 `generate:shims → scripts/dev.ts → tauri dev → bun run vite + cargo run`。类型检查和生产打包出现在 `build` 链路；静态开发入口另在 `scripts/dev-static.ts` 中调用 Vite production build。

## 1. 首要瓶颈：临时排查目录进入文件监听

### 对照结果

| 指标         | 修复前配置 | 临时排除 `.tmp/`、`.jj/` |
| ------------ | ---------: | -----------------------: |
| 首次页面加载 | 198.535 秒 |                22.707 秒 |
| 监听条目     |    208,687 |                    8,001 |
| 监听目录     |     34,398 |                    1,044 |
| Vite RSS     |  2,511 MiB |                  872 MiB |

页面首开耗时降低约 **88.6%**，监听条目减少约 **96.2%**。

调查时 `vite.config.ts` 的 `server.watch.ignored` 已包含 `src-tauri/`、`.dev-data/` 和 `target/`，仍会遍历 `.tmp/`。基线采样中 `.tmp/` 占 **200,091** 个监听条目；历史 `.tmp/app-memory/` 单独约有 **149,233 个文件**。临时产物持续积累可以解释近期逐渐变慢的现象。`.jj/` 为顺带排除的工作区元数据，其基线监听条目为 275。

2026-10-16 的 `50d74250c` 已处理过 `.dev-data/` 与 Rust 产物监听。这次同类问题发生在另一个持续积累的目录。

现已为 Vite 补齐 `.tmp/`、`.jj/` 排除项，保留 `src/`、`packages/`、`plugins/` 的源码热更新。修改后完整重启 dev，使原监听资源释放。历史排查数据可以保留，优化重点在监听边界。

## 2. 剩余 dev 首开耗时：同步压缩 tokenizer 资产

插件钩子计时定位到 `scripts/vite/tokenizerAssetPlugin.ts`：加载虚拟模块时，`createAssetMap()` 对七组 tokenizer 的 JSON 与配置逐一执行同步读取和 `gzipSync(..., { level: 9 })`。

- 基线同步耗时约 6.75 秒。
- 排除临时目录后仍耗时约 6.75 秒。
- 这部分发生在 Vite 进程中，会阻塞其他模块请求；同一服务刷新时可复用已经加载的模块。

现已让 dev 虚拟模块直接返回 URL 映射，资产在首次请求时按需异步读取、压缩并缓存。并发请求共享同一个生成任务，失败后清理该缓存条目，允许下一次请求重试。生产构建继续输出现有 gzip 资产，保持运行时 URL 和内容契约。

## 3. 请求规模：图标 URL 包装模块与首屏依赖

- 同一服务刷新采样记录约 4,000 个资源请求。
- `src/config/preset-icons.ts` eager 导入 871 个 Lobe SVG 的 URL 包装模块，以及 public 自定义图标的 URL 包装模块。
- public 自定义图标的最终映射直接使用 `/model-icons/<name>`；现有做法为这些静态路径额外引入了模块请求。
- `src/main.ts` 静态导入多个分离窗口容器、插件 UI，并全量挂载 Element Plus 与图标导出，扩大了首次转换图。

建议在监听问题解决后，再评估图标路径清单与窗口容器按需加载。对应的图标映射、插件共享全局变量和分离窗口初始化契约需一并保持。当前数据足以确认请求规模，尚未逐项测定这些结构调整的收益。

## 4. Rust：切换开发实例配置会触发本体重编译

本次 Cargo fingerprint 日志明确报告 `TAURI_CONFIG` 环境变量变化：上一个开发实例与调查实例的 `devUrl`、`productName`、`identifier` 不同。随后重编译应用库与二进制，耗时约 33 秒，依赖 crate 保持复用。

`scripts/dev.ts` 会按实例生成上述配置，`tauri::generate_context!()` 将配置参与到编译产物中。固定开发实例配置可以减少这类重编译触发。若希望不同实例共享二进制，需要进一步拆分编译期身份与运行期端口、显示名称的职责，并核对应用标识相关行为。

当前 `Cargo.toml` 同时声明 `staticlib`、`cdylib`、`rlib`。本地开发产物中 staticlib 约 2.8 GiB、rlib 约 1.1 GiB，值得后续单独计时评估桌面 dev 所需的输出种类；涉及平台和打包兼容性，宜独立处理。

本地存在 383 个历史应用 fingerprint 目录，作为环境背景记录。此次重编译的直接依据为 Cargo 报告的配置变更及 timings。

## 5. 类型检查：全量成本与增量缓存

根 `build:tsc` 当前为 `vue-tsc --noEmit`，每次执行均重新启动类型检查。源码 include 同时覆盖约 350 个测试文件，保持这部分检查覆盖也应纳入优化方案。

临时启用增量选项后，连续两次使用同一缓存文件实测：

| 方式                         |     耗时 | 结果 |
| ---------------------------- | -------: | ---- |
| 原脚本全量检查               | 76.01 秒 | 通过 |
| 增量模式，首次生成缓存       | 76.74 秒 | 通过 |
| 增量模式，无源码变化再次检查 | 24.47 秒 | 通过 |

命令为 `bun run build:tsc --incremental --tsBuildInfoFile .tmp/build-speed/vue-tsc.tsbuildinfo --extendedDiagnostics`。缓存命中后本轮耗时降低约 68%，仍有启动和程序构建成本。该样本反映源码未变化的重复执行收益；代码修改后的失效范围需要在实施时另行核对。

建议优先评估可持久化的增量检查缓存，保留当前检查范围，并将缓存放入已忽略目录。若拆分应用与测试的 TypeScript project，需确保两者都有正式检查入口。

## 6. 实施与复测

两项改动已落入 `vite.config.ts` 与 `scripts/vite/tokenizerAssetPlugin.ts`。使用同一已构建桌面程序、现有依赖缓存和全新 WebView profile 复测：

| 状态                              | 首次页面加载 |
| --------------------------------- | -----------: |
| 修复前                            |   198.535 秒 |
| 仅排除临时目录的调查对照          |    22.707 秒 |
| 监听修复 + tokenizer 按需异步压缩 |    14.397 秒 |

最终采样监听条目为 8,003，监听目录 1,044；tokenizer 插件的虚拟模块加载已降至毫秒级。真实窗口中并发请求 tokenizer 配置资产并解压 JSON 成功，随后缓存请求返回正常。该轮复测安排在类型检查和生产构建结束后执行。

验证结果：

- 监听集成测试继续覆盖应用、共享包、插件源码的变更事件，并补齐 `.tmp/`、`.jj/` 产物排除。
- tokenizer 插件集成测试覆盖 URL 清单的延迟读取、并发与后续请求共享缓存、失败后重试、生产 gzip 路径及 JSON 内容。两个测试文件合计 4 项通过。
- 脚本类型检查和前端类型检查通过；前端类型检查本轮 81.11 秒。
- Vite 生产构建通过，含进程启动约 21.76 秒；14 个生产 gzip 资产全部与对应 npm 源 JSON 字节一致。

本次实施聚焦 dev 启动。类型检查缓存、图标请求收敛和 Rust 构建方案保留为后续优化项。

## 优化顺序

1. **已完成：dev 监听排除项**。源码变更监听保持有效，历史排查数据保留。
2. **已完成：tokenizer dev 按需异步压缩**。首次页面加载阶段的约 6.75 秒同步压缩已移至资产请求阶段。
3. **类型检查增量缓存**：针对正式构建重复类型检查成本。
4. **图标模块请求与首屏静态依赖收敛**：需分项计时，保持插件和分离窗口行为。
5. **Rust 开发实例配置与输出种类优化**：单独核对跨平台需求。

## 本机证据

本机忽略目录 `.tmp/build-speed/` 保存了 `vite-build.log`、`typecheck.log`、`dev-profile-first.log`、`reload-warm.json`、`ab-baseline.json`、`ab-ignored.json` 、`ab-fixed.json`、`fix-tests.log`、`fix-build-timings.txt`、`fix-production-assets.json` 和插件计时脚本。Cargo 报告由 `--timings` 输出到 `src-tauri/target/cargo-timings/`。这些原始产物保留在调查机器，仓库中保留本文的结果与解释。
