# 正式版本 Agent 界面控制：调研与实施建议

> 调研日期：2026-11-02  
> 范围：桌面正式构建、随应用分发的 CLI、第三方 Agent 接入、敏感信息保护、界面可访问性。  
> 状态：已吸收 2026-11-02 外部审查，按轻量本机控制方案收敛；本文中的命令与模块路径均为提案。

## 1. 结论

建议新增面向正式用户的「Agent 控制」，采用 **Named Pipe / Unix Domain Socket + 独立轻量 CLI（`aiohubctl`）+ 页面内语义树与短期元素引用**。设置提供「关闭 / 只读观察 / 允许控制」三种模式，默认关闭；本地 CLI 自动读取当前用户私有连接文件，开启后即可连接。

核心目标是让受用户委托的本机 Agent 完成界面操作和配置，同时避免 API Key、Token、敏感请求头经观察、状态读取、错误或截图进入模型上下文。设计以同用户本地 Agent 为可信操作者，保留简单的启用边界与连接校验。

能力分成两层：

- **界面操作**：从现有 Dev Control 纯 DOM 函数提炼页面内引擎，返回紧凑语义树和绑定快照的 `ref`，支持点击、输入、按键、选择、滚动、等待和导航。
- **业务动作**：复用 `toolRegistryManager`、方法元数据与现有执行链，只补少量宿主 UI 动作和输出脱敏。

首版以结构化观察为主；截图和 MCP stdio 适配可后置。保留源码可访问性调查及修复清单，将修复落在日常组件与开发期检查中。

原方案中的配对审批、分资源权限、锁屏吊销、Endpoint 重新授权和独立凭据托管移出本任务。各项吸收与保留理由见 §12。

## 2. 当前仓库事实

### 2.1. Dev Control 的可复用资产

| 当前入口                                                             | 已有能力                                   | 正式版处理建议                                         |
| -------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| `scripts/dev-control/cli.ts`、`protocol.ts`                          | JSON 输出、单步/批量、定位、超时、错误分类 | 复用命令习惯，明确三态模式与连接身份                   |
| `scripts/dev-control/discovery.ts`、`session.ts`                     | 多实例、窗口身份、重连与启动身份核验       | 保留实例/启动/窗口三层身份；改用正式控制服务发现       |
| `src/dev/control/bridge.ts`                                          | 导航、就绪状态、scope/action 注册          | 提炼受限的应用适配层；控制入口由原生会话分发           |
| `src/dev/control/registry.ts`                                        | 显式注册状态和动作，动作附说明及副作用     | 复用注册方式，宿主动作保持少量，统一模式检查与输出脱敏 |
| `scripts/dev-control/dom-inspect.ts`                                 | 控件 role/name/state、区域、定位、边界     | 升级为安全语义快照，补充语义计算和元素引用             |
| `scripts/dev-control/screenshot-page.ts`、`playwright-operations.ts` | 密码框/显式选择器遮罩、内存处理            | 将脱敏责任移入应用，覆盖截图及其他输出                 |
| `src/services/types.ts`、工具注册体系                                | 已有 `agentCallable`、参数和异步任务元数据 | 桥接公开方法及现有执行语义，复用实际业务实现           |

当前 `registerDevState()` 仅在 bridge 内登记 `ui` 与 `capabilities`；未发现业务模块实际登记开发动作。因而「已有通用动作注册器」和「各工具已有完整控制适配」之间仍有一段工作。

桌面工具存在 48 个顶层注册文件；源码中找到 83 处 `agentCallable: true` 字面声明。这是发现入口的清单线索，实际暴露数量还取决于运行时注册、配置与动态元数据。`agentCallable` 表示内部工具调用资格，桥接时根据当前控制模式检查是否可执行，并复用现有工具安全策略。

### 2.2. 当前 release 边界

- `vite.config.ts` 通过 `AIO_DEV_CONTROL` 定义前端开发桥开关，`src/main.ts` 条件加载 bridge。
- `src-tauri/src/commands/dev_control.rs` 在 `debug_assertions` 下读取开发控制环境变量；release 的身份命令返回 `None`。
- `src-tauri/src/lib.rs` 中 WDIO 与嵌入式 WebDriver 插件仅在 debug 分支初始化。
- 当前 Windows 路径使用 CDP/Playwright，Linux 路径使用嵌入式 WebDriver 及平台输入。部分定位和输入能力存在平台差异，例如 Linux DOM 路径暂不提供 role/label 定位及原生 select 之外的 select 语义。
- 当前 DOM inspect 基于选择器列举元素并估算 role/name；它与操作系统可访问性树、标准可访问名称算法的覆盖范围有差别。

