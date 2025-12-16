# 富文本渲染器 - 可交互按钮功能设计文档

## 1. 需求概述

### 目标

让 LLM 能够在回复中输出可点击的按钮，用户点击后可以执行预定义的操作，例如：

- **插入到输入框**：将按钮内容添加到聊天输入框。
- **直接发送**：将按钮内容作为新消息发送。
- **复制到剪贴板**：将指定内容复制到用户剪贴板。

### 设计原则

1.  **对 LLM 友好** - 语法结构清晰，符合常见 LLM 的工具调用习惯。
2.  **安全性高** - 杜绝任意代码执行，所有动作都在白名单内，由前端控制。
3.  **解析成本低** - 最大化复用现有解析器架构，减少实现复杂度。
4.  **流式兼容** - 支持在流式输出中快速识别和渲染。
5.  **HTML 混排友好** - 能与 `<b>`, `<i>` 等标准 HTML 标签自然融合。

---

## 2. 语法设计

我们采用语义化的 XML/HTML 标签 `<Button>` 作为按钮的语法。这种方案符合 LLM 的工具调用模式，且能无缝融入现有的 HTML 解析流程。

### 2.1 核心语法

| 属性 (Attribute) | 描述                                                 | 示例值                          | 状态 |
| :--------------- | :--------------------------------------------------- | :------------------------------ | :--- |
| `type` (必需)    | 定义点击后的行为。                                   | `send` / `input` / `copy`       | 必需 |
| `value` (可选)   | 实际执行操作的内容。如果缺失，则使用按钮的文本内容。 | "请帮我搜索最新的AI模型"        | 可选 |
| `style` (可选)   | 内联 CSS 样式。当存在时，将完全替换组件的默认样式。  | "background:blue; color:white;" | 可选 |

按钮上显示的文本（Label）直接作为标签的子内容提供。

### 2.2 语法形式

#### 1. 自闭合标签（推荐）

当按钮的显示文本与操作内容一致时，使用自闭合标签，并通过 `value` 属性定义内容。这是最简洁、流式渲染最友好的形式。

```html
<!-- 点击后直接发送 "我同意" -->
<button type="send" value="我同意" />

<!-- 点击后将 "搜索" 插入输入框 -->
<button type="input" value="搜索" />

<!-- 使用内联样式 -->
<button
  type="send"
  value="自定义按钮"
  style="background: #4CAF50; color: white; border-radius: 4px;"
/>
```

#### 2. 包含子内容的标签

当按钮的显示文本与操作内容不一致时，使用完整的开闭合标签。`value` 属性定义操作内容，标签的子文本定义显示内容。

```html
<!-- 按钮显示 "搜索"，点击后将 "请帮我搜索最新的AI模型" 插入输入框 -->
<button type="input" value="请帮我搜索最新的AI模型">搜索</button>
```

如果 `value` 属性被省略，将使用标签的子文本作为操作内容。

```html
<!-- 按钮显示 "同意"，点击后直接发送 "同意" -->
<button type="send">同意</button>
```

### 2.3 语法解析规则

| 语法                                       | 动作 (`action`) | 显示文本 (`label`) | 实际内容 (`content`) |
| :----------------------------------------- | :-------------- | :----------------- | :------------------- |
| `<Button type="send" value="A" />`         | `send`          | A                  | A                    |
| `<Button type="input" value="A" />`        | `input`         | A                  |
| `<Button type="send" value="B">A</Button>` | `send`          | A                  | B                    |
| `<Button type="send">A</Button>`           | `send`          | A                  | A                    |
| `<Button type="input">A</Button>`          | `input`         | A                  | A                    |

### 2.4 为什么选择这个语法

1.  **LLM 友好** - 结构化的 XML 标签非常符合现代 LLM（如 Claude、GPT-4）的工具调用和函数式思维，易于生成和理解。
2.  **实现成本低** - 项目的 `Tokenizer` 已有成熟的 HTML 标签解析能力，包括属性和自闭合标签。我们只需在 `parseInlines` 阶段增加一个针对 `tagName === 'button'` 的分支即可，无需修改词法分析器。
3.  **安全性高** - 动作类型 `type` 被严格限制在前端的白名单内 (`send`, `input`, `copy`)，点击只会触发预定义的 Vue 事件，杜绝了 LLM 注入任意 JavaScript 代码的风险。
4.  **可扩展性强** - 未来若想添加新功能（如“执行工具”、“打开URL”），只需在 `type` 白名单中增加新值，并添加对应的处理逻辑即可。
5.  **流式兼容** - 自闭合语法 `<Button ... />` 在接收到 `/>` 时即可立即渲染，解决了传统 XML 等待闭合标签的延迟问题。

### 2.5 LLM Prompt 示例

