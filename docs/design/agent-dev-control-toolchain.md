# Agent 开发界面控制工具链

> 状态：第一阶段已实施；第二、三阶段按需要扩展  
> 日期：2026-10-13  
> 范围：桌面端日常开发，以 Windows / WebView2 为首期运行环境
> 使用入口：[开发界面控制指南](../guide/dev-control.md)

## 1. 建议

给项目提供一套独立的 **Dev Control CLI**：agent 通过 Bun 命令操作已运行的开发实例，获取精简界面结构、执行点击和输入、读取开发状态并保存真实 WebView 截图。

推荐结构：

```text
任意 agent / 开发者终端
        │ Bun CLI / stdin JSON
        ▼
Dev Control（宿主侧 TypeScript）
        │ CDP：定位、输入、截图、运行态事件
        ▼
真实 Tauri WebView2
        │ 小型开发桥：路由、就绪状态、窗口身份、显式应用动作
        ▼
现有 router / service / composable
```

命令行作为公共入口。MCP 可在后续按需要包装同一套命令，核心逻辑留在项目内。

第一版采用短连接 CLI，批量动作共用一次连接。常驻服务和远程 HTTP 接口留到存在明确需要时扩展。

## 2. 仓库已有基础

| 入口                                        | 当前能力                                                                              | 可复用方向                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| `scripts/dev.ts`、`scripts/dev-settings.ts` | dev 实例后缀、端口和数据目录配置；启动 Tauri                                          | 增加显式控制开关和实例发现信息       |
| `scripts/perf/launch.ts`                    | 设置 `AIO_WEBVIEW2_ADDITIONAL_BROWSER_ARGS`，隔离 WebView2 profile                    | 复用 CDP 启动参数与 profile 隔离经验 |
| `scripts/perf/frames.ts`                    | `/json/list` 发现目标、WebSocket CDP、页面求值、等待 selector、真实视口截图、滚轮输入 | 提取薄 CDP 通道及截图能力            |
| `src-tauri/src/lib.rs`                      | Windows 的 debug / `perf-instrumentation` 构建接受额外 WebView2 参数                  | dev 控制复用 debug 路径，明确 opt-in |
| `tests/tauri-e2e/`                          | 真实 Tauri WebDriver、已有 `data-testid` 和交互场景                                   | 复用定位契约，维持回归测试入口       |
| `tests/windows-ui-automation/`              | 按 PID 操作 Windows 文件、目录对话框                                                  | 原生对话框有需求时接入已有能力       |
| `src/router/index.ts`                       | 工具动态注册、分离工具和组件窗口路由                                                  | 开发桥调用现有 router                |

当前 CDP 客户端围绕性能采样编写：按首个匹配的 page 连接，缺少通用命令超时、断线清理和事件订阅。通用化时补齐这些生命周期行为。

实施时已将一致的调试参数接入主窗口、分离工具/组件、Canvas、后台 runtime 和外部播放覆盖层的窗口创建入口。真实运行确认分离工具窗口可以从同一端点发现。CLI 过滤后台 runtime 页面。

debug 构建提供读取额外参数的代码路径；开启监听仍需传入调试端口参数。

## 3. 操作能力分层

### 3.1 页面交互

提供：

- `inspect`：当前路由、视口、主要区域、可操作元素及状态。
- `click`、`fill`、`press`、`select`、`scroll`：操作页面控件。
- `wait`：等待元素、路由或显式就绪条件。
- `screenshot`：视口或元素截图，返回本机绝对路径。
- `observe`：组合精简界面快照和截图，供 agent 确认结果。

优先采用 `playwright-core` 的 CDP attach 和 locator 能力，连接现有 WebView2。使用当前运行实例的渲染环境；依赖留在开发工具链。

Playwright 的 click 已包含唯一匹配、可见性、稳定性、遮挡和 enabled 检查。这些能力有助于减少“命令返回成功，目标实际没被点到”的问题。自身的 CDP 客户端负责薄协议能力与兼容兜底，避免重新开发完整 locator 引擎。

Playwright CDP attach 与其原生连接存在能力差异，首期聚焦定位、输入、求值和截图。高级 tracing、下载管理和复杂嵌套 frame 能力按实际需求确认。依赖版本以实施时官方稳定版本和项目兼容情况选定；使用公开稳定 API。

连接配置要检查 Playwright 对现有 context 的默认下载、焦点和 media 覆盖。若所选版本提供公开的关闭默认覆盖选项，优先启用；否则评估配置影响，必要时走薄 CDP 通道，保持开发实例的原有运行语义。