正式服务应独立于上述 debug 开关。启用正式控制也应保持开发调试通道关闭，避免运行态出现另一条权限更高的旁路。

### 2.3. 已有存储与权限条件

- Rust 已依赖 `tokio`、`axum`、`hyper`、`uuid` 和 `rand`，具备实现本地异步服务所需的基础组件。实际新增依赖以实现时选定传输为准。
- 应用路径已有 `src/utils/appPath.ts` → `get_app_config_dir` 与原生路径解析。控制偏好、连接描述与必要诊断沿用该根目录约定；带 Token 的连接文件显式使用用户私有权限。
- `src-tauri/capabilities/default.json` 对主窗口提供了多项文件、对话框、剪贴板等权限；Tauri capability 约束 WebView/IPC，控制桥另行检查启用模式、公开动作与敏感输出。
- `src/composables/useLlmProfiles.ts` 将渠道结构与凭据分开落盘，加载时通过 `mergeLlmSecrets()` 将凭据合并回前端渠道对象。
- `src/utils/llm-secret/codec.ts` 明确将当前方案定位为固定种子轻量混淆。它降低磁盘明文暴露，控制输出的保护仍需要单独实现。
- 当前 `tauri.conf.json` 的 CSP 为 `null`。该背景进一步要求正式控制避免引入任意脚本、前端注入或直接暴露既有 IPC 的执行入口。

## 3. 外部方案与选型

### 3.1. 接入方式比较

| 方案                      | 优点                                        | 主要约束                                     | 建议           |
| ------------------------- | ------------------------------------------- | -------------------------------------------- | -------------- |
| 正式版启用 CDP/WebDriver  | 现有开发工具可连接，原生输入覆盖较强        | 直接开放页面求值及调试能力，输出难以统一脱敏 | 留在开发工具链 |
| 第三方通用桌面控制/UIA    | 能覆盖系统窗口                              | 用户需要额外工具，存在定位和焦点成本         | 作为外部补充   |
| 现成 Tauri MCP 控制插件   | 可以快速接入现有 Agent 客户端               | 仍需检查默认暴露能力及本项目敏感输出         | 参考实现       |
| 应用内控制桥 + 独立 CLI   | 各类 Agent 均可调用，应用集中处理操作和输出 | 需要维护小型协议与跨平台分发                 | **主方案**     |
| 上述通路 + MCP stdio 适配 | 支持 MCP 的客户端可直接发现工具             | 多一个薄适配与客户端配置                     | 后续追加       |

查阅到的 `tauri-plugin-mcp-bridge` 0.13.2 API 文档包含页面脚本执行及多种应用控制能力，文档说明默认启用全部命令。本次未对其完整源码和 release 行为做审计。[S6]

### 3.2. 传输建议

- Windows 使用 Named Pipe，Linux/macOS 使用 Unix Domain Socket，限定本机当前用户。Windows 设置当前用户/登录会话 ACL 并拒绝远程管道客户端；Unix socket 目录和文件使用私有权限。[S8]
- 启用时生成随机连接 Token，在用户私有应用目录写出 `control.json`，记录协议版本、实例/启动身份、端点和 Token。CLI 自动读取，Token 避免进入参数、日志、错误和标准输出。
- 服务每次请求校验 Token 与当前模式；关闭或退出时撤销当前连接身份并清理连接描述，重新开启生成新 Token。模式从允许控制切到只读时即时阻止新提交及排队写操作，保留已完成结果。已进入业务执行的任务沿用既有取消语义并报告实际状态。
- 不同数据目录和 portable 实例分开发现，连接时核对实例/启动身份。发现与持久化路径沿用应用路径工具；portable 目录仍需核实文件权限。
- 使用有大小上限的 NDJSON 请求/响应，包含请求 ID、命令、窗口/快照身份与参数。处理分包、超时和断线，逐行解析 UTF-8 数据。
- `aiohubctl` 随安装版与便携包分发，建议使用轻量 Rust 二进制；普通用户无需安装 Bun/Node。

本机 Pipe/UDS 无需向网页开放 HTTP 端口；浏览器跨站请求主要是未来增加 loopback HTTP 时的边界。Token 负责本地连接身份校验，不能将其表述为对任意同用户进程的隔离。若以后增加 HTTP，再按实际传输实现认证、Host/Origin 校验和跨站请求防护。[S1][S2]

MCP stdio 适配器由 Agent 客户端启动，向同一控制桥转发结构化请求，沿用模式与输出规则。[S1]

## 4. 推荐架构

