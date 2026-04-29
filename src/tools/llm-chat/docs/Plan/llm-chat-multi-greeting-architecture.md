# 多开局系统架构方案

> 状态: Approved
> 日期: 2026-04-29
> 范围: `src/tools/llm-chat`
> 
> 本文档整合了多开局系统的调查分析、方案对比、审查修正和最终架构决策，是施工前的架构共识。

## 1. 问题定义

### 1.1. 背景

酒馆 (SillyTavern) 角色卡支持 **`alternate_greetings`** 字段（多开局），即一张角色卡可以预设多个不同的开场白/起始场景，用户创建会话时选择其中一个作为开局。

### 1.2. 现状

当前 [`sillyTavernParser.ts`](src/tools/llm-chat/services/sillyTavernParser.ts) 将 `first_mes` 和 `alternate_greetings` **全部拍扁**成线性预设消息（`assistant` 角色），策略如下：

```
greetings = [first_mes, ...alternate_greetings]
→ 全部转为 assistant preset message
→ 仅第 0 条 isEnabled=true，其余 isEnabled=false
→ displayPresetCount = greetings.length
```

**结果**：用户创建会话后只能看到第一个默认开场白。想切换开局场景必须进 Agent 预设编辑器，找到对应消息并手动切换 `isEnabled` 开关。

### 1.3. 核心矛盾

| 维度       | 预设系统                   | 会话系统          |
| ---------- | -------------------------- | ----------------- |
| 结构       | 线性数组                   | 树状 (Tree)       |
| 编排模型   | 顺序注入 + 锚点 + 深度     | 分支 + 叶节点导航 |
| 多开局需求 | 互斥选择（选一个分支开始） | 天然支持分支      |

预设要保持线性（编排简单、心智负担低），但多开局本质上是**会话初始分支选择**问题，不应由预设系统承担。

### 1.4. 关键数据流（现状）

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

### 1.5. 预设消息的 `isEnabled` 机制

预设消息的 `isEnabled` 是一个**编辑态开关**：

- 在预设编辑器中手动切换
- 上下文构建时（[`injection-assembler.ts`](src/tools/llm-chat/core/context-processors/injection-assembler.ts)）过滤掉 `isEnabled === false` 的消息
- 这是一个**静态配置**，对所有使用该 Agent 的会话同时生效

**这意味着**：如果用户切换了开局（修改了 `isEnabled`），会影响所有已有会话的预设注入结果。

---

## 2. 方案对比

### 2.1. 方案 A: 会话创建时选择开局

**核心思路**：多开局不进入预设系统，而是在**会话创建时**作为初始化选项——弹出选择对话框，选中开局作为第一条 assistant 消息插入会话树。

- ✅ 改动量最小，主要在 UI 层
- ✅ 每个会话独立选择，互不影响
- ❌ 无法在会话中途切换开局预览
- ❌ 无法复用现有的 `isPresetDisplay` UI 渲染管道

### 2.2. 方案 B: 箱组消息 (Message Group) — **最终采用**

**核心思路**：在预设编辑器中，将多个互斥消息放入一个"箱组"（`type: "group"` 节点），运行时自动选出激活的一条 Variant 注入上下文。

- ✅ 预设保持线性编排，心智负担不变
- ✅ "箱组"作为局部互斥容器，精准解决多开局且可复用于其他场景
- ✅ 通过"虚拟 Siblings"映射复用现成的 `MessageMenubar.vue` 分支切换 UI
- ✅ 每个会话通过 `variantOverrides` 独立选择
- ⚠️ 预设编辑器需要适配箱组的可视化编辑（分层展开）

### 2.3. 方案 C: 预设树化（被否决）

将整个预设系统改为树状结构，让预设消息之间可以形成分支关系。

- ❌ 预设用线性有功能需要在（顺序注入、锚点定位、深度控制）
- ❌ 树状不适合预设编排，对作者心智负担较大

---

## 3. 可行性确认

### 3.1. 与锚点系统的兼容性

原 v1 审查报告曾断言方案 B 不可行（"`type: "group"` 会撞上锚点语义"），该判断已被修正为**错误**。实际代码中：

| 位置 | 判断逻辑 | 是否受 `group` 影响 |
|------|---------|-------------------|
| [`classifyPresetMessages()`](src/tools/llm-chat/core/context-processors/injection-assembler.ts:31) | 按 `injectionStrategy` 分类，**不按 `type`** | ❌ 无影响 |
| 骨架遍历锚点判断 | `type !== "message"` 分支 | ⚠️ 需在骨架前展开 group（将 active variant 提升为普通消息） |
| [`getActivePathWithPresets()`](src/tools/llm-chat/utils/chatPathUtils.ts:15) | 只用 `type === "chat_history"` 找占位符 | ❌ 无影响 |
| [`AgentPresetEditor`](src/tools/llm-chat/components/agent/assets/AgentPresetEditor.vue:576) | `anchorRegistry.hasAnchor(type)` 判锚点，group 不在注册表中 | ❌ 无影响（走普通消息分支） |

**结论：方案 B 在数据语义层面不存在结构冲突。** 只需在 `classifyPresetMessages` 之前展开 group 节点，其余管道逻辑零改动。

---

## 4. 最终架构决策

