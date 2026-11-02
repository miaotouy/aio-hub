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

调查初始，根 `build:tsc` 为 `vue-tsc --noEmit`，每次执行均重新启动类型检查。源码 include 同时覆盖约 350 个测试文件，保持这部分检查覆盖也应纳入优化方案。

临时启用增量选项后，连续两次使用同一缓存文件实测：

| 方式                         |     耗时 | 结果 |
| ---------------------------- | -------: | ---- |
| 原脚本全量检查               | 76.01 秒 | 通过 |
| 增量模式，首次生成缓存       | 76.74 秒 | 通过 |
| 增量模式，无源码变化再次检查 | 24.47 秒 | 通过 |

命令为 `bun run build:tsc --incremental --tsBuildInfoFile .tmp/build-speed/vue-tsc.tsbuildinfo --extendedDiagnostics`。缓存命中后本轮耗时降低约 68%，仍有启动和程序构建成本。该样本反映源码未变化的重复执行收益；代码修改后的失效范围需要在实施时另行核对。

现已将增量选项接入根 `build:tsc`，缓存使用已忽略的 `.tmp/typecheck/vue-tsc.tsbuildinfo`，保持原有源码与测试检查范围。`build` 和桌面构建沿用该入口；首次运行生成缓存，后续根据变更更新检查结果。

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

首轮实施聚焦 dev 启动。后续已接入正式构建的类型检查缓存，并让便携版跳过安装包生成；图标请求收敛和 Rust 构建方案保留为后续优化项。

## 7. 正式构建提速

根 `build:tsc` 已启用增量缓存；普通桌面安装包构建入口保持原样，便携版的普通与 `--local` 两个入口均向内部 Tauri 构建传入 `--no-bundle`，成功后照常导出版本化 EXE 与 `portable.flag`。

便携版集成测试在临时工作区运行真实脚本，以轻量构建替身验证普通与本地模式的参数传递、产物导出，以及构建失败时阻止导出旧 EXE。相关便携版、日志、Android 构建测试共 13 项通过，修改涉及的脚本 TypeScript 检查通过。

正式入口验证：`bun run build` 首次生成 `.tmp/typecheck/` 缓存并完成生产打包，耗时 **99.46 秒**；随后 `bun run build:tsc --extendedDiagnostics` 缓存命中，耗时 **27.15 秒**，两项均通过。该轮首次完整前端构建包含类型检查及 Vite 打包，缓存命中样本仅计类型检查。原始日志和计时保存在 `.tmp/build-speed-implementation/`。

完整桌面构建已于 2026-10-30 21:55:25 至 22:01:18（Asia/Shanghai）执行 `bun run tauri:build:local`，退出码为 0，总耗时 **353.23 秒（5 分 53 秒）**。Vite 内部打包耗时 **23.06 秒**，Cargo 报告 release 阶段 **3 分 59 秒**；其余时间包含类型检查、前置资源处理、NSIS 打包与更新签名。成功生成本地版本 EXE、NSIS 安装包及 `.sig` 更新签名，并完成临时配置清理。完整日志位于 `.tmp/build-logs/desktop-2026-10-30T13-55-25-221Z-70248.log`，总计时位于 `.tmp/build-speed-implementation/desktop-full-build.json`。本轮沿用现有依赖与类型检查缓存，应用 Rust crate 发生了重新编译；该结果用于记录当前完整构建耗时。

类型检查与 Vite 打包保持串行；Rust profile、链接配置和编译优化等级保持原样。便携版安装包阶段的节省量留待真实 Tauri 全链路计时。

## 8. Rust release 编译时间调查

### 基线与分段

以提交 `3a720b905` 为代码基点，执行 `bun run tauri:build:local --no-bundle -- --timings`。本轮保留前端生产构建，跳过安装包生成，Cargo 使用 release 默认优化设置。总耗时 340.37 秒，其中 Vite 内部打包 24.14 秒，Cargo 报告 274.7 秒；该单轮结果用于定位阶段成本，与此前 239 秒的 Rust 样本存在运行波动。

| Cargo 单元 | 耗时 |
| --- | ---: |
| 应用库 `aio_hub_lib` | 266.4 秒 |
| `aiohub` 二进制 | 6.0 秒 |
| 应用 build script 执行 | 0.2 秒 |