```text
第三方 Agent
  ├─ 进程调用 aiohubctl
  └─ MCP client → 薄 stdio 适配（后续）
                       │ Named Pipe / Unix Domain Socket
                       ▼
              Rust 本地控制入口
              - 关闭 / 只读观察 / 允许控制
              - 连接 Token、请求边界与窗口身份
                       │ 固定的应用内请求/响应
                       ▼
              前端控制桥
              ├─ 从 Dev Control 提炼的 DOM 引擎
              │  语义树、snapshotId/ref、敏感/忽略标记
              ├─ 少量宿主 UI 状态与快捷动作
              └─ 现有工具注册表 / 执行链
                       │
                       ▼
              集中输出脱敏 → CLI JSON 响应
```

控制桥随应用编译。复用 `dom-inspect.ts`、`dom-operations.ts` 的纯页面逻辑，保留 Dev Control 的调试专用入口；第三方只提交固定命令和数据。原生入口绑定窗口及请求身份，响应只接收对应窗口的待处理请求。

建议模块位置：`src-tauri/src/agent_control/`、`src/agent-control/`、设置页对应目录，以及独立 `aiohubctl` crate。提炼后的公共 DOM 逻辑可由开发控制和正式控制共用，避免维护两套交互实现。

### 4.1. 三态开关与使用体验

| 模式     | 可执行内容                                                        |
| -------- | ----------------------------------------------------------------- |
| 关闭     | 关闭监听，清理连接文件及当前 Token                                |
| 只读观察 | `status`、`windows`、`observe`、明确的脱敏 `state`、观察性 `wait` |
| 允许控制 | 在观察能力上开放 UI 操作与公开业务动作                            |

设置页面保留完整工作区，展示模式、连接状态、CLI 路径和接入说明。开启后 CLI 直接连接；模式检查统一放在控制入口。设置中的控制模式区域标记为控制忽略区，用户在本地更改模式。

首版将 `action`、`navigate`、`scroll` 与所有输入命令归入允许控制，避免通过可能产生副作用的方法绕过只读。观察与等待只检查当前状态，避免隐式聚焦、滚动或调用写方法。Token 只随启停和应用启动更新，流程中无需频繁配对或重连。

### 4.2. 控制桥集中约束

- 入口只接受已知命令，检查三态模式、参数基本类型、长度、窗口和快照身份。
- UI 操作使用控制桥持有的 `ref`；当前模式、`data-control-ignore` 和目标状态在实际执行前复核，避免旧快照或后续 DOM 变化误操作。
- `data-control-ignore` 子树跳过观察与引用分配；`data-sensitive` 表示内容需要脱敏，必要时仍可保留具备安全名称的输入入口。两类标记职责分开。
- `press` 等键盘命令也要核对当前焦点、快捷键路径和忽略区域。首版提供已适配的按键语义，避免通用全局快捷键间接操作忽略区。
- 工具动作仅暴露元数据标记 `agentCallable: true` 的方法，保留工具既有策略和参数处理；控制层无需给每个 Store/组件增加一套权限判断。
- 输入与输出分开处理；DOM 忽略标记只覆盖界面通路，`state/action` 的结果同样经过脱敏 helper。

Tauri capabilities 继续负责窗口/原生命令权限。新增控制 command 应核实调用窗口和参数边界；应用自定义 command 的默认暴露行为见官方说明。[S3]

## 5. 敏感信息保护

### 5.1. 安全目标与边界

本任务按以下目标收敛：

1. **避免误读凭据进入上下文**：观察、状态、业务结果、错误和后续截图沿用统一脱敏规则，防止应用已解出的凭据经控制输出流入模型。
2. **明确本机启用边界**：默认关闭，使用当前用户私有 Pipe/UDS 和本地 Token；只读模式在控制入口统一限制写操作。

信任受用户委托的同用户本机 Agent。允许控制后，可在现有业务规则下修改普通配置、渠道地址和运行工具。现有凭据混淆设计无需因控制 CLI 升级为原生密钥托管，控制流程也无需增加 Endpoint 绑定审批、锁屏吊销或查看密码前暂停会话。

连接 Token 与应用 API Key 分开保存和使用，Token 本身也属于应避免回显的字段。同用户进程可以独立访问文件或调试应用，这超出本协议的输出保护目标。

### 5.2. 当前已确认的泄漏入口

| 源码位置                                    | 当前行为                                               | 生产控制需要的处理                                            |
| ------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------- |
| `CustomHeadersEditor.vue:247-258`           | 请求头值为普通文本输入，模板展开值同时进入页面与 title | 按 header 类型和敏感来源分类；输入、预览、title、复制统一保护 |
| `MultiKeyManagerDialog.vue:674-679`         | 批量导入密钥使用普通 textarea                          | 复用敏感编辑器；读取只返回存在性，输入值及回显进入脱敏通路    |
| `MultiKeyManagerDialog.vue:183-193`、`:479` | 一键将全部密钥复制到系统剪贴板                         | 对应入口使用控制忽略标记；导出结果及快捷键路径同样核查        |
| 多处 `type="password" show-password`        | 用户可切换显示密码                                     | 敏感标记随显示状态保留，观察及后续截图始终按敏感内容处理      |
| `dom-inspect.ts:13-41`                      | 名称可来自 title、placeholder、innerText/textContent   | 敏感标签、预览和祖先聚合文字也需要安全投影                    |
| `llm-inspector/core/utils.ts:129`           | 基于模式识别密钥，保留部分前缀                         | 配置使用脱敏 DTO，业务结果复用领域脱敏 helper，模式识别补漏   |

