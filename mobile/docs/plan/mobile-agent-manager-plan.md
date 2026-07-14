# 移动端 Agent 独立化管理器 — 规划方案

> **文档状态**: 实施中（阶段 1、2 已完成，阶段 3 主链路已接通）
> **创建日期**: 2025-06-23  
> **最近核对**: 2026-07-14
> **关联模块**: `mobile/src/tools/agent-manager/`
> **前置依赖**: `mobile/src/tools/llm-api/`, `mobile/src/tools/llm-chat/`

## 1. 背景与动机

### 1.1. 桌面端演进情况

本计划创建时，桌面端 Agent（智能体）代码主要位于 `src/tools/llm-chat/` 内部。当前桌面端已经将核心类型、管理 UI 和存储能力迁移到 `src/tools/agent-manager/`，因此本节原有的“物理寄生于 llm-chat”描述只代表历史背景，不再代表仓库现状。

- `src/tools/agent-manager/types/agent.ts` — 桌面端当前 Agent 类型基线
- `src/tools/agent-manager/components/` — Agent 管理与编辑 UI
- `src/tools/agent-manager/composables/storage/` — 分离式存储实现
- `src/tools/agent-manager/agent-manager.registry.ts` — 工具注册入口

桌面端仍与聊天运行时存在业务协作，但物理模块已经分离。移动端实现继续保持 `agent-manager` 不依赖 `llm-chat` Store、聊天侧单向消费 Agent 配置的原则。

### 1.2. 移动端现状

移动端已经从最初的预留状态推进到可用主链路：

- `agent-manager` 已具备独立存储、CRUD、角色大厅、详情编辑、导入和预设消息编辑能力。
- `ChatHome.vue` 的“角色大厅”入口已启用；“用户档案”仍处于待实现状态。
- `PipelineContext.agentConfig` 已改为 `ChatAgent | null`。
- 会话通过 `displayAgentId` 绑定 Agent，执行器会读取 Agent 的模型、基础参数与预设消息。
- 聊天顶部已展示当前 Agent；聊天内切换 Agent 尚未实现。

### 1.3. 为何选择在移动端试水分离

1. **干净的起点**：本计划启动时，移动端尚未引入 Agent 实现，没有历史包袱。
2. **验证解耦可行性**：移动端的分离实践已经验证 Chat 与 Agent 可以通过单向依赖协作，并可继续为桌面端演进提供参考。
3. **跨工具复用**：独立的 Agent 管理器可以被未来的其他工具（OCR 预设、工作流节点等）直接调用，而不必依赖 `llm-chat`。
4. **职责清晰**：`llm-chat` 只关注"对话"，`agent-manager` 只关注"角色配置与管理"。

---

## 2. 架构设计

### 2.1. 模块边界

```mermaid
graph LR
    subgraph "agent-manager (独立模块)"
        AS[agentStore]
        AStorage[useAgentStorage]
        AImport[useAgentImporter]
        AUI[AgentList / AgentDetail]
    end

    subgraph "llm-chat (现有模块)"
        CS[llmChatStore]
        CE[useChatExecutor]
        Pipeline[contextPipelineStore]
        APL[agent-preset-loader 处理器]
    end

    subgraph "llm-api (现有模块)"
        PS[llmProfilesStore]
    end

    AS -->|提供 Agent 配置| CE
    AS -->|提供 Agent 配置| APL
    CE -->|构建 PipelineContext| Pipeline
    Pipeline -->|执行| APL
    AUI -->|"发起对话" 触发| CS
    AS -->|读取模型列表| PS
    AStorage -->|持久化| AS
```

### 2.2. 依赖方向（单向依赖）

| 模块            | 可以依赖                                      | 不可以依赖             |
| --------------- | --------------------------------------------- | ---------------------- |
| `agent-manager` | `llm-api`（模型元数据）                       | `llm-chat`（避免循环） |
| `llm-chat`      | `agent-manager`（获取 Agent 配置）, `llm-api` | —                      |

**特别说明**：`agent-manager` 提供"发起对话"的交互时，通过**路由跳转 + query 参数**传递 `agentId`，而非直接 import `llmChatStore`。这保持了依赖方向的纯净性。

