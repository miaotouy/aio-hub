# 多开局系统实施计划 v3 —— 编辑器解耦与弹窗式箱组管理

> 状态: Draft
> 日期: 2026-04-29
> 前置文档: [`llm-chat-multi-greeting-design.md`](llm-chat-multi-greeting-design.md), [`llm-chat-multi-greeting-design-review-v2.md`](llm-chat-multi-greeting-design-review-v2.md)
> 范围: `src/tools/llm-chat`

## 0. 设计决策确认

经过调查与讨论，以下设计决策已确认：

| 决策项           | 结论                                                       | 理由                                                   |
| ---------------- | ---------------------------------------------------------- | ------------------------------------------------------ |
| 总体方案         | 方案 B（箱组消息 / Message Group）                         | 预设保持线性，局部互斥容器精准解决问题                 |
| 编辑器交互       | **弹窗式箱组管理**，不做嵌套拖拽                           | 嵌套拖拽交互复杂、易出错；弹窗式简单直观               |
| 编辑器复用策略   | `PresetMessageEditor` 去壳为纯编辑器，不同场景套不同弹窗壳 | 复用现有编辑器逻辑，避免重复代码                       |
| 注入策略归属     | **Group 级别统一配置**                                     | "组的含义就是同一位置的不同变体，不同位置就不该放一组" |
| Variant 状态存储 | **会话级** `variantOverrides`                              | 每个会话可独立选择不同开局，互不影响                   |

---

## 1. 编辑器架构解耦

### 1.1 现状问题

当前 [`PresetMessageEditor.vue`](src/tools/llm-chat/components/agent/editors/PresetMessageEditor.vue) 是"弹窗即编辑器"的单体结构：

```
BaseDialog
  └── 所有编辑控件（角色、名称、过滤、注入策略、工具栏、编辑器、预览）
```

这种结构导致编辑逻辑**无法在弹窗以外的容器中复用**（如箱组管理器的侧边栏布局）。

### 1.2 目标架构

```
PresetMessageEditor.vue (纯编辑器，无壳，可嵌入任意容器)
  ├── 角色选择
  ├── 名称输入
  ├── 模型过滤 (可选隐藏)
  ├── 注入策略 (可选隐藏)
  ├── 工具栏 (宏/变量/知识库/复制/粘贴)
  └── RichCodeEditor + 预览

PresetMessageEditorDialog.vue (弹窗壳，给旧代码用)
  └── PresetMessageEditor (嵌入 BaseDialog)

VariantGroupManagerDialog.vue (箱组管理器弹窗)
  ├── [顶部] 组属性编辑区
  │     ├── 组名称
  │     ├── 注入策略 (Group 级别)
  │     └── 模型过滤 (Group 级别)
  └── [主体] 左右分栏
        ├── [左侧 30%] Variant 列表
        │     ├── 列表项 (摘要 + 设为默认⭐ + 删除🗑️)
        │     └── 新增 Variant 按钮
        └── [右侧 70%] PresetMessageEditor (纯编辑器直接嵌入)
              └── 编辑当前选中 Variant 的内容和角色
```

### 1.3 `PresetMessageEditor.vue` Props 设计

```typescript
interface Props {
  // === 消息数据 ===
  modelValue: MessageForm; // v-model 绑定消息数据

  // === 上下文 ===
  agentName?: string;
  userProfile?: UserProfile | null;
  agent?: any;
  llmThinkRules?: LlmThinkRule[];
  richTextStyleOptions?: RichTextRendererStyleOptions;

  // === 控件可见性控制（用于在不同容器中差异化展示）===
  hideRole?: boolean; // 隐藏角色选择（Variant 场景：组统一指定角色）
  hideName?: boolean; // 隐藏名称输入
  hideInjection?: boolean; // 隐藏注入策略（Variant 场景：组统一管理）
  hideModelMatch?: boolean; // 隐藏模型过滤（Variant 场景：组统一管理）
  hideToolbar?: boolean; // 隐藏工具栏
}

interface Emits {
  (e: "update:modelValue", value: MessageForm): void;
}
```

### 1.4 现有代码迁移路径

`PresetMessageEditor.vue` 当前约 1040 行，迁移步骤：

