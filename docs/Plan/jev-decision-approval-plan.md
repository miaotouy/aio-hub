# JEV 决策模型应用层落地：工具自动审批仲裁 (Desktop)

> 状态：**Draft**（已审议修订 v5：吸收 mmcode JEV 实战经验——per-option criteria、重试策略、保首尾截断、inline 脚本检测、危险特征跳过仲裁；修正 ToolApprovalResult 契约、arbitrationStates key 契约、状态 Map 清理时机；v4：两段式仲裁等待态、参考 opencode / pi / snow-cli 审批模式、红线 7/8、强制审批可配置模式、Q1–Q3 已裁决）
>
> 关联：[`v0.7.0-rc-implementation-audit.md`](../Plan/v0.7.0-rc-implementation-audit.md) 中「TypeSafe AI System One 决策渠道」为已落地底座，本计划是其应用层消费者
>
> 范围：跨模块（`llm-apis` / `tool-calling` / `llm-chat` / `agent-manager` / `sub-agent`）

---

## 1. 背景与现状调查

### 1.1. JEV 底座现状（已具备，无需重做）

| 层          | 位置                                                                                                                                              | 状态                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 协议核心    | `packages/llm-core/src/types/system-one.ts`、`providers/typesafe-system-one.ts`、`system-one-executor.ts`（位于 `packages/llm-core/src/` 根目录） | ✅ 已落地，支持 `noul`（0~1 概率）/ `choice`（枚举）/ `score`（评分）三类结构化问答 |
| 桌面 facade | `src/llm-apis/system-one-core.ts` → `callTypeSafeSystemOneApi()`                                                                                  | ✅ 已落地，含超时 / AbortSignal / 传输观察者                                        |
| 渠道与预设  | `src/config/llm-presets/presets/typesafe.ts`（`jev-latest`）                                                                                      | ✅ 已落地                                                                           |
| 元数据      | `src/config/model-metadata-presets/providers.ts` 的 `model-prefix-jev`，`capabilities: { decision: true }`                                        | ✅ 已落地                                                                           |
| 渲染识别    | `src/tools/rich-text-renderer`（JEV 自然语言工具调用展示）                                                                                        | ✅ 已落地（仅展示，非决策）                                                         |

**结论：应用层消费者数量为零。** JEV 当前在产品中没有任何实际用途。

### 1.2. 工具审批链路现状（参考 opencode / snow-cli）

审批决策发生在 [`src/tools/tool-calling/core/executor.ts`](../../src/tools/tool-calling/core/executor.ts)：

1. **死区短路**：`checkSecurityPolicy()` 返回 `block` → 直接拒绝，无审批环节；
2. **强制审批**：返回 `approve` → `forceApproval = true`，跳过一切自动批准；
3. **静态规则**：`shouldAutoApprove()`（executor.ts:452）基于 `mode` + `autoApproveTools` + `autoApproveMethods` 白名单判定；
4. **人工审批**：未命中自动批准的请求经 `onBeforeExecute` 回调 → [`toolCallingStore.requestApproval()`](../../src/tools/llm-chat/stores/toolCallingStore.ts:148) 弹窗等待人工，带超时与生命周期清理（KI-006 已修复）。

**人工审批唯一收口点**：`toolCallingStore.requestApproval()`。以下来源全部经过它：

- llm-chat 编排器（`useToolCallOrchestrator.ts`）
- VCPLog 频道（`vcpConnectorStore.ts`）
- VCP Node 协议（`vcpNodeProtocol.ts`）
- 跨窗口审批代理（`useLlmChatSync.ts`）
- sub-agent / 后台任务（`awaiting_approval` 状态）

**参考项目审批模式差异**：

| 项目                  | 模式                                      | 特点                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **pi (coding-agent)** | hook 同步阻塞                             | `tool_call` 事件里同步判断危险命令（正则），无 UI 时直接 block，无 pending/队列                                                                                                                                      |
| **opencode**          | Effect 挂起 + 事件                        | `permission.ask` 挂起当前流程，pending Map + deferred，reply 支持 once/always，拒绝时级联同 session pending                                                                                                          |
| **snow-cli**          | 双层：主会话同步确认 / sub-agent 逐个确认 | 主会话用 `toolConfirmationFlow` 同步确认；sub-agent 用 `subAgentToolApproval` 按 tool 逐个确认，`shouldStopAfterRejection` 时中断后续                                                                                |
| **mmcode (kilocode)** | 静态规则 → 决策模型 → 人工                | 静态 allow/deny 先行，仅灰区（`ask_user`）送 Jev；危险标记命令不送模型；decision model 返回 `{ decision, confidence }`，allow/deny 双向 confidence 门槛；任何失败 → `ask`；来源走 `autoApprovalInfo.source` 旁路对象 |

### 1.3. 断层分析