### 2.3. 物理目录结构

```
mobile/src/tools/agent-manager/
├── agent-manager.registry.ts     # 工具注册入口
├── ARCHITECTURE.md               # 本模块架构文档
├── components/
│   ├── PresetMessageEditor.vue   # 预设消息编辑器（主容器，适配移动端折叠与手势）
│   ├── PresetMessageCard.vue     # 单条预设消息卡片（支持角色标识、启用开关、快捷操作）
│   ├── SinglePresetMessageEditor.vue # 单条消息属性编辑器（弹窗，支持角色/组/注入策略/模型匹配）
│   ├── PresetGroupEditDialog.vue # 预设消息组编辑器（弹窗，支持新建/编辑消息组）
│   └── AgentPresetBatchDialog.vue # 预设消息批量管理器（弹窗，支持批量删除/启用/移动组）
├── composables/
│   ├── useAgentStorage.ts        # 本地文件存储（index + 独立 JSON）
│   ├── useAgentImporter.ts       # 角色卡导入（支持 AIO JSON & SillyTavern PNG/JSON）
│   ├── usePresetTokenCalculator.ts # Rust o200k Token 估算消费层
│   └── __tests__/                  # Token 估算器测试
├── locales/
│   ├── zh-CN.json
│   └── en-US.json
├── stores/
│   └── agentStore.ts             # 核心 Pinia Store
├── types/
│   └── agent.ts                  # ChatAgent 与导入所需类型定义
└── views/
    ├── AgentList.vue             # 角色大厅 / 列表页
    └── AgentDetail.vue           # 智能体详情 / 编辑页（集成基础属性与预设消息编辑器）
```

---

## 3. 核心类型定义与数据结构对齐

为了确保移动端与桌面端之间的无损导入导出以及未来的双端数据同步，移动端读写时必须保留未被移动端 UI 编辑的高级字段。当前实现通过完整对象克隆、对象展开和索引签名保留未知字段，运行时具备无损保留基础；但移动端显式 TypeScript 类型尚未与桌面端最新定义 100% 同步。

截至 2026-07-14 的已知类型差异：

- 移动端尚未显式声明桌面端已有的 `defaultGreetingId`。
- 移动端 `AgentCategory` 仍为 `assistant | character | expert | custom`；桌面端当前为 `assistant | character | expert | creative | workflow | other`。
- 多个桌面端高级字段在移动端使用 `unknown` 表达，以保留数据但不提供完整的编译期结构约束。

后续同步类型时不得破坏现有未知字段保留能力，也不得在移动端保存时裁剪暂不支持的桌面端字段。

### 3.1. 核心类型设计快照

下列代码块保留创建计划时的目标结构，用于说明需要无损保存的字段范围，不再作为当前类型基线。当前实现以 `mobile/src/tools/agent-manager/types/agent.ts` 为准，桌面端基线以 `src/tools/agent-manager/types/agent.ts` 为准；两者的已知差异见上文。