1. **去除 `BaseDialog` 壳**：将现有 [`PresetMessageEditor.vue`](src/tools/llm-chat/components/agent/editors/PresetMessageEditor.vue) 中的 `<BaseDialog>` 标签剥离，使其成为纯编辑器组件。
2. **创建 `PresetMessageEditorDialog.vue`**：新建弹窗壳文件，内部引用 `PresetMessageEditor` 并包裹 `BaseDialog`。
3. **更新引用方**：将 `AgentPresetEditor.vue` 中的 import 从 `PresetMessageEditor.vue` 改为 `PresetMessageEditorDialog.vue`。
4. **功能等价验证**：确保弹窗编辑行为与重构前完全一致。

---

## 2. 数据结构变更

### 2.1 `ChatMessageNode` 扩展

在 [`types/message.ts`](src/tools/llm-chat/types/message.ts:81) 中：

```typescript
export interface ChatMessageNode {
  // ... 现有字段不变

  type?: MessageType | "group"; // 新增 "group" 类型

  // 新增：箱组专属字段（仅 group 节点使用）
  childrenIds: string[]; // 已有字段，group 用于引用其 Variants
  role: MessageRole; // 已有字段，group 角色统一约束所有 Variants

  metadata?: {
    // ... 现有字段不变

    /** 箱组显示名称（如 "开场白"），仅 group 节点 */
    groupName?: string;

    /** 默认激活的 Variant ID（Agent 级默认值），仅 group 节点 */
    activeVariantId?: string;

    /** 标记该节点是箱组子节点，不参与独立注入扫描 */
    isVariant?: boolean;
  };
}
```

### 2.2 `ChatSessionDetail` 扩展

在 [`types/session.ts`](src/tools/llm-chat/types/session.ts:40) 中：

```typescript
export interface ChatSessionDetail {
  // ... 现有字段不变

  /**
   * 会话级别的 Variant 覆盖
   * key: groupId, value: 用户选中的 variantId
   * 优先级高于 Agent 级的 activeVariantId
   */
  variantOverrides?: Record<string, string>;
}
```

### 2.3 Variant 节点与 Group 节点的关系

```
agent.presetMessages = [
  // 普通消息（不变）
  { id: "msg1", type: "message", role: "system", content: "..." },

  // 箱组节点
  {
    id: "group-greeting",
    type: "group",
    role: "assistant",            // 组统一角色
    content: "",                  // group 节点本身无内容
    name: "开场白",               // 组显示名称
    childrenIds: ["var-0", "var-1", "var-2"],  // 指向 Variants
    injectionStrategy: {          // 组级注入配置
      type: "depth",
      depth: 0
    },
    metadata: {
      groupName: "开场白",
      activeVariantId: "var-0"    // Agent 级默认
    }
  },

  // Variant 子节点（不独立参与注入扫描）
  { id: "var-0", type: "message", role: "assistant", content: "你好！", metadata: { isVariant: true } },
  { id: "var-1", type: "message", role: "assistant", content: "Hello!", metadata: { isVariant: true } },
  { id: "var-2", type: "message", role: "assistant", content: "こんにちは！", metadata: { isVariant: true } },

  // chat_history 锚点（不变）
  { id: "chat_history-placeholder", type: "chat_history", ... }
]
```

---

## 3. 文件改动清单