### 3.2 应用开发桥

页面侧提供命名空间，例如 `window.__AIO_DEV_CONTROL__`，只暴露小型、显式的接口：

```ts
interface DevControlBridge {
  describe(): Promise<{
    protocolVersion: number;
    instanceId: string;
    windowLabel: string;
    route: string;
    ready: boolean;
  }>;
  navigate(path: string): Promise<void>;
  readState(scope: string): Promise<unknown>;
  runAction(name: string, args: unknown): Promise<unknown>;
}
```

用途：直接跳工具页、读取当前选中项、通过正式业务入口装载开发样例、选择已有会话。

约定：

- `navigate` 调用项目 router，等待路由初始化与工具注册完成，保持 SPA 运行态。
- `readState` 按 scope 返回经过筛选的开发状态；scope 在对应模块显式注册。
- `runAction` 使用白名单注册，调用现有 service / composable，注明产生的副作用。
- 模块根据需要添加适配器。首期只做路由、身份和就绪状态，避免逐工具铺开改造。
- 编辑器、Canvas 等特殊控件可以增加专用适配器；普通按钮和输入框沿用页面交互。
- `eval` 作为显式高级调试能力。默认流程使用结构化命令，输出中标识它是脚本求值。

页面交互用于观察用户实际操作结果，应用动作用于准备开发状态。结果记录执行方式，方便区分交互验证与状态准备。

### 3.3 原生边界

截图覆盖 WebView 页面内容。窗口装饰、原生菜单、系统文件对话框和系统级拖放需要独立能力。

开发时需要直接选定一个样例文件，可提供调用正式导入入口的应用动作；验证文件选择器交互时，使用已有 Windows UI Automation 辅助程序。两种执行方式在结果中分别记录。

UI 可见且正常渲染时作为主要使用环境。窗口遮挡、最小化和隐藏时的渲染更新分别观察；遇到停帧或页面挂起，返回明确状态，由 agent 决定恢复窗口。保留默认开发运行态的节流与焦点语义。

## 4. Agent 使用体验

以下为当前接口示例，完整参数与使用方式见开发界面控制指南。

```powershell
# 在原有 dev 入口开启控制
bun run dev -- --agent

# 静态前端同样可用
bun run dev:static -- --agent

# 查看可连接实例与窗口
bun scripts/dev-control/cli.ts instances
bun scripts/dev-control/cli.ts windows --instance agent-dev

# 跳转工具并观察
bun scripts/dev-control/cli.ts navigate /settings --instance agent-dev --window main
bun scripts/dev-control/cli.ts observe --instance agent-dev --window main

# 操作明确目标
bun scripts/dev-control/cli.ts click --role button --name "保存" --instance agent-dev --window main
bun scripts/dev-control/cli.ts fill --testid chat-message-editor --text "开发样例" --instance agent-dev --window main

# 对特殊控件执行明确的应用动作
bun scripts/dev-control/cli.ts action editor.setText --args-file .dev-data/example-args.json --instance agent-dev --window main
```

### 4.1 一次调用完成连续操作

CLI 提供 stdin JSON 输入；自然语言到操作指令的解释由 agent 完成。程序负责确定性执行。

```json
{
  "instance": "agent-dev",
  "window": "main",
  "timeoutMs": 15000,
  "steps": [
    { "op": "navigate", "path": "/settings" },
    {
      "op": "click",
      "target": { "role": "button", "name": "主题", "exact": true }
    },
    { "op": "observe", "screenshot": true }
  ]
}
```

每个窗口按顺序执行写操作，批次失败即停止，返回已完成步骤和失败位置。不同 agent 操作同一窗口时，首期使用实例侧文件锁串行化写批次；锁带进程身份和所有权 token，持有进程退出后的锁可回收。存活进程的锁保持有效，回收操作也通过独立锁串行化。批次属于交互序列，已产生的业务副作用保留。

输出 JSON 写 stdout，诊断日志写 stderr。统一结果包含：

- `ok`、执行时间、实例和窗口身份。
- 执行方式：`ui`、`appAction` 或 `eval`。
- 已完成步骤与当前路由。
- 按需返回快照、截图绝对路径。
- 错误的机器码、原因和建议下一步。

截图文件写入当前实例的开发 artifact 目录，CLI 只返回路径。默认截图开关关闭，`observe` 或显式选项才截图，失败时按需保存诊断产物。

### 4.2 定位与快照

定位优先级：

