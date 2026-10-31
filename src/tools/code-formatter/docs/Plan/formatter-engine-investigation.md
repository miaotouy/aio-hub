# 代码格式化引擎调查

调查日期：2026-10-31。范围为应用内 Code Formatter 和复用的 HTML 格式化调用；仓库开发时使用的 Prettier 配置保持独立。

## 第二阶段实施：Rust、C/C++ 系统格式化器

- 已在语言选择中增加 Rust、C、C++，工具共支持十二种语言。PHP 使用 Mago，其余八种语言延续 Prettier。
- Rust 通过 rustfmt 格式化，提供 edition 2015/2018/2021/2024 选择；C 与 C++ 共用 clang-format，采用 LLVM 风格。
- 默认从 PATH 查找，也支持填写绝对路径；界面展示可用版本或安装/路径提示，并提供重新检测。路径和 edition 通过工具配置管理器保存。
- 延续统一 `format_code` IPC 与失败保留输入的结果契约；新增 `code_formatter_status` 返回引擎检测结果。
- 系统进程直接启动，源码使用 stdin；工作目录和格式配置隔离，Rust 跳过子模块。格式化时限 10 秒、探测 5 秒，限制输入/输出大小，并在超时或管道错误时终止回收进程。
- 本机真实 Tauri IPC 验证 Rust、C、C++、PHP 的格式化与幂等性、Rust 未提供子模块、Rust 语法错误及缺失程序提示。前端 8 项测试、Rust 7 项测试通过（另有 1 个由子进程调用的夹具入口），类型检查与 Vite 构建通过。
- 页面验证通过：Rust edition 切换、无效路径提示、修正后恢复、重新进入后的设置持久化，以及 C/C++ 共用绝对路径的实际格式化。
- 本阶段沿用可选系统工具分发策略，随应用打包引擎需要另行评估平台依赖和许可证。当前接口和边界见工具架构文档。

## 第一阶段实施：PHP 原生格式化

- 本机 Windows MSVC stable 工具链已从 Rust 1.98.1 升至 1.99.1，现有四个 Android 编译目标保留；仓库桌面 Cargo package 声明最低 Rust 1.99。
- PHP 已切换到 `mago-formatter 1.59.0`。纯逻辑位于 `src-tauri/crates/code-formatter/`，Tauri 命令 `format_code` 负责派发阻塞任务，注册位置沿用当前 `src-tauri/src/commands.rs` 汇总入口。
- 默认 PHP 目标版本为 8.4，换行宽度 80、缩进 4 空格、单引号优先；支持显式 PHP 版本、缩进、行宽、引号、尾逗号和换行符设置。输入只在内存中处理。
- 已移除前端 PHP 插件及 npm 依赖。PHP 需要真实桌面运行态；其余八种语言继续使用 Prettier，并保留浏览器使用能力。
- 前端维持现有结果契约；原生任务返回的字符串错误会正确展示，旧请求结果会在输入或语言变化后失效。
- 本轮按分阶段方案落地 PHP。其他八种语言的原生化仍为后续工作。
- 工具链升级暴露了目录搜索中的两处原子操作弃用提示，已将 `fetch_update` 等价迁移为编译器推荐的 `try_update`。
- 验证通过：格式化库 4 项单测、前端结果契约 4 项测试、前端类型检查、Vite 生产构建，以及隔离 Tauri 实例的 PHP 正常输入、语法错误、选项传递和页面输入输出。生产构建中已无 PHP 插件的 `fs/path` 外部化警告。日志与临时样例位于 `.tmp/formatter-upgrade/`。

## 结论

- PHP 构建警告对应一条真实的浏览器不兼容调用路径：插件默认根据本地 `composer.json` 推断 PHP 版本，依赖 `process`、`fs`、`path`。
- 短期可通过显式设置 PHP 版本修复该运行路径；升级插件本身仍会遇到同一默认行为。显式版本能绕开文件访问，顶层导入造成的构建警告仍然存在。
- PHP 原生化优先评估 Mago。它提供接收内存代码的 Rust API，适合直接接入 Tauri command。
- 原有九种语言可由 dprint 生态的 Rust 库与 Mago 组合覆盖。适合分语言逐步迁移，并保留现有前端入口和结果契约。
- 直接接入各格式化 crate 更符合应用内字符串处理场景；整个 dprint CLI、动态插件下载与 WASM 宿主可以留给需要可扩展插件的场景。

