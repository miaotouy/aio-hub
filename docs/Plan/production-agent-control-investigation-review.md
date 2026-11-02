# 《正式版本 Agent 界面控制：调研与实施建议》审查与裁剪意见

- **被审查文档**：`docs/Plan/production-agent-control-investigation.md`
- **审查日期**：2026-11-02
- **核心结论**：原报告的**代码事实盘点（§2）、明文回显入口排查（§5.2）、750 个 Vue 模板无障碍扫描（§7.2–7.4）质量极高，全数保留**；但架构与安全设计部分（§4、§5.1/5.3/5.4、§6.3、§8）误判了项目的密钥保护设计意图，将「防止 Agent 随便扫到明文污染上下文」过度引申为「防范同机恶意进程窃密的零信任网银体系」，必须在进入实施前大幅裁剪。

---

## 1. 核心认知纠偏：对齐 `secrets.dat` 的真实设计意图

原报告在 §5.2 中注意到 `src/utils/llm-secret/codec.ts` 使用固定种子（`aiohub-llm-secrets-v1`）做流式混淆而非重度系统级加密，进而推导出了一整套防范「同系统用户下恶意进程通过控制通道窃取或拐骗密钥」的复杂防御机制（如配对审批、锁屏吊销、看密码暂停会话、修改 Endpoint 重新授权凭据绑定等）。

**这里存在根本性的设计意图错位：**

1. **为什么 `secrets.dat` 采用非明文混淆但不加密？**
   - 设计目标**从来不是防范同机恶意软件或逆向工程**（同操作系统用户下的进程本就拥有对应用目录和代码的完整读取能力）。
   - 真实目标是 **Anti-Accidental-Ingestion（防 Agent 无意扫出明文吸入上下文）**：防止本地 Coding Agent 在执行文件搜索（`grep` / `Get-Content`）或目录遍历时，直接扫出 `sk-...` 等明文 API Key 并将其带入商业大模型的云端上下文。
2. **正式版 Agent 控制接口的安全边界应当与 `secrets.dat` 完全同构：**
   - **输出侧严防明文回显（防误扫）**：Agent 调用 `observe`、`inspect`、`state`、`screenshot` 时，返回的数据结构和画面绝不能直接吐出解混淆后的明文密钥，否则 `secrets.dat` 在落盘侧做的防扫保护就会在 UI/IPC 侧破功。
   - **控制侧信任本地同用户 Agent（不防内鬼）**：既然能调用本地 CLI 的 Agent 本来就跑在当前用户权限下，任何试图防范「Agent 恶意改 Base URL 钓鱼」或「逼迫用户频繁弹窗审批/锁屏重连」的设计都是无效摩擦，不仅防不住真正的恶意程序，还会严重破坏正常自动化体验与业务代码整洁度。

---

## 2. 逐章审查与保留/砍削清单

