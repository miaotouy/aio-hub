# Ubuntu 开发控制脚手架调查

调查日期：2026-10-29。基线为 `2d516cf94`，环境与已完成的界面走查见[Ubuntu 虚拟机兼容性验证](../guide/ubuntu-vm-compatibility.md)。本文保留调查依据与实施取舍。Linux 控制闭环已接入当前工作区，实施结果见文末。

## 结论

沿用现有 Dev Control 的命令协议、批处理、身份核验和开发桥，为 Linux 增加嵌入式 WebDriver 连接适配。Windows 继续使用当前 CDP / Playwright 路径。VM 启动与 SSH 编排放在外层，CLI 在 Ubuntu 原生检出中执行。

本轮临时 Python 脚本证明了控制通道可用，适合保留为排查材料。正式入口仍应收敛到 Bun 脚本，避免长期维护两套操作协议。

## 已核实的基础

| 入口                                                             | 当前实现与复用价值                                                                     |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `scripts/dev-control/protocol.ts`、`src/dev/control/protocol.ts` | 已有参数验证、定位目标、连续步骤和结果类型                                             |
| `scripts/dev-control/commands.ts`                                | 已有失败即停止、已完成步骤保留、窗口操作锁和共享超时预算                               |
| `scripts/dev-control/connection.ts`                              | 已有原生身份核验、窗口选择、前端初始化失败时的诊断路径；具体实现依赖 Playwright `Page` |
| `src/dev/control/bridge.ts`、`registry.ts`                       | 路由、就绪状态、按模块注册的状态与动作，可跨渲染引擎复用                               |
| `src-tauri/src/commands/dev_control.rs`                          | 原生身份仅向显式开启控制的 Debug 进程提供；WebView2 参数配置限定 Windows               |
| `src-tauri/src/lib.rs`                                           | Debug 已注册 `tauri-plugin-wdio` 与嵌入式 WebDriver，Release 保持原运行边界            |
| `tests/tauri-e2e/wdio.conf.ts`                                   | 已使用 `driverProvider: "embedded"`，具备二进制、数据目录、端口和日志配置经验          |

### 本轮真实运行探测

通过 SSH 在虚拟机内连接 `127.0.0.1:4457`，控制端点仅在 guest 回环监听。`ss` 确认该端口由当前 `aiohub` 进程绑定在回环地址。

- `/status` 返回 ready。
- 标准 `/session/{id}/execute/sync` 返回真实来源 `tauri://localhost`、主页路径与 1280 × 768 视口。
- 标准 CSS 元素查找与 `/element/{id}/click` 可点击设置入口，实际路径变为 `/settings`。
- 前轮已使用 WebDriver 截图接口取得真实 WebKitGTK PNG；`/wdio/eval` 也能指定 `window_label` 执行脚本。
- 当前运行产物的 `window.__AIO_DEV_CONTROL__` 未启用，普通 DOM 探查可用，开发桥的路由、状态和动作能力尚未接入本轮独立启动流程。

原始结果保存在已忽略的 `.tmp/ubuntu-compat/scaffold-probe.json`；窗口状态探测脚本与其他截图也在该目录。

**输入语义需要单独处理。** 检查当前安装的 Rust WebDriver 1.2.0 源码后确认，`platform/executor.rs::click_element` 使用 `scrollIntoView()`、`el.click()` 与 `focus()`。该接口可验证页面响应，但调用方仍需检查唯一性、可见性、禁用态和遮挡；系统级输入、用户激活限制、原生拖放等行为需要另外选择验证路径。报告中应记录 `inputBackend`，避免将 DOM 点击结果当成原生指针验证。

针对性的临时控件探测也确认了这项差异：按钮被覆盖层遮挡，命中检测返回覆盖层，WebDriver 点击仍触发按钮事件，事件的 `isTrusted` 为 `false`。探测结束后已移除临时控件，结果保存在 `.tmp/ubuntu-compat/scaffold-input-probe.json`。

## 优先改进项

### 1. 实例启动、身份与运行模式

当前 `prepareDevControl()` 直接拒绝非 Windows；之后的启动核验固定访问 `/json/version`，并调用 PowerShell 检查监听。`DevConnection.attach()` 也固定使用 Chromium CDP。

