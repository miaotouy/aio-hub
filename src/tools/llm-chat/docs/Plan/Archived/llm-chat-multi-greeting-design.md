# 多开局系统与树状会话对接方案 —— 调查分析报告

> 状态: Draft
> 日期: 2026-04-29
> 范围: `src/tools/llm-chat`

## 1. 问题定义

### 1.1. 背景

酒馆 (SillyTavern) 角色卡支持 **`alternate_greetings`** 字段（多开局），即一张角色卡可以预设多个不同的开场白/起始场景，用户创建会话时选择其中一个作为开局。

### 1.2. 现状

当前 `sillyTavernParser.ts` 在第 221-237 行将 `first_mes` 和 `alternate_greetings` **全部拍扁**成线性预设消息（`assistant` 角色），策略如下：

```
greetings = [first_mes, ...alternate_greetings]
→ 全部转为 assistant preset message
→ 仅第 0 条 isEnabled=true，其余 isEnabled=false
→ displayPresetCount = greetings.length
```

**结果**：用户创建会话后只能看到第一个默认开场白。想切换开局场景必须进 Agent 预设编辑器，找到对应消息并手动切换 `isEnabled` 开关。多个开局同时显示在 UI 上会造成混乱（互斥选择 vs 并列显示）。

### 1.3. 核心矛盾

| 维度       | 预设系统                   | 会话系统          |
| ---------- | -------------------------- | ----------------- |
| 结构       | 线性数组                   | 树状 (Tree)       |
| 编排模型   | 顺序注入 + 锚点 + 深度     | 分支 + 叶节点导航 |
| 多开局需求 | 互斥选择（选一个分支开始） | 天然支持分支      |

预设要保持线性（编排简单、心智负担低），但多开局本质上是**会话初始分支选择**问题，不应由预设系统承担。

## 2. 现状架构分析

### 2.1. 关键数据流

```
角色卡导入 (sillyTavernParser)
  │
  ├─ first_mes + alternate_greetings[]
  │    └─→ agent.presetMessages[] (均为 assistant role)
  │         ├─ [0]: isEnabled=true   ← 默认开局
  │         ├─ [1]: isEnabled=false  ← 备选开局1
  │         └─ [2]: isEnabled=false  ← 备选开局2
  │
  └─→ agent.displayPresetCount = greetings.length

会话创建 (useSessionManager.createSession)
  │
  └─→ 仅创建根节点 (system role)
       ├─ rootNodeId → activeLeafId
       └─ 预设消息不进入会话树

UI 展示 (chatPathUtils.getActivePathWithPresets)
  │
  ├─ 找到 chat_history 占位符位置
  ├─ 提取占位符之前的启用 user/assistant 预设消息
  ├─ 取最后 displayPresetCount 条
  ├─ 标记 isPresetDisplay: true
  └─→ 拼接到会话活动路径前面显示
```

### 2.2. 预设消息的 `isEnabled` 机制

预设消息的 `isEnabled` 是一个**编辑态开关**：

- 在预设编辑器中手动切换
- 上下文构建时（`injection-assembler.ts`）过滤掉 `isEnabled === false` 的消息
- 这是一个**静态配置**，对所有使用该 Agent 的会话同时生效

**这意味着**：如果用户切换了开局（修改了 `isEnabled`），会影响所有已有会话的预设注入结果。

### 2.3. MessageMenubar 中的线索

`MessageMenubar.vue` 第 609-613 行有一个关键的 tooltip：

```
"预设消息暂不支持创建分支，需等预设系统树化后才能对接"
```

这说明团队已经意识到：预设消息在 UI 中作为 `isPresetDisplay` 展示时，无法像普通会话消息一样进行分支操作。**预设系统树化**是一个被标记为待实现的方向，但也承认这会带来复杂性。

## 3. 方案分析

### 3.1. 方案 A: 会话创建时选择开局（轻量推荐）

**核心思路**：多开局不进入预设系统，而是在**会话创建时**作为初始化选项。

```
流程变更：
1. 用户选择角色卡 → 创建会话
2. 弹出"选择开局"对话框：
   ┌─────────────────────────────────┐
   │  选择开局场景                    │
   │  ┌───────────────────────────┐  │
   │  │ ○ 默认开场白 (first_mes)  │  │
   │  │ ○ 备选开局 1              │  │
   │  │ ○ 备选开局 2              │  │
   │  │ ○ 无开场白                 │  │
   │  └───────────────────────────┘  │
   │            [确定]               │
   └─────────────────────────────────┘
3. 选中开局 → 作为第一条 assistant 消息插入会话树
```

**优点**：