| 缺口             | 说明                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 只有两极         | 「全自动（静态白名单）」与「全人工（弹窗）」之间没有中间层。非白名单操作一律打扰用户                                              |
| 决策模型无消费者 | JEV 快（不生成自然语言）、便宜（$0.042/M 输入 token，输出免费）、结构化（概率裁决），是灰区仲裁的理想执行者，但没有任何模块调用它 |
| 白名单维护成本   | `autoApproveMethods` 需要逐项手工配置，无法根据「参数 + 上下文」做细粒度判断                                                      |

---

## 2. 设计方案

### 2.1. 定位：灰区仲裁层（Decision Arbitration）

在「需要审批」与「弹人工」之间插入一个可选的决策模型仲裁环节：

```mermaid
flowchart TD
    A[工具请求] --> B{checkSecurityPolicy<br/>安全策略}
    B -->|block 死区| C[直接拒绝<br/>JEV 永远无权介入]
    B --> D{shouldAutoApprove<br/>静态规则}
    D -->|自动批准| E[执行]
    D -->|需要审批 / 强制审批| F{JEV 决策仲裁层·新增}
    F -->|低风险且高置信| E
    F -->|高风险| G[拒绝]
    F -->|模糊区间| H[人工审批弹窗]
    F -->|渠道不可用/超时/解析失败| H
    H -->|批准| E
    H -->|拒绝| G
```

### 2.2. 模块分层

```
src/services/decision-arbiter/          ← 新增，决策仲裁服务
├── types.ts                            ArbiterDecision / ArbitrationContext / ArbiterConfig
├── evaluator.ts                        纯函数裁决器（阈值规则，可单测，无 IO）
├── jevQuestionnaire.ts                 构造 System One 问答（state 摘要 + questions）
└── index.ts                            createDecisionArbiter()：封装渠道调用、超时、
                                        失败降级（fail-closed）、结果缓存、审计日志
```

- **`evaluator.ts`（纯函数）**：输入 `SystemOneResponse` + `ArbiterConfig`，输出 `"approve" | "deny" | "escalate"`。零依赖，全量单测覆盖阈值边界。
- **`index.ts`（服务）**：持有 profile 解析与渠道调用，导出 `Arbiter` 接口。**不直接依赖 Pinia**，由宿主装配。

### 2.3. 收口点：审批入口依赖注入

仲裁装配在 [`toolCallingStore.requestApproval()`](../../src/tools/llm-chat/stores/toolCallingStore.ts:148) 入口第一步（方案 C，替代备选的 executor 内嵌 / 编排器装配，理由见 §8）：

```ts
// toolCallingStore（示意）
interface ApprovalArbiter {
  arbitrate(ctx: ArbitrationContext): Promise<ArbiterDecision>;
}
let arbiter: ApprovalArbiter | null = null;
export function setApprovalArbiter(a: ApprovalArbiter | null) { arbiter = a; }

async function requestApproval(sessionId, request, externalId?, options?) {
  if (arbiter && options?.skipArbitration !== true) {
    const verdict = await arbiter.arbitrate(buildArbitrationContext(request));
    if (verdict.action === "approve") return "approved";   // 记录审计后放行
    if (verdict.action === "deny") return "rejected";      // 记录审计后拒绝
    // escalate → 继续走原有人工弹窗流程
  }
  // …原有人工审批流程不变
}
```

- `executor.ts` **零改动**：preview hook 时序、approvalCache、安全策略短路全部保持原状（preview 在仲裁之前已由 executor 分发）。
- 所有审批来源（本地会话 / VCP / 跨窗口）天然统一获得仲裁能力。
- VCP 等外部来源可通过 `ArbitrationContext.source` 识别并按配置豁免自动放行（§2.6 红线 5）。

### 2.4. 仲裁等待态与浮窗出现时机（用户已裁决）

采用**非阻塞两段式**：仲裁等待态在消息流工具卡片上展示，浮窗只在 JEV 未通过（escalate）时出现。

```
工具请求进入
  → 卡片状态 arbitrating「等待 AI 审核」（骨架光晕）
      ├─ JEV approve → 直接执行，卡片显示「Jev 自动放行」徽标
      ├─ JEV deny    → 流程结束，卡片显示「Jev 风险拦截 (91%)」
      └─ escalate    → 写入 pendingRequests
                        → ToolCallingApprovalBar 浮窗出现
                        → 卡片状态转 awaiting_approval
                        → 人工批准/拒绝 → 执行/拒绝
```

实现要点：