本轮模板扫描在 750 个 Vue 模板中找到 12 个字面 `type="password"`、13 处 `show-password`，没有找到实际的 `data-dev-sensitive` 或 `data-sensitive` 模板标记。动态渲染、TSX 和运行时属性另需核实。开发截图已支持 `data-dev-sensitive` 选择器，但现有模板尚未形成统一标注习惯。

### 5.3. 轻量脱敏规则

- **配置与状态**：复用现有凭据剥离逻辑并补充安全 DTO；对 API Key、Token、敏感请求头返回 `hasApiKey` / `hasSecret` 等状态。输入字段与脱敏输出分开，修改普通配置时保留既有凭据，避免把占位符保存为真实值。
- **DOM 语义树**：默认跳过 input/textarea 的 `value`；只对明确安全且任务确有需要的字段提供值。`data-sensitive` 子树的原文、title、placeholder、description 及祖先聚合文字在序列化前处理。`aria-labelledby` 等引用也经过相同规则。
- **敏感组件**：请求头编辑器、批量导入 textarea、密钥列表和相关 tooltip/弹层统一补标记。`show-password` 改变 input type 后仍保留敏感身份；用户可在本地照常查看，控制输出继续遮蔽。
- **忽略区域**：为密钥显示、复制/导出入口及控制模式设置使用 `data-control-ignore`；执行时同样检查。忽略标记覆盖 Teleport 出去的内容，截图若后续支持也需遮罩其中的敏感区域。
- **业务返回与诊断**：`state`、`action`、错误、进度和异步结果统一经过控制桥 helper。配置对象按已知敏感字段/领域规则处理；JSON 字符串及自由文本不能只依赖对象属性名过滤。无法可靠处理的含凭据返回改为状态或省略对应内容，再逐项补适配。

这些措施集中在控制桥、公共敏感展示组件和少量确有回显的组件中。现有业务 Store 继续执行自身职责。输入值、Token 与原始结果避免写入控制日志；敏感内容由用户在本地录入即可，首版无需独立秘密传输通道。

### 5.4. 截图后置

首版以语义树和状态读取完成工作。跨平台截图独立评估，暂不提供时通过能力描述说明支持情况。

后续如提供截图，采集器应能识别当前窗口内所有敏感标记及忽略子树的敏感区域，并在导出前完成遮罩。临时 CSS 可作为采集流程的一部分，但需核实密码已展开、Teleport 弹层、滚动/缩放和画面时序，确保遮罩进入最终图片、异常时恢复界面。遮罩未完成时跳过图片输出。

开发工具已有截图脱敏实现可复用。Windows 原生采集可参考 WebView2 `CapturePreview`，平台实现留待确有需要时验证。[S7]

## 6. 界面控制与业务动作契约

### 6.1. 首批命令

以下为提案，当前仓库尚未实现：

```powershell
aiohubctl status
aiohubctl windows
aiohubctl observe --window main
aiohubctl click --ref e17 --snapshot <id>
aiohubctl fill --ref e22 --snapshot <id> --text "新的显示名称"
aiohubctl press --ref e22 --snapshot <id> --key Enter
aiohubctl select --ref e25 --snapshot <id> --option-ref o3
aiohubctl scroll --ref e30 --snapshot <id> --delta-y 600
aiohubctl wait --ref e29 --snapshot <id> --state enabled
aiohubctl navigate /settings?section=llm-service
aiohubctl state ui
aiohubctl action <toolId>.<method> --input-file request.json
```

`status` 可报告发现的实例与可用能力，CLI 支持选择实例，首版无需额外 connect/disconnect。关闭服务由用户在设置中完成。后续 MCP stdio 使用同一命令模型。

CLI 以 JSON 输出，stderr 只保留必要诊断。具备副作用的命令超时后报告实际已知状态，避免自动重试。需要连续执行时，先由调用方串行发送；批量接口可按实际需求补充。

### 6.2. 页面内引擎与短期引用