## 调查时的实现

- `src/tools/code-formatter/logic/formatter.ts`：`FormatterCore.formatCode()` 统一接入 `prettier/standalone`，各语言解析器与 PHP/XML 插件按需动态导入并缓存。
- `src/tools/code-formatter/types.ts`：JS、TS、JSON、HTML、CSS、Markdown、PHP、XML、YAML 九种语言；结果为 `formatted / success / error / warning`。
- `src/tools/code-formatter/CodeFormatter.vue`：输入变化后 500ms 防抖格式化。
- `src/tools/web-distillery/components/distillery/PreviewPanel.vue`：单独动态导入 Prettier 格式化 HTML；超过 200KB 的快照跳过自动美化，以保持响应。
- 常用默认选项包含 `singleQuote: true` 和 `trailingComma: "es5"`；开放选项允许继续传入其他 Prettier 配置。
- 工具现有架构文档仍描述部分插件静态导入，当前源码已改为全部按需加载；实施迁移时同步修正文档。

## PHP 问题复现

初次调查时安装 `@prettier/plugin-php 0.24.0`。其 standalone 仍引入 `fs` 与 `path`；`phpVersion` 的默认值为 `auto`，会进入 `getComposerPhpVersion()` 并执行 `process.cwd()`。

在无 `process`、无文件系统全局变量的隔离 JS VM 中，通过浏览器 UMD 入口加载插件，以同一段 PHP 函数为输入：

| 插件   | 参数                | 结果                                     |
| ------ | ------------------- | ---------------------------------------- |
| 0.24.0 | 默认参数            | `ReferenceError: process is not defined` |
| 0.24.0 | `phpVersion: "8.2"` | 格式化成功                               |
| 0.26.0 | 默认参数            | `ReferenceError: process is not defined` |
| 0.26.0 | `phpVersion: "8.2"` | 格式化成功                               |

0.26.0 是调查时 npm `latest` 返回的版本，测试源码下载到 `.tmp/formatter-investigation/`，项目依赖保持原样。8.2 仅作为对照实验参数，产品默认版本应独立决定。

这项实验确认了默认行为对 Node 环境的依赖。初次调查只执行隔离复现；本轮真实 Tauri 验证结果见实施更新。项目 Vite 配置仅替换 `process.env.PRETTIER_DEBUG`，没有提供 `process.cwd()` 的浏览器实现。

显式配置版本后，顶层 `fs/path` 导入仍会被构建器解析。因此运行修复与消除构建警告应分开处理。迁走 PHP 引擎并移除其前端导入，可以从依赖路径上解决这类警告。

## 方案对比

| 方案                         | 对当前工具的适配                       | 主要代价                                                                                  | 判断                                 |
| ---------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| 保留 Prettier，修复 PHP 参数 | 保留九种语言及现有输出风格             | 顶层 Node 导入警告仍在，格式化计算仍处于前端                                              | 适合短期修复                         |
| Prettier 移入 Web Worker     | 保留现有引擎，格式化计算移出 UI 线程   | Worker 打包、错误与请求管理；PHP 默认行为仍需修复                                         | 适合以较低成本处理前端卡顿           |
| Mago 接管 PHP                | PHP 内存字符串直接走 Rust              | 风格及选项映射、Rust 版本要求                                                             | 推荐作为原生化的第一步               |
| dprint 生态 crate + Mago     | 原生覆盖九种语言，统一接入现有前端 API | 多引擎适配、嵌入代码回调、Rust 编译与二进制成本                                           | 推荐作为完整原生化方向               |
| Oxfmt                        | 官方列出多种原生语言，也提供 Node API  | 当前 HTML 等格式仍由内置 Prettier 处理且依赖 Node；PHP/XML 缺少本次需求所需的完整覆盖依据 | 可继续观察，当前适合作为部分语言候选 |
| Biome                        | JS/TS/JSON/CSS 等前端语言可作为候选    | 本次查阅材料不足以确认九种语言的统一覆盖；HTML 支持与稳定性需按选定版本核对               | 单独替换整个工具收益有限             |