1. **store 侧**：`requestApproval()` 入口先调 `arbiter.arbitrate()`，approve/deny 直接 resolve，**只有 escalate 才 push 进 `pendingRequests`**——浮窗天然只在未通过时出现；人工审批超时从 escalate 时刻起算，仲裁耗时（timeoutMs ≤ 8s）不计入人工超时窗口；
2. **仲裁中状态可观察**：store 增加响应式 `arbitrationStates: Map<requestId, "arbitrating" | "escalated" | "auto-approved" | "auto-denied">`。**Key 契约为 `request.requestId`（即 `ParsedToolRequest.requestId`），必须与消息卡片携带的 id 一致，禁止使用 store 内部 `pending.id`（随机串，`toolCallingStore.ts:158`）**，否则 `ToolCallMessage.vue` 无法按消息响应式读取；escalate 时更新该 map 并入列。**生命周期**：`arbitrationStates` 与审计映射在会话清理（`cancelBySession`）/ 窗口关闭时按 sessionId 联动清理，未决项必须删除，已结项可保留 LRU 上限（默认最近 100 条）防止长会话内存增长；
3. **卡片状态**：`awaiting_approval` 之外新增 `arbitrating` 等待态样式；deny 走 `rejected` 但徽标显示「Jev 风险拦截」而非「用户拒绝」（需携带审计来源，见 §2.6 红线 7）；
4. **§3.1 修订**：仲裁期间审批条不存在，无需骨架光晕；审批条只在 escalate 后出现，批量 escalate 请求聚合进同一个浮窗；
5. **并发批量**：N 个请求各自仲裁互不阻塞，arbiter 内部做并发上限（默认 3）与节流。

### 2.5. JEV 问答设计（单次调用多问题）

```ts
// state：工具调用上下文的序列化摘要（控制 token 预算，目标 < 2k）
// - toolId / methodName / displayName
// - mergedArgs（超长值截断脱敏，见下方「state 摘要裁剪规范」，
//   思路参考 aio-file-operator 的 formatPathForError，如需直接复用需先提取到共享 utils）
// - 内嵌脚本内容：检测到 inline 脚本（node -e / python -c / sh -c 等）或本地脚本文件引用时，
//   将脚本正文附加进 state（脱敏后截断）——这类内容对风险判断至关重要，仅看命令行不可判
// - 安全策略结果（forceApproval / 死区不会到达这里）
// - agent 名称、最近用户消息摘要

// questions：
questions: {
  risk:      { type: "noul",   instructions: "该操作造成不可逆损害或越权访问的概率" },
  intent:    { type: "noul",   instructions: "参数与用户当前意图一致的概率" },
  verdict:   { type: "choice", options: ["approve", "deny", "escalate"],
               instructions: "综合裁决（须与 risk / intent 自洽）",
               criteria: {
                 approve:  "参数与用户意图吻合、可逆、无越权、无数据损毁风险的常规操作；",
                 deny:     "破坏性操作、数据丢失、权限提升（sudo / 系统目录）、对外暴露服务、删除不可恢复数据、越出工作区范围；",
                 escalate: "无法自信归类为安全或危险：模糊、信息不足、或信号相互矛盾。",
               } },
}
```

**state 摘要裁剪规范**（`jevQuestionnaire.ts` 内实现，独立可单测）：

- 整体序列化后总长上限 ≤ 1.5k 字符；单字段字符串超过 200 字符按**「保首尾、缩中间」**截断：保留前 100 + `…[截断 N 字符]…` + 后 50；
- base64 / data URL 自动识别，替换为 `[binary data: ~N bytes]`，不送入模型；
- 对象 / 数组递归深度上限 3 层，超出层以 `{…}` 占位；
- args 中的常见密钥字段名（`key` / `token` / `password` / `secret`）值脱敏为 `***`。

`evaluator.ts` 裁决规则（伪码，**矛盾即升级**）：

```text
若 choice 答案 confidence < confidenceThreshold        → escalate（deny 与 approve 均受此门槛保护）
若 verdict = "deny" 或 risk ≥ denyThreshold        → deny
若 verdict = "approve" 且 risk ≤ autoThreshold
   且 intent ≥ intentThreshold                     → approve
若 verdict 与 noul 分数矛盾（如 verdict=approve 但 risk ≥ denyThreshold，
   或 verdict=deny 但 risk/intent 均处于安全区）          → escalate（不信任自相矛盾的裁决）
其余（含模糊区间、答案类型校验失败）                 → escalate
```

所有阈值用户可配，默认取**保守值**（宁可多升级人工）。

### 2.6. 安全红线（硬约束）