建议：

- 实例描述增加传输类型 `cdp | embedded-webdriver`，按平台选择监听检查和连接实现。保留现有实例 ID、启动 ID、应用 PID 和窗口标签核验。
- 将前端运行模式扩为 `hmr | static | bundled-debug`。`discovery.ts` 当前只接受 HTTP 前端地址，连接层也按 HTTP origin 过滤页面，需显式支持本地应用来源；端点本身仍限定回环 HTTP。
- 启动生产前端资源的 Debug 程序时，构建阶段设置 `AIO_DEV_CONTROL=1`，让 Vite 保留开发桥；运行阶段也设置 `AIO_DEV_CONTROL=1`，并提供同一实例的 `AIO_DEV_CONTROL_INSTANCE` 与 `AIO_DEV_CONTROL_STARTUP`。仅在运行时补变量无法恢复已裁剪的前端模块。
- 就绪状态分清进程存活、驱动可连接、原生身份可核验和前端完成初始化。白屏时保留 inspect、截图和显式 eval 的诊断入口。
- CLI 在 Ubuntu 内运行，外层只负责 SSH 转发命令与取回产物。宿主机直接消费 guest 描述文件会错误地按 Windows PID 判断 Linux launcher 是否存活。

### 2. 小型传输适配与会话恢复

`commands.ts` 的定位、输入、等待、截图都直接依赖 Playwright。替换连接函数不足以完成 Linux 支持。

建议提取按现有操作组织的小型会话接口，由 CDP 和 WebDriver 各自实现；保留公共参数验证、批处理结果和错误协议。无需模拟完整 Playwright API。

首批覆盖 windows、inspect、截图、显式 eval、开发桥调用，以及有明确前置检查的 CSS / testid 点击和输入。role / label 定位、修饰键、滚动和双击按真实能力逐项接入，尚未具备的能力返回可行动错误，能力列表供调用方预先查询。

- 区分应用进程生命周期与 WebDriver session 生命周期；连接结束时释放自建 session，保留正在运行的应用。
- 以启动 ID、PID 和窗口标签校验缓存；驱动重启或页面刷新后重新发现窗口、重建会话。
- 只读探查允许重连；写操作超时后先 observe，再决定是否重试，防止点击、导入或保存重复执行。
- 延续窗口锁与整批截止时间。WebDriver 操作开始前的定位等待也计入同一预算。
- session 按窗口 handle / Tauri label 映射，默认跳过 `background-js`，目标窗口缺失或重复时给出明确诊断。

### 3. 截图与紧凑取证

当前正式 CLI 已默认遮罩密码框和 `[data-dev-sensitive]`，支持附加 mask、局部截图与精简结构。临时 Python 脚本直接保存全视口 PNG，并读取较长的 `body.innerText`，缺少这些保护。

Linux 适配需要保留正式入口的保护：

- inspect 默认只返回有限数量的控件、状态、路由和视口，省略输入值；页面全文作为显式操作。
- 截图支持敏感区域遮罩与裁切；遮罩无法可靠应用时中止保存，避免自动回退成原始截图。若采用临时覆盖层，等待绘制后截图，并在 finally 中恢复页面。
- 每次操作返回截图路径、采集时间、窗口与路由，按启动身份归档；SSH 包装将 guest 产物复制到本地已忽略目录，返回宿主机可预览的绝对路径。
- 增加按游标读取的错误摘要：前端异常、CSP 拒绝和本次操作新增的应用错误。默认使用筛选字段、数量上限与脱敏地址，完整日志保持显式读取。启动前就开始采集，覆盖前端初始化阶段。

### 4. 窗口尺寸结果核验

请求 960 × 720 后，驱动立即返回的尺寸及一秒后的窗口尺寸、WebView 视口均仍为 1280 × 768。原生窗口状态为可见、可调整、非最大化、非全屏，缩放因子为 1；前轮直接调用 Tauri `set_size` 同样未改变视口。

