# LLM Chat 模块现状分析报告

## 1. 概述

LLM Chat 模块是一个功能完备、架构清晰的对话界面。它采用了 Vue 3 (Composition API)、Pinia 和 TypeScript 构建。其核心设计思想是**状态驱动**与**关注点分离**，将复杂的业务逻辑、数据管理与UI渲染清晰地解耦。

该模块不仅实现了标准的聊天功能，还包含了**对话分支（树形历史）**、**可分离组件（独立窗口）**、**智能体（角色预设）** 和 **思维链展示** 等多项高级特性，整体架构具有出色的可扩展性和可维护性。

## 2. 核心架构分析

模块的架构可以分为三个主要层次：**视图层 (Components)**、**状态管理层 (Pinia Stores)** 和 **逻辑与功能层 (Composables)**。

### 2.1. 视图层 (Components)

视图层负责UI的布局和渲染，组件职责划分明确。

- **`LlmChat.vue`**: 作为模块的根组件，它是一个“布局容器”。负责搭建三栏式界面（左侧边栏、主聊天区、右侧边栏），并处理侧边栏的拖拽和折叠。它本身不包含业务逻辑，而是通过事件将用户操作传递给状态管理层。
- **`ChatArea.vue`**: 核心聊天区的“总成”组件。它组合了 `MessageList` 和 `MessageInput`，并在头部显示当前对话的上下文信息（智能体和模型）。该组件是**窗口分离功能**的关键实现者，能够通过 `useDetachable` composable 将自身“撕下”到独立窗口中，并通过代理与主窗口通信。
- **`MessageList.vue`**: 纯粹的“消息渲染器”。负责将消息数组渲染为对话列表。它支持展示多种消息状态（生成中、错误）、元数据（Token用量）以及一个特色功能——可折叠的**思维链(Reasoning)内容**。
- **侧边栏组件**:
  - `LeftSidebar.vue`: 管理当前会话的智能体切换和参数覆盖。
  - `SessionsSidebar.vue`: 管理所有历史会话的列表，支持创建、切换和删除会话。

### 2.2. 状态管理层 (Pinia Stores)

这是整个模块的“大脑”，负责所有的数据和业务逻辑。

- **`agentStore.ts` (`useAgentStore`)**:
  - **核心概念**: 定义了“智能体”(Agent)——一个可复用的对话角色预设。
  - **职责**: 管理智能体的增删改查。每个智能体封装了模型ID、系统提示词、默认参数等配置。它将角色配置与底层的API密钥解耦，提高了灵活性和复用性。
  - **关键Action**: `getAgentConfig`，用于合并智能体的基础配置和会话的临时覆盖参数，生成最终的API请求配置。

- **`store.ts` (`useLlmChatStore`)**:
  - **核心概念**: 管理具体的“对话”(Session)和消息历史。
  - **职责**:
    1.  **会话管理**: 维护所有 `ChatSession` 的列表，处理会话的创建、切换、删除和更新。
    2.  **消息管理**: 实现了完整的消息生命周期，包括发送、流式接收、中止、重新生成和软删除。
    3.  **API协同**: `sendMessage` action是模块的心脏，它协同 `agentStore` 和 `useLlmRequest` 来完成一次完整的LLM API调用。
  - **核心亮点：树形历史结构**:
    - 消息不以线性数组存储，而是以 `ChatMessageNode` 组成的**树状结构**。每个节点都有父子关系。
    - 这天然地支持了**对话分支**。例如，“重新生成”操作会从父节点创建新的分支，而不是覆盖历史。
    - `currentMessageChain` getter 通过从当前活动叶节点向上回溯，动态生成一个线性的消息链供UI使用，设计非常巧妙。

### 2.3. 逻辑与功能层 (Composables)

通过 Composables 封装可复用的功能逻辑，进一步提升了代码的模块化程度。