1. **死区不可仲裁**：`block` 短路位于 executor 安全策略层，架构上先于审批入口，JEV 无权触碰；
2. **fail-closed**：渠道熔断 / 超时 / 响应解析失败 / 答案类型异常 → 一律 `escalate` 人工，**绝不自动放行**（与 pi 的 no-UI block、snow-cli 的 abort→reject 语义一致）；
3. **配置防篡改**：`decisionArbitration` 配置列入 `set_agent_field` 受保护路径，修改必须经受信任 UI 本地独立确认（KI-003 机制）；
4. **全量审计**：每次仲裁记录结构化日志（`createModuleLogger("decision-arbiter")`）：来源、toolId、model、answers、阈值、最终 action、耗时、是否放行；审批卡片上向用户展示「JEV 仲裁意见」（模型、概率、结论）；
5. **外部来源隔离**：`ArbitrationContext.source` 标记请求来源；VCP / 跨窗口来源默认**只允许 escalate/deny，不允许自动 approve**，放行需显式开启独立开关（需同步修改 VCP 两个调用点传参：`vcpConnectorStore.ts:578`、`vcpNodeProtocol.ts:313/620`）；
6. **强制审批独立开关（可配置模式）**：`forceApproval` 类操作是否允许 JEV 放行，与普通灰区分离配置，由 `DecisionArbitrationConfig.mode` 决定，默认 `gray-zone`（一律跳过仲裁、只走人工）。当前 `forceApproval` 全仓库仅两个来源：
   - **`aio-file-operator` 审批区规则**：黑名单模式下路径命中 `type: "approve"` 的 `blackListRules`（`src/tools/aio-file-operator/utils/security.ts:391`）；
   - **`llm-chat` 敏感字段保护（KI-003）**：`set_agent_field` 命中 `SECURITY_SENSITIVE_AGENT_PATHS`（`src/tools/agent-manager/services/agentManagementService.ts:107`）。

   两者均由工具 `checkSecurityPolicy` hook 返回 `{ status: "approve" }`，经 `executor.ts:174-175` 置位；`aggressive` 模式下必须满足更严的 `forceApprovalRiskThreshold`（默认 5%）才自动放行。此外，任何来源命中静态可识别的危险特征（权限提升关键词、递归删除、工作区外绝对路径、内嵌脚本中的危险调用等）时，即使 `shouldAutoApprove` 判为需审批，也**直接跳过仲裁转人工**，不消耗 JEV——语义与 mmcode「danger-marker 命令不送决策模型」一致；
7. **审计来源可区分（不破坏契约）**：放行来源（规则 / JEV / 人工）通过**旁路审计映射**记录（store 侧 `auditRecords: Map<requestId, AuditInfo>`，参照 mmcode 的 `autoApprovalInfo: { source }` 旁路对象做法），**禁止把 `ToolApprovalResult` 由 `"approved" | "rejected"` 对象化**——`executor.ts:269-270` 的 `approvalResult === "approved"` 是严格字面量比较，对象化后所有审批会被误判为 denied；executor 控制流零改动；
8. **防仲裁循环**：deny 后模型改参数重试会再次仲裁，arbiter 按 `toolId + args 摘要` 记录近期裁决，同一请求指纹短时间窗口内（默认 60s）重复 escalate 时跳过仲裁直接人工，防止 JEV 被反复消耗；
9. **仲裁调用重试与超时预算**：对 429 / 529 / 网络层错误做有限快速重试（默认最多 1 次，退避 250ms，参照 mmcode 的指数退避策略），单次请求超时与重试总时长共同计入 `timeoutMs`（默认 8s）；超预算即 escalate，绝不因重试拖长人工等待窗口。

### 2.7. 配置模型

```ts
// 全局（设置中心 → LLM 服务）：选择决策渠道。全局单例，不提供 Agent 级独立渠道（Q2）
interface DecisionChannelSettings {
  profileId: string | null;   // 需标记 capabilities.decision 的 profile
  model: string;              // 默认 jev-latest
  timeoutMs: number;          // 默认 8000（含重试总耗时）
  maxRetries: number;         // 默认 1，仅对 429/529/网络错误重试
}

// Agent 级（ToolCallConfig 扩展，agent-manager）
interface DecisionArbitrationConfig {
  enabled: boolean;                       // 默认 false
  mode: "gray-zone" | "aggressive";       // 默认 gray-zone（见下方说明）
  autoRiskThreshold: number;              // 默认 0.15
  denyRiskThreshold: number;              // 默认 0.75
  intentThreshold: number;                // 默认 0.6
  confidenceThreshold: number;            // 默认 0.7（参照 mmcode 实战默认 0.8，取略宽但保守的值）
  forceApprovalRiskThreshold: number;     // 默认 0.05，仅 aggressive 模式生效
  autoApproveExternalSources: boolean;    // 默认 false（VCP 等）
}
```

**强制审批处理策略（可配置）**：

- **`gray-zone`（默认，推荐）**：`forceApproval`（安全沙箱审批区、`set_agent_field` 敏感字段）请求**直接跳过仲裁**——JEV 只能返回 escalate/deny，送仲裁纯属浪费成本与延迟，一律人工弹窗；
- **`aggressive`**：`forceApproval` 请求也送入 JEV，但需满足 `risk ≤ forceApprovalRiskThreshold`（默认 5%）且通过其余阈值才自动放行；外部来源仍受红线 5 约束（默认不自动放行）。