| 章节                              | 评估                          | 审查处理意见                                                                                                                                                                                                                                                                                                                                                     |
| :-------------------------------- | :---------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **§1 结论摘要**                   | ⚠️ 需修正                      | 保留「Named Pipe/UDS + 独立轻量 CLI (`aiohubctl`) + 安全 DOM 语义树 (`ref`)」主路线；**删去**「高风险动作二次确认」、「短期会话令牌与锁屏失效」、「6 级权限模型」。                                                                                                                                                                                              |
| **§2 当前仓库事实盘点**           | ✅ 留用                        | 事实准确。特别是指出 `registerDevState` 仅注册了 `ui`/`capabilities`，而 48 个工具中 83 处 `agentCallable: true` 尚未桥接，直接指明了业务动作层的复用方向。                                                                                                                                                                                                      |
| **§3 外部实践对比**               | ✅ 留用                        | 对比结论合理：采用类似 `agent-browser` 的紧凑语义树 + 短期元素引用 `ref`（如 `e17`），放弃在生产环境暴露原生 CDP/WebDriver。                                                                                                                                                                                                                                     |
| **§4.1 启用与配对机制**           | ❌ 大幅砍削                    | **砍掉**「一次性配对码 / 应用内批准弹窗」、「锁屏立即撤销令牌」、「托盘常驻一键暂停」、「查看密码前必须先暂停所有观察会话」。<br>**改为**：应用设置中提供一个简单的开关（`关闭` / `只读观察` / `允许控制`）。开启后在当前用户私有目录写出连接端点与随机 Session Token 文件（仅用于防浏览器网页跨站盲打），本地 CLI 读取该文件即可直连，无需人工弹窗配对。        |
| **§4.2 六级权限模型与共用风控**   | ❌ 驳回                        | **严禁实施**「6 类细粒度 RBAC Scope」以及「UI click、快捷键、剪贴板与业务 action 在业务调用前再次校验风险策略」。这种设计会导致所有业务 Store 和组件方法被控制层权限判断侵入。<br>**改为**：在控制桥与 DOM 语义树生成层单点收口——不希望被 Agent 触碰的敏感开关或密钥管理弹窗，直接在 DOM 上标记 `[data-control-ignore]`，使其不进入语义树、不分配 `ref`。        |
| **§5.1 威胁模型**                 | ⚠️ 重写定位                    | 威胁模型收敛为两条：<br>1. **防上下文污染**：防止 API Key、Token、敏感请求头通过 `observe`/`state`/`screenshot` 被 Agent 意外读入 LLM 上下文；<br>2. **防跨站盲打（Local CSRF）**：使用 Pipe/UDS + 本地文件 Token，拒绝无凭据请求。                                                                                                                              |
| **§5.2 仓库中已确认的泄漏入口**   | ✅ 重点留用                    | 排查非常精准，直接作为第一阶段必改项：<br>1. `CustomHeadersEditor.vue:247-258`（请求头值明文显示且 `:title` 展开完整值）<br>2. `MultiKeyManagerDialog.vue:674-679`（普通 textarea 明文批量导入 Key）<br>3. `MultiKeyManagerDialog.vue:183-193`（一键复制全部明文 Key 到剪贴板）<br>4. 将未落地的 `data-dev-sensitive` 升级为实际生效的敏感标记并在关键组件补齐。 |
| **§5.3–5.4 六层防护与防回显机制** | ⚠️ 去芜存菁                    | **保留**：DTO 级脱敏（只返回 `hasSecret: true`）、DOM 语义树抹除 `input[type=password]` 与敏感标记节点的文本/属性/title。<br>**砍掉**：「修改渠道 Endpoint 时重新确认凭据绑定及网络授权」、「独立 stdin 秘密通道」、「看密码前暂停会话」。                                                                                                                       |
| **§6.1 传输拓扑与协议**           | ✅ 留用（精简命令）            | 保留 Named Pipe / UDS + NDJSON + `aiohubctl` + 后续薄封装 MCP Server。<br>CLI 命令集精简为：`status`、`windows`、`observe`、`click`、`fill`、`press`、`select`、`scroll`、`wait`、`navigate`、`state`、`action`。<br>**砍掉**：`pair`、`revoke`、`audit`。                                                                                                       |
| **§6.2 UI 观察与语义交互**        | ⚠️ 复用现有实现                | 不要从零重造。仓库现有的 `scripts/dev-control/dom-inspect.ts` 与 `dom-operations.ts` 已经是零 Playwright 依赖的纯页面函数。<br>直接将其提炼迁入 `src/`，把脆弱的 CSS Path 定位升级为带 `snapshotId` 的内存短期 `ref (e1, e2...)`，并重点补齐 **Element Plus 弹层组件（`el-select` / `el-dialog` Teleport 到 body）** 的定位与选择适配。                          |
| **§6.3 业务动作层 (`action`)**    | ⚠️ 禁止重复造轮子              | **砍掉**新建一套包含「输入输出 Schema、权限、资源范围、风险、敏感字段、预览、持久化确认、幂等键」的重型注册表。<br>**改为**：直接复用并桥接现有的 `toolRegistryManager`（`src/services/registry.ts` 中已声明 `agentCallable: true` 的方法），仅在控制桥补充少量宿主 UI 级快捷动作（如路由跳转、切换当前会话/Agent、读取脱敏后的 UI 状态）。                      |
| **§6.4 截图策略**                 | 🔽 降级为可选                  | 结构化 DOM 语义树已是 Agent 交互的主通道。无需在第一阶段强行攻关 WebView2 `CapturePreview` 跨平台原生截图与内存坐标遮罩流水线；若需前端截图，仅在导出前对敏感元素临时应用 CSS 遮罩即可。                                                                                                                                                                         |
| **§7 前端可访问性审计**           | ✅ 留用清单，砍掉生产 CLI 审计 | **保留 §7.2–7.4 的具体组件修复清单**（如 `LlmChat.vue:543`、`ChatAreaHeader.vue:169`、`TitleBar.vue:156`、`AgentManager.vue:271` 等无名称图标按钮和 `div @click` 改造）。<br>**砍掉 §7.5**：不要在生产控制工具里做 `aiohubctl audit` 无障碍与对比度审计器，也无需接入操作系统 UIA 树做交叉核查，模板规范走开发期 ESLint / 单元测试即可。                         |