- 从 `scripts/dev-control/dom-inspect.ts`、`dom-operations.ts` 提炼共享 DOM 核心；两者可复用纯页面逻辑，生产入口替换定位与脱敏策略。保留现有超时、可见性、禁用、遮挡和节点变化检查。
- 快照包含实例/启动、窗口、文档身份和 `snapshotId`；元素 `ref` 仅在该快照有效期内使用。内存映射由页面内引擎持有，禁止只按 `e17` 这样的短编号跨快照复用。
- 替代 `nth-of-type` 路径，并在执行前核实节点仍连接、对应同一逻辑条目、符合敏感/忽略规则。列表 DOM 复用时也要核对条目身份；失效后提示重新观察。
- 紧凑语义树返回安全的 role/name/state/可用操作，遇到重名按区域和条目上下文区分。平台完整可访问性树与此轻量树的覆盖范围分别说明。
- 优先适配 Element Plus 的 `el-select` 选项和 `el-dialog`，从 body 的 Teleport 区域发现关联弹层，同时继承敏感/忽略身份。语义修复与模板标记需要覆盖实际落点。
- 虚拟列表只返回已加载区域；富文本、Monaco、canvas、排序和系统文件对话框按现有业务能力逐项适配。未支持时返回明确说明。

### 6.3. 桥接现有业务动作

复用 `toolRegistryManager` 的工具实例与 `getMetadata()`，只暴露 `agentCallable: true` 的方法。参数描述、默认值和异步元数据沿用 `MethodMetadata`；宿主 UI 只补路由、当前会话/Agent 和脱敏状态等少量快捷入口。

调用链优先适配现有 `executeToolRequests()`，保留默认参数、`checkSecurityPolicy`、`ToolContext`、超时/取消及任务提交等行为。允许控制可映射为该调用来源的普通自动执行配置；工具本身已有的阻断或强制确认继续按原业务策略处理，缺少必要上下文时返回可行动原因。

需注意两个当前实现事实：

- `src/services/registry.ts` 管理注册和生命周期，`agentCallable` 在各工具的元数据中声明。
- `src/services/executor.ts` 的通用 `execute()` 具有窗口路由及工具选择逻辑，入口主要检查方法是否存在。控制桥直接透传任意方法会遗漏 Agent 调用资格及工具策略，需复用合适执行链。

首版无需另建全量风险/资源/幂等注册表。保留请求 ID 用于关联结果，副作用失败或超时按真实状态报告。异步工具复用现有 taskId 与查询方法，任务结果、进度和错误也经过输出脱敏。

## 7. 元素可访问性调查

### 7.1. 方法与覆盖边界

本轮读取 Git 跟踪的桌面 `src/**/*.vue`，从顶层 template 提取标签/属性线索；忽略模板注释，统计原生及 Element Plus 常用控件、名称标记、点击事件、键盘与焦点标记。一次性脚本及逐项候选放在已忽略的 `.tmp/agent-control-research/`。

这是源码启发式调查：覆盖生产页面、共享组件、示例和辅助模板，未把构建产物逐一还原到实际窗口。Vue 组件最终 DOM、父级 tooltip/form label、运行时动态名称、事件委托、虚拟列表和焦点状态需要真实 Tauri 运行态核实。`@click.stop` 这样的事件拦截层也可能被计入候选。

范围为 750 个桌面 Vue 模板，分布在 47 个带 Vue 模板的工具目录、设置页和其他共享/视图目录。48 个工具注册入口中的 `retrieval` 主要提供业务服务，本轮没有对应 Vue 模板可列。移动端和独立插件仓库另行评估。

### 7.2. 初筛结果

| 项目                                                |  数量 | 含义                                        |
| --------------------------------------------------- | ----: | ------------------------------------------- |
| `button` / `el-button`                              | 2,271 | 源码标签数，同一循环标签运行时可能产生多项  |
| 自闭合按钮缺少自身 aria-label/aria-labelledby/title |   255 | 常见于图标按钮，父级 tooltip 等需运行态核查 |
| 带 click 的 div/span/li 等非语义容器                |   339 | 包含真实动作和事件拦截容器                  |
| 上述容器同时缺少自身 role/tabindex/键盘处理线索     |   325 | 待核查候选；实际修复量依赖交互语义          |
| 常用输入/选择控件                                   | 1,481 | 用于后续关联 label、状态及编辑能力核查      |
| 带 aria-label/aria-labelledby 的标签                |   296 | 线索数量，不能据此推断通过率                |
| 带 data-testid 的标签                               |   235 | 定位线索，与可访问名称职责不同              |

255 与 325 均为候选数量，应逐项复核；它们不构成 WCAG 失败项总数。下表零候选也仅表示这两项规则未命中。

### 7.3. 人工核查的代表案例