---

## 3. UI/UX 详细设计规范 (UI Specification)

本功能在前端涉及 4 处关键交互界面与视觉表达，严格遵循项目规范：
- 遵从 [`theme-appearance.md`](../../.kilocode/rules/theme-appearance.md)：使用 `var(--card-bg)`、`backdrop-filter`，禁止硬编码实色与直接使用 Element Plus `light` 实色；
- 遵从 [`semantic-decoration.md`](../../.kilocode/rules/semantic-decoration.md)：禁止在审批卡片整高使用 3px~4px 彩色粗边线，统一使用 **6px 状态点 + 小型 Badge + 1px 中性边框** 表达严重度与状态。

### 3.1. 审批输入悬浮条 (`ToolCallingApprovalBar.vue`)

浮动在对话输入框上方，**仅在 JEV 判定为 `escalate`（需人工裁决）或渠道降级时才出现**——仲裁等待期卡片处于 `arbitrating` 态（§2.4），浮窗不展示。

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 工具调用申请   [ 1 个待处理 ]                   [ 全部允许 ] [ 全部拒绝 ] [ 常规循环 ] │
├─────────────────────────────────────────────────────────────────────────────────┤
│ ┌─ 单项卡片 ──────────────────────────────────────────────────────────────────┐ │
│ │ >_ fs.read_file      Jev 建议: 需人工确认 · 风险 42% · 意图 88%       [允许] [拒绝] │ │
│ │    path: "E:/project/secret.key"                                              │ │
│ │    ▾ 展开 Jev 仲裁详情 (jev-1.13.0 · 165ms · System One)                       │ │
│ │      ├─ 风险评估 [██████░░░░] 42% (超出自批准上限 15%)                           │ │
│ │      ├─ 意图置信 [████████░░] 88% (吻合用户最近请求)                             │ │
│ │      └─ 裁决原因: 访问涉及敏感后缀文件，建议由用户复核权限。                       │ │
│ └─────────────────────────────────────────────────────────────────────────────┘ │
│ ⚠️ 这些工具将以你的身份在本地执行，请确认安全后再允许。                               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 视觉与交互规范：
1. **JEV 仲裁结果微标签 (Badge)**：
   - 放置在工具名称右侧，尺寸 `small`，圆角 `4px`；
   - 颜色与质感：
     - **升级人工 (Escalate)**：背景使用 `rgba(var(--el-color-warning-rgb), calc(var(--card-opacity) * 0.15))`，文字为 `var(--el-color-warning)`，左侧搭配 6px 橙色状态指示点；
     - **渠道降级 (Fail-closed)**：背景使用 `rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.15))`，标注 `Jev 离线 · 安全兜底`；
2. **可折叠仲裁证据面板 (Detail Accordion)**：
   - 默认折叠，不增加高密度审批列表的视觉噪音；
   - 展开后展示微型双进度条（风险度、意图置信度），使用 CSS 自定义属性配合 `color-mix` 渲染渐变槽，高度固定 `4px`，避免跳动；
   - 模型名、延迟与单次 Token 预估以 `var(--text-color-secondary)` 等宽字体呈现；
3. **人工审批超时**：从浮窗出现（escalate）时刻起算，不包含仲裁耗时（§2.4 实现要点 1）。

---

### 3.2. 聊天消息流工具卡片 (`ToolCallMessage.vue`)

历史与当前消息流中，工具卡片需清晰回溯该操作的放行凭证与审计标记：

1. **状态栏凭证 Badge**：
   - 当调用完成或执行中时，头部右侧除原有的耗时与状态外，新增 **放行源徽标 (Audit Origin)**：
     - `规则自动放行`（静态白名单）；
     - `Jev 自动放行 (风险 4%)`（浅翠绿微透明背景）；
     - `人工确认放行`（常规主色微透明背景）；
     - `Jev 风险拦截 (风险 91%)`（浅赤红微透明背景）；
   - 放行源徽标依赖 §2.6 红线 7 的旁路审计映射（`auditRecords`）；「规则放行」不经过 store，需由 executor 以旁路信息（不改 `ToolApprovalResult` 契约与控制流）带出最小来源标记；
2. **`arbitrating` 等待态**（§2.4）：
   - 状态取自 store 的 `arbitrationStates` map；
   - 展示「等待 AI 审核」文字 + 微型环形加载指示，替代原 `awaiting_approval` 图标位；
   - 卡片不展示审批按钮（浮窗此时尚未出现）；
3. **工具卡片详情抽屉/折叠区**：
   - 工具参数面板底部增加「安全与仲裁」信息条；
   - 记录快照：包含 JEV 提问的问题、给出的 `noul` 分数、模型版本及决策耗时。
---

### 3.3. 智能体编辑面板 (`ToolCallingSection.vue`)