---

## 3. 收敛后的实施路线图（供后续编码直接执行）

### Phase 1：堵住 UI 明文回显口 + 关键控件语义化（零架构风险，可立即动工）
1. **敏感组件脱敏加固**：
   - 修复 `CustomHeadersEditor.vue`：默认掩码显示敏感 Header（如 `Authorization`、`x-api-key` 等），移除暴露完整明文的 `:title="row.value"`，打上 `data-sensitive`。
   - 修复 `MultiKeyManagerDialog.vue`：为批量导入 `textarea` 与密钥列表区域打上 `data-sensitive`；在控制桥激活期间或通过语义树巡检时屏蔽该弹窗内的明文提取。
   - 为所有 API Key 输入框及展示位统一补齐 `data-sensitive` 标记。
2. **核心页面可访问性补齐**：
   - 按原报告 §7.4 清单，优先给主导航、`LlmChat`、`ChatAreaHeader`、`MessageInput`、`Settings`、`AgentManager` 中的纯图标 `<el-button>` 补齐 `aria-label`（复用已有 `title` 或 `el-tooltip content`）。
   - 将高频自定义卡片/折叠头（如 `SettingCollapsibleCard.vue`、`ModelSelectDialog.vue`）的 `<div @click>` 改为 `<button type="button">` 或补齐 `role="button" tabindex="0"`。

### Phase 2：前端内聚控制桥与短期 `ref` 语义树（复用 `dev-control` 纯页面函数）
1. **迁入并升级页面内引擎**：
   - 将 `scripts/dev-control/dom-inspect.ts` 与 `dom-operations.ts` 的纯 DOM 逻辑抽离为前端公共控制模块。
   - 引入 `snapshotId` 与短期元素引用映射（`e1`, `e2`...），替代冗长的 `nth-of-type` CSS Path。
   - **硬性脱敏守则**：`inspect` 严禁读取任何 `input/textarea` 的明文 `value`（除非显式声明为非敏感搜索框），严禁读取 `[data-sensitive]` 及 `[data-control-ignore]` 子树内的文本、`title`、`placeholder`。
   - 适配 Element Plus 常见交互（处理 `el-select` 下拉菜单 Teleport 到 `body` 后的选项发现与点击）。
2. **桥接现有业务能力**：
   - 将 `src/services/registry.ts` 中 `agentCallable: true` 的工具方法直接映射为可调用的 `action`，不另起炉灶定义重型风控 Schema。
   - 状态读取（`state`）返回的配置对象统一经过单点脱敏 helper，剥离 `apiKey` / 敏感请求头，仅保留 `hasApiKey: boolean`。

### Phase 3：Tauri 本地 IPC 端点与轻量 `aiohubctl`
1. **Tauri 侧本地监听**：
   - 受设置项开关控制（默认关闭），启动后监听当前用户权限下的 Named Pipe（Windows）或 Unix Domain Socket（Linux/macOS），并在应用数据目录写入包含管道路径与随机 Session Token 的 `control.json`。
2. **轻量 CLI (`aiohubctl`)**：
   - 读取 `control.json` 自动附带 Token 发送 NDJSON 指令（`observe` / `click` / `fill` / `select` / `navigate` / `state` / `action`）。
   - 保持无状态或轻量会话转发，后续按需在其上薄封装一层 MCP stdio 适配器即可。