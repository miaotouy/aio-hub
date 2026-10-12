# Agent 开发界面控制

AIO Hub 提供本机开发控制 CLI，用于操作真实 Tauri WebView2、读取界面结构与保存 PNG。入口位于项目中，各类 agent 和开发者终端都可以调用。当前支持 Windows 桌面端。

## 启动

```powershell
bun run dev -- --agent --agent-instance agent-demo
```

静态开发：

```powershell
bun run dev:static -- --agent --agent-instance agent-demo
```

省略 `--agent-instance` 时，沿用 `AIO_ID_SUFFIX`；后缀为空时使用 `agent`。多个实例使用不同名称，前端和代理端口沿用项目现有的后缀分配规则。端口冲突时调整 `AIO_PORT` 或选择其他实例名称。

控制模式每次启动创建独立应用数据目录和 WebView2 profile，位置为 `.dev-data/dev-control/data/<实例>/<启动身份>/`。此模式下 `AIO_DATA_DIR` 的既有配置由本次隔离目录替换。需要复现已有数据时，在确认来源后将需要的开发样例放入隔离实例；日常实例保持原有目录。

启动终端提示控制就绪后，即可调用 CLI。结束开发时在启动终端按 Ctrl+C。截图和隔离数据保留供检查。

## 查看实例与窗口

```powershell
bun scripts/dev-control/cli.ts instances
bun scripts/dev-control/cli.ts windows --instance agent-demo
```

只有一个实例时可省略 `--instance`。多个实例时显式指定目标。默认窗口是 `main`，分离工具和组件窗口使用 `windows` 返回的 `windowLabel`。

`ready` 表示页面应用初始化状态。原生身份核验与前端初始化相互独立：前端初始化失败时，已核验的窗口依然支持 `inspect`、`screenshot` 和显式 `eval`，便于检查白屏或加载页面。路由、领域状态和应用动作等待页面开发桥连接。

## 操作与观察

```powershell
bun scripts/dev-control/cli.ts navigate /settings --instance agent-demo
bun scripts/dev-control/cli.ts inspect --instance agent-demo
bun scripts/dev-control/cli.ts observe --instance agent-demo
```

- `inspect` 返回路由、视口、主要区域、可操作元素、状态与可复用 locator。
- `observe` 返回界面结构和真实 PNG 路径；`--no-screenshot` 只读取结构。
- `screenshot` 只保存 PNG，可指定一个目标元素进行局部截图。
- `--limit 80` 调整摘要元素数量，范围为 1–200；默认 60。
- `--scope <CSS>` 限定观察区域，或限定定位目标的父区域。
- `--timeout 30000` 设置整批操作总超时，默认 15000 毫秒，范围为 100–120000。

定位方式每次选择一种：

```powershell
bun scripts/dev-control/cli.ts click --testid chat-send-message --instance agent-demo
bun scripts/dev-control/cli.ts click --role button --name "保存" --instance agent-demo
bun scripts/dev-control/cli.ts fill --label "名称" --text "开发样例" --instance agent-demo
bun scripts/dev-control/cli.ts fill --placeholder "搜索" --text "主题" --instance agent-demo
bun scripts/dev-control/cli.ts click --css "button.example" --scope "[role=dialog]" --instance agent-demo
```

role / label / placeholder 默认精确匹配，`--no-exact` 改为部分匹配。匹配多个元素时返回候选信息；通过 scope 或更明确的定位缩小范围。

摘要中的 `name` 是 DOM 标签与文本摘要。返回的 locator 优先使用现有 `data-testid`，其余使用当前 DOM 的 CSS 路径。页面布局变化后重新 inspect。需要语义定位时，可主动指定 role 和 accessible name。

其他操作：

```powershell
bun scripts/dev-control/cli.ts press --key Enter --instance agent-demo
bun scripts/dev-control/cli.ts press --css textarea --key Control+A --instance agent-demo
bun scripts/dev-control/cli.ts select --label "选项" --value example --instance agent-demo
bun scripts/dev-control/cli.ts scroll --delta-y 600 --instance agent-demo
bun scripts/dev-control/cli.ts scroll --css ".message-list" --delta-y 600 --instance agent-demo
bun scripts/dev-control/cli.ts wait --testid chat-message-editor --instance agent-demo
bun scripts/dev-control/cli.ts wait --route /settings --instance agent-demo
```

`select` 面向原生 select 元素。自定义下拉框通过点击展开，再选择具体项。`fill` 面向标准文本输入和 contenteditable；编辑器外层容器需要定位其真实输入，或按需注册专用开发动作。