```typescript
// mobile/src/tools/agent-manager/types/agent.ts
import type { ChatMessageNode } from "../../llm-chat/types/message";
import type { LlmParameters } from "../../llm-chat/types/llm";
import type { AgentCategory } from "../../llm-chat/types/agent";

/**
 * 智能体共有配置基础接口（完全对齐桌面端 AgentBaseConfig）
 */
export interface AgentBaseConfig {
  /** 预设配置的版本号（格式版本），默认为 2 */
  version?: number;
  /** 智能体自身的版本号（用于升级对比） */
  agentVersion?: string;
  /** 智能体名称（用作唯一标识符的一部分，也是宏替换的 ID） */
  name: string;
  /** 显示名称（UI 显示优先使用） */
  displayName?: string;
  /** 智能体描述 */
  description?: string;
  /** 智能体图标/头像（emoji、图标路径或相对文件名，如 avatar-xxx.png） */
  icon?: string;
  /** 预设消息序列（支持完整的树形结构、注入策略、模型匹配等） */
  presetMessages?: ChatMessageNode[];
  /** 开局消息列表 */
  greetings?: any[]; // 对应 GreetingMessage[]
  /** 在聊天界面显示的预设消息数量 */
  displayPresetCount?: number;
  /** 参数配置 */
  parameters?: LlmParameters;
  /** LLM 思考块规则配置 */
  llmThinkRules?: any[];
  /** 富文本渲染器样式配置 */
  richTextStyleOptions?: any;
  /** 工具调用默认折叠 */
  defaultToolCallCollapsed?: boolean;
  /** 虚拟时间配置 */
  virtualTimeConfig?: {
    virtualBaseTime: string;
    realBaseTime: string;
    timeScale?: number;
  };
  /** 筛选标签 */
  tags?: string[];
  /** 智能体分类 */
  category?: AgentCategory;
  /** 正则管道配置 */
  regexConfig?: any;
  /** 交互行为配置 */
  interactionConfig?: {
    sendButtonCreateBranch?: boolean;
    defaultMediaVolume?: number;
  };
  /** 智能体资产分组定义 */
  assetGroups?: any[];
  /** 智能体专属资产 */
  assets?: any[];
  /** 关联的世界书 ID 列表 */
  worldbookIds?: string[];
  /** 关联的快捷操作组 ID 列表 */
  quickActionSetIds?: string[];
  /** 世界书覆盖设置 */
  worldbookSettings?: any;
  /** 知识库关联配置 */
  knowledgeBaseConfig?: any;
  /** 知识库全局设置 (检索参数) */
  knowledgeSettings?: any;
  /** 工具调用配置 */
  toolCallConfig?: any;
  /** 环境增强配置 */
  extensionConfig?: any;
  /** 视觉化输出指南 */
  visualGuideline?: string;
  /** 会话变量配置 */
  variableConfig?: any;
  /** 预设消息组定义 */
  presetGroups?: any[];
}

/**
 * 智能体（Agent）完整定义（完全对齐桌面端 ChatAgent）
 */
export interface ChatAgent extends AgentBaseConfig {
  /** 智能体的唯一标识符 (运行时生成的 UUID) */
  id: string;
  /** 历史头像列表（相对文件名），用于在头像选择器中快速显示 */
  avatarHistory?: string[];
  /** 使用的 Profile ID */
  profileId: string;
  /** 使用的模型 ID */
  modelId: string;
  /** 绑定的用户档案 ID（可选） */
  userProfileId?: string | null;
  /** 创建时间 (ISO 8601 格式) */
  createdAt: string;
  /** 最后使用时间 (ISO 8601 格式) */
  lastUsedAt?: string;
}
```

### 3.2. 存储结构对齐

为了支持智能体专属资产（如自定义头像、背景图等）的物理隔离与无损迁移，移动端必须完全对齐桌面端的**“一智能体一目录”**分离式存储结构。

```
{appConfigDir}/agent-manager/
├── agents-index.json          # 索引文件（轻量级，用于快速列表渲染）
└── agents/
    ├── {agentId1}/
    │   ├── agent.json         # 智能体完整数据（ChatAgent 格式）
    │   └── avatar-xxx.png     # 智能体专属头像（icon 字段保存为相对路径 "avatar-xxx.png"）
    └── {agentId2}/
        └── agent.json
```

**索引文件格式（完全对齐桌面端 AgentIndexItem）**：

```typescript
interface AgentIndexItem {
  id: string;
  name: string;
  displayName?: string;
  agentVersion?: string;
  description?: string;
  icon?: string; // 头像/图标
  profileId: string;
  modelId: string;
  lastUsedAt?: string;
  createdAt: string;
  category?: AgentCategory;
  tags?: string[];
}

interface AgentsIndex {
  version: string; // "1.1.0"
  agents: AgentIndexItem[]; // 智能体元数据列表（用于排序和快速显示）
}
```