| 位置                                                                    | 已确认的源码形态                                              | 建议                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| `src/tools/llm-chat/LlmChat.vue:543`、`:567`                            | 侧栏折叠/展开使用带 click 的 div，缺少角色、焦点和键盘入口    | 使用原生 button，补名称、expanded 及控制对象             |
| `src/tools/llm-chat/components/ChatAreaHeader.vue:169`                  | 当前智能体切换使用 div + click.capture，缺少按钮/菜单触发语义 | 语义化触发器，报告 expanded，键盘打开及关闭后焦点返回    |
| `src/tools/agent-manager/AgentManager.vue:271-291`                      | 编辑/克隆/删除按钮只有图标与外层 tooltip，按钮缺少自身名称    | 显式 aria-label，保留 tooltip；运行态复核最终名称与焦点  |
| `src/views/Settings.vue:310-323`                                        | 窄窗口返回按钮缺少文字/名称，重置图标按钮依赖 tooltip         | 增加明确名称，核查响应式导航状态                         |
| `src/views/Settings/llm-service/components/CustomHeadersEditor.vue:261` | 删除请求头按钮仅图标                                          | 提供上下文名称/条目关联，敏感值不进入名称                |
| `src/components/common/BaseDialog.vue:31-67`                            | 已有 dialog、aria-modal、标题和关闭按钮名称                   | 作为公共基础复用；焦点圈定、返回和嵌套弹窗继续运行态核查 |
| `src/components/common/DropZone.vue:31-35`                              | 已有条件焦点与 Enter/Space 处理                               | 保持内置按钮独立可用，按现有契约扩展                     |

标准按钮模式要求可访问名称，并支持 Enter/Space 激活；这些约定能同时改善键盘、辅助技术与 Agent 操作。[S4] 可访问名称还涉及关联标签及优先级，当前 inspect 的自定义启发式不宜作为标准审计依据。[S5]

### 7.4. 各模块源码初筛清单

下表按两项候选数之和排序，仅用于定位阅读优先级。

| 模块                   | Vue 模板 | 按钮 | 自闭合按钮缺少自身名称线索 | 点击容器缺少角色/焦点/键盘线索 | 输入/选择控件 |
| ---------------------- | -------: | ---: | -------------------------: | -----------------------------: | ------------: |
| llm-chat               |       99 |  259 |                         28 |                             56 |           155 |
| agent-manager          |       60 |  185 |                         23 |                             42 |           169 |
| shared-and-other-views |       76 |  133 |                         15 |                             28 |            26 |
| settings               |       43 |  186 |                         15 |                             20 |           214 |
| media-generator        |       27 |   91 |                         11 |                             15 |            52 |
| window-automator       |       18 |   48 |                         13 |                             12 |            64 |
| rich-text-renderer     |       48 |   62 |                         10 |                             12 |            65 |
| sketch-pad             |       24 |   93 |                          4 |                             17 |            36 |
| translator             |        9 |   40 |                         18 |                              3 |            19 |
| st-worldbook-manager   |        7 |   31 |                         10 |                             10 |            51 |
| git-committer          |       23 |   88 |                          0 |                             17 |            24 |
| smart-ocr              |        5 |   28 |                          8 |                              9 |            12 |
| ffmpeg-tools           |       11 |   54 |                         16 |                              0 |            55 |
| vcp-connector          |       17 |   31 |                          1 |                             15 |            22 |
| color-picker           |       13 |   51 |                          5 |                             10 |            12 |
| skill-manager          |       10 |   27 |                          9 |                              5 |            22 |
| web-canvas             |       15 |   24 |                          4 |                             10 |             2 |
| recall                 |       24 |   89 |                          6 |                              7 |            40 |
| component-tester       |       15 |  170 |                          9 |                              1 |            51 |
| directory-tree         |        3 |   10 |                          6 |                              2 |            16 |
| embedding-playground   |        7 |   18 |                          7 |                              1 |            11 |
| dir-search             |       11 |   19 |                          0 |                              7 |             7 |
| token-calculator       |       11 |   32 |                          6 |                              1 |            34 |
| transcription          |        4 |   19 |                          6 |                              1 |             5 |
| regex-applier          |        2 |   26 |                          5 |                              1 |            14 |
| tool-calling           |       11 |   31 |                          4 |                              2 |            14 |
| llm-inspector          |       14 |   39 |                          0 |                              5 |            12 |
| aio-file-operator      |        3 |    9 |                          3 |                              1 |             5 |
| data-filter            |        1 |   14 |                          4 |                              0 |            17 |
| symlink-mover          |        7 |   10 |                          4 |                              0 |             4 |
| asset-manager          |        8 |   13 |                          0 |                              3 |            23 |
| config-converter       |        5 |   15 |                          1 |                              2 |            11 |
| git-analyzer           |       12 |   36 |                          3 |                              0 |            43 |
| realtime-subtitle-ocr  |       15 |   59 |                          0 |                              3 |            20 |
| api-tester             |        8 |   21 |                          1 |                              1 |            19 |
| content-deduplicator   |        4 |    7 |                          0 |                              2 |            13 |
| web-distillery         |       21 |   83 |                          0 |                              2 |            46 |
| service-monitor        |        4 |    0 |                          0 |                              1 |             0 |
| sub-agent              |        8 |   26 |                          0 |                              1 |             5 |
| code-formatter         |        1 |    3 |                          0 |                              0 |             5 |
| danmaku-player         |        8 |   13 |                          0 |                              0 |            13 |
| directory-janitor      |        3 |    6 |                          0 |                              0 |            10 |
| json-formatter         |        1 |    5 |                          0 |                              0 |             1 |
| knowledge-base         |       12 |   40 |                          0 |                              0 |            30 |
| media-info-reader      |        6 |    5 |                          0 |                              0 |             2 |
| system-pulse           |        9 |    4 |                          0 |                              0 |             1 |
| text-diff              |        1 |    6 |                          0 |                              0 |             5 |
| user-profile-manager   |        5 |    7 |                          0 |                              0 |             3 |
| wallpaper-detector     |        1 |    5 |                          0 |                              0 |             1 |