Oxfmt 的“支持某语言”需要同时核对其原生列表与 Prettier 委托列表。官方文档明确：Prettier-backed 格式依赖 Node，仅 npm 包支持，独立二进制会跳过这些文件。

## 原生引擎组合

以下为初次调查时 crates.io 返回的稳定版本。PHP 的实施与验证见文首；其余语言的组合尚未编译集成，性能与体积也尚未测量。

| 现有语言                | 候选 Rust 库               | 查询版本 | 备注                                                             |
| ----------------------- | -------------------------- | -------- | ---------------------------------------------------------------- |
| JavaScript / TypeScript | `dprint-plugin-typescript` | 0.96.1   | 公开 `format_text` 等原生库入口                                  |
| JSON                    | `dprint-plugin-json`       | 0.25.2   | 配置与 Prettier 并非完全一致                                     |
| Markdown                | `dprint-plugin-markdown`   | 0.28.2   | 代码围栏中的嵌入语言需要接入对应引擎                             |
| HTML / XML              | `markup_fmt`               | 0.27.6   | 公开 Rust `format_text`；HTML 内 script/style 需要外部格式化回调 |
| CSS                     | `malva`                    | 0.16.0   | 同时可覆盖 SCSS、Sass、Less                                      |
| YAML                    | `pretty_yaml`              | 0.6.0    | YAML 独立适配                                                    |
| PHP                     | `mago-formatter`           | 1.59.0   | 最新版本的 Rust 要求高于当前本机，见下一节                       |

这些库可直接作为 Rust 依赖使用。采用这条路线时，应用携带原生实现，格式化过程无需安装 Node、PHP 或临时读写源码文件。dprint 的插件清单中也包含进程型包装插件；它们的部署要求需要单独看待。

### Mago 的版本边界

- 本机：`rustc 1.98.1`。
- `mago-formatter 1.59.0` 的声明最低 Rust 版本：`1.99.0`。
- crates.io 返回的较新兼容候选：`1.51.0`，声明最低 Rust 版本 `1.97.0`。
- 1.51.0 与 1.59.0 源码均公开 `Formatter::new(...)` 和 `format_code(name, code)`；输入为内存中的字节内容。
- 实施时选择同步提升工具链，或先约束兼容版本。后者还需检查 Mago 内部 crate 的解析结果；单个 crate 的最低版本声明无法代替完整编译验证。
- Mago 使用 `MIT OR Apache-2.0`；表中其他库查询到的许可证为 MIT。

## 建议的接入方式

保留前端 `FormatterCore.formatCode()` 作为调用入口，以语言路由选择原生适配器。新增统一 `format_code` command，返回现有 `FormatResult` 契约，按项目规范注册到 Tauri command 列表。

1. **先迁 PHP**：Mago 处理字符串输入；显式传入 PHP 目标版本；从前端移除 PHP 插件导入。其他语言继续复用当前实现。
2. **再迁其余语言**：JS/TS/JSON/Markdown 接入 dprint 对应 crate，CSS/YAML 使用独立库，HTML/XML 使用 markup_fmt。
3. **补齐嵌入语言**：HTML 的 script/style、Markdown 代码围栏通过统一语言路由回调格式化。只有外层缩进变化时，应明确其能力边界。
4. **复用 HTML 入口**：Web Distillery 改调同一服务，保留合理的大内容交互策略；原生化后的实际阈值由运行体验决定。
5. **处理交互与选项**：CPU 工作放入 `spawn_blocking` 等阻塞任务通道；使用请求序号避免旧响应覆盖新输入。定义共享选项并显式映射，语言特有参数分别处理。