## 一次执行连续动作

将下面内容保存为 `.dev-data/dev-control-example.json`，操作目标应按实际页面调整：

```json
{
  "instance": "agent-demo",
  "window": "main",
  "timeoutMs": 30000,
  "steps": [
    { "op": "navigate", "path": "/settings" },
    { "op": "wait", "route": "/settings" },
    { "op": "observe", "screenshot": true }
  ]
}
```

执行：

```powershell
bun scripts/dev-control/cli.ts batch --file .dev-data/dev-control-example.json
```

也可以通过 stdin 传入 JSON：

```powershell
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Text.UTF8Encoding]::new($false)
Get-Content -Raw -Encoding utf8 .dev-data/dev-control-example.json | bun scripts/dev-control/cli.ts batch --stdin
```

整批指令先校验，再连接与执行。失败后立即停止，返回已完成步骤、失败位置和原因；之前的业务副作用保留。超时的写操作可能已经生效，先 observe，再决定后续操作。

同一窗口的写批次使用进程锁串行化。不同窗口可以分别操作。实例名称也使用启动锁，避免多个启动进程争用同一份实例描述。

CLI 结果写 stdout，退出码 0 表示成功，1 表示失败。结果记录操作类型：`ui` 为页面交互，`appAction` 为路由或应用动作，`eval` 为显式脚本求值。命令结束时断开调试连接，开发窗口继续运行。

## 截图与敏感信息

截图保存在 `.dev-data/dev-control/artifacts/<启动身份>/`，结果返回本机绝对路径。默认捕获 WebView 视口，保持当前动画和插入光标状态。

密码输入与 `[data-dev-sensitive]` 区域默认遮罩。可以增加遮罩：

```powershell
bun scripts/dev-control/cli.ts screenshot --mask ".profile-secret" --instance agent-demo
```

`--mask` 可重复传入。结构摘要省略输入框的值；普通页面可见内容仍会进入截图。检查含有凭证或私人内容的页面时，使用局部截图或明确遮罩。

截图范围是 WebView 页面内容。Windows 文件对话框、原生菜单和系统级拖放按具体需求复用现有 Windows UI Automation 工具。

## 应用状态与扩展动作

```powershell
bun scripts/dev-control/cli.ts state ui --instance agent-demo
bun scripts/dev-control/cli.ts state capabilities --instance agent-demo
```

当前内置 scope：

- `ui`：窗口身份、路由、就绪、视口与焦点状态。
- `capabilities`：已注册的状态 scope 与应用动作。

开发桥位于 `src/dev/control/bridge.ts`，适配器注册入口位于 `src/dev/control/registry.ts`。模块可以在开发入口中使用 `registerDevState()` 与 `registerDevAction()`，后者需附带描述与副作用说明；返回的清理函数用于生命周期结束和 HMR dispose。

动作调用：

```powershell
bun scripts/dev-control/cli.ts action editor.setText --args-file .dev-data/editor-args.json --instance agent-demo
```

此示例动作需要对应模块实际注册。普通页面控件使用交互指令；复杂编辑器或场景准备通过适配器调用现有 service / composable。

显式调试求值：

```powershell
bun scripts/dev-control/cli.ts eval --expression "document.title" --instance agent-demo
```

`eval` 具备页面脚本与页面现有 IPC 的权限，返回值使用 JSON 表达。含循环引用或其他特殊值时，脚本应自行整理为 JSON 可表达的结构。

## 静态前端重建

与启动实例保持相同的后缀和基础端口配置，并显式编译开发桥：

```powershell
$env:AIO_ID_SUFFIX = "agent-demo"
bun run dev:static:build -- --agent
```

随后通过托盘“重启前端”或刷新对应窗口加载新快照。控制程序在每次调用重新发现页面身份，正常处理页面刷新和新增分离窗口。Rust 修改触发 Tauri 重新编译时，启动器重新核验新进程；编译期间返回实例启动中，窗口就绪后继续操作。

## 本地权限与验证入口

控制通道显式开启，限定 loopback 并校验实际监听地址；应用握手只在明确开启控制的 debug 进程中返回身份。普通发布前端构建会裁剪开发桥，Rust release 分支返回关闭状态。

原始 CDP 属于高权限本机调试端点，同用户进程可直接连接。使用独立开发数据，结束后关闭开发实例。

相关验证入口：

```powershell
bun run check:dev-ui
bun run test:dev-ui
```

设计与实施范围见 [开发控制工具链](../design/agent-dev-control-toolchain.md)。