### 7.5. 开发期修复与检查

生产 CLI 首版移除 `audit`。上面的源码候选和人工案例继续作为修复线索，优先处理主导航、设置、聊天输入、智能体切换和图标操作按钮。

- 图标按钮增加明确 `aria-label`，tooltip 可继续用于视觉提示；复制现有标题时确认它准确描述动作且没有敏感内容。
- 高频点击容器优先使用原生 `button type="button"`。确需自定义角色时补齐名称、焦点、Enter/Space 及正确状态，避免只添加 `role`。
- 弹窗焦点进入/返回、组合控件键盘行为和动态选项发现保留真实 Tauri 走查。源码扫描、ESLint 和单元测试各覆盖适合的确定性问题。
- 后续按项目现有工具链评估合适的 lint 规则，避免用模板文案存在性测试替代交互验证。操作系统 UIA 交叉审计移出本任务范围。

## 8. 实施顺序与工作量判断

### 第一阶段：回显修复与高频控件语义化

修复请求头值及其 title/预览、批量密钥导入和复制导出入口，明确 `data-sensitive` / `data-control-ignore` 的公共约定。优先补主导航、设置、聊天与智能体切换的按钮名称和键盘行为。

这批改动与现有界面直接相关，可先做；源码候选逐项核实，避免把事件拦截层机械改成按钮。

### 第二阶段：复用页面内引擎和现有动作

提炼 Dev Control 纯 DOM 核心，增加安全序列化、`snapshotId/ref`、执行前标记检查和 Element Plus 弹层适配。桥接公开工具方法与少量宿主动作，复用执行链和脱敏 helper。

开发控制通道可用于验证共享逻辑；生产入口仍由第三阶段本地服务提供，调试入口继续保持开发专用。

### 第三阶段：本地 IPC 与轻量 CLI，串起完整流程

交付三态设置、私有 Pipe/UDS、`control.json`、连接 Token、NDJSON 和 `aiohubctl`，在正式构建完成一条纵向流程：

**用户开启允许控制 → CLI 自动发现连接 → Agent 查看设置并修改渠道普通字段 → 用户本地录入 Key → Agent 查询脱敏状态并通过现有业务入口测试连接 → 用户关闭控制。**

阶段二、三按此流程衔接，先交付可用能力。截图、多平台完善、批量命令和 MCP stdio 按实际需要追加。

### 工作量判断

- **较小**：三态设置、脱敏状态、命令外形和已有组件的局部语义修复。
- **中等**：本地 IPC/CLI 分发、共享 DOM 提炼、短期引用、多窗口和 Element Plus 适配。
- **主要持续工作**：敏感回显覆盖、复杂控件行为和现有业务执行链衔接。

本任务围绕启用、观察、操作与输出治理推进。具体工期在首批流程、平台与业务入口确认后估算。

## 9. 聚焦验证建议

本次为文档修订：保留先前源码调查结果，核对审查提及的 DOM 引擎、注册表、执行器和凭据混淆源码；未修改产品实现，未运行应用、真实网络任务、构建或测试。

实施时围绕少量公开契约验证：

1. **模式与连接**：默认关闭；只读下写命令和 action 被入口拒绝；Token/实例错误不可连接；切换模式立即影响后续操作。
2. **脱敏**：用合成凭据覆盖请求头、批量导入、祖先文字/关联标签、state、action、错误和进度；本地展开密码后仍保持控制输出脱敏。
3. **引用与忽略区域**：跨窗口/过期快照/列表节点复用和执行前进入忽略区时拒绝误操作；键盘命令遵循相同约束。
4. **真实流程**：通过正式构建完成上述配置场景，确认保存、读取和关闭控制。工具原有安全策略及异步返回保持可用。