| 阶段                | 文件                                                                                                  | 改动量     | 说明                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| **1. 类型**         | [`types/message.ts`](src/tools/llm-chat/types/message.ts)                                             | 小         | `type` 扩展 `"group"`；metadata 加 `groupName?`, `activeVariantId?`, `isVariant?` |
| **1. 类型**         | [`types/session.ts`](src/tools/llm-chat/types/session.ts)                                             | 小         | `ChatSessionDetail` 加 `variantOverrides?`                                        |
| **1. 类型**         | [`types/common.ts`](src/tools/llm-chat/types/common.ts)                                               | 小         | `MessageType` 联合类型加 `"group"`                                                |
| **2. 编辑器解耦**   | `components/agent/editors/PresetMessageEditor.vue`                                                    | 中         | 去除 BaseDialog 壳，变为纯编辑器组件                                              |
| **2. 编辑器解耦**   | `components/agent/editors/PresetMessageEditorDialog.vue`                                              | **新文件** | 弹窗壳（BaseDialog 包裹 PresetMessageEditor），替代旧引用                         |
| **3. 箱组管理器**   | `components/agent/editors/VariantGroupManagerDialog.vue`                                              | **新文件** | 弹窗式箱组管理器（顶部组属性 + 左右分栏，右侧嵌入 PresetMessageEditor）           |
| **4. 预设列表适配** | `components/agent/assets/AgentPresetEditor.vue`                                                       | 中         | 列表渲染区分 `group` 节点；点击分发到不同编辑器                                   |
| **5. 解析器**       | [`services/sillyTavernParser.ts`](src/tools/llm-chat/services/sillyTavernParser.ts)                   | 中         | 多开局拍扁逻辑 → 聚合为 group + variants                                          |
| **6. 上下文管道**   | [`injection-assembler.ts`](src/tools/llm-chat/core/context-processors/injection-assembler.ts)         | 小         | 展开 group 节点（~40行，classify 之前）                                           |
| **7. 路径计算**     | [`chatPathUtils.ts`](src/tools/llm-chat/utils/chatPathUtils.ts)                                       | 中         | group 展开 + variant 元数据标记                                                   |
| **8. 聊天 UI**      | [`MessageList.vue`](src/tools/llm-chat/components/message/MessageList.vue)                            | 小         | siblings 计算适配 group variant                                                   |
| **8. 聊天 UI**      | [`MessageMenubar.vue`](src/tools/llm-chat/components/message/MessageMenubar.vue)                      | 小         | 解锁 branch-control + variant 事件                                                |
| **8. 聊天 UI**      | [`ChatArea.vue`](src/tools/llm-chat/components/ChatArea.vue)                                          | 小         | 事件透传                                                                          |
| **9. Store**        | [`llmChatStore.ts`](src/tools/llm-chat/stores/llmChatStore.ts)                                        | 中         | `switchVariant` action + 实例化逻辑                                               |
| **9. Store**        | [`useSessionManager.ts`](src/tools/llm-chat/composables/session/useSessionManager.ts)                 | 小         | `variantOverrides` 字段持久化                                                     |
| **9. Store**        | [`useChatStorageSeparated.ts`](src/tools/llm-chat/composables/storage/useChatStorageSeparated.ts)     | 小         | 序列化/反序列化                                                                   |
| **10. 发送逻辑**    | [`useChatHandler.ts`](src/tools/llm-chat/composables/chat/useChatHandler.ts)                          | 中         | 实例化 greeting 节点                                                              |
| **11. 批量管理**    | [`AgentPresetBatchDialog.vue`](src/tools/llm-chat/components/agent/assets/AgentPresetBatchDialog.vue) | 小         | 适配 group 类型                                                                   |

---

## 4. 实施阶段规划

### 阶段 A：编辑器解耦（纯重构，无功能变更）

1. 重构 [`PresetMessageEditor.vue`](src/tools/llm-chat/components/agent/editors/PresetMessageEditor.vue)：剥离 `BaseDialog` 壳，保留纯编辑逻辑。
2. 新建 [`PresetMessageEditorDialog.vue`](src/tools/llm-chat/components/agent/editors/PresetMessageEditorDialog.vue)：弹窗壳，引用纯编辑器。
3. 更新 `AgentPresetEditor.vue` 的 import 引用到 `PresetMessageEditorDialog.vue`。
4. 验证：弹窗编辑行为与重构前完全一致。

### 阶段 B：类型与解析

1. 更新 `message.ts`、`common.ts`、`session.ts` 类型定义。
2. 修改 `sillyTavernParser.ts`：`alternate_greetings` 聚合为 group。
3. 修改 `injection-assembler.ts`：展开 group 节点。

### 阶段 C：箱组管理器 UI

1. 创建 [`VariantGroupManagerDialog.vue`](src/tools/llm-chat/components/agent/editors/VariantGroupManagerDialog.vue)。
2. 适配 `AgentPresetEditor.vue`：区分 group 与普通消息的渲染和点击行为。
3. 适配 `AgentPresetBatchDialog.vue`。

### 阶段 D：聊天界面与存储

1. 修改 `chatPathUtils.ts`、`MessageList.vue`、`MessageMenubar.vue`、`ChatArea.vue`。
2. 修改 `llmChatStore.ts`、`useSessionManager.ts`、`useChatStorageSeparated.ts`。
3. 修改 `useChatHandler.ts`：实例化逻辑。

### 阶段 E：测试与兼容

1. 向后兼容验证：旧 Agent 数据正常加载和编辑。
2. 角色卡导入测试：多开局角色卡正确生成 group。
3. 会话切换开局测试：不同会话独立选择。

---

## 5. 交互流程

### 5.1 预设编辑器中的箱组管理