1. 显式提供的 `data-testid`，复用已有稳定交互契约。
2. role + accessible name，精确匹配。
3. label、placeholder 与限定区域。
4. 显式 CSS selector。
5. 需要查看几何布局时使用页面坐标。

多匹配时返回候选列表；遇到遮挡、disabled 或过期目标时返回对应原因。

第一版 `inspect` 输出可重用的 locator 描述，跨 CLI 调用直接重新定位。短 ref 可作为后续便捷能力，必须携带窗口和 snapshot 身份，并检查节点失效；DOM 重排后重新观察。

快照默认限长、聚焦可操作元素，返回选中、展开、disabled 等关键状态；按需指定区域、深度和列表范围。虚拟列表只描述当前挂载内容，需要远端项时显式滚动或走领域动作。

observe 结果带时间和路由身份，辅助判断状态对应关系。页面动画或流式输出持续变化时，保留真实状态并提示观察时机；界面结构和截图属于相邻时间的观察，避免宣称原子一致。

## 5. 开发实例与生命周期

### 5.1 实例隔离和发现

`--agent` 延续 `loadDevSettings()`，通过现有后缀机制生成或选择开发实例，优先使用独立数据目录与 WebView2 profile。默认保留当前机器配置下的真实服务行为；需要 mock 数据时显式选择开发样例。

Bun launcher 在工作区 `.dev-data/dev-control/` 保存实例发现文件，内容包含协议版本、实例 ID、CDP 端点、前端模式、启动身份、隔离数据根与就绪状态。这里属于宿主开发产物；应用自身的配置、缓存和临时持久化仍遵循 `getAppConfigDir()`。

生命周期：

1. 选择可用 loopback 端口，传入 WebView2 调试参数。
2. 启动 Tauri，等待 endpoint 与页面开发桥就绪。
3. 校验页面返回的实例身份与 launcher 的启动身份一致，发布可用描述。
4. 枚举窗口时，将 CDP target 与 Tauri window label 对应。
5. 退出时按本次启动的进程归属清理，回收实例描述；重连时复核身份和存活状态。

PID 仅作为归属信息，配合启动时间与握手身份防止复用误判。多个可用实例时要求显式选择。连接已有实例必须核验身份；复用已有数据目录时明确显示目标并要求使用者显式选择。

CLI 连接结束只断开调试会话。停止应用由 launcher 或独立 stop 操作负责，并区分本工具启动的实例和外部附着实例。

### 5.2 多窗口与刷新

按 Tauri window label 选择操作目标；`main` 为常用默认。枚举排除 DevTools、background runtime 和其他非目标页。外部内容 WebView 作为独立显式类别处理。

工具分离、窗口关闭、页面刷新和 HMR 后，重新发现 execution context 与开发桥。操作返回 `WINDOW_CLOSED`、`PAGE_RELOADING` 等状态，并提示等待或重新选择。自动恢复只用于发现和只读观察，可能已生效的写操作由调用方确认后再执行。

开发桥在 `src/main.ts` 对应用页面启动，支持幂等初始化和 HMR dispose，保证多窗口身份与就绪信息可读。

## 6. 开关与本地安全

### 6.1 同时覆盖 HMR 和静态开发

当前 `dev:static` 使用 production 前端构建，单独检查 `import.meta.env.DEV` 会遗漏这条开发路径。

建议：

- launcher 设置专用前端构建开关，例如 `VITE_AIO_DEV_CONTROL=1`。
- 前端动态导入开发桥，并向后端请求本次开发实例的允许状态与身份。
- 后端启用条件为 debug 构建与明确的 `--agent` 启动标记；新增 command 遵循项目注册规范。
- 普通发布构建明确关闭专用开关，Rust release 分支关闭开发桥握手。已有 `perf-instrumentation` 通道仍按其自身用途管理。
- 静态开发产物写现有 static snapshot 目录，保留发布构建产物目录的职责。

如此可同时处理 Vite HMR、production 前端的静态开发以及前端被普通浏览器打开的情况。普通浏览器仅可在显式提供 browser fallback 时使用对应能力。

### 6.2 调试端点的权限性质

CDP 能求值页面脚本。在 Tauri 中，这也可能触达页面本来拥有的 IPC 和本地资源权限。将其视为高权限本地开发通道：

- 显式 opt-in，绑定 loopback，核实实际监听地址，避免对外暴露。
- 每实例独立端口和 profile；端口随机化用于减少冲突。
- 首期只提供本机 CLI，减少另一层网络服务的维护成本。
- 如后续增加 HTTP 外观层，再设置启动期 token、Origin 校验和请求限制。
- 原始 CDP 端点自身缺少这层应用鉴权；HTTP 外观层的 token 无法阻止本机进程直连原始端点。
- 回收调试端点与发现文件，操作只允许已核验的开发实例。