- **`useLlmRequest.ts`**: (位于 `@/composables`) 封装了底层的LLM API请求逻辑，处理流式响应和错误。
- **`useDetachable.ts` / `useDetachedManager.ts`**: (位于 `@/composables`) 提供了组件/窗口分离的核心能力。
- **`useDetachedChatArea.ts`**: 专门为 `ChatArea` 组件定制的 composable，作为其在分离状态下的**数据和事件代理**，实现了与主窗口 Pinia store 的跨窗口状态同步。

## 3. 特性亮点总结

- **树形对话历史**: 实现了非破坏性的对话编辑和分支探索，是整个模块最核心的创新点。
- **组件可分离**: `ChatArea` 可以被拖拽到独立窗口中，提供了类似IDE的多窗口体验，极大地提升了灵活性。
- **智能体系统**: 将角色配置与会话分离，鼓励用户创建和复用不同的对话预设，提升了效率。
- **状态驱动架构**: 严格遵循单向数据流，逻辑清晰，易于测试和维护。
- **思维链展示**: 支持在UI上直接查看模型的推理过程，对高级用户和开发者非常友好。

## 4. 架构远景与蓝图

根据项目的设计文档 (`ComfyTavern/DesignDocs`) 和参考资料 (`SillyTavern`, `Cherry Studio`)，LLM Chat 模块的最终目标是成为一个高度可控、可编排的知识构建工具，而非简单的线性聊天记录器。其核心蓝图包括：

- **完全体的树状历史编辑 (`ComfyTavern` 设计)**:
  - 提供一个可视化的图状/树状编辑器（“上帝视角”）。
  - 支持对消息节点进行高级操作，如**剪枝 (Prune)**、**嫁接 (Graft)**、**启用/禁用 (Enable/Disable)** 和 **切换主干 (Switch Trunk)**。
  - 将对话从“消耗品”转变为可重构、可精炼的“知识资产”。

- **SillyTavern 级的高级上下文管理**:
  - 引入类似“世界书”的动态上下文注入机制，根据关键词、规则、定时效果等动态修改Prompt。
  - 实现类似“角色卡”的深度角色定制，包括角色专属的系统提示覆盖和行为指令。

- **Cherry Studio 级的丰富交互体验**:
  - 支持多模态输入（文件、图片粘贴）。
  - 提供强大的消息操作（多选、编辑、重发、分支创建）。
  - 实现快捷命令、模型提及 (`@`) 等高效交互方式。

## 5. 现状与远景的对比分析

综合来看，当前模块的开发阶段可以总结为 **“数据层先行，功能层验证，UI层滞后”**。

- **数据层：高度对齐 (★★★★★)**
  - 核心数据结构 `ChatMessageNode` 和 `ChatSession` (定义于 `types.ts`) 与最终设计蓝图 (`chat-history-branching-design.md`) 中的定义**几乎完全一致**。
  - 包含了 `parentId`, `childrenIds`, `isEnabled` 等关键字段，为所有高级树状编辑功能**预留了坚实的基础**。这是当前实现最大的亮点和优势。

- **逻辑层：初步实现 (★★★☆☆)**
  - `store.ts` 已经实现了基于树状结构的基础逻辑，如通过 `activeLeafId` 切换分支，以及通过 `isEnabled` 标志进行非破坏性操作（用于“重新生成”）。
  - 这可以被视为最终设计方案的一个**最小可行产品 (MVP)**，验证了核心数据流的可行性。
  - 然而，距离设计文档中定义的剪枝、嫁接等高级操作，以及 SillyTavern 级的动态上下文注入逻辑，还有很大差距。

- **UI 与交互层：差距巨大 (★☆☆☆☆)**
  - 这是当前最薄弱的环节。用户完全无法感知到底层的树状结构。
  - **缺失可视化编辑器**：没有图状视图来展示和操作对话分支。
  - **交互功能非常基础**：仅实现了删除、重生成等基本操作，远未达到 Cherry Studio 的丰富度。
  - **缺少高级配置能力**：用户无法像在 SillyTavern 中那样精细地配置角色、世界信息和提示模板。