在智能体配置的「工具调用设置 (Tool Calling)」抽屉中新增专属配置卡片（Q1 已裁决为可配置模式，保留「保守灰区 / 激进模式」两档）：

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ AI 决策自动审批 (Jev / System One)                              [ 开关: 已开启 ] │
│ 借助超轻量决策模型分析工具参数与意图，对低风险灰区操作自动放行，减少弹窗打扰。          │
├─────────────────────────────────────────────────────────────────────────────────┤
│ 仲裁策略模式:                                                                    │
│  (•) 保守灰区 (推荐)      - 强制审批区(安全沙箱等)始终弹窗，仅仲裁常规未白名单工具    │
│  ( ) 激进模式 (极客模式)  - 允许 Jev 在极低风险(<5%)下放行部分审批区操作，具有一定风险 │
│                                                                                 │
│ 自动化阈值调节:                                                                  │
│  自动放行风险上限: [────●────────────] 15%   (低于此风险且意图吻合方可自动放行)          │
│  高危直接拒绝下限: [──────────────●──] 75%   (高于此风险直接阻断，不打扰用户)            │
│  意图一致性最低要求: [────────●───────] 60%   (低于此一致性强制转人工审核)              │
│  裁决置信度最低要求: [──────────●─────] 70%   (低于此置信度不采纳裁决，approve/deny 均转人工) │
│                                                                                 │
│ 外部来源安全防线:                                                                │
│  [ 开关: 关 ] 允许 VCP / 外部协同工具调用自动放行                                  │
│  (关闭时，所有通过 VCP 远程发起的工具请求必须由人工确认，Jev 仅提供建议不自动放行)      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 视觉与交互规范：
1. **模式卡片单选组 (Segmented Radio)**：
   - 使用卡片化 Radio 替换普通单选框，直观呈现「保守」与「激进」的安全边界对比；
   - 选择激进模式时，弹出内联黄色警示提示（`ElAlert`，`type="warning"`）；
2. **滑块与数值联动 (Dual-control Slider)**：
   - `el-slider` 配套 `format-tooltip`，端点增加安全区间色带指示；
   - 自动放行风险上限最高锁定在 `30%`，超出需弹出二次确认框，防止误配置导致全自动放行；
3. **受保护字段防篡改 (KI-003 对齐)**：
   - 本区域的所有表单变更均标记为敏感字段，Agent 无法通过工具调用静默下调阈值。

---

### 3.4. 全局设置中心 (`Settings/llm-service/`)

全局设置用于指定默认 System One 仲裁服务端点与渠道绑定：

1. **服务提供者选择器**：
   - 复用 [`LlmModelSelector`](../../src/components/common/LlmModelSelector.vue)，需**新增** `filter-capability` 属性（当前组件无此能力，`ModelSelectDialog.vue` 有 capability 展示逻辑可参考）；
   - 自动筛选出打上 `capabilities.decision: true` 标记的模型（如 `jev-latest`, `jev-1.13.0`, `openjev-mini`）；
2. **连通性与决策探测器 (Ping & Decision Test)**：
   - 选项旁提供「⚡ 测试仲裁连通性」轻量按钮；
   - 点击后在 1 秒内向 System One 发送预设 mock 决策请求（`test-decision`），在按钮下方通过 `Tag` 动态呈现：
     - 成功：`✅ 延迟 124ms · 计费: $0.000002 · 决策状态正常`；
     - 失败：`❌ 渠道无响应 / 401 密钥失效`，附带排查引导。

---

## 4. 实施拆解

### P1 — 决策仲裁服务（纯逻辑层）
- [ ] 新建 `src/services/decision-arbiter/`：types / evaluator / jevQuestionnaire / index
- [ ] `callTypeSafeSystemOneApi` 接入：profile 解析、超时、AbortSignal 透传、有限重试（红线 9，429/529/网络错误，默认 1 次 + 250ms 退避，计入 timeoutMs）；并发上限（默认 3）与请求指纹缓存（红线 8）
- [ ] `jevQuestionnaire.ts`：verdict question 带 **per-option criteria**（§2.5）；state 摘要实现「保首尾缩中间」裁剪 + base64/密钥脱敏 + **inline 脚本内容检测**（node -e / python -c / sh -c 等）
- [ ] `evaluator.ts`：阈值裁决 + **矛盾即升级**规则（verdict 与 noul 分数相悖 → escalate）
- [ ] 单测：evaluator 阈值边界（含 confidence 双向门槛）、矛盾裁决、fail-closed 路径、重试退避、答案类型校验失败、state 摘要截断/脱敏/脚本检测