这些验证分别保护启用边界、明文输出、操作定位和功能完整性。实现变更后按项目规范执行相关测试、类型检查和 Vite 构建；交互与视觉在真实 Tauri 窗口走查。

## 10. 仍需原型验证的事项

- 从开发脚本提炼 DOM 核心后，两类入口的超时与事件语义保持一致。
- 多窗口请求来源、页面刷新和短期引用失效处理。
- Element Plus Teleport 弹层中标记继承、选项发现和按键路径。
- 工具执行链的宿主配置、上下文和异步结果如何最小改动地复用。
- 安装版/portable/多实例的私有连接文件、权限与 CLI 分发。

先完成一条真实配置流程，再按使用需求扩展复杂编辑器与工具。

## 11. 外部一手资料

外部资料查阅日期：2026-11-02。MCP 引用固定于 2025-11-25 规范页面，文档重定向时以目标页面实际内容为准；草案及插件文档用于方案参考。

- **[S1] MCP Transports**：stdio、Streamable HTTP、Origin/loopback/认证要求。https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- **[S2] MCP Security Best Practices**：令牌透传、会话安全、最小权限及 confused-deputy 风险。https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices
- **[S3] Tauri Capabilities**：窗口/WebView 的 IPC 权限与作用范围。https://v2.tauri.app/security/capabilities/
- **[S4] WAI-ARIA APG Button Pattern**：按钮名称、状态与键盘交互。https://www.w3.org/WAI/ARIA/apg/patterns/button/
- **[S5] Accessible Name and Description Computation 1.2**：本轮页面为 2026-10-21 Working Draft；后续实现须固定使用的规范与实现版本。https://www.w3.org/TR/accname-1.2/
- **[S6] tauri-plugin-mcp-bridge 项目 API 文档**：了解现有 Tauri MCP 桥的能力范围。https://docs.rs/tauri-plugin-mcp-bridge/latest/tauri_plugin_mcp_bridge/
- **[S7] Microsoft WebView2 ICoreWebView2 / CapturePreview**：原生 WebView 内容截图。此旧版引用页标记停止维护，实施时沿页面入口切换当前 API reference 并核对 SDK。https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2
- **[S8] Microsoft Named Pipe Security and Access Rights**：默认 ACL、显式安全描述符与登录会话隔离。https://learn.microsoft.com/en-us/windows/win32/ipc/named-pipe-security-and-access-rights

## 12. 外部审查吸收记录（2026-11-02）

审查原文：`production-agent-control-investigation-review.md`，保留原文供追溯。

| 意见                                   | 处理       | 落点/原因                                             |
| -------------------------------------- | ---------- | ----------------------------------------------------- |
| 对齐防止凭据误入上下文的目标           | 采纳       | §1、§5.1；按可信本机 Agent 收敛                       |
| 三态开关、本地文件 Token、CLI 自动直连 | 采纳       | §3.2、§4.1；移除配对、细粒度权限及锁屏重连            |
| 复用纯 DOM 引擎和 snapshotId/ref       | 采纳       | §6.2；优先 Element Plus 弹层                          |
| 桥接已有注册表，避免重型动作框架       | 采纳并补充 | §6.3；沿用 agentCallable 与既有执行/安全/任务语义     |
| 使用 DOM 敏感/忽略标记集中处理         | 采纳并补充 | §4.2、§5.3；执行时复核，覆盖键盘、关联标签和 Teleport |
| 移除 Endpoint 再授权、独立秘密通道     | 采纳       | §5.1、§5.3；用户本地录入，普通控制不追加审批          |
| 截图作为可选能力                       | 采纳       | §5.4；语义树优先，CSS 遮罩仍需采集验证                |
| 移除生产 audit / UIA 交叉审计          | 采纳       | §7.5；保留清单和开发期真实交互走查                    |
| 仅过滤 DOM 即完成保护                  | 部分采纳   | state/action/错误存在独立输出路径，仍需集中脱敏       |
| 用 lint / 单测覆盖可访问性             | 部分采纳   | 可覆盖静态规则；焦点和复杂键盘行为保留运行态核查      |

本次核对还修正两处审查中的源码描述：混淆种子实际是 `aiohub.llm.vault.v1`；公开方法元数据由各工具提供，`registry.ts` 负责注册管理。Pipe/UDS 自身无需网页 HTTP 入口，本地 Token 的用途表述为连接身份校验，跨站防护留给实际增加的 HTTP 通道。