> **存储设计优势**：
>
> 1. **轻量化加载**：列表页仅加载 `agents-index.json`，避免一次性读取数十个完整智能体 JSON 导致的 I/O 瓶颈。
> 2. **资产自治**：智能体专属头像与配置文件存放在同一目录下，删除智能体时可一并清理，且打包导出时极易归档。
> 3. **无损兼容**：存储路径使用独立的 `agent-manager/`，物理上与 Chat 的会话数据完全隔离，但目录层级和文件格式与桌面端 `llm-chat/agents/` 完美一致。

---

## 4. 双模块协作机制

### 4.1. 场景一：从角色大厅发起新对话

```mermaid
sequenceDiagram
    participant User
    participant AgentList as AgentList.vue
    participant Router as Vue Router
    participant ChatStore as llmChatStore
    participant ChatView as LlmChatView.vue

    User->>AgentList: 点击 Agent 卡片的"发起对话"
    AgentList->>Router: router.push('/tools/llm-chat/chat/new?agentId=xxx')
    Router->>ChatView: 路由匹配，挂载组件
    ChatView->>ChatStore: createSession({ agentId })
    ChatStore-->>ChatView: 返回 sessionId，session.displayAgentId = agentId
    ChatView->>ChatView: 开始对话
```

### 4.2. 场景二：对话执行时注入 Agent 上下文

```mermaid
sequenceDiagram
    participant CE as useChatExecutor
    participant AS as agentStore (agent-manager)
    participant Pipeline as contextPipelineStore
    participant APL as agent-preset-loader

    CE->>AS: getAgentById(session.displayAgentId)
    AS-->>CE: 返回 ChatAgent 完整配置
    CE->>Pipeline: executePipeline(context)
    Note over CE: context.agentConfig = agent
    Pipeline->>APL: process(context)
    APL->>APL: 过滤禁用消息与禁用消息组
    APL->>APL: 注入 presetMessages → messages 头部
    APL-->>Pipeline: 返回增强后的 messages[]
```

当前处理器只实现基础前置注入，尚未执行 `injectionStrategy` 与 `modelMatch`。这两项属于阶段 3 增强工作。

### 4.3. 场景三：在聊天界面切换 Agent（待实现）

在聊天界面顶部，提供一个轻量级的 Agent 选择器（下拉或弹窗），用户切换后：

1. 更新 `session.displayAgentId`。
2. 后续消息使用新 Agent 的配置发送。
3. 历史消息不受影响（每条助手消息的 metadata 中快照了当时的 agentId）。

---

## 5. 实施计划

### 当前进度（2026-07-14）

- [x] 阶段 1：独立目录存储、CRUD Store、工具注册与默认智能体；未知字段可无损保留。
- [x] 阶段 2：完整预设消息编辑器体系的移植与移动端适配（多轮消息、消息组、触摸排序、批量管理、导入导出与高级字段编辑）。
- [x] 阶段 3 主链路：角色大厅入口、会话绑定、模型与基础参数绑定、基础预设管道注入、聊天栏智能体标识。
- [ ] 阶段 3 增强：执行 `injectionStrategy`、执行 `modelMatch`、聊天内切换 Agent、开局消息实例化。
- [x] 后续增强（已提前完成）：AIO Agent JSON、SillyTavern JSON/PNG 导入和预设 JSON 导入导出。
- [ ] 后续增强（未完成）：头像与二进制资产管理、完整参数编辑、用户档案。
- [ ] 兼容性收尾：将移动端显式类型和分类筛选项同步到桌面端最新定义。

实现偏差：移动端当前全量加载智能体详情，以降低首版状态复杂度；列表使用页面内紧凑行而非独立 `AgentCard`。存储格式仍保持 `agent-manager/agents/{id}/agent.json` 与轻量索引分离，后续可在数据规模需要时切换为按需加载，不影响磁盘格式。索引不保存 `currentAgentId`，Agent 选择状态以聊天会话的 `displayAgentId` 为准。

阶段 2 实现说明：Rust 后端已经接入单一 `o200k_base` 词表，前端通过 `mobile/src/utils/tokenCounting.ts` 批量调用 `count_tokens_batch`，编辑器以 500ms 防抖更新启用消息的 Token 估算，并排除禁用消息和禁用消息组。IPC 失败时回退为字符估算。AIO Agent JSON 与 SillyTavern JSON/PNG 角色数据已支持导入，头像和随包二进制资产仍归入后续“头像与资产管理”阶段。详见 [`mobile-token-counting-plan.md`](./mobile-token-counting-plan.md)。

