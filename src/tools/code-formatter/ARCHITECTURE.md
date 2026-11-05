# Code Formatter：架构与开发者指南

## 1. 格式化入口

`logic/formatter.ts` 的 `FormatterCore.formatCode(code, language, options)` 是工具统一入口，保留以下结果契约：

- `formatted`：成功时为格式化后的代码，失败时保留输入。
- `success`：本次格式化是否成功。
- `error` / `warning`：供界面展示的错误或警告。

空输入返回空字符串。语言自动检测继续由 `detectLanguage()` 负责。

## 2. 引擎路由

| 语言                                                         | 当前引擎                                    | 运行环境              |
| ------------------------------------------------------------ | ------------------------------------------- | --------------------- |
| JavaScript、TypeScript、JSON、HTML、CSS、Markdown、XML、YAML | Prettier standalone 与按需加载的解析器/插件 | 桌面与浏览器          |
| PHP                                                          | Rust 侧 Mago 1.59.0                         | Tauri / Electron 桌面 |
| Rust                                                         | 系统 rustfmt                                | Tauri / Electron 桌面 |
| C、C++                                                       | 系统 clang-format                           | Tauri / Electron 桌面 |

Prettier 核心及各解析器均按需动态导入并缓存。PHP、Rust、C、C++ 在 Tauri 与 Electron 桌面版调用统一 `format_code` IPC；浏览器通过 `getHostCapability("systemCodeFormatting")` 展示桌面引擎提示。格式化失败时保留输入。前端语言继续使用 Prettier。

## 3. PHP 原生实现

```text
CodeFormatter.vue
  → FormatterCore.formatCode()
    → invoke("format_code", { code, language, options })
      → src-tauri/src/commands/code_formatter.rs
        → spawn_blocking
          → src-tauri/crates/code-formatter
            → Mago Formatter::format_code()
```

- `aiohub-code-formatter` 是与宿主解耦的 Rust 库，负责 PHP 内存格式化、共用系统引擎参数计划，以及 Tauri 的进程管理。
- Electron 通过 `electron/code-formatter.ts` → `code-formatter-worker.ts` → `native/knowledge-addon/src/code_formatter.rs` 使用同一 Rust 库；Mago 在可终止的独立辅助进程中运行。Rust/C/C++ 共用 `external::build_plan()` 的路径校验和 argv，由 Node 执行外部程序。
- Tauri command 为 PHP 派发阻塞任务，为系统引擎执行异步进程调用；沿用 `src-tauri/src/commands.rs` 的统一注册入口，供 `lib.rs` 调用。
- Mago 需要 Rust 1.99；桌面 Cargo package 与格式化库均声明最低版本。
- 每次调用创建独立 arena，请求结束后释放其分配内容。
- 源码通过内存传入，不搜索 `composer.json`，不执行输入代码，也不调用外部 PHP 进程。
- 语法错误与参数错误作为 IPC 错误返回，由前端转换成统一结果结构；字符串错误会保留可读信息。

### 3.1 PHP 选项

| 字段               | 默认值  | 说明                                                                |
| ------------------ | ------- | ------------------------------------------------------------------- |
| `phpVersion`       | `8.4`   | 显式目标版本，范围为 7.0–8.5；不提供文件系统自动探测                |
| `singleQuote`      | `true`  | 优先使用单引号                                                      |
| `printWidth`       | `80`    | 换行宽度，范围 1–1000                                               |
| `tabWidth`         | `4`     | 缩进宽度，范围 1–16                                                 |
| `useTabs`          | `false` | 使用制表符缩进                                                      |
| `trailingCommaPHP` | `true`  | PHP 多行结构的尾逗号，受目标版本限制                                |
| `trailingComma`    | 未设置  | `none` 关闭尾逗号；`es5` / `all` 启用。显式 `trailingCommaPHP` 优先 |
| `endOfLine`        | `lf`    | `lf`、`crlf`、`cr`、`auto`                                          |

选项名通过 camelCase 反序列化。PHP 映射上表字段；Rust/C/C++ 的选项见下一节，其余语言继续遵循现有 Prettier 配置。

## 4. Rust、C/C++ 系统格式化器

aiohub-code-formatter 的 `external` 模块提供异步格式化和引擎检测：