1037 个单元命中缓存，3 个单元重建。应用库约占 Cargo 时间的 97%，依赖已得到复用。末尾进程采样覆盖 DLL 与 EXE 的两次 `link.exe` 调用，各约 3～5 秒；主要成本集中在应用库编译。Cargo 的最大单元并发为 2，`jobs=24`；本轮待重建单元很少，该数字与 rustc 内部代码生成线程数应分开理解。

原始基线的应用库同时输出 `staticlib`、`cdylib`、`rlib`，且 `tauri::generate_context!()` 位于同一应用库中。依赖信息包含 `dist/index.html` 等前端产物，前端资源变化会参与 Rust 应用库的失效判断。后续优先评估应用库的增量复用；仅从产物体积推断删除库类型的收益仍需专项对照。

原始 Cargo 报告和进程采样保存于 `.tmp/rust-build-investigation/baseline-cargo-timing.html`、`baseline-units.json`、`baseline-rust-processes.json`。链接时间来自约 1 秒间隔的末尾采样，按近似值使用。

### 应用包增量编译对照

对照通过临时 Cargo 参数设置 `profile.release.package.aiohub.incremental=true`，同时显式保留 `profile.release.package.aiohub.codegen-units=16` 与 `opt-level=3`。构建启用与基线一致的 `tauri/custom-protocol` 特性，并沿用当前 Cargo fingerprint 中记录的 `TAURI_CONFIG`，保持本地版本与资源配置一致。正式 `Cargo.toml`、构建脚本和优化等级保持原样。

| 场景 | Cargo 耗时 | 应用库耗时 | 缓存情况 |
| --- | ---: | ---: | --- |
| 普通 release，应用重编译基线 | 274.7 秒 | 266.4 秒 | 1037 个单元复用，3 个重建 |
| 增量模式，首次建立缓存 | 258.2 秒 | 250.27 秒 | 首轮另有少量插件单元重建 |
| 缓存建立后，给 `dist/index.html` 加入 HTML 注释 | 145.5 秒 | 140.31 秒 | 1038 个单元复用，2 个重建 |
| 恢复原始 HTML 字节，再次编译 | 143.3 秒 | 138.02 秒 | 1038 个单元复用，2 个重建 |
| 相同输入，再次执行 Cargo | 1.90 秒 | 无编译 | 1040 个单元全部复用 |

前四行使用 Cargo timings；最后一行使用 Cargo CLI 报告耗时，该行用于确认相同输入能稳定复用产物。HTML 修改与还原两轮的进程级总计时分别为 145.98 秒、144.17 秒，均退出 0。首次建缓存与普通基线的少量差异按运行波动处理；缓存建立后的资源小改样本，比本轮普通应用重编译基线降低约 47%。收益范围为该类资源小改，Rust 源码重构与依赖升级需另取样本。

Cargo fingerprint 日志明确指出恢复后的 `dist/index.html` 时间变化使应用库失效。`tauri-codegen` 的 `EmbeddedAssets::to_tokens` 同时以 `include_bytes!` 跟踪原始资源与缓存压缩资源，因此前端产物更新会进入应用库的依赖检查。首次生成压缩资源后，也可能因其时间晚于编译起点而使下一轮失效。本轮已完成还原构建，确认原始 HTML 字节恢复，并验证随后一次构建全部命中缓存。

本轮有效应用库增量缓存目录约 2.7 GiB，包含保留的编译会话。实验的 Cargo 报告、编译器参数、进程计时与 fingerprint 日志保存在 `.tmp/rust-build-investigation/`；`comparison.json` 汇总各轮构建单元数据。首次缺少 `tauri/custom-protocol` 的试运行已中止，排除在上述对照之外。

### 后续实施建议

1. 前端产物变化优先通过资源嵌入拆分缩小重建范围，实测见下一节。应用包级增量参数保留为 Rust 源码修改场景的候选方案，正式配置暂时沿用原有 release 设置。
2. 将 Rust 源码小改作为下一种性能样本，核对缓存收益和磁盘增长；本轮已覆盖内嵌资源改动与还原。
3. 保留 `staticlib`、`cdylib`、`rlib` 的正式配置，待单独量化桌面所需输出类型后再决策。链接采样只有数秒，链接器替换优先级较低。