默认日志与状态输出屏蔽凭证字段，网络观测优先返回方法、脱敏地址、状态和耗时。截图可能含有可见敏感内容，提供敏感区域 mask / crop 选项；`eval` 和完整日志属于使用者主动请求的高权限调试输出。

## 7. 实施顺序

### 第一阶段：日常可用闭环

实现 `--agent` 启动配置、实例发现、窗口选择、`inspect`、`click`、`fill`、`press`、`wait`、`screenshot`、`observe` 和批量 JSON 命令。开发桥仅提供身份、就绪与路由。

建议新增目录：

```text
scripts/dev-control/
  cli.ts
  connection.ts
  discovery.ts
  commands.ts
  protocol.ts
  artifacts.ts
src/dev/control/
  bridge.ts
  registry.ts
```

与 `scripts/dev.ts`、`scripts/dev-settings.ts`、`scripts/dev-static.ts`、`src/main.ts` 和现有 Rust debug 配置路径聚焦集成。薄 CDP 代码按实际复用关系整理，保留性能脚本的测量语义。

### 第二阶段：减少调试回合

补充 console / pageerror 的有界事件采集、失败请求摘要、限定区域快照、特殊编辑器适配器、常用开发场景动作以及按需失败截图。

### 第三阶段：按使用反馈扩展

需要原生对话框时复用已有 Windows helper；需要持续事件流时增加常驻会话；需要 MCP 时包装同一协议。移动端与 macOS / Linux 的调试传输按平台提供单独适配。

## 8. 最值得先做的切片

优先交付“一条命令启动可控制开发实例，一次 observe 返回真实界面结构与 PNG”的切片，再加入点击和输入。用主窗口与一个分离窗口确认目标选择，分别确认 HMR 和 `dev:static` 入口。

这里先按开发操作工具交付，保留现有 WebDriver 回归测试入口。交互动作及截图能直接服务日常开发后，再依据具体故障补充能力。

## 9. 技术依据

官方资料：

- Playwright 的 WebView2 文档：通过 `connectOverCDP` 连接已有 WebView2，使用独立 user-data-folder 隔离实例。
- Playwright 的 `BrowserType.connectOverCDP` 文档：说明 CDP 连接的能力差异与附着实例的配置影响。
- Playwright 的 Auto-waiting 文档：说明 locator 操作的唯一性、可见性、稳定性、遮挡和 enabled 检查。
- Playwright Locator 文档：ARIA snapshot 可表达界面结构；具体参数和版本实施时选用公开稳定 API。

仓库依据见第 2 节。第一阶段已由 `scripts/dev-control/` 与 `src/dev/control/` 实现。当前观察快照使用有界 DOM 摘要，返回 `data-testid` 或 CSS locator，语义定位由调用方显式指定。`state` 与 `action` 已提供注册机制，首期内置 `ui` 和 `capabilities` 两个状态 scope。

实施补充：

- 每次控制启动建立新的独立数据目录和 WebView2 profile；实例名称使用独立启动锁。
- Playwright 固定开发依赖 `1.64.0`，通过公开的 `noDefaults: true` 保留原有焦点、media 和下载配置。
- 参数由一致的 WebView builder 配置传入。此机器的运行态未采用全局 WebView2 环境变量作为调试参数入口。
- 前端导入失败时通过原生 command 核验身份，保留页面观察和截图；应用动作等待开发桥就绪。
- 窗口刷新会在后续 CLI 调用重新连接，开发桥支持自身 HMR 清理和重启。Rust 重编译替换应用进程时，启动器重新核验监听与原生身份，并更新进程归属；已在真实 dev 实例验证恢复。
- 第一阶段使用新的连接模块，性能探针保持现有测量语义，通用薄 CDP 提取留到有复用需要时处理。
- 已完成真实 HMR 主窗口、分离 JSON 工具窗口和 production 前端静态开发的操作与截图走查。

## Ubuntu 后续调查

2026-10-29 已在 Ubuntu 真实 WebKitGTK 窗口验证嵌入式 WebDriver 的求值、元素点击和截图通道。Linux 传输适配、输入语义差异、运行模式与实例生命周期的建议见 [Ubuntu 开发控制脚手架调查](./linux-dev-control-investigation.md)。当前工作区已接入 Linux 嵌入式传输、独立实例与安全操作闭环；正式用法与平台能力边界见开发界面控制指南。