### P2 — 审批链路接入
- [ ] `toolCallingStore`：`setApprovalArbiter` 注入口 + `requestApproval` 仲裁前置（escalate 才入列，浮窗后置出现）+ `skipArbitration` 选项
- [ ] `arbitrationStates` 响应式 map（`arbitrating` / `escalated` / `auto-approved` / `auto-denied`）**以 `request.requestId` 为 key**（红线 7 契约），并在 `cancelBySession`/窗口关闭时联动清理（LRU 上限 100）
- [ ] 放行来源（规则 / JEV / 人工）走**旁路审计映射** `auditRecords: Map<requestId, AuditInfo>`，**不改 `ToolApprovalResult` 字符串契约**（红线 7）
- [ ] llm-chat 初始化时按全局 + Agent 配置装配 arbiter
- [ ] `ArbitrationContext.source` 来源标记：编排器 / vcp-log / vcp-node / sync（需改 `vcpConnectorStore.ts:578`、`vcpNodeProtocol.ts:313/620` 调用点传参）
- [ ] 集成测试：mock arbiter 的 approve / deny / escalate / 渠道异常 / 超时路径；确认 preview hook 与 approvalCache 时序不受影响；deny-重试防循环生效

### P3 — 安全加固与 UI
- [ ] `set_agent_field` 受保护路径验证：`decisionArbitration` 若置于 `toolCallConfig` 下则已被 `SECURITY_SENSITIVE_AGENT_PATHS` 前缀覆盖（agentManagementService.ts:94），仅需补专项测试；若置于 Agent 顶层则需扩展保护列表
- [ ] 危险特征跳过仲裁判定：任一来源命中静态危险特征（权限提升 / 递归删除 / 工作区外绝对路径 / 危险内嵌脚本）→ 直接转人工，不调 arbiter（红线 6）
- [ ] `ToolCallMessage.vue`：新增 `arbitrating` 等待态（「等待 AI 审核」+ 环形加载）+ 放行源徽标（规则放行 / Jev 放行 / 人工放行 / Jev 阻断）与审计详情（SVG 图标为主，避免 emoji）
- [ ] `ToolCallingApprovalBar.vue`：单项卡片增加 JEV 仲裁徽标、风险/意图微型进度条与折叠面板（仅 escalate 后出现）
- [ ] `ToolCallingSection.vue`：新增「AI 决策自动审批」配置卡片（模式选择、阈值滑块含 confidence 与 forceApproval、VCP 外部来源开关）
- [ ] 设置中心：决策渠道选择（按 `capabilities.decision` 过滤）+ 快速连通性测试按钮

### P4 — 后台任务与 sub-agent 接入
- [ ] 先调查后台任务 `awaiting_approval` 实际审批路径是否经过 `requestApproval` 收口（当前 grep 仅编排器与 VCP 三处调用；参考 snow-cli `subAgentToolApproval.ts` 的 sub-agent 逐项确认 + reject 即停模式）
- [ ] 后台任务接入仲裁，减少长效任务的人工等待中断；跨窗口来源遵循红线 5（默认不自动放行）
- [ ] 任务中心卡片展示仲裁记录

### P5 — 验证收口
- [ ] 真实 `jev-latest` 渠道冒烟（含网络失败降级）
- [ ] 死区绕过尝试、配置篡改链路回归
- [ ] `bun run check` 全绿 + 相关测试

---

## 5. 测试要点

| 类别             | 用例                                                                                                                                   |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| evaluator 纯函数 | 阈值边界值、choice/score 组合、confidence 门槛（approve 与 deny 双向）、**verdict 与 noul 矛盾 → escalate**、类型不匹配 → escalate     |
| fail-closed      | 渠道超时 / 熔断 / JSON 解析失败 / noul 越界 → escalate                                                                                 |
| 重试预算         | 429/网络错误有限重试成功；重试总耗时超 timeoutMs → escalate                                                                            |
| state 摘要       | 「保首尾缩中间」截断、base64 与密钥字段脱敏、inline 脚本内容被附加进 state                                                             |
| 收口点           | approve 短路返回、deny 短路返回、escalate 才入列 pendingRequests、skipArbitration 生效                                                 |
| 等待态           | arbitrating 状态渲染、escalate 后浮窗出现、人工超时不包含仲裁耗时                                                                      |
| 状态契约         | `arbitrationStates` 以 `request.requestId` 为 key 命中消息卡片；会话清理后未决项被删除                                                 |
| 时序兼容         | preview hook 仍先于审批分发一次；批量审批 approvalCache 不重复仲裁                                                                     |
| 强制审批         | gray-zone 下两个来源跳过仲裁；aggressive 下超过 forceApprovalRiskThreshold 仍不放行                                                    |
| 危险特征         | 静态危险特征（权限提升 / 递归删除 / 工作区外路径）跳过仲裁直接人工                                                                     |
| 安全             | 死区永不触达仲裁；VCP 来源默认不放行；`set_agent_field` 篡改被拦截                                                                     |
| 防循环           | 同一请求指纹 60s 内重复 escalate → 跳过仲裁直接人工                                                                                    |
| 审计契约         | 每次仲裁产出结构化日志字段完整；origin 走旁路审计映射，`ToolApprovalResult` 保持字符串字面量（回归：executor `=== "approved"` 仍成立） |