- **改动量最小**：主要在 UI 层，不改变预设/会话核心数据结构
- **预设保持线性**：`isEnabled` 不再承担互斥选择职责，所有开局消息可以统一标记
- **每个会话独立**：不同会话可以选择不同开局，互不影响
- **简单直观**：用户一眼看到所有选项，点一下就选好了

**需改动**：

1. `AgentBaseConfig` 新增字段：`alternateGreetings?: string[]`（存储备选开局文本）
2. `sillyTavernParser.ts`：将 `alternate_greetings` 存入新字段而非全量拍入 `presetMessages`
3. `useSessionManager.createSession`：接受可选 `greetingIndex` 参数，将会话初始化消息写入树
4. 新建 UI：会话创建时展示开局选择器
5. `displayPresetCount` 逻辑调整：不再从预设中提取开场白显示

### 3.2. 方案 B: 箱组消息 (Message Group)

**核心思路**：在预设编辑器中，将多个互斥消息放入一个"箱组"，运行时自动选出启用的一条。

```
数据结构示意：
presetMessages: [
  { type: "message", role: "system", ... }    // 普通预设
  {
    type: "choice_group",                     // 箱组
    choices: [
      { content: "开场白A", role: "assistant", isDefault: true },
      { content: "开场白B", role: "assistant", isDefault: false },
    ],
    activeChoiceIndex: 0,                     // 当前选中的
  },
  { type: "chat_history" }                    // 占位符
]
```

**优点**：

- 通用性强：不仅用于开局，任何互斥预设消息都可以用
- 编辑体验好：在预设编辑器中就能管理多选项

**缺点**：

- **数据结构改动大**：`ChatMessageNode` 需要支持新的 `type` 和嵌套结构
- **管道处理复杂**：`injection-assembler` 需要理解箱组语义
- **UI 改动多**：预设编辑器、上下文预览等都需要适配
- **过度设计风险**：对于"多开局"这一具体需求，引入了不必要的抽象层

### 3.3. 方案 C: 预设树化（被否决）

将整个预设系统改为树状结构，让预设消息之间可以形成分支关系。

**否决原因（用户已明确指出）**：

- 预设用线性有功能需要在（顺序注入、锚点定位、深度控制）
- 树状不适合预设编排，过于繁琐
- 对作者心智负担较大，远比会话中的分支大

## 4. 推荐方案

**推荐方案 B（箱组消息 / Message Group）**

方案 A（会话创建时选择开局）改动量最小，但存在两个局限：（1）无法在会话中途切换开局预览；（2）无法复用现有的 `isPresetDisplay` UI 渲染管道。方案 B 在方案 A 基础上增加抽象层，保留预设线性编排优势的同时，用"箱组"这个局部容器来容纳互斥候选。

### 4.1. 数据模型变更

**`ChatMessageNode` 扩展**（`types/message.ts`）：

```typescript
export interface ChatMessageNode {
  // ... 现有字段不变
  type?: MessageType | "group"; // 新增 "group" 类型
  metadata?: {
    // ... 现有字段不变
    activeVariantId?: string; // 箱组当前选中的子版本 ID
    groupName?: string; // 箱组显示名称（如"开场白"）
    isVariant?: boolean; // 标记该节点是箱组子节点，避免被独立注入
  };
}
```

**存储方式**：箱组节点及其所有子节点（Variants）都存入 `agent.presetMessages` 数组。子节点标记 `isVariant: true`，通过 `childrenIds` 与父组关联。上下文构建管道会跳过 `isVariant === true` 的节点。

### 4.2. 导入流程变更 (`sillyTavernParser.ts`)

```
改动前：first_mes + alternate_greetings → 全量拍入 presetMessages (isEnabled 互斥)
改动后：
  1. 创建 type: "group" 节点，groupName = "开场白"
  2. first_mes → 组内 Variant #0，标记 isVariant: true
  3. alternate_greetings → 组内 Variant #1, #2, ...，标记 isVariant: true
  4. 设置 group 节点的 activeVariantId = Variant #0 的 ID
  5. displayPresetCount 逻辑不变——箱组在预设列表中占一个位置
```

### 4.3. 上下文管道变更 (`injection-assembler.ts`)

```
扫描 presetMessages 时：
  - 遇到 type: "group"：
      1. 读取 activeVariantId
      2. （可选）检查会话层的 variantOverrides 是否覆盖了该 ID
      3. 找到对应子节点，将其注入上下文（标记 isPresetDisplay: true）
      4. 跳过其他 isVariant === true 的子节点
  - 遇到 isVariant === true：直接跳过（它们只能通过父组被引用）
```

### 4.4. 预设编辑器 UI (`AgentPresetEditor.vue`)