`singleQuote`、`trailingComma`、缩进、换行与 XML 空白敏感度需要逐项映射。不同格式化引擎的排版风格会存在差异，迁移前应与现有用户可见行为对照；无需追求所有输出与 Prettier 逐字一致。

## 初次调查完成范围

初次调查完成实现审阅、PHP 默认参数隔离复现、替代引擎公开 API 与语言覆盖调查，以及 Mago 的最低 Rust 版本检查。此时业务代码和依赖保持原样；后续集成与运行态验证见文首两阶段实施更新。

## 资料

- [PHP 插件 npm 元数据](https://registry.npmjs.org/@prettier%2fplugin-php/latest)
- [PHP 插件选项源码](https://github.com/prettier/plugin-php/blob/main/src/options.mjs)
- [dprint 插件清单](https://dprint.dev/plugins/)
- [dprint TypeScript 原生入口](https://github.com/dprint/dprint-plugin-typescript/blob/main/src/lib.rs)
- [markup_fmt 接入说明](https://github.com/g-plane/markup_fmt)
- [markup_fmt Rust API](https://docs.rs/markup_fmt)
- [Malva](https://github.com/g-plane/malva)
- [Pretty YAML](https://github.com/g-plane/pretty_yaml)
- [Mago 1.51.0 格式化 API](https://github.com/carthage-software/mago/blob/1.51.0/crates/formatter/src/lib.rs)
- [Mago 版本元数据](https://crates.io/api/v1/crates/mago-formatter)
- [Oxfmt 语言支持与原生/Prettier 区分](https://oxc.rs/docs/guide/usage/formatter/language-support.html)
- [Biome 官方文档](https://biomejs.dev/)

## 扩展语言：Rust 与 C/C++

### 本机验证

本机已有 `rustfmt 1.10.0-stable` 和 `clang-format 18.1.8`。已用标准输入传入代码，分别验证 Rust、C、C++ 格式化输出；过程中无需创建源码文件。Rust 与 C 样例中的中文说明注释均保留。

- Rust：`rustfmt --emit stdout --edition 2024 --config skip_children=true`。适配时显式选择 edition，并禁止递归处理子模块；工作目录使用应用临时目录，隔离项目配置查找。
- C：`clang-format --assume-filename=snippet.c --style=LLVM`。
- C++：`clang-format --assume-filename=snippet.cpp --style=LLVM`。
- 本机 LLVM 18 无法识别较新版本文档中的 `--fail-on-incomplete-format`。后续适配应按支持版本选择参数，且将格式化和编译器语法检查分别处理。

### 接入建议

Rust 采用官方 rustfmt，C/C++ 采用 LLVM clang-format。它们均适合从 Rust 后端直接启动进程，并通过 stdin/stdout 传递代码；调用参数由应用构造，避免拼接 shell 命令。

有两种部署方式：

| 部署方式     | 用户体验与维护成本                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 可选系统工具 | 优先检测系统路径或用户指定位置；缺少引擎时展示可操作的安装/配置提示。应用包更轻，但各机格式化器版本可能不同。                                   |
| 随应用分发   | 统一版本、开箱即用；需要维护各平台二进制、运行依赖、许可证和升级流程。rustfmt 的工具链相关依赖、clang-format 的平台依赖都应随选定构建实际核验。 |

可选系统工具方式现已接入，沿用统一 `format_code` IPC，并通过引擎状态检测提供缺失提示。后续独立评估引擎随应用分发策略。

`prettyplease` 偏向生成代码的格式化，`Topiary` 的现成支持范围也与本次目标不同。本次选择 rustfmt/clang-format 作为默认候选，优先保证注释、宏和主流语言语法的成熟处理。

### 补充来源

- [rustfmt 官方仓库与标准输入用法](https://github.com/rust-lang/rustfmt)
- [clang-format 官方用法](https://clang.llvm.org/docs/ClangFormat.html)
- [Prettyplease 的设计定位](https://github.com/dtolnay/prettyplease)
- [Topiary 的语言与部署说明](https://github.com/tweag/topiary)