---

## 6. 对 RC 清单的影响

- 本功能若纳入 0.7.0-rc.1，需在审计文档 §2.2 增加「JEV 决策仲裁」条目，并在 §4 阶段一补充 `bun test src/services/decision-arbiter/`；
- 若按独立小版本（0.7.0-rc.2 或 feat 分支）交付，RC 清单不变。

---

## 7. 备选方案记录（为什么不选）

| 方案                        | 说明                                                              | 落选理由                                                                             |
| --------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| A. executor.ts 内嵌仲裁     | 在 `needsApproval` 判定后直接调 JEV                               | executor 引入渠道 IO 依赖，破坏纯执行层；VCP 等外部入口被动启用，风险面不可控        |
| B. 编排器层装配             | 在 `useToolCallOrchestrator` 各调用点包装                         | 需逐个改造所有审批来源，遗漏即失效；VCP / 跨窗口路径分散                             |
| **C. 审批入口注入（选定）** | `toolCallingStore.requestApproval` 入口统一仲裁，arbiter 依赖注入 | 单一收口覆盖全部来源；store 只依赖 `ApprovalArbiter` 接口，保持分层；executor 零改动 |

---

## 8. 开放问题裁决记录

- **Q1（已裁决：采用可配置模式）**：保留 `gray-zone`（默认，强制审批项不送仲裁）与 `aggressive`（允许 JEV 在 `forceApprovalRiskThreshold` 默认 5% 内放行强制审批项）两档，由用户配置；对应 §2.6 红线 6、§2.7、§3.3；
- **Q2（已裁决：暂不做独立渠道配置）**：保持全局单渠道（`DecisionChannelSettings`）+ Agent 级 `enabled` 开关；不做 Agent 级独立选渠道/模型，后续确有需要再评估；
- **Q3（已裁决：尽量减少手工）**：既然引入 AI 审批就是为了减少手工，低风险命中的请求**直接自动放行**，不增加「每次询问」轻提示档；仅保留审计日志与工具卡片状态回溯。

---

## 9. 参照实现记录（mmcode JEV 实战）

本计划 v5 吸收了 mmcode（kilocode 分支）已落地的 JEV 决策模型经验，对照提交链：

- `f4d9546e3e` 初版：TypeSafe Jev 提供商 + AI 审批开关 + 置信度阈值（对应本计划 P1/P2）；
- `0f03d697eb` 上下文增强：对话上下文注入 + inline 脚本检测 + 「保首尾缩中间」截断（对应 §2.5）；
- `cf12a263b4` 状态流转：`evaluating → approved / ask_user / denied` 状态机 + UI 反馈（对应 §2.4）。

**采纳项**：

1. `jev.ts` 的 per-option criteria 设计——choice 问题为每个选项写可执行判定准则（§2.5）；
2. 有限重试 + 指数退避（429/529/网络错误），并纳入超时预算（红线 9）；
3. 「保首尾缩中间」截断与 base64/密钥脱敏（§2.5 state 裁剪规范）；
4. inline 脚本内容检测（node -e / python -c / sh -c）（§2.5）；
5. 危险特征命令不送决策模型、直接转人工（红线 6）；
6. 放行来源通过旁路对象记录，不改基础裁决类型（红线 7）。

**未采纳 / 差异项**：

- mmcode 全局单开关 + 仅在 Task/命令审批单点接入；本计划采用「Agent 级 `enabled` + 全局渠道」分层，并在 `requestApproval` 单一收口覆盖本地 / VCP / 跨窗口 / sub-agent 全部来源；
- mmcode 无并发上限、请求指纹防循环与外部来源隔离；本计划补齐（红线 5/8）。


## 10.施工提示

1. **类型扩展同步**：
   在实现 `setApprovalArbiter` 注入时，建议在 `toolCallingStore` 中定义清晰的 `ApprovalArbiter` 接口，并确保 TypeScript 类型能够无缝对接未来编写的 `src/services/decision-arbiter/` 产物。
2. **UI 动效与防抖**：
   在 [`ToolCallMessage.vue`](src/tools/llm-chat/components/ToolCallMessage.vue) 中渲染 `arbitrating` 等待态时，应注意与现有的骨架光晕或加载动画样式保持一致（复用项目现有的 UI token 和变量，严禁出现硬编码颜色）。
3. **测试覆盖重点**：
   务必对 `evaluator.ts` 中的**“矛盾即升级”**（如 verdict=approve 但 risk 高于 denyThreshold）编写详尽的单元测试，这是保证系统在面对 AI 逻辑自相矛盾时能够“宁错杀不放过（fail-closed/escalate）”的关键安全防线。