阶段 3 实现说明：当前管道处理器会注入已启用且所属组未禁用的预设消息，并将 Agent 的模型和常用生成参数传给请求层；但所有预设消息目前统一前置，尚未执行编辑器中保存的注入策略和模型匹配规则。聊天页当前仅展示 Agent 标识，尚未提供切换入口。

验证记录（2026-07-14）：`bun run build`、`bun run test:run`、`bun run check:backend` 和 `cargo test --manifest-path src-tauri/Cargo.toml` 均通过。现有自动化测试主要覆盖 Token 计数，Agent 存储、导入、会话绑定和预设管道仍缺少专项测试。

### 阶段 1：基础设施搭建（地基）

| 任务                | 产出文件                         | 说明                                                               |
| ------------------- | -------------------------------- | ------------------------------------------------------------------ |
| 定义 ChatAgent 类型 | `types/agent.ts`                 | 核心字段已覆盖，未知高级字段可保留；显式类型仍需跟进桌面端最新定义 |
| 实现本地存储        | `composables/useAgentStorage.ts` | 已实现一智能体一目录、索引同步、损坏索引恢复；头像迁移尚未实现     |
| 实现核心 Store      | `stores/agentStore.ts`           | 已实现 CRUD、列表管理和全量详情加载；按需加载尚未启用              |
| 工具注册            | `agent-manager.registry.ts`      | 路由、语言包、图标（使用 `markRaw` 包裹）                          |
| 创建默认 Agent      | Store 初始化逻辑                 | 首次初始化且存在可用模型时创建一个“默认助手”                       |

### 阶段 2：完整预设消息编辑器体系的移植与移动端适配（骨架与核心）

为了彻底告别“平庸化”的单条系统提示词编辑，移动端必须完整移植桌面端的**多轮预设消息与消息组管理体系**。由于移动端屏幕狭窄且交互以手势为主，我们需要对编辑器进行深度的移动端适配设计。

#### 2.1. 移动端预设消息编辑器设计规范（严格遵循《移动端设计语言与 Varlet 降级决议》）

为了彻底告别“平庸化”的单条系统提示词编辑，移动端必须完整移植桌面端的**多轮预设消息与消息组管理体系**。同时，根据移动端设计语言决议，**严禁使用 Varlet 的结构性容器（如 `var-card`、`var-popup`、`var-collapse` 等）来搭建编辑器骨架**，必须采用自研 Vue 组件与项目 CSS token 主导设计，Varlet 仅在叶子节点（如按钮、输入框、开关）作为原子件使用。

1. **手势与排序**：
   - 移动端不适合复杂的鼠标拖拽。我们将采用 **“拖拽手柄（Touch Drag） + 快捷上移/下移按钮”** 双轨制。
   - 在每条消息卡片右侧提供拖拽手柄，同时在“更多操作”菜单中提供“上移”和“下移”按钮，确保在小屏幕上也能精准调整顺序。

2. **自研消息卡片（PresetMessageCard）**：
   - **拒绝使用 `var-card`**。卡片采用纯 Vue + CSS 编写，背景色使用 `--card-bg`，边框使用 `var(--border-width) solid var(--border-color)`，圆角使用 `var(--app-radius-md)`，完美适配 AIO Hub 的主题外观系统。
   - **折叠与展开（Accordion 模式）**：默认情况下，卡片仅展示角色标签、消息名称和内容的首行缩略。点击卡片可展开查看完整内容，或点击“编辑”按钮进入全屏编辑器，避免主页面被超长文本撑爆。