- Rust 使用 `rustfmt --emit stdout`，默认 edition 2024，可在界面切换为 2015、2018、2021。
- C 与 C++ 共用 clang-format，分别指定 `snippet.c`、`snippet.cpp` 作为语言提示，使用显式 LLVM 风格。
- 路径留空时从进程 PATH 查找；自定义路径要求绝对路径。配置文件只保存两个引擎路径与 Rust edition，源码留在当前编辑区。
- `code_formatter_status({ language, formatterPath })` 执行有 5 秒时限的 `--version` 检测，返回 camelCase 的 `available / engine / version / error`；可用版本需包含对应引擎名称。
- 界面提供版本或安装提示、路径编辑和重新检测。C 与 C++ 共用路径配置，Rust 保持独立；路径和 edition 通过 createConfigManager 持久化。
- 直接启动进程，源码经 stdin 输入；并发处理输入、stdout、stderr。格式化时限 10 秒，错误/超时会终止并回收子进程，取消时启用 kill-on-drop。
- 输入上限 4 MiB；Tauri 的 stdout / stderr 各限制 16 MiB，Electron 的两路输出合计限制 16 MiB。界面错误诊断截取最多 3000 字符。
- 每次在独立临时目录执行。rustfmt 读取明确指定的空配置文件并启用 skip_children；clang-format 使用内联风格。两者均以 LF 输出，避免读取项目格式配置或遍历 Rust 子模块。
- Rust 默认 4 空格，C/C++ 默认 2 空格；支持 printWidth（80，1–1000）、tabWidth（1–16）、useTabs。PHP/Prettier 的其他选项仅由各自引擎处理。
- clang-format 执行排版，完整语义/语法检查仍由编译器承担。应用当前使用用户系统工具版本，跨机器输出可能存在差异。

### 4.1 Electron 生命周期

- 全局串行执行，单窗口/文档最多接受 2 个任务，全应用最多 8 个；请求序列化上限为 26 MiB，以容纳 4 MiB 源码的 JSON 转义。
- 每次任务在应用数据根的 `code-formatter/jobs/format-*` 创建独立工作目录，完成后清理。源码经 stdin 传输，Rust 的目录中只写入明确指定的空配置文件。
- 检测/外部格式化分别限制 5/10 秒；宿主为辅助进程请求提供 15 秒期限，涵盖同步 PHP 计算。
- 刷新、主文档导航、渲染进程退出和关窗使所属排队任务失效，并终止正在执行的辅助进程树；进程树退出后才清理工作目录、处理下一任务。其他窗口保留各自的任务归属。
- 应用退出等待任务和空闲辅助进程收尾。无法确认辅助进程退出时停止服务并保留工作目录，提示重启应用。

## 5. 界面与异步结果

输入变化和语言切换统一触发 500ms 防抖格式化。每次变化立即递增请求序号，待执行或正在执行的旧请求完成后，仅当前序号的结果能够更新输出。清空输入立即清空输出，并使旧请求失效。

界面保留输入区、输出区、语言选择与复制/发送操作。PHP 格式化在 Tauri 的阻塞任务通道或 Electron 的独立辅助进程运行，计算与界面线程隔离。

## 6. 相关验证

新增测试围绕公开行为：PHP 注释与字符串保留、格式化幂等性、语法错误、布局选项及非法参数；前端测试覆盖四种原生语言的结果契约、IPC 字符串错误、引擎检测和浏览器能力。系统进程测试使用当前测试程序作为跨平台子进程夹具，验证大输入/输出并发传输、错误诊断、时限、输出限制及无效配置。

```powershell
cargo test --manifest-path src-tauri/Cargo.toml -p aiohub-code-formatter
bun run test:run src/tools/code-formatter/__tests__/formatter.test.ts src/platform/core/capabilities.test.ts
bun run test:electron electron/code-formatter.test.ts electron/process-runner.test.ts
```

真实 IPC 与页面交互通过项目 Dev Control 在隔离桌面实例验证。2026-11-05 Windows Electron 生产资源已验证四种原生语言、选项与幂等性、自动格式化、自定义路径持久化及出错时保留输入。受控可执行文件验证错误诊断、输出溢出、真实十秒超时、刷新/关窗/退出时父子进程回收和双窗口隔离；证据见全局 [Electron 执行待办](../../../docs/Plan/electron-feature-gap-execution.md)。macOS/Linux 的实际系统引擎和生命周期继续验收。

## 7. 扩展方向

后续原生语言组合、Mago 版本边界与 Rust/C/C++ 引擎调查见 [格式化引擎调查](docs/Plan/formatter-engine-investigation.md)。当前支持十二种语言，Rust/C/C++ 已以可选系统工具方式接入；随应用分发引擎留待后续独立评估。