设置含义参考 Cargo 官方 [Profiles](https://doc.rust-lang.org/cargo/reference/profiles.html) 与 [Build timings](https://doc.rust-lang.org/cargo/reference/timings.html)；Tauri 内嵌资源行为依据本机锁定的 `tauri-codegen 2.6.3` 源码核对。

## 9. 前端资源嵌入移至 EXE 入口

将桌面端 `tauri::generate_context!()` 从 `src-tauri/src/lib.rs` 移至 `src-tauri/src/main.rs`，应用库通过 `run_with_context(context)` 接收上下文。移动平台的无参数 `run()` 入口在 `cfg(mobile)` 下保留，内部委托同一初始化函数；独立的 `mobile/src-tauri` 包保持原样。

### 对照方式与结果

沿用此前记录的 `TAURI_CONFIG`，从 `src-tauri` 运行 `cargo build --release --bin aiohub --features tauri/custom-protocol --timings`。本轮移除实验性增量参数，使用普通 release 设置，保留三种库输出、优化等级与依赖缓存。先构建新结构，再只给生成的 `dist/index.html` 追加 HTML 注释，随后按原始字节恢复并重建，最后验证相同输入缓存。

| 场景 | Cargo 耗时 | 应用库耗时 | EXE 耗时 | 缓存情况 |
| --- | ---: | ---: | ---: | --- |
| 原结构普通 release 基线 | 274.7 秒 | 266.4 秒 | 6.0 秒 | 1037 个复用，3 个重建 |
| 新结构首次构建 | 253.4 秒 | 191.99 秒 | 57.59 秒 | 1037 个复用，3 个重建 |
| 仅改生成 HTML | 59.4 秒 | 命中缓存 | 57.69 秒 | 1039 个复用，1 个重建 |
| 恢复原始 HTML | 60.6 秒 | 命中缓存 | 58.9 秒 | 1039 个复用，1 个重建 |
| 相同输入再次构建 | CLI 1.83 秒 | 命中缓存 | 命中缓存 | 1040 个全部复用 |

所有构建退出码均为 0。进程采样与 Cargo timings 均确认两轮前端资源变化只有二进制目标重建。给 HTML 加注释与恢复两轮的进程级耗时为 59.91 秒、61.18 秒；无变更探测的进程级耗时为 2.95 秒。HTML 已恢复原始字节。

相较此前普通应用重编译基线，这类前端资源小改的 Rust 阶段耗时降低约 78%；相较应用包增量实验的 145.5 秒，降低约 59%。这些结果对应本机已有依赖缓存和该轮输入，首轮构建仍需要编译应用库。资源嵌入及其代码生成成本转移到了 EXE，二进制目标的编译时间增加到约 58 秒；前端资源依然随 EXE 分发。

### 正式构建入口与运行验证

再执行 `bun run tauri:build:local --no-bundle -- --timings`，包含正常类型检查、完整 Vite 资源重建与 Rust release 编译，退出码为 0，总耗时 **125.16 秒**。Vite 内部打包 **23.44 秒**，Cargo **65.7 秒**，其中 EXE 编译 **64.08 秒**；1039 个单元命中缓存，只有二进制目标重建。应用库在实际前端生产构建流程中继续命中缓存。该轮跳过安装包生成。

使用生成的 release EXE 和 `.tmp/rust-build-investigation/runtime/` 内独立数据、WebView profile 启动真实应用，约 2.12 秒后收到 `main` 窗口 `phase=vue-mounted` 的前端 ready 回报，确认内嵌资源加载、Vue 挂载与前后端 IPC 可用。验证后关闭本轮创建的实例，保留原有应用实例。

两份修改文件的 `rustfmt --check` 发现 `lib.rs` 中两处已有格式差异（模块排序与相邻 Linux 分支换行）；本轮保持无关代码原样。

### 适用边界与本机证据

Rust 源码、依赖、构建特性、版本、`TAURI_CONFIG` 或共享 build script 输入变化，仍可能触发应用库重建。上述数字仅统计 Cargo 阶段，完整构建另含类型检查、Vite、资源处理及可选的安装包生成。本轮保持 release 配置与安装包机制。

原始报告位于 `.tmp/rust-build-investigation/context-*-cargo-timing.html`，进程与 fingerprint 日志使用相同前缀；`context-comparison.json` 汇总构建单元数据。生成 HTML 的备份保存在 `context-original-index.html`。正式入口日志为 `.tmp/build-logs/desktop-2026-10-30T14-45-43-476Z-23008.log`，总计时为 `context-official-build.json`，运行验证结果为 `runtime/result.json`。

## 10. 资源嵌入成本与 EXE 编译分段

上一节的约一分钟统计整个二进制目标编译。进一步用 rustc `-Ztime-passes` 拆分阶段，并用相同 EXE 源码、编译参数、已构建依赖与 `TAURI_CONFIG` 做独立输出目录对照。本轮使用锁定版本 `tauri 2.11.5`、`tauri-codegen 2.6.3` 与 `rustc 1.98.1`。诊断选项仅用于临时探测，正式构建配置保持原样。

### 普通 release 的阶段分布

完整资源的 rustc 本体耗时 **56.539 秒**：

| 阶段 | 耗时 |
| --- | ---: |
| 宏展开（含资源扫描、内容处理、压缩缓存检查及索引生成） | 8.447 秒 |
| 单态化及 LLVM IR 代码生成 | 5.859 秒 |
| 等待 LLVM 优化与代码生成完成 | 36.913 秒 |
| 其中：本地 ThinLTO 阶段 | 32.457 秒 |
| 链接阶段 | 3.099 秒 |

各阶段存在嵌套及并行，表内 ThinLTO 是 LLVM 阶段的子项。当前没有显式启用全程序 LTO，报告中的 ThinLTO 对应编译器在本 crate 多代码生成单元之间执行的本地优化。`embed-bitcode=no` 下仍可出现这类本地优化。

### 控制变量对照

临时源文件都放在 `.tmp/rust-build-investigation/embed-*/`，直接复用已捕获的 rustc 命令和必要编译环境，输出到各自目录，保留正式 EXE 与仓库源码。

| 变体 | rustc 耗时 | 说明 |
| --- | ---: | --- |
| 原始完整资源与完整上下文 | 56.539 秒 | 普通 release 设置 |
| 将资源替换为空，保留上下文生成 | 49.144 秒 | `generate_context!(assets = 空 EmbeddedAssets)` |
| 空资源上下文，另嵌入单个 ZIP 字节块 | 48.514 秒 | 用 `black_box(include_bytes!(ZIP))` 保留约 65.9 MiB 资源包 |
| 保留全部资源，仅对 EXE 临时加 `-C lto=off` | 36.398 秒 | 保持 `opt-level=3`，后端库沿用已有产物 |

全部有效变体编译成功。空资源和单 ZIP 两轮相差约 0.6 秒，按运行波动理解，未测得单个大字节块带来显著额外成本。ZIP 对照仅验证字节嵌入成本，未实现 ZIP 资源提供器，生成的对照 EXE 不用于功能运行。

完整资源与空资源对照相差约 **7.4 秒**；保留上下文生成时，即使去掉所有前端资源仍需约 **49 秒**。宏展开从约 8.4 秒降至不足 0.4 秒，LLVM 本地 ThinLTO 仍需约 33 秒。因此当前主要优化方向是减少前端变化时重复编译的上下文初始化代码。只把散文件换成一个 ZIP，同时保留 EXE 中的完整 `generate_context!()`，仍会承担约 49 秒的编译成本。

`lto=off` 单轮降低约 36% 的 EXE 编译耗时，但会改变代码优化方式。该参数未接入正式入口，运行性能与产物体积尚需单独评估。

### ZIP 打包与重复资产

当前 `dist/` 共 **2,982 个文件，100.64 MiB**。同一批文件用 Python 标准库打包：ZIP store 耗时 **1.117 秒**、约 101.04 MiB；ZIP deflate level 1 耗时 **2.918 秒**、约 65.87 MiB。此结果衡量归档本身，与 Tauri 当前 Brotli 压缩及运行期资源读取机制分开理解。

发现可去重内容约 **12.73 MiB**，主要是 OCR 语言包同时出现在 `assets/*traineddata*.gz` 与 `tesseract-lang/`。`src/tools/smart-ocr/config/language-packs.ts` 用 `import.meta.glob` 获取语言选项，但这些动态导入仍让 Vite 输出资产副本；实际 OCR Worker 使用 `/tesseract-lang` 公共路径。修正时应保留语言发现和 Worker 资源路径契约。

### 后续方向与证据

优先评估让配置、权限等上下文生成留在后端库缓存中，由 EXE 仅提供资源数据。Tauri 的 `generate_context!(assets = ...)` 和 `Assets` 接口提供了拆分入口；资源生成或资源包提供器仍需独立设计。进一步采用链接后的 EXE 资源注入或外置资源包，需配套读取实现与打包、签名流程调整。

原始阶段日志为 `embed-native-profile-stderr.log`，摘要为 `embed-profile-summary.json`，变体汇总为 `embed-variant-results.json`，资产与 ZIP 测量为 `embed-asset-stats.json`，均位于 `.tmp/rust-build-investigation/`。初次诊断设置引发依赖失效及 Windows 命令行长度问题，相关未完成试运行排除；最终诊断 Cargo 总耗时包含依赖恢复，未用作资源成本对照。所有有效对照仅引用各 rustc 本体阶段。

最后恢复常规命令复核：全部 1040 个 Cargo 单元复用，CLI 耗时 2.04 秒。正式 release EXE 保留完整资源，临时对照源码和产物均留在忽略目录。

## 11. 上下文与资源独立编译的实施结果

### 实现

新增桌面专用 proc-macro crate `src-tauri/crates/desktop-entry`。EXE 根据 Tauri 的 `cfg(dev)` 调用 `run!(true/false)`，读取同一配置与 `TAURI_CONFIG`，通过官方 `tauri-codegen::embedded_assets::EmbeddedAssets` 只生成资源表达式，再调用 `aio_hub_lib::run_with_assets`。配置、权限和上下文初始化在后端库中用 `generate_context!(assets = assets)` 生成并缓存。

压缩格式、缓存、原始输入依赖跟踪和运行期读取沿用 Tauri。有效 CSP 或 isolation 配置自动委托 EXE 中的官方完整上下文宏，保留 HTML nonce、哈希及相关安全处理；这类配置仍承担完整上下文编译成本。开发服务、静态资源构建及目录/文件清单/远程 URL 的配置分支保持对应的 Tauri 行为。移动端包保持原样。

OCR 语言发现改为 Vite 虚拟清单插件 `tesseractLanguagesPlugin`，扫描 `public/tesseract-lang` 中的文件名，不再向模块图导入语言包二进制。开发模式新增、删除语言文件会刷新选项；Worker 沿用 `/tesseract-lang` 公共路径。

### 构建对照

| 场景 | Cargo 耗时 | 应用库 | EXE 编译 |
| --- | ---: | --- | ---: |
| 上一轮完整前端重建（上下文在 EXE） | 65.7 秒 | 复用 | 64.08 秒 |
| 本轮完整前端重建 | **17.1 秒** | 复用 | 15.30 秒 |
| 本轮仅修改生成 HTML | **14.8 秒** | 复用 | 13.03 秒 |
| 本轮恢复原始 HTML | **14.7 秒** | 复用 | 13.03 秒 |

新结构首次建立缓存的 Cargo 耗时为 214.4 秒，其中应用库 197.51 秒、EXE 14.42 秒、proc-macro crate 0.85 秒。后续三轮均为 1040 个单元复用、1 个二进制单元重建。相较上一轮约 59～61 秒的前端资源小改样本，本轮约 14.7～14.8 秒，降低约 75%；相较最初约 274.7 秒的普通应用重编译样本，降低约 95%。这些对照对应已有依赖缓存和同一机器上的各轮输入。

正式入口 `bun run tauri:build:local --no-bundle -- --timings` 退出 0，包含类型检查与 Vite 生产打包，总耗时 **72.78 秒**；Vite 内部打包 **21.23 秒**，Cargo **17.09 秒**。相较上一轮同入口的 125.16 秒，本轮减少约 42%。该入口跳过安装包生成。

Cargo 依赖信息复核：`aio_hub_lib.d` 已不跟踪 `dist/index.html`，`aiohub.d` 继续跟踪；前端资源变更仍会进入 EXE 的失效判断。

### LTO 决策

本轮临时阶段采样：完整资源 rustc 本体 **13.790 秒**，宏展开 **8.192 秒**，代码生成 **0.177 秒**，本地 ThinLTO **0.840 秒**，链接 **2.740 秒**。上下文生成移回后端缓存后，原本约 32.5 秒的本地 ThinLTO 已缩短到不足 1 秒。

仅对临时 EXE 关闭 LTO 的对照耗时 **11.260 秒**，其中宏展开 7.283 秒、链接 2.516 秒。单轮总差约 2.5 秒，包含资源处理及链接的运行波动。此次保留正式 release 优化配置，未启用 `lto=off` 或包级增量编译。

### 产物与验证

生产前端产物从 **100.64 MiB / 2982 文件** 降为 **88.61 MiB / 2970 文件**，减少 **12.03 MiB**。六份 OCR 语言包各保留一份，位于 `tesseract-lang/`，字节保持原样。这里统计 `dist/`；Tauri 本身存在按内容复用的压缩缓存，EXE 体积收益需单独看待。

新增两项 Vite 集成测试，覆盖生产输出中的语言包路径、字节与单份分发，以及开发模式语言增删、组合选项和 HTTP 资源读取；与相邻 tokenizer 插件集成测试一起运行，共 5 项通过。前端类型检查、相关脚本严格类型检查、正式 Vite 构建通过；`cargo check --bin aiohub` 的 dev 模式检查通过（25.43 秒）。

使用正式 release EXE、新建独立数据与 WebView profile 启动真实应用，约 2.12 秒后收到 `main` 窗口 `phase=vue-mounted` 回报，确认资源加载和前后端通信可用。测试实例已关闭，原有实例保持运行，生成 HTML 的测试注释已还原。最后执行常规 release 命令，1041 个单元全部命中缓存，CLI 耗时 1.94 秒。

汇总与原始文件保存在 `.tmp/rust-build-investigation/`：`split-comparison.json`、`split-official-build.json`、`split-asset-stats.json`、`split-lto-comparison.json`、`split-profile-stderr.log`、`split-dev-check.log` 与 `split-runtime/result.json`。正式入口日志为 `.tmp/build-logs/desktop-2026-10-30T15-17-35-753Z-83940.log`。

## 优化顺序

1. **已完成：dev 监听排除项**。源码变更监听保持有效，历史排查数据保留。
2. **已完成：tokenizer dev 按需异步压缩**。首次页面加载阶段的约 6.75 秒同步压缩已移至资产请求阶段。
3. **已完成：类型检查增量缓存**：正式构建复用 `.tmp/typecheck/vue-tsc.tsbuildinfo`。
4. **已完成：便携版跳过安装包生成**：内部 Tauri 构建增加 `--no-bundle`，保留 release EXE 导出和便携模式标识。
5. **图标模块请求与首屏静态依赖收敛**：需分项计时，保持插件和分离窗口行为。
6. **已完成：Rust 上下文与资源独立编译**：前端资源小改可复用后端库和上下文初始化代码，Cargo 阶段实测约 14.7～14.8 秒，完整前端重建后的 Cargo 为 17.1 秒。
7. **已完成：OCR 语言包单份分发**：语言发现使用虚拟清单，生产前端产物减少约 12.03 MiB。

## 本机证据

本机忽略目录 `.tmp/build-speed/` 保存了 `vite-build.log`、`typecheck.log`、`dev-profile-first.log`、`reload-warm.json`、`ab-baseline.json`、`ab-ignored.json` 、`ab-fixed.json`、`fix-tests.log`、`fix-build-timings.txt`、`fix-production-assets.json` 和插件计时脚本。Cargo 报告由 `--timings` 输出到 `src-tauri/target/cargo-timings/`。这些原始产物保留在调查机器，仓库中保留本文的结果与解释。