3. **自研全屏深度编辑器（SinglePresetMessageEditor）**：
   - **拒绝使用 `var-popup` 承载全屏**。采用自研的 Vue 全屏遮罩层组件（`position: fixed; inset: 0; z-index: 100;`，配合 Vue `<Transition>` 动画），提供最宽敞的输入视野和沉浸式的编辑体验，彻底避免 Varlet 默认圆角、阴影和 MD3 表面分层对 AIO 默认观感的污染。
   - **核心编辑区**：
     - **角色选择**：采用自研的极简 Vue 选项卡（Tabs）或分段按钮组，配合项目 CSS 变量（如 `--primary-color`、`--card-bg` 等）进行样式定制，支持 System / User / Assistant 快速切换。
     - **消息名称**：单行输入框（可使用 `var-input` 作为原子件）。
     - **内容输入**：全屏大文本框（`var-input` textarea，占据屏幕核心区域），支持自适应高度与宏提示。
     - **所属组**：下拉选择当前已有的消息组。
   - **自研高级折叠区**：将“注入策略（Injection Strategy）”和“模型匹配（Model Match）”放入底部的自研折叠面板中（通过简单的 `ref` 变量控制 `v-show`，配合 CSS 过渡动画实现，**拒绝使用 `var-collapse`**），默认收起，保持界面清爽，但保留 100% 的高级配置能力。

4. **消息组联动（PresetMessageGroup）**：
   - 在编辑器顶部提供“预设消息组”横向滑动面板（纯 CSS `overflow-x: auto` 实现，**拒绝使用 Varlet 容器**）。
   - 支持展示单选组（Radio）和多选组（Checkbox），并支持一键启用/禁用整个组。
   - 组内消息的启用状态与组开关、单选状态实时联动。

5. **命令式 API 规范**：
   - 所有的提示和确认弹窗（如删除确认、导入成功提示等）**必须统一使用项目封装的 `customMessage` 和 `customDialog`**，严禁直接调用 Varlet 的 `Snackbar` / `Dialog`。

#### 2.2. 任务拆解与产出

| 任务                     | 产出文件                                   | 说明                                                                                                                                                                                |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **智能体列表页**         | `views/AgentList.vue`                      | 展示所有 Agent，支持搜索、分类筛选、新建、删除。                                                                                                                                    |
| **智能体详情页**         | `views/AgentDetail.vue`                    | 整合基础属性编辑（名称、描述、头像、模型绑定）与 **`PresetMessageEditor`** 组件。                                                                                                   |
| **预设消息编辑器主组件** | `components/PresetMessageEditor.vue`       | 预设消息管理主容器。负责消息列表渲染、分页、拖拽排序、消息组面板联动、导入/导出/粘贴/批量管理等全局操作。                                                                           |
| **单条消息卡片**         | `components/PresetMessageCard.vue`         | 移动端适配的消息卡片。展示角色标签（System/User/Assistant 采用不同主题色）、名称、内容缩略、启用开关。提供拖拽手柄和“更多”操作菜单（复制、克隆、删除、移动组、上移/下移）。         |
| **单条消息属性编辑器**   | `components/SinglePresetMessageEditor.vue` | **自研全屏编辑器组件**（纯 Vue + CSS 实现全屏遮罩层，拒绝 `var-popup`）。提供角色、名称、内容、所属组的编辑，以及注入策略、模型匹配的高级折叠配置区，为长文本输入提供最宽敞的视野。 |
| **消息组编辑器**         | `components/PresetGroupEditDialog.vue`     | 弹窗组件。用于新建或编辑消息组（名称、选择模式：单选/多选、启用状态）。                                                                                                             |
| **批量管理器**           | `components/AgentPresetBatchDialog.vue`    | 弹窗组件。支持多选消息进行批量删除、批量启用/禁用、批量移动到指定消息组。                                                                                                           |
| **Token 估算器**         | `composables/usePresetTokenCalculator.ts`  | 消费 Rust 后端统一的 `o200k_base` 本地计数能力，批量计算启用消息并展示总 Token 数；该结果用于上下文占比参考，明确标记为 o200k 预估。                                                |
| **角色卡导入**           | `composables/useAgentImporter.ts`          | 支持 AIO Agent JSON 和 SillyTavern 角色卡（PNG/JSON）的解析与导入，自动将角色卡属性转化为多轮预设消息。                                                                             |