## 6. 迭代开发路线图建议

基于以上分析，建议后续开发遵循 **“由内而外，先功能后交互”** 的原则，充分利用已有的数据层优势，逐步补齐功能和UI的短板。

- **阶段一：核心体验补完 (基础)**
    1.  **实现消息 Markdown 渲染 (技术选型: `vue-renderer-markdown`)**:
        -   **目标**: 引入 `vue-renderer-markdown` 库，将消息内容从纯文本升级为功能完整的 Markdown 渲染。
        -   **核心价值**: 它的流式渲染、高性能和可扩展性，是后续所有体验优化的基石。
    2.  **实现消息编辑与重发**: 允许用户编辑自己发送的消息，并能触发以新内容重新向模型提问，优化纠错流程。

- **阶段二：线性对话体验深度优化**
    1.  **性能优化 - 无限滚动加载**: 改造消息列表，在主干视图中支持长对话的性能优化，解决初始加载慢和内存占用的问题。
    2.  **效率提升 - 快捷命令与提及**: 实现输入框的 `/` 快捷命令和 `@` 模型提及功能，为高级用户提供更流畅的操作。
    3.  **功能扩展 - 基础多模态输入**: 在输入框区域增加文件/图片上传功能，解锁视觉和RAG能力的基础。
    4.  **上下文管理 - 分割线与多选**: 在线性视图中，实现“新上下文分割线”和消息“多选”功能，以更好地管理长对话。

- **阶段三：可视化树状编辑器 MVP**
    1.  **实现只读视图与分支切换**: 引入图表库（如 `VueFlow`），开发“编辑模式”，将对话渲染成**只读**的树状图。允许用户在图上或通过菜单**切换主干** (`activeLeafId`)。
    2.  **实现基础交互**: 在树状图中，允许用户点击节点执行“启用/禁用” (`isEnabled`) 操作，并将状态变化实时反馈到线性视图中。

- **阶段四：高级编辑与上下文注入**
    1.  **实现高级编辑**: 在可视化编辑器中，实现拖拽式的**剪枝 (Prune)** 和 **嫁接 (Graft)** 操作，完成对话的非线性重构。
    2.  **上下文注入 MVP**: 借鉴 SillyTavern 的“世界书”，实现一个简单的关键词->内容注入功能，并提供插入位置选项。

- **阶段五：生态完善与细节打磨**
    1.  **完善 Agent 系统**: 借鉴 SillyTavern 的“角色卡”，为 `ChatAgent` 增加更多高级配置，如角色专属的提示覆盖、角色笔记等。
    2.  **UI/UX 细节打磨**: 增加消息分组、智能粘贴、可配置的禅模式布局等体验优化功能。

通过以上四个阶段，可以平稳地将 LLM Chat 模块从当前的“有其骨而未有其肉”的状态，逐步构建成一个功能完整、体验出色的高级对话工具。

---

### 附录 - 1 ：

### vue-renderer-markdown

> Vue 3 的高速 Markdown 渲染器，针对大文档、流式内容和实时预览做了深度优化。

## 目录