```
AgentPresetEditor 消息列表
  ┌────────────────────────────────────┐
  │ [System] 系统提示词                 │  ← 普通消息（点击弹出 PresetMessageEditor）
  │ ┌────────────────────────────────┐ │
  │ │ 📦 开场白 (3个变体)            │ │  ← group 消息（点击弹出 VariantGroupManager）
  │ │ 当前: 你好！                    │ │
  │ │ [编辑组]                        │ │
  │ └────────────────────────────────┘ │
  │ [chat_history] 占位符              │
  └────────────────────────────────────┘
```

点击"编辑组"后：

```
VariantGroupManager 弹窗
  ┌─────────────────────────────────────────────────────────┐
  │  编辑开场白                                         [×]  │
  ├─────────────────────────────────────────────────────────┤
  │  组名称: [开场白________]                                │
  │  注入策略: ○ 跟随列表  ● 📍深度 [0]  ○ 🔩高级  ○ ⚓锚点  │
  │  角色: ● System  ○ User  ○ Assistant                    │
  ├───────────────────┬─────────────────────────────────────┤
  │  Variant 列表      │  编辑 Variant #1                     │
  │                    │                                     │
  │  ⭐ 你好！(默认)    │  [角色: Assistant]  [名称: _____]    │
  │  ─────────────── │  ┌─────────────────────────────────┐ │
  │     Hello!        │  │ 你好！我是...                    │ │
  |  ───────────────  |  │                                 │ │
  |  こんにちは！      │  │                                 │ │
  │                    │  └─────────────────────────────────┘ │
  │                    │                                     │
  │  [+ 添加变体]      │  [复制] [粘贴] [覆盖] [插入宏]       │
  ├───────────────────┴─────────────────────────────────────┤
  │                                    [取消]  [保存组]      │
  └─────────────────────────────────────────────────────────┘
```

### 5.2 聊天界面中的开局切换

```
聊天流
  ┌────────────────────────────────────┐
  │ 📦 开场白                    ◀ 1/3 ▶│  ← MessageMenubar 分支切换箭头
  │ ┌────────────────────────────────┐ │
  │ │ 🤖 你好！我是...                │ │  ← 当前选中的 Variant 内容
  │ └────────────────────────────────┘ │
  ├────────────────────────────────────┤
  │ 👤 你好，请问...                    │  ← 用户首条消息
  └────────────────────────────────────┘
```

---

## 6. 风险与缓解

| 风险                                                      | 等级 | 缓解措施                                                                  |
| --------------------------------------------------------- | ---- | ------------------------------------------------------------------------- |
| `PresetMessageEditor` 去壳重构后行为退化                  | 中   | 重构后立即进行完整功能回归测试；新 `PresetMessageEditorDialog` 覆盖旧引用 |
| 分页系统与 group 节点冲突                                 | 中   | 分页按 group 整体计算占用行数，group 始终完整显示                         |
| 旧 Agent 数据兼容                                         | 低   | 旧 `isEnabled` 互斥消息正常显示，仅在打开编辑器时提示升级                 |
| `variantOverrides` 引用的 variantId 因 Agent 重导入而失效 | 低   | 加载时校验有效性，失效时自动回退到 `activeVariantId`                      |

---

## 7. 待实施时确认的细节

1. **Variant 角色**：是否允许同一组内 Variant 使用不同角色？（初步建议：组统一约束角色，但允许个别覆盖。） - 统一角色
2. **批量管理**：`AgentPresetBatchDialog` 是否需要对 group 做特殊处理？（初步建议：v1 暂时把 group 当作不可拆分的整体。） - 先不拆
3. **Macro 处理**：Variant 编辑器内是否依然支持宏自动补全？（应该支持，与普通消息一致。） - 消息内容本身和普通消息没区别，就多了个变体选择，对最终的预览构建来说还是会扁平化，也就是透明的

---

## 8. 结论

本计划采用"编辑器解耦 + 弹窗式箱组管理"策略，避开嵌套拖拽的复杂性。通过将 `PresetMessageEditor` 剥离为纯编辑器组件，再按场景套上不同的弹窗壳（`PresetMessageEditorDialog` / `VariantGroupManagerDialog`），实现编辑器逻辑的最大化复用。注入策略归属于组级别，Variant 只关心角色和内容——这与"组是同一位置的变体容器"的语义完全一致。

各阶段可以独立验证和交付：阶段 A 是纯重构无功能变更，阶段 B 实现数据流闭环，阶段 C 提供可视化编辑体验，阶段 D 完成与聊天界面的对接。
