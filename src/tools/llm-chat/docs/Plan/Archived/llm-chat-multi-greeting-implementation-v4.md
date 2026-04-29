# 多开局系统实施计划 v4 —— 解析器路由与变体标签管理

> 状态: Draft
> 日期: 2026-04-29
> 前置文档: [`llm-chat-multi-greeting-design.md`](llm-chat-multi-greeting-design.md), [`llm-chat-multi-greeting-implementation-v3.md`](llm-chat-multi-greeting-implementation-v3.md)
> 范围: `src/tools/llm-chat`

## 0. 设计决策确认

基于对“减少屎山”和“交互可识别性”的深入讨论，确认以下架构：

| 决策项       | 结论                               | 理由                                           |
| :----------- | :--------------------------------- | :--------------------------------------------- |
| **核心架构** | **Group 代理模式 (Scheme B)**      | 保持 95% 基础代码不动，将复杂性封装在解析阶段  |
| **变体识别** | **显式标签 (name 字段)**           | 解决内容预览相似导致的“脸盲”问题，提升可维护性 |
| **解析逻辑** | **解析器路由 (Resolver Pipeline)** | 在注入上下文前统一“脱壳”，下游逻辑保持平面化   |
| **存储位置** | **会话级覆盖 (variantOverrides)**  | 确保不同会话可以独立选择不同的变体路径         |

---

## 1. 数据结构微调

### 1.1 `ChatMessageNode` 字段复用

直接复用现有的 `name` 字段作为变体的“标签”。

```typescript
// src/tools/llm-chat/types/message.ts

export interface ChatMessageNode {
  // ... 现有字段
  name?: string; // [复用] 组名 (type="group") 或 变体名 (isVariant=true)
  type?: MessageType | "group";

  metadata?: {
    // ... 现有字段
    groupName?: string; // 冗余存储，便于快速访问
    activeVariantId?: string; // 组节点：Agent 级默认选中的变体 ID
    isVariant?: boolean; // 变体节点：标记为子变体，不参与独立注入扫描
  };
}
```

### 1.2 `ChatSessionDetail` 扩展

```typescript
// src/tools/llm-chat/types/session.ts

export interface ChatSessionDetail {
  // ...
  /** 会话级变体覆盖：groupId -> selectedVariantId */
  variantOverrides?: Record<string, string>;
}
```

---

## 2. 解析器路由逻辑 (The Resolver)

为了不让“组”的概念污染整个系统，我们需要一个标准的“脱壳”函数。

### 2.1 `resolvePresetMessages` 工具函数

```typescript
// 伪代码实现思路
function resolvePresetMessages(messages: ChatMessageNode[], overrides: Record<string, string> = {}): ChatMessageNode[] {
  const result: ChatMessageNode[] = [];

  // 1. 建立变体映射表 (Variant Map)
  const variantMap = new Map<string, ChatMessageNode>();
  messages.filter((m) => m.metadata?.isVariant).forEach((v) => variantMap.set(v.id, v));

  // 2. 遍历并替换
  messages.forEach((msg) => {
    if (msg.type === "group") {
      // 路由逻辑：会话覆盖 > 组默认 > 第一个子节点
      const selectedId = overrides[msg.id] || msg.metadata?.activeVariantId || msg.childrenIds[0];
      const selectedVariant = variantMap.get(selectedId);

      if (selectedVariant) {
        // 返回一个带有组上下文的副本，方便 UI 追溯
        result.push({
          ...selectedVariant,
          metadata: {
            ...selectedVariant.metadata,
            isPresetDisplay: true,
            parentId: msg.id, // 记录父组 ID，用于 MessageMenubar 识别
            parentIsGroup: true,
          },
        });
      }
    } else if (!msg.metadata?.isVariant) {
      // 普通消息直接加入
      result.push(msg);
    }
  });

  return result;
}
```

---

## 3. UI 交互增强

### 3.1 变体管理器 (`VariantGroupManagerDialog`)

- **左侧列表**：
  - 第一行：显示 `variant.name` (加粗)，如果为空则显示 `变体 #N`。
  - 第二行：显示内容摘要 (灰色小字)。
- **右侧编辑器**：
  - 显式提供“变体名称”输入框。
  - 提供“设为默认”开关。

### 3.2 聊天流切换器 (`MessageMenubar`)

- **解锁条件**：`message.metadata.parentIsGroup === true`。
- **显示增强**：切换箭头的 `1/3` 区域，悬浮时显示当前变体的 `name`。
- **事件**：点击切换时，触发 `switch-variant`，更新会话的 `variantOverrides`。

---

## 4. 实施阶段清单

### 阶段 A：基础重构 (重读 v3 阶段 A)

- [ ] `PresetMessageEditor` 去壳，Props 增加 `hideName` 控制。
- [ ] 新建 `PresetMessageEditorDialog` 保持兼容。

### 阶段 B：解析器路由实现

- [ ] 修改 `chatPathUtils.ts`：实现 `resolvePresetMessages` 逻辑。
- [ ] 修改 `injection-assembler.ts`：调用解析器进行“脱壳”。
- [ ] 修改 `sillyTavernParser.ts`：导入时自动生成 `name` 标签（变体 1, 变体 2...）。

### 阶段 C：变体管理 UI

- [ ] 实现 `VariantGroupManagerDialog`。
- [ ] `AgentPresetEditor` 列表项适配：显示组及其当前选中的变体标签。

### 阶段 D：会话状态与实例化

- [ ] `llmChatStore` 增加 `switchVariant` action。
- [ ] `useChatHandler` 实例化逻辑：确保拷贝的是选中的 Variant 节点，并将其 `isPresetDisplay` 置为 `false`。

---

## 5. 风险控制

- **ID 稳定性**：如果 Agent 重导导致 ID 变化，`variantOverrides` 会失效。
  - **对策**：加载时校验 ID 是否存在，若不存在则回退到默认值并静默清理无效 Key。
- **嵌套限制**：暂时不支持“组中组”。
  - **对策**：UI 层级限制，只允许一级变体。

---

## 6. 结论

v4 方案通过 **“解析器路由”** 解决了架构复杂性问题，通过 **“name 字段标签化”** 解决了用户交互的识别问题。这套方案既能优雅地处理 SillyTavern 的多开局导入，也能支持用户手动构建复杂的逻辑分支，且对现有系统的侵入性降到了最低。