- **分层展开**（用户已确认）：组节点下方缩进显示所有子版本，直观展示互斥关系
- **组容器卡片**：显示 `groupName`、当前激活版本预览、版本数量
- **管理功能**：
  - 子节点卡片上提供"设为默认"按钮（更新父组的 `activeVariantId`）
  - 组内支持添加/删除版本、排序
  - 支持解散组（将子节点还原为独立预设消息）
- **拖拽适配**：组作为一个整体参与外部排序；子节点可在组内拖拽或拖出组

### 4.5. 聊天界面适配 (`MessageMenubar.vue`)

**当前状态**（调查自第609-619行、第360-400行）：

- `branch-control` 区域显示左右切换箭头，依赖 `siblings` 数组
- `isPresetDisplay` 消息被严格限制：无法创建分支、重试、删除
- 第611行 tooltip："预设消息暂不支持创建分支，需等预设系统树化后才能对接"

**所需变更**：

1. **解锁预设分支切换**：当 `isPresetDisplay && message.parentIsGroup` 时，启用 `branch-control` 区域
2. **虚拟 Siblings 映射**：将箱组内所有 Variants 映射为计算属性 `groupSiblings`，使现有箭头 UI 直接复用
3. **事件转发**：新增 `emit('switch-variant', variantId)` 事件，由父组件（`ChatArea`）捕获后更新会话的 `variantOverrides`
4. **tooltip 更新**：第 609-613 行的提示从"预设系统树化"改为"切换开场白版本"

### 4.6. 树状会话对接 (Instantiation)

1. **会话视角**：`ChatSessionDetail` 中增加 `variantOverrides: Record<string, string>`，存储用户当前预览的版本 ID
2. **预览切换**：用户在聊天流中切换版本时，不修改 Agent 原始数据，只更新 `variantOverrides`
3. **实例化**：用户发送第一条消息时，当前选中的 Variant 被拷贝为真实会话节点（`isPresetDisplay: false`），插入会话树作为分支起点

### 4.7. 向后兼容

- 旧 Agent（无箱组结构）：行为完全不变
- 已导入的 Agent（alternate_greetings 在 presetMessages 中以 isEnabled 互斥）：旧逻辑继续工作
- 新导入的角色卡：按新逻辑解析为箱组
- 方案 A 可作为箱组的退化情况：无 alternate_greetings 但有 first_mes 时，箱组只有一个 Variant

## 5. 实施步骤

| 阶段 | 内容                                                                              | 影响范围                                         |
| ---- | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1    | 类型定义：`ChatMessageNode` 扩展 `type: "group"` 及 `activeVariantId`/`isVariant` | `types/message.ts`                               |
| 2    | 解析器：修改 `sillyTavernParser.ts`，拍扁逻辑 → 聚合为箱组节点                    | `services/sillyTavernParser.ts`                  |
| 3    | 管道：`injection-assembler.ts` 适配 `group` 类型节点的展开逻辑                    | `core/context-processors/injection-assembler.ts` |
| 4    | 编辑器：`AgentPresetEditor.vue` 实现分层展开 + 嵌套拖拽                           | `components/agent/assets/AgentPresetEditor.vue`  |
| 5    | 聊天 UI：`MessageMenubar.vue` 虚拟 Siblings 映射 + 事件转发                       | `components/message/MessageMenubar.vue`          |
| 6    | 会话 Store：`variantOverrides` 字段 + 实例化逻辑                                  | `stores/llmChatStore.ts`                         |
| 7    | 清理：`isEnabled` 互斥逻辑可从多开局场景中退役                                    | `chatPathUtils.ts` 等                            |

## 6. 风险与考量

1. **数据结构复杂度**：`type: "group"` 引入嵌套语义，`chatPathUtils.ts` 和 `injection-assembler.ts` 需增加递归处理
2. **拖拽实现**：`VueDraggableNext` 的扁平列表需支持"组内嵌套"拖拽语义，可能需要双层 `draggable` 组件
3. **会话状态膨胀**：`variantOverrides` 随会话持久化，需考虑箱组删除/修改时的清理策略
4. **`isEnabled` 语义重叠**：箱组出现后，`isEnabled` 的"互斥开关"职责被 `activeVariantId` 替代，需要明确两者边界

## 7. 结论

方案 B（箱组消息）是**平衡抽象与实用**的方案：

- 预设系统保持线性编排，心态负担不变
- "箱组"作为局部互斥容器，精准解决多开局问题且可复用于其他场景
- 通过"虚拟 Siblings"映射复用现成的 `MessageMenubar.vue` 分支切换 UI
- 向后兼容，旧数据无需迁移
