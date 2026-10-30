# Agent 开发界面控制

AIO Hub 提供本机开发控制 CLI，用于操作真实 Tauri WebView、读取界面结构与保存 PNG。入口位于项目中，各类 agent 和开发者终端都可以调用。支持 Windows / WebView2 和 Linux / WebKitGTK；两端复用命令协议，输入能力按传输实现区分。

## 启动

```powershell
bun run dev -- --agent --agent-instance agent-demo
```

静态开发：

```powershell
bun run dev:static -- --agent --agent-instance agent-demo
```

省略 `--agent-instance` 时，沿用 `AIO_ID_SUFFIX`；后缀为空时使用 `agent`。多个实例使用不同名称，前端和代理端口沿用项目现有的后缀分配规则。端口冲突时调整 `AIO_PORT` 或选择其他实例名称。

控制模式每次启动创建独立应用数据目录，Windows 同时隔离 WebView2 profile，位置为 `.dev-data/dev-control/data/<实例>/<启动身份>/`。此模式下 `AIO_DATA_DIR` 的既有配置由本次隔离目录替换。需要复现已有数据时，在确认来源后将需要的开发样例放入隔离实例；日常实例保持原有目录。

启动终端提示控制就绪后，即可调用 CLI。结束开发时在启动终端按 Ctrl+C。截图和隔离数据保留供检查。

Vite 文件监听跳过 `.dev-data/`、`.tmp/`、`.jj/` 和 Rust 的 `target/` 目录，保留应用、共享包与插件源码的热更新。运行数据、排查产物和版本元数据会随开发累积；将它们加入监听会增加句柄、内存与启动耗时。修改监听配置后，完整关闭并重新启动开发实例，使旧监听资源释放。

## Ubuntu 独立运行与宿主机控制

在 Ubuntu 原生检出中构建生产前端资源 Debug 程序。构建与运行均开启开发控制，Release 继续使用原有发布流程。

```bash
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
export AIO_DEV_CONTROL=1
bun run generate:shims
bun run build:tsc
bun run build:vite
mkdir -p .tmp/dev-control
printf '%s' '{"build":{"beforeBuildCommand":""}}' > .tmp/dev-control/tauri.build.json
bun run tauri build --debug --no-bundle --config "$(pwd)/.tmp/dev-control/tauri.build.json"
bun run dev:control -- start --instance ubuntu-probe
bun run dev:control -- status --instance ubuntu-probe
bun run dev:control -- stop --instance ubuntu-probe
```

独立运行入口接收可选的 `--binary <绝对路径>`，要求产物保留开发桥。每次启动创建独立数据目录，日志写入 `.dev-data/dev-control/launchers/`。停止操作核对启动进程身份，并由 launcher 终止自己创建的应用进程组。

Windows 工作区可直接调用 SSH 包装：

```powershell
bun run dev:vm -- doctor
bun run dev:vm -- start --instance ubuntu-probe
bun run dev:vm -- control windows --instance ubuntu-probe
bun run dev:vm -- control observe --instance ubuntu-probe --limit 20
bun run dev:vm -- control navigate /settings --instance ubuntu-probe
bun run dev:vm -- control click --css ".settings-btn" --instance ubuntu-probe
bun run dev:vm -- stop --instance ubuntu-probe
```

默认 SSH 别名为 `ubuntu-vm`；原生与共享检出路径沿用本机工作流，可通过 `AIO_VM_SSH_HOST`、`AIO_VM_REPO`、`AIO_VM_SHARED_REPO` 覆盖。截图会自动复制到宿主工作区，结果返回可预览的本地绝对路径。`batch --stdin` 可接收宿主机管道中的 JSON；`--file`、`--text-file` 等文件参数在 guest 中解析。

`dev:vm sync` 只将当前宿主分支的已提交内容快进到干净的同名 guest 分支，保留本地改动时会停止同步。VM 需要启动时使用 `bun run dev:vm -- vm-start --vmx "D:\Virtual Machines\Ubuntu 64-bit\Ubuntu 64-bit.vmx"`，启动器处理本机遇到的 CPU 亲和性问题；已运行的 VM 保持原状。细节见 [Ubuntu 虚拟机兼容性验证](./ubuntu-vm-compatibility.md)。

Linux 的 `dev --agent` 与 `dev:static --agent` 也选择嵌入式连接。独立程序通过 `bundled-debug` 模式保留真实本地资源来源，适合 CSP 与打包行为走查。