- [特性亮点](#特性亮点)
- [安装](#安装)
- [快速开始](#快速开始)
- [代码块模式](#代码块模式)
- [TypeScript 使用](#typescript-使用)
- [SSR 指南](#ssr-指南)
- [故障排查](#故障排查)
- [性能优化建议](#性能优化建议)
- [相关链接](#相关链接)
- [许可协议](#许可协议)

## 特性亮点

- ⚡ **极致性能**：渲染和 DOM 更新针对流式内容做了优化
- 🌊 **流式优先**：支持不完整 Markdown、渐进式渲染
- 🧠 **Monaco 增量更新**：大体量代码块也能保持丝滑交互
- 🪄 **Mermaid 渐进式渲染**：语法一旦正确立即展示
- 🧩 **自定义节点组件**：可无缝接入自有 Vue 组件
- 📝 **完整 Markdown 支持**：表格、数学公式、Emoji、复选框等全覆盖
- 🔄 **实时更新**：局部变更不会破坏格式
- 📦 **TypeScript 优先**：提供完整类型提示
- 🔌 **零配置上手**：默认即可用于任意 Vue 3 项目

## 安装

```bash
pnpm add vue-renderer-markdown vue
# 或
npm install vue-renderer-markdown vue
# 或
yarn add vue-renderer-markdown vue
```

### 可选 peer 依赖

如需开启高级功能，可按需安装：

| 依赖             | 版本     | 作用                           | 缺失时退化行为 |
| ---------------- | -------- | ------------------------------ | -------------- |
| `mermaid`        | >=11     | Mermaid 图表                   | 展示源代码     |
| `vue-use-monaco` | >=0.0.33 | Monaco 编辑器                  | 仅显示纯文本   |
| `shiki`          | ^3.13.0  | MarkdownCodeBlockNode 语法高亮 | 仅显示纯文本   |
| `vue-i18n`       | >=9      | 国际化                         | 内置同步翻译器 |

- ⚠️ KaTeX 未随本库打包或自动注入。如需 LaTeX 数学公式渲染，请在宿主应用中安装 `katex` 并手动引入其样式表。示例：

```bash
pnpm add katex
# 或
npm install katex
```

然后在应用入口（例如 `main.ts`）中引入样式：

```ts
import "katex/dist/katex.min.css";
```

- 🖼️ 工具栏图标改用本地 SVG，无需额外图标库

## 快速开始

```vue
<script setup lang="ts">
import MarkdownRender from "vue-renderer-markdown";
import "vue-renderer-markdown/index.css";

const content = `
# Hello Vue Markdown

- 支持列表
- 支持 **加粗** / *斜体*

\`\`\`ts
console.log('流式渲染!')
\`\`\`
`;
</script>

<template>
  <MarkdownRender :content="content" />
</template>
```

### 代码块模式

| 模式        | 组件                    | 适用场景                   | 依赖             |
| ----------- | ----------------------- | -------------------------- | ---------------- |
| 默认 Monaco | `CodeBlockNode`         | 交互、折叠、复制等完整功能 | `vue-use-monaco` |
| Shiki 高亮  | `MarkdownCodeBlockNode` | 轻量展示、SSR 友好         | `shiki`          |
| 纯文本      | `PreCodeNode`           | 最小依赖、AI "思考" 输出   | 无               |

切换示例：

```ts
import { MarkdownCodeBlockNode, setCustomComponents } from "vue-renderer-markdown";

setCustomComponents({
  code_block: MarkdownCodeBlockNode,
});
```

或在实例级启用纯文本：

```vue
<MarkdownRender :content="content" :render-code-blocks-as-pre="true" />
```

## TypeScript 使用

### 渲染类型化 AST

```vue
<script setup lang="ts">
import type { BaseNode } from "vue-renderer-markdown";
import { ref, watchEffect } from "vue";
import MarkdownRender, { parseMarkdownToStructure } from "vue-renderer-markdown";

const content = ref<string>("# Demo\n\n- 列表项\n");
const nodes = ref<BaseNode[]>([]);

watchEffect(() => {
  nodes.value = parseMarkdownToStructure(content.value);
});
</script>

<template>
  <MarkdownRender :nodes="nodes" />
</template>
```

### 自定义组件时的类型提示

```vue
<!-- components/CustomCodeBlock.vue -->
<script setup lang="ts">
import type { CodeBlockNode } from "vue-renderer-markdown";

const props = defineProps<{ node: CodeBlockNode }>();
</script>

<template>
  <pre class="custom-code">
    <code :data-lang="props.node.language">{{ props.node.code }}</code>
  </pre>
</template>
```

```ts
// main.ts
import { createApp } from "vue";
import { setCustomComponents, VueRendererMarkdown } from "vue-renderer-markdown";
import App from "./App.vue";
import CustomCodeBlock from "./components/CustomCodeBlock.vue";

const app = createApp(App);

setCustomComponents("docs", {
  code_block: CustomCodeBlock,
});

app.use(VueRendererMarkdown, {
  mathOptions: {
    commands: ["infty", "perp", "alpha"],
    escapeExclamation: true,
  },
  getLanguageIcon(lang) {
    return lang === "shell" ? "<span>sh</span>" : undefined;
  },
});

app.mount("#app");
```

### NodeRenderer 属性：`parseOptions`

`<MarkdownRender />`（组件内部名为 `NodeRenderer`）现已支持一个新的 `parseOptions` 属性。当你通过 `content` 传入 Markdown 字符串并让组件内部解析时，`parseOptions` 会被转发给内部的 `parseMarkdownToStructure`，从而允许你在解析前/后对 token 或节点做自定义转换，而不需要手动调用解析函数。

类型说明（库中已导出）：

- `preTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — 在 `markdown-it` 生成 token 之后、库处理之前调用。用于重写或替换 tokens。
- `postTransformTokens?: (tokens: MarkdownToken[]) => MarkdownToken[]` — 在库做内部 token 修复之后调用；如果你返回了新的 token 数组，库会重新将其处理为节点。
- `postTransformNodes?: (nodes: ParsedNode[]) => ParsedNode[]` — 直接在解析出的节点树上操作，常用于调整最终输出，是最简单高效的方式之一。

使用场景：当你需要支持自定义语法（例如把特定 HTML 块映射为自定义节点类型）或做轻量级的 token 修改以支持自定义组件渲染时，`parseOptions` 非常有用。配合 `setCustomComponents`（或实例级的 `custom-id` 机制）可将自定义节点类型映射为 Vue 组件。

Token 级示例（作为组件 prop 传入）：

```vue
<script setup lang="ts">
import MarkdownRender, { getMarkdown } from "vue-renderer-markdown";

const md = getMarkdown();

function pre(tokens: any[]) {
  return tokens.map((t) => {
    if (t.type === "html_block" && /<thinking>/.test(t.content || "")) {
      return {
        ...t,
        type: "thinking_block",
        content: (t.content || "").replace(/<\/?thinking>/g, ""),
      };
    }
    return t;
  });
}

const parseOptions = { preTransformTokens: pre };
</script>

<template>
  <MarkdownRender
    :content="markdownString"
    :parse-options="parseOptions"
    custom-id="playground-demo"
  />
</template>
```

节点级示例（postTransformNodes 作为组件 prop）：

```vue
<script setup lang="ts">
import MarkdownRender from "vue-renderer-markdown";

function postNodes(nodes) {
  if (!nodes || nodes.length === 0) return nodes;
  const first = nodes[0];
  if (first.type === "paragraph") {
    return [{ type: "thinking", content: "Auto-thought", children: [first] }, ...nodes.slice(1)];
  }
  return nodes;
}

const parseOptions = { postTransformNodes: postNodes };
</script>

<template>
  <MarkdownRender :content="markdownString" :parse-options="parseOptions" />
</template>
```

注意：

- 如果你已经自己调用 `parseMarkdownToStructure` 并将 `nodes` 直接传给组件，则 `parseOptions` 不会生效——它仅在组件接收 `content` 并在内部解析时被使用。
- 当你通过 token 转换生成新的自定义节点类型时，请用 `setCustomComponents('your-id', { your_node_type: YourComponent })` 注册对应的 Vue 组件，并给组件传入 `custom-id="your-id"`，以便渲染器能找到并渲染你的组件。

## SSR 指南

本库设计为 SSR 安全，重型依赖（Monaco、Mermaid）仅在浏览器端懒加载，浏览器相关功能会自动跳过服务端渲染。

- Nuxt 3：使用 `<client-only>` 包裹组件
  ```vue
  <template>
    <client-only>
      <MarkdownRender :content="markdown" />
    </client-only>
  </template>
  ```
- Vite SSR / 自定义 SSR：在 `onMounted` 后再渲染组件

  ```vue
  <script setup lang="ts">
  import { onMounted, ref } from "vue";
  import MarkdownRender from "vue-renderer-markdown";

  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });
  </script>

  <template>
    <div v-if="mounted">
      <MarkdownRender :content="markdown" />
    </div>
    <div v-else>
      <!-- SSR 回退：轻量预格式化文本 -->
      <pre>{{ markdown }}</pre>
    </div>
  </template>
  ```

- 运行 `pnpm run check:ssr` 可验证导入安全
- 需要服务器预渲染的图表或代码，可先生成静态 HTML 后传入

更多示例详见 [docs/nuxt-ssr.zh-CN.md](docs/nuxt-ssr.zh-CN.md)。

## 故障排查

### Monaco worker 加载失败

**现象**：生产环境或预览时控制台报错 `Could not load worker`、`Failed to load Monaco worker`。

**解决方案**：在 Vite 配置中启用 `vite-plugin-monaco-editor-esm` 并指定 worker 输出目录。

```ts
// vite.config.ts
import path from "node:path";
import monacoEditorPlugin from "vite-plugin-monaco-editor-esm";

export default {
  plugins: [
    monacoEditorPlugin({
      languageWorkers: ["editorWorkerService", "typescript", "css", "html", "json"],
      customDistPath(root, buildOutDir, base) {
        return path.resolve(buildOutDir, "monacoeditorwork");
      },
    }),
  ],
};
```

> 注意：如仅需渲染 Monaco 编辑器（用于代码编辑或预览），可直接集成 `vue-use-monaco`，无需本库的完整 Markdown 渲染管线。

### Mermaid 不渲染

**现象**：标记为 ` ```mermaid` 的代码块仍然显示原始文本。

**排查步骤**：

1. 确认已经安装依赖：
   ```bash
   pnpm add mermaid
   ```
2. 校验代码块语法是否为有效 Mermaid：
   ````markdown
   ```mermaid
   graph TD
     A[Start] --> B[End]
   ```
   ````
   ```

   ```
3. 打开控制台查看 Mermaid 抛出的错误，库会在渲染失败时自动回退到源码展示。

### 语法高亮无效

**现象**：使用 `MarkdownCodeBlockNode` 时代码块仅显示纯文本。

**解决方案**：安装 `shiki` 依赖：

```bash
pnpm add shiki
```

并确保在渲染器中启用了该组件：

```ts
import { MarkdownCodeBlockNode, setCustomComponents } from "vue-renderer-markdown";

setCustomComponents({
  code_block: MarkdownCodeBlockNode,
});
```

### TypeScript 提示缺失

**现象**：项目中报错 `Cannot find module 'vue-renderer-markdown'` 或类型提示缺失。

**排查步骤**：

1. 从包入口导入类型：
   ```ts
   import type { BaseNode, CodeBlockNode } from "vue-renderer-markdown";
   ```
2. 如需更细致的类型定义：
   ```ts
   import type { MarkdownRenderProps } from "vue-renderer-markdown/dist/types";
   ```
3. 在 `tsconfig.json` 中开启 `"moduleResolution": "bundler"` 或 `"node16"`：
   ```json
   {
     "compilerOptions": {
       "moduleResolution": "bundler"
     }
   }
   ```

### SSR 报 `window is not defined`

**原因**：Monaco、Mermaid、Web Worker 等功能依赖浏览器环境，需要延迟到客户端执行。

- **Nuxt 3**：
  ```vue
  <template>
    <client-only>
      <MarkdownRender :content="markdown" />
    </client-only>
  </template>
  ```
- **自定义 Vite SSR**：

  ```vue
  <script setup lang="ts">
  import { onMounted, ref } from "vue";
  import MarkdownRender from "vue-renderer-markdown";

  const mounted = ref(false);
  onMounted(() => {
    mounted.value = true;
  });
  </script>

  <template>
    <MarkdownRender v-if="mounted" :content="markdown" />
  </template>
  ```

### Tailwind 样式冲突

**现象**：库的样式被 Tailwind 或其他组件库覆盖。

**解决方案**：将库样式导入 Tailwind 的 `components` 层，确保加载顺序可控。

```css
/* main.css 或 index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  @import "vue-renderer-markdown/index.css";
}
```

如需更高优先级，可放入 `base` 层：

```css
@layer base {
  @import "vue-renderer-markdown/index.css";
}
```

### 图标未显示

**现象**：复制、折叠等工具栏按钮显示为文本或占位符。

**解决方案**：

1. 确认已经引入库的样式文件（`import 'vue-renderer-markdown/index.css'`）。
2. 检查构建工具是否允许从依赖中导入静态资源（SVG）。
3. 如已自定义图标组件，请确保它们渲染了预期的 SVG 内容。

## 性能优化建议

- 将大型 Markdown 文档拆分为小块流式写入，避免一次性渲染阻塞主线程。
- 仅展示时使用 `MarkdownCodeBlockNode` 或 `render-code-blocks-as-pre`，可跳过 Monaco 初始化。
- 使用 `setCustomComponents('id', mapping)` 为不同渲染实例分别注册组件，并在不再需要时移除，减少内存占用。
- 在应用启动时调用 `setDefaultMathOptions`，统一数学公式配置，防止在渲染期间重复计算。
- 对复杂 Mermaid 图表可提前在服务端校验或预渲染，再将结果作为缓存内容传给组件。
- Math 渲染错误时，可通过 `setDefaultMathOptions` 调整需要自动补全反斜杠的指令集合。若需在服务端生成或缓存 KaTeX 输出，请确保宿主应用已安装 `katex` 并将其包含在构建中。

## 新增属性：`viewportPriority`

- 类型：`boolean`
- 默认值：`true`

说明：

- 开启（默认）时，渲染器会优先渲染视口内或接近视口的节点，将离屏的重型节点（如 Mermaid、Monaco）延后处理，从而提升长文档与流式内容的首屏可交互体验。
- 关闭（设为 `false`）时，所有节点将尽快“急切”渲染，适合打印/导出、需要一次性完成布局测量的场景，或你明确希望立即呈现全部内容的情况。

示例：

```vue
<script setup lang="ts">
import MarkdownRender from "vue-renderer-markdown";

const markdown = `# 包含大量图表与代码块的长文档...`;
</script>

<template>
  <!-- 准备打印或导出时可关闭视口优先 -->
  <MarkdownRender :content="markdown" :viewport-priority="false" />
  <!-- 在模板中使用短横线写法：viewport-priority；不传时为默认开启 -->
</template>
```

## 国际化 / 备用翻译

如不想安装或使用 `vue-i18n`，本库内置了一个同步备用翻译器，覆盖常见 UI 文案（复制、预览、图片加载等）。可在应用启动时通过 `setDefaultI18nMap` 替换默认英文翻译：

```ts
import { setDefaultI18nMap } from "vue-renderer-markdown";

setDefaultI18nMap({
  "common.copy": "复制",
  "common.copySuccess": "已复制",
  "common.decrease": "减少",
  "common.reset": "重置",
  "common.increase": "增加",
  "common.expand": "展开",
  "common.collapse": "折叠",
  "common.preview": "预览",
  "image.loadError": "图片加载失败",
  "image.loading": "正在加载图片...",
});
```

如安装并配置了 `vue-i18n`，库会优先使用其翻译。

## 相关链接

- Streaming Playground：https://vue-markdown-renderer.simonhe.me/
- 传统渲染对比示例：https://vue-markdown-renderer.simonhe.me/markdown
- 文档：[docs/](docs/)
- Issue 反馈：https://github.com/Simon-He95/vue-markdown-render/issues

## 许可协议

[MIT](./LICENSE)

---

报告生成时间: 2025-10-20