```
当你需要为用户提供可交互的选项时，请使用 <Button> 标签。

# 语法规则
- 使用 <Button type="..." value="..." /> 创建一个按钮。
- `type`: 必须是以下之一：
  - `send`: 用户点击后直接发送消息。
  - `input`: 用户点击后将内容插入到输入框。
- `value`: 按钮关联的内容。
- `style` (可选): 为按钮添加内联 CSS 样式。

# 示例
你想了解哪方面的信息？
<Button type="input" value="请介绍一下最新的 Gemini 模型" />
<Button type="input" value="它和 GPT-4o 有什么区别？" />
<Button type="send" value="都不用，谢谢" />
```

---

## 3. 技术实现

### 3.1 新增类型定义

在 [`types.ts`](./types.ts) 中添加 `ActionButtonNode` 并更新 `AstNode` 联合类型。

```typescript
/**
 * 可交互按钮节点
 * 用于渲染用户可点击的动作按钮
 */
export interface ActionButtonNode extends BaseAstNode {
  type: "action_button";
  props: {
    /** 动作类型：'send' 直接发送, 'input' 插入到输入框, 'copy' 复制 */
    action: "send" | "input" | "copy";
    /** 按钮显示文本 */
    label: string;
    /** 点击时的实际内容 */
    content: string;
    /** 内联样式，当存在时，将完全替换组件的默认样式 */
    style?: string;
  };
  children?: never;
}

// 在 AstNode 联合类型中加入 ActionButtonNode
export type AstNode =
  // ... 现有类型
  ActionButtonNode;
```

### 3.2 词法分析器 (`Tokenizer.ts`)

**无需修改**。现有的 `htmlTagRegex` 和 `parseAttributes` 方法已经能正确解析 `<Button ... />` 标签，并生成 `html_open` 类型的 Token。

### 3.3 内联解析器修改

这是核心修改点。在 [`parser/inline/parseInlines.ts`](./parser/inline/parseInlines.ts) 中，对 `html_open` 类型的 Token 进行特殊处理。

```typescript
// 在 parseInlines 方法中，html_open 的处理逻辑内
if (token.type === "html_open") {
  flushText();

  const tagName = token.tagName.toLowerCase(); // 统一转为小写

  // --- 新增逻辑：处理 <Button> 标签 ---
  if (tagName === "button") {
    const action = token.attributes.type as "send" | "input" | "copy" | undefined;

    // 安全性检查：只处理白名单内的 action 类型
    if (action && ["send", "input", "copy"].includes(action)) {
      let label = "";
      let content = token.attributes.value || "";
      const style = token.attributes.style; // 获取 style 属性

      if (token.selfClosing) {
        // 自闭合标签: label 和 content 都来自 value
        label = token.attributes.value || "";
        content = label;
      } else {
        // 非自闭合标签: label 来自子节点，content 来自 value 或子节点
        const innerTokens = collectInnerTokens(tokens, i, tagName);
        const childNodes = ctx.parseInlines(innerTokens);
        label = extractTextFromNodes(childNodes);
        if (!content) {
          content = label;
        }
      }

      nodes.push({
        id: "", // ID 将由上层统一分配
        type: "action_button",
        props: { action, label, content, style }, // 将 style 传递给 props
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      });
      continue; // 处理完毕，继续下一个 token
    }
    // --- 结束新增逻辑 ---
  }

  // ... 原有的通用 HTML 标签处理逻辑 ...
}
```

_（注：`collectInnerTokens` 和 `extractTextFromNodes` 是需要实现的辅助函数）_

### 3.4 Vue 组件实现 (`ActionButtonNode.vue`)

利用简化的服务调用方案，直接与 `LlmChatRegistry` 交互，避免了复杂的事件穿透。

#### 3.4.1 扩展 `LlmChatRegistry`

首先，在 [`src/tools/llm-chat/llmChat.registry.ts`](../llm-chat/llmChat.registry.ts) 中添加 `sendMessage` 方法。

```typescript
// src/tools/llm-chat/llmChat.registry.ts

/**
 * 发送消息（设置内容并触发发送）
 * @param content 要发送的内容
 */
public async sendMessage(content: string): Promise<void> {
  return errorHandler.wrapAsync(
    async () => {
      logger.info('通过 Registry 发送消息', { contentLength: content.length });
      // 设置内容到输入框
      this.inputManager.setContent(content);
      // 触发发送
      const { useLlmChatStore } = await import('./store');
      const store = useLlmChatStore();
      await store.sendMessage(content);
    },
    {
      level: ErrorLevel.ERROR,
      userMessage: '发送消息失败',
      context: { content },
    }
  );
}
```

#### 3.4.2 创建 `ActionButtonNode.vue`