富文本内嵌预览的交互回归也可复用独立实例：

```bash
bun run rich-text:embedded:tauri -- --instance ubuntu-probe --out-dir .tmp/embedded-preview
```

该入口在 WebView2 与 WebKitGTK 中运行同一组页面契约，报告包含运行引擎、逐项结果和诊断错误。WebKitGTK 使用生产资源 Debug 实例。

### Linux 输入与截图能力

- 已提供 inspect / observe / screenshot、显式 eval、开发桥 navigate / state / action，以及 CSS、testid、placeholder 定位。
- click / fill / select / scroll 使用 DOM 输入，结果标记 `inputBackend: "dom"`。写入前检查唯一性、可见性、禁用态、稳定性和遮挡；输入框还检查只读状态。写操作超时后先 observe 核对结果。
- role / label 定位、双击、修饰键和 press 暂时返回 `UNSUPPORTED_CAPABILITY`。通过 `state capabilities` 查看当前能力；需要系统指针、原生对话框或用户激活语义时另选原生验证路径。
- 原生 WebKit 截图先在内存中遮罩密码框、`[data-dev-sensitive]` 和显式 mask，再裁切并写盘；敏感区域或视口在截图期间变化时中止保存。

### GNOME 客体原生输入

Ubuntu GNOME 的右键菜单、真实鼠标事件、拖动和播放器手势，可通过 `bun run dev:vm -- input --stdin` 直接调用客体 Mutter。该入口经 SSH 连接当前用户的桌面会话，支持客体截图，宿主机鼠标保持自由。常规定位与读取状态继续使用 Dev Control；操作方法与坐标边界见 [客体鼠标与键盘](./ubuntu-vm-compatibility.md#客体鼠标与键盘)。

## 场景准备与首次使用

隔离实例使用独立数据，模型渠道、智能体和会话都需按场景准备。聊天页在打开时直接展示工作区；发送消息缺少可用模型时才打开模型选择器。验证搜索、排序、滚动等布局行为时，通过应用现有 store、service 或开发适配器载入样例，再在实际页面操作。

截图前确认页面加载已完成，并检查当前弹窗是否属于目标场景。无关弹窗通过正常关闭或取消操作退出，让等待中的交互正常结束。局部组件挂载适合组件级诊断；完整页面走查使用真实工作区，保留应用本身的面板、滚动容器与层级关系。

## 查看实例与窗口

```powershell
bun scripts/dev-control/cli.ts instances
bun scripts/dev-control/cli.ts windows --instance agent-demo
```

只有一个实例时可省略 `--instance`。多个实例时显式指定目标。默认窗口是 `main`，分离工具和组件窗口使用 `windows` 返回的 `windowLabel`。

`ready` 表示页面应用初始化状态。原生身份核验与前端初始化相互独立：前端初始化失败时，已核验的窗口依然支持 `inspect`、`screenshot` 和显式 `eval`，便于检查白屏或加载页面。路由、领域状态和应用动作等待页面开发桥连接。

## 操作与观察

下列 role、修饰键和双击示例用于 Windows / CDP；Linux 按前述能力列表选择定位与动作。

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
bun scripts/dev-control/cli.ts dblclick --css ".tab-item.active .tab-name" --instance agent-demo
bun scripts/dev-control/cli.ts click --css '.file-item .file-path[title="src/example.ts"]' --modifiers Alt --instance agent-demo
```

role / label / placeholder 默认精确匹配，`--no-exact` 改为部分匹配。匹配多个元素时返回候选信息；通过 scope 或更明确的定位缩小范围。

摘要中的 `name` 是 DOM 标签与文本摘要。返回的 locator 优先使用现有 `data-testid`，其余使用当前 DOM 的 CSS 路径。页面布局变化后重新 inspect。需要语义定位时，可主动指定 role 和 accessible name。

单击与双击可使用 `--modifiers Alt` 临时按住修饰键；组合按键重复传入该参数。batch 使用 `"modifiers": ["Alt"]`，支持 Alt、Control、Meta、Shift，执行后恢复原按键状态。

双击使用 `dblclick`，沿用单击的定位参数，也可在 batch 中使用 `{ "op": "dblclick", "target": { "css": ".tab-item.active .tab-name" } }`。它通过原生鼠标事件执行，保留两次单击和随后的双击事件顺序，并受同一窗口写入锁保护。

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

`select` 面向原生 select 元素。自定义下拉框通过点击展开，再选择具体项。样式化开关的原生输入框可能为零尺寸，点击时定位可见外层，例如 `--css '.el-switch:has(input[aria-label="单击文件时固定标签页"])'`。`fill` 面向标准文本输入和 contenteditable；编辑器外层容器需要定位其真实输入，或按需注册专用开发动作。

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

整批指令先校验，再连接与执行。失败后立即停止，返回已完成步骤、失败位置和原因；之前的业务副作用保留。定位等待与动作执行共用当前步骤的剩余预算。找不到目标返回 `TARGET_NOT_FOUND`；遮挡、禁用与隐藏状态优先返回对应错误。失败后立即断开本次 CDP 连接，停止后续步骤并释放窗口锁。超时的写操作可能已经生效，先 observe，再决定后续操作。

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

## 窗口尺寸与错误摘要

```powershell
bun scripts/dev-control/cli.ts resize --width 960 --height 720 --instance agent-demo --timeout 3000
bun scripts/dev-control/cli.ts diagnostics --instance agent-demo --limit 20
bun scripts/dev-control/cli.ts diagnostics --since 5 --document-id <上一结果的文档身份> --instance agent-demo
```

resize 等待实际视口达到目标，并返回窗口尺寸、视口、缩放和状态。返回 `WINDOW_RESIZE_UNCONFIRMED` 时按错误中的实际视口记录结果；本机 Wayland 下 960 × 720 请求尚未生效。

diagnostics 读取启动期的前端异常、未处理拒绝和 CSP 摘要，每个文档最多保留 200 条。返回 `cursor`、`documentId`、截断与丢弃状态；后续请求同时带回游标和文档身份，页面重载时会从新文档重新读取。摘要裁剪常见凭证字段和 URL 查询参数；完整业务日志仍通过本次实例的日志目录显式查看。

## 教程截图与引导标注

维护用户教程时，Agent 可以使用本 CLI 自行准备示例场景、完成页面操作并采集真实截图，再添加编号、箭头、文字气泡或局部放大。也可以在开发窗口中临时插入只负责展示的引导叠加层，截图后移除。截图资源位置、标注约定和发布范围见 [文档站维护与教程截图](./docs-maintenance.md)。

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

## Tauri 内部拖拽排序

Windows WebView2 的原生文件拖放会与 HTML5 Drag and Drop 路径冲突。应用内部排序使用 `VueDraggableNext` / SortableJS 的 fallback 路径，沿用 `AgentPresetEditor.vue`、`ProfileSidebar.vue` 等组件的配置：

```vue
<VueDraggableNext
  v-model="items"
  handle=".item-grip"
  :force-fallback="true"
  :fallback-on-body="true"
  :animation="150"
>
  <!-- 带稳定 key 的条目；操作按钮与拖拽柄分开 -->
</VueDraggableNext>
```

拖拽柄设置 `cursor: grab`、`touch-action: none` 与 `user-select: none`。`fallback-on-body` 适合列表位于滚动面板或弹窗的场景，避免拖动影像被容器裁切。保持窗口原生文件拖放配置，让文件导入继续走既有通道。

验证时在真实 Tauri 窗口从手柄拖动，检查数据顺序、当前编辑对象和保存后顺序。浏览器中的 HTML5 拖拽结果和模拟 `dragstart` 事件覆盖不到 WebView2 的原生拖放行为。

## 本地权限与验证入口

控制通道显式开启，限定 loopback 并校验实际监听地址；应用握手只在明确开启控制的 debug 进程中返回身份。普通发布前端构建会裁剪开发桥，Rust release 分支返回关闭状态。

原始 CDP 与嵌入式 WebDriver 属于高权限本机调试端点，同用户进程可直接连接。使用独立开发数据，结束后关闭开发实例。

相关验证入口：

```powershell
bun run check:dev-ui
bun run test:dev-ui
```

设计与实施范围见 [开发控制工具链](../design/agent-dev-control-toolchain.md)。

### 文件 URI 的平台回归

H5 `text/uri-list` 拖放和聊天输入的文件 URI 转附件共用 `src/utils/fileDropPaths.ts`。Linux 的 `/home/...` 保留正斜杠，Windows 盘符和 UNC 按对应路径形态转换，百分号编码仅解码一次。Dev Control 可用带 `DataTransfer` 的 DOM drop 验证 URI 解析和应用导入链路；系统文件管理器的物理拖动、原生拦截器与落点坐标需另行实机验证。