当前安装插件的 `set_window_rect` 忽略 `set_position`、`set_size` 的错误，随后直接回读尺寸。这能解释为何 HTTP 请求成功不足以证明尺寸生效，窗口保持原尺寸的具体原因仍待定位。

建议增加独立窗口调整操作：记录请求值、窗口实际值、视口值、缩放与窗口状态，在有限时间内等待实际尺寸收敛；未达到目标时返回 `WINDOW_RESIZE_UNCONFIRMED`，附带当前值。允许应用最小尺寸、装饰尺寸与缩放产生的合理差异，但报告实际使用的测试视口。

下一步针对该问题采集 GTK / 窗口管理器层证据，再决定是否需要同环境的 X11 对照。现阶段保留 Wayland 环境，较小视口验证继续标为待完成。

### 5. VM 外层生命周期与环境准备

本地 skill 的 `vm-aiohub.sh` 已有原生检出、快进同步和安装入口，仍缺少本轮实际用到的能力：

- Windows 独立启动器：从 WMI 获取逻辑处理器数量，限定适用的处理器组，短暂调整启动亲和性并恢复；先检查 VM 是否已运行。
- Ubuntu 环境诊断：将 `$HOME/.local/bin` 加入 PATH，分别检查 Bun、Node、Cargo、系统开发库和桌面会话。只输出白名单变量，避免转储凭证与整份环境。
- 独立运行实例：配置端口、数据根、日志和运行清单；支持 start / status / stop，按 PID 及进程启动身份核对所有权，避免按进程名批量终止应用。
- 桌面环境：解析当前用户的 DISPLAY、Wayland、D-Bus 和 Xauthority；缺少可用桌面会话时给出提示。跨平台入口避免硬编码 UID 或临时认证文件名。
- 安装策略：预先报告忽略的插件工作区缺失与锁文件解析差异；网络代理显式传入。依赖清理与系统升级保留独立操作，系统包升级继续由有 sudo 权限的维护流程处理。
- Git 同步：保留脏工作区检查与 ff-only；同步前比较 guest 修改，自动清理仅限本次脚本明确创建的文件。local skill 中远端名称与跟踪关系已过时，后续改为查询当前 Git 配置。

## 建议实施顺序

1. **先打通重复探查闭环**：Ubuntu 内的实例启动 / 停止 / 状态、嵌入式连接、身份与前端桥、inspect / 安全截图 / eval；宿主机通过一个 SSH 包装调用。
2. **接入主界面与设置操作**：复用既有批处理协议，补齐必要的确定性定位、动作前置检查、错误增量与会话恢复。
3. **解决尺寸与专项输入**：窗口调整回读、滚动与键盘，随后根据工具页需求选择拖放、剪贴板和原生对话框的验证路径。

实施时重点保护身份错配、重复写操作、会话过期、截图脱敏和批处理失败边界。复用 `check:dev-ui`、`test:dev-ui` 及相关现有用例，真实 Ubuntu 窗口验证选取一个主页到设置的短流程即可起步。

## 实施结果（2026-10-29）

已落地跨平台会话接口、Linux 嵌入式连接、生产资源 Debug 独立启动、启动与文档身份核验、安全截图、DOM 输入前置检查、尺寸回读和诊断游标。宿主机通过 `dev:vm` 执行控制并取回截图；Linux 日常 dev 入口也复用该传输。命令说明见[开发界面控制指南](../guide/dev-control.md)。

真实窗口验证了主页 / 设置跳转、遮挡拦截、单次点击、320 × 160 局部截图与敏感区域黑色遮罩、宿主截图回传和独立实例停止 / 重启。当前 Wayland 尺寸请求仍未生效，CLI 已返回 `WINDOW_RESIZE_UNCONFIRMED`；role / label、双击、修饰键和 press 保留显式能力边界。

富文本性能入口已复用同一页内采样器适配 WebKitGTK。CDP 与长任务缺失项保持不可用状态；首轮真实渲染与同引擎分词对照见 [Ubuntu 性能初测](../Plan/ubuntu-compatibility-performance-20261029.md)。真实长会话、Worker 传输、原生输入和系统级交互继续按具体场景推进。

仓库内 WebDriver 依赖版本保持原样，现有 E2E 的版本约束继续生效。