```vue
<script setup lang="ts">
import LlmChatRegistry from "@/tools/llm-chat/llmChat.registry";
import { useClipboard } from "@vueuse/core";

const props = defineProps<{
  nodeId: string;
  label: string;
  content: string;
  action: "send" | "input" | "copy";
  style?: string;
}>();

const llmChatService = new LlmChatRegistry();
const { copy, copied } = useClipboard({ source: props.content });

const handleClick = async () => {
  switch (props.action) {
    case "input":
      llmChatService.addContentToInput(props.content);
      break;
    case "send":
      await llmChatService.sendMessage(props.content);
      break;
    case "copy":
      await copy();
      break;
  }
};

const iconMap = {
  send: "⚡",
  input: "📝",
  copy: "📋",
};

const titleMap = {
  send: "点击直接发送",
  input: "点击插入到输入框",
  copy: "点击复制内容",
};
</script>

<template>
  <button
    :class="{ 'action-button': !props.style, [`action-${props.action}`]: !props.style }"
    :style="props.style"
    :title="titleMap[props.action]"
    @click="handleClick"
  >
    <!-- 如果没有内联样式，使用带图标的默认布局 -->
    <template v-if="!props.style">
      <span class="action-icon">
        <template v-if="props.action === 'copy' && copied">✅</template>
        <template v-else>{{ iconMap[props.action] }}</template>
      </span>
      <span class="action-label">{{ props.label }}</span>
    </template>
    <!-- 如果有内联样式，只显示文本内容，完全由 style 控制外观 -->
    <template v-else>
      {{ props.label }}
    </template>
  </button>
</template>

<style scoped>
.action-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 12px;
  margin: 2px 4px;
  font-size: 13px;
  line-height: 1.4;
  color: var(--primary-color);
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s ease;
  vertical-align: middle;
}
.action-button:hover {
  background: var(--primary-color);
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.3);
}
/* ... 其他样式 ... */
</style>
```

### 3.5 渲染器映射

在 [`components/AstNodeRenderer.tsx`](./components/AstNodeRenderer.tsx) 中注册组件：

```typescript
import ActionButtonNode from "./nodes/ActionButtonNode.vue";

const componentMap: Record<string, any> = {
  // ... 现有映射
  action_button: ActionButtonNode,
};
```

### 3.6 方案优势：服务直连

- **解耦**：`ActionButtonNode` 组件不依赖其父组件，无需通过 `provide/inject` 或层层 `$emit` 来传递事件。
- **高效**：`ActionButtonNode → LlmChatRegistry` 的调用链极短。
- **可维护**：功能内聚在 `ActionButtonNode` 和 `LlmChatRegistry` 中，易于理解和修改。

---

## 4. 安全性考虑

- **内容安全**: 按钮的 `label` 和 `content` 始终作为纯文本处理，不会被当作 HTML 解析，防止 XSS。
- **动作限制**: `type` 属性被严格限制在白名单内，LLM 无法创造新的、不安全的动作。
- **样式隔离**: 按钮使用 scoped CSS，不会污染全局样式。当 LLM 提供 `style` 属性时，其作用域也仅限于该按钮本身。

---

## 5. 实现检查清单

- [ ] 在 `types.ts` 中添加 `ActionButtonNode` 类型定义。
- [ ] 在 `llmChat.registry.ts` 中添加 `sendMessage` 方法。
- [ ] 在 `parser/inline/parseInlines.ts` 中添加对 `<Button>` 标签的解析逻辑。
- [ ] 创建 `components/nodes/ActionButtonNode.vue` 组件。
- [ ] 在 `AstNodeRenderer.tsx` 中注册 `action_button` 组件。
- [ ] 更新 `ARCHITECTURE.md` 文档，说明新增的 `ActionButtonNode`。

---

## 6. 测试用例

```markdown
# 基础自闭合测试

<Button type="input" value="简单按钮" />
<Button type="send" value="发送按钮" />

# 带不同显示文本和内容

<Button type="input" value="这是实际内容">显示文本</Button>
<Button type="send" value="即将发送的内容">快速发送</Button>

# 省略 value，使用子文本作为内容

<Button type="send">直接发送这段文字</Button>

# 带内联样式的按钮

<Button type="send" value="自定义样式" style="background: linear-gradient(to right, #6a11cb, #2575fc); color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer;" />

# 边界情况

<Button type="input" value="包含'引号'和<tag>的文本" />
<Button type="input" value="很长很长很长很长很长很长很长很长的按钮文本" />

# 多个按钮并排

<Button type="input" value="A" /> <Button type="input" value="B" /> <Button type="send" value="C" />

# 在段落中使用

这是一段文字，中间有 <Button type="input" value="一个按钮" /> 可以点击。

# 不应该被解析的情况（错误或非白名单 type）

<Button type="execute" value="danger" />
<button>这是一个标准的HTML按钮</button>
```