| 决策项 | 结论 | 理由 |
|--------|------|------|
| **总体方案** | 方案 B（箱组消息 / Message Group） | 预设保持线性，局部互斥容器精准解决问题 |
| **核心架构** | **Group 代理模式**（解析器路由 `resolvePresetMessages`） | 保持 95% 基础代码不动，将复杂性封装在解析阶段 |
| **编辑器交互** | **弹窗式箱组管理**，不做嵌套拖拽 | 嵌套拖拽交互复杂、易出错；弹窗式简单直观 |
| **编辑器复用策略** | `PresetMessageEditor` 去壳为纯编辑器，不同场景套不同弹窗壳 | 复用现有编辑器逻辑，避免重复代码 |
| **注入策略归属** | **Group 级别统一配置** | "组的含义就是同一位置的不同变体，不同位置就不该放一组" |
| **Variant 状态存储** | **会话级** `variantOverrides`（`ChatSessionDetail` 上） | 每个会话可独立选择不同开局，互不影响 |
| **变体识别** | **显式标签**（复用 `name` 字段） | 解决内容预览相似导致的"脸盲"问题，提升可维护性 |

---

## 5. 核心设计原则

### 5.1. Group 代理模式（解析器路由）

不让"组"的概念污染整个系统。有一个标准的"脱壳"函数 `resolvePresetMessages()`，在注入上下文前统一展开 group 节点，下游逻辑保持平面化。

```
resolvePresetMessages(messages[], overrides):
  1. 建立 variant 映射表
  2. 遍历消息：
     - type === "group" → 取 active variant（会话覆盖 > 组默认 > 第一个子节点），提升为普通消息
     - isVariant === true → 跳过
     - 其他 → 直接保留
  3. 返回平面数组
```

### 5.2. 会话级状态存储

展示时优先读取会话的 `variantOverrides`，回退到 Agent 的 `activeVariantId` 作为默认值。

```typescript
// ChatSessionDetail 新增
variantOverrides?: Record<string, string>; // groupId → variantId
```

### 5.3. 弹窗式编辑器

- `PresetMessageEditor.vue` 剥离 `BaseDialog` 壳，变为纯编辑器组件
- `PresetMessageEditorDialog.vue` 作为弹窗壳替代旧引用
- `VariantGroupManagerDialog.vue` 作为箱组管理器弹窗

### 5.4. 显式变体标签

直接复用 `ChatMessageNode.name` 字段作为变体的"标签"，在导入时自动生成（变体 1, 变体 2...），用户可在编辑器中修改。

---

## 6. 数据模型概要

### 6.1. `ChatMessageNode` 扩展

```typescript
export interface ChatMessageNode {
  type?: MessageType | "group";
  name?: string; // 组名 (type="group") 或 变体名 (isVariant=true)
  
  metadata?: {
    groupName?: string;       // 箱组显示名称（仅 group 节点）
    activeVariantId?: string; // 默认激活的 Variant ID（仅 group 节点）
    isVariant?: boolean;      // 标记为箱组子节点，不参与独立注入扫描
    parentGroupId?: string;   // 父箱组 ID（仅 variant 节点或副本）
    allVariantIds?: string[]; // 同级 variant ID 列表（仅 variant 副本）
    currentVariantIndex?: number;
    variantSiblingPreviews?: Array<{ id: string; name?: string; contentPreview: string }>;
    isGreetingInstantiation?: boolean; // 标记 greeting 实例化节点
  };
}
```

### 6.2. Group 与 Variant 的存储关系

```
agent.presetMessages = [
  { id: "msg1", type: "message", role: "system", content: "..." },
  {
    id: "group-greeting",
    type: "group",
    role: "assistant",
    childrenIds: ["var-0", "var-1", "var-2"],
    injectionStrategy: { type: "depth", depth: 0 },
    metadata: { groupName: "开场白", activeVariantId: "var-0" }
  },
  { id: "var-0", type: "message", role: "assistant", content: "你好！", metadata: { isVariant: true } },
  { id: "var-1", type: "message", role: "assistant", content: "Hello!", metadata: { isVariant: true } },
  { id: "var-2", type: "message", role: "assistant", content: "こんにちは！", metadata: { isVariant: true } },
  { id: "chat_history-placeholder", type: "chat_history", ... }
]
```

---

## 7. 风险与缓解

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|---------|
| 编辑器改动量大 | 中 | `AgentPresetEditor` 需分层展开 UI + 箱组管理弹窗 | 先做 UI layout，弹窗式避开嵌套拖拽 |
| `PresetMessageEditor` 去壳重构后行为退化 | 中 | 剥离 BaseDialog 可能遗漏逻辑 | 重构后立即完整功能回归测试 |
| 分页系统与 group 节点冲突 | 中 | group + variants 可能跨页 | 分页按 group 整体计算占用行数，或 group 始终完整显示 |
| `variantOverrides` 引用的 ID 因 Agent 重导入而失效 | 低 | 重新导入角色卡后 group 结构变了 | 加载时校验 variantId 是否仍在 group 中，不存在的回退到默认 |
| 实例化时机 | 低 | 切换开局后不发送就切换会话，状态需保持 | `variantOverrides` 已持久化在会话上，切换会话不丢失 |

---

## 8. 向后兼容

- 旧 Agent（无箱组结构）：行为完全不变
- 已导入的 Agent（`alternate_greetings` 在 `presetMessages` 中以 `isEnabled` 互斥）：旧逻辑继续工作
- 新导入的角色卡：按新逻辑解析为箱组
- 方案 A 可作为箱组的退化情况：无 `alternate_greetings` 但有 `first_mes` 时，箱组只有一个 Variant