### 阶段 3：打通对话连接（合体）

| 任务               | 修改文件                                                   | 状态     | 说明                                                            |
| ------------------ | ---------------------------------------------------------- | -------- | --------------------------------------------------------------- |
| 解除"角色大厅"禁用 | `llm-chat/views/ChatHome.vue`                              | 已完成   | 点击跳转到 `/tools/agent-manager`                               |
| 修改会话创建       | `llm-chat/stores/llmChatStore.ts`                          | 已完成   | `createSession()` 支持传入 `agentId`                            |
| 修改执行器         | `llm-chat/composables/useChatExecutor.ts`                  | 已完成   | 从 agentStore 获取配置，填充 `agentConfig` 并绑定模型与基础参数 |
| 实现管道处理器     | `llm-chat/core/pipeline/processors/agent-preset-loader.ts` | 部分完成 | 已注入启用的预设消息；注入策略和模型匹配尚未执行                |
| 聊天界面显示 Agent | `llm-chat/views/LlmChatView.vue`                           | 已完成   | 导航栏展示当前 Agent 头像和名称；切换入口尚未实现               |

---

## 6. 与桌面端的兼容策略

| 维度         | 策略                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **存储路径** | 移动端与桌面端当前都采用各自应用配置目录下的 `agent-manager/agents/{id}/agent.json` 与 `agents-index.json` 布局；跨端迁移通过导入导出完成                                                                                                                                                                                                                                                   |
| **类型定义** | 运行时通过完整对象克隆和未知字段保留确保未编辑字段不被裁剪；显式 TypeScript 类型需持续跟随桌面端演进，当前仍存在 `defaultGreetingId` 和分类枚举差异                                                                                                                                                                                                                                         |
| **无损编辑** | **核心策略（Lossless Editing）**：<br>1. 移动端编辑时从完整 Agent 对象执行 `structuredClone`，保存时提交完整草稿，从而保留 UI 暂不支持的桌面端高级字段（如 `toolCallConfig`、`knowledgeBaseConfig`、`worldbookIds`、`quickActionSetIds` 等）。<br>2. 编辑单条预设消息时同样克隆完整 `ChatMessageNode`，原样保留 `presetAttachments`、`childrenIds` 等未编辑字段，只覆盖用户明确修改的内容。 |
| **导入格式** | 完美支持桌面端的 `AIO_Agent_Export` JSON 格式，确保角色卡可以跨端**无损迁移**                                                                                                                                                                                                                                                                                                               |
| **未来演进** | 如果桌面端也决定拆分 Agent，可以参照移动端的架构模式进行渐进式重构                                                                                                                                                                                                                                                                                                                          |

---

## 7. 风险评估

| 风险                                     | 影响         | 缓解措施                                                     |
| ---------------------------------------- | ------------ | ------------------------------------------------------------ |
| `agent-manager` 与 `llm-chat` 的循环依赖 | 构建失败     | 严格遵循单向依赖；"发起对话"通过路由跳转而非直接 import      |
| 桌面端数据迁移到移动端时格式不兼容       | 用户丢失配置 | 兼容字段与未知字段原样保留，编辑时仅覆盖移动端明确支持的字段 |
| 移动端内存限制导致大量 Agent 加载卡顿    | UI 卡顿      | 磁盘保留轻量索引；当前全量加载，数据规模增长后切换为按需加载 |
| PresetMessages 过长导致 Token 超限       | 请求失败     | 请求前统计完整上下文并按阈值显示 warning / critical 提示     |

---

## 8. 开放问题

1. **用户档案 (UserProfile)**：是否也应该独立为一个工具？还是暂时作为 `agent-manager` 的子功能？
   - 倾向：做独立模块页

2. **世界书 (Worldbook)**：移动端是否需要支持？
   - 倾向：当前版本不添加，后续适时再追加。

3. **存储路径是否与桌面端对齐**：用 `agent-manager/` 还是 `llm-chat/agents/`？
   - 已决定：使用独立的 `agent-manager/`，物理隔离更干净。跨端迁移通过导入导出解决。
