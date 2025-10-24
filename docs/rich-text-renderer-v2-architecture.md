# 富文本渲染器 V2 架构设计文档

**版本**: 1.0
**状态**: 草案
**作者**: 咕咕

## 1. 背景与目标

### 1.1. 现有架构的问题

当前的富文本渲染器 (`StreamProcessor.ts`) 深度依赖 `markdown-it` 作为核心解析引擎。这种方法导致了以下核心问题：

1.  **黑盒依赖**：`markdown-it` 的内部解析逻辑不透明，我们只能在其外部通过脆弱的启发式规则（如 `MarkdownBoundaryDetector`）来猜测其状态，这在处理复杂的混合内容时非常不可靠。
2.  **控制权倒置**：我们被迫围绕 `markdown-it` 的限制进行“打补丁”，而不是将 `markdown-it` 作为一个可控的工具来使用，导致架构复杂且难以维护。
3.  **无法处理复杂 HTML 嵌套**：基于换行符的块分割策略，无法正确解析内部包含任意换行和 Markdown 内容的复杂 HTML 结构，这是当前架构的根本性缺陷。

### 1.2. V2 架构的目标

新架构的核心目标是**夺回解析逻辑的完全控制权**，实现一个健壮、可扩展、且能无缝处理 Markdown 和 HTML 混合内容的流式渲染引擎。

- **自主可控**：摆脱对 `markdown-it` 作为核心解析器的依赖，自研顶层解析逻辑。
- **结构化解析**：不再将 HTML 视为扁平字符串，而是将其作为一级公民，解析成真正的树形结构。
- **无缝混合**：在统一的 AST 中，实现 HTML 节点与 Markdown 节点的任意嵌套和混合。
- **流式原生**：整个解析流程原生支持流式数据输入和增量更新。

## 2. 核心设计：统一抽象语法树 (AST)

新架构的基石是一个能够统一表示 HTML 和 Markdown 的 AST。为此，我们提议对现有的节点类型 (`types.ts`) 进行升级。

### 2.1. 引入 `GenericHtmlNode`

我们将废弃旧的、存储扁平字符串的 `HtmlBlockNode` 和 `HtmlInlineNode`，引入一个新的、结构化的 `GenericHtmlNode`：

```typescript
// 提议的新节点类型
export interface GenericHtmlNode extends BaseAstNode {
  type: 'generic_html';
  props: {
    tagName: string;              // e.g., 'div', 'p', 'span'
    attributes: Record<string, string>; // e.g., { style: '...', class: '...' }
  };
  children: AstNode[]; // 内部可以包含任何其他 AST 节点！
}
```

此节点将 HTML 元素表示为一个包含标签名、属性和子节点列表的结构化对象，允许其子节点是任何其他类型的 AST 节点，从而实现了混合内容的原生支持。

## 3. 系统架构与数据流

新系统将由一个清晰的、单向数据流管道构成。

### 3.1. 架构图 (Mermaid)

```mermaid
graph TD
    A[原始文本流] --> B{Tokenizer (分词器)};
    B --> C{Parser (解析器)};
    C --> D[统一 AST];
    D --> E{Renderer (渲染器)};
    E --> F[Vue 组件树];

    subgraph CustomParser
        B;
        C;
    end

    subgraph Vue Layer
        E;
        F;
    end

    C -- 可选调用 --> G(markdown-it 实例);
    style G fill:#f9f,stroke:#333,stroke-width:2px

    note right of C: 解析器维护一个上下文栈<br>来处理HTML嵌套。
    note right of G: markdown-it 降级为<br>可选的内联解析工具。
```

### 3.2. 组件职责

1.  **Tokenizer (分词器)**
    - **输入**：原始文本字符串。
    - **输出**：一个令牌（Token）序列。
    - **职责**：通过正则表达式等方式，将文本切割成有明确类型的原子单元，如 `HTML_OPEN_TAG`, `TEXT`, `STRONG_DELIMITER`, `NEWLINE` 等。它不关心语法结构。

2.  **Parser (解析器)**
    - **输入**：令牌序列。
    - **输出**：统一的 AST。
    - **职责**：这是新架构的核心。
        - 维护一个**上下文栈**，用于追踪开放的 HTML 标签，从而正确处理嵌套。
        - 当遇到 `HTML_OPEN_TAG` 时，进入“HTML 模式”，将其后的所有内容（直到匹配的闭合标签）都作为其子节点处理。
        - 在 HTML 节点内部，可以**递归调用**内联解析逻辑来处理 Markdown 语法。
        - **(可选) 调用 `markdown-it`**：对于纯粹的 Markdown 块，可以将其内容传递给一个 `markdown-it` 实例，作为一个高效的内联语法解析工具，然后将其返回的 AST 整合到主 AST 中。

3.  **Renderer (渲染器)**
    - **输入**：统一的 AST。
    - **输出**：最终的用户界面（Vue 组件）。
    - **职责**：遍历 AST，根据每个节点的 `type`，将其映射到对应的 Vue 组件进行渲染。现有的 `AstNodeRenderer.tsx` 是一个很好的基础，只需为其增加对 `GenericHtmlNode` 的支持即可。

## 4. 实施路线图

建议分阶段实施，以确保平稳过渡。

1.  **阶段一：定义基础 (Architect Mode)**
    - [x] 在 `docs` 目录下创建本架构文档。
    - [ ] (待切换至 Code Mode) 修改 `src/tools/rich-text-renderer/types.ts`，添加 `GenericHtmlNode` 定义。
    - [ ] (待切换至 Code Mode) 创建新文件 `src/tools/rich-text-renderer/CustomParser.ts`，搭建基础类结构。

2.  **阶段二：实现解析器 (Code Mode)**
    - [ ] 在 `CustomParser.ts` 中实现 `Tokenizer`，能够识别 HTML 标签和基本 Markdown 定界符。
    - [ ] 在 `CustomParser.ts` 中实现 `Parser` 的核心逻辑，特别是基于上下文栈的 HTML 嵌套处理。

3.  **阶段三：集成与替换 (Code Mode)**
    - [x] 创建一个新的流式处理器 `StreamProcessorV2.ts`，使用 `CustomParser` 作为其核心。
    - [x] 创建 `GenericHtmlNode.vue` 渲染组件。
    - [x] 在 `AstNodeRenderer.tsx` 和 `componentMap` 中添加对 `GenericHtmlNode` 的渲染支持。
    - [x] 在 `RichTextRenderer.vue` 中集成 V2 处理器，支持通过 prop 切换。
    - [x] 在测试页面中添加 V2 解析器切换开关。
    - [x] 添加专门的 V2 解析器测试用例到预设。
    - [ ] 全面测试验证新处理器功能。
    - [ ] （可选）验证所有测试用例通过后，删除旧的 `StreamProcessor.ts` 和相关代码。

## 5. 核心解析器重构计划 (V2.1)

**作者**: 咕咕
**日期**: 2025-10-24

### 5.1. 问题诊断

经过对 `CustomParser.ts` 现有实现的分析，发现其核心问题在于为“顶层内容”和“HTML 标签内部的内容”设计了两套完全不同的解析逻辑，导致行为不一致且无法处理复杂的混合内容。

- **顶层逻辑**: 能正确识别 HTML 标签并进入“HTML 模式”。
- **HTML 内部逻辑 (缺陷)**: 一旦进入 HTML 模式，便将所有非 HTML 内容视为大块纯文本，再交给 `markdown-it` 处理，丢失了 `Tokenizer` 提供的精细结构，违背了 V2 架构的初衷。

### 5.2. 重构目标：统一的递归下降解析模型

为了根除此问题，我们将对 `CustomParser.ts` 进行重构，用一个统一、优雅的**递归下降 (Recursive Descent)** 解析模型取代当前分裂的逻辑。

### 5.3. 具体实施计划

1.  **引入核心递归函数 `parseNodes`**:
    -   创建一个新的私有方法 `private parseNodes(stopCondition: (token: Token) => boolean): AstNode[]`。
    -   此函数将成为解析器的“心脏”，负责消费令牌流并构建节点树。
    -   `stopCondition` 是一个回调函数，用于告知当前解析层级应在何时终止（例如，遇到匹配的 HTML 闭合标签）。

2.  **统一并重构解析逻辑**:
    -   **废弃 `htmlStack`**: 递归调用栈将自然地处理嵌套关系，不再需要手动维护 `htmlStack`。
    -   **移除逻辑分叉**: 移除主处理循环中基于 `htmlStack.length` 的逻辑判断，确保解析器在任何上下文下都遵循同一套规则。
    -   重构 `processChunk` 方法，使其职责简化为填充令牌缓冲区并调用顶层的 `parseNodes`。

3.  **实现递归下降算法**:
    -   **HTML 节点处理**:
        -   当 `parseNodes` 遇到 `html_open` 令牌时，它会：
        1.  创建一个 `GenericHtmlNode`。
        2.  **递归调用** `parseNodes` 来解析其子节点。这次递归调用会传入一个新的 `stopCondition`，例如 `(token) => token.type === 'html_close' && token.tagName === 'div'`。
        3.  将递归调用返回的子节点列表赋值给 `GenericHtmlNode.children`。
    -   **Markdown 节点处理**:
        -   当遇到如 `strong_delimiter` 等成对的 Markdown 标记时，同样通过递归调用 `parseNodes` 并设置相应的停止条件来解析其内部内容。

4.  **简化与清理**:
    -   移除 `parseTokenAsNode`、`createTextNodeWithMarkdown` 等被新逻辑取代的旧辅助函数，保持代码库的整洁。
    -   `markdown-it` 的角色将进一步明确，仅作为处理纯文本内联格式化的工具，而非核心解析流程的一部分。

### 5.4. 预期收益

-   **健壮性**: 解析器将能够正确处理任意深度的 HTML 和 Markdown 混合嵌套。
-   **可维护性**: 单一、统一的解析逻辑更易于理解、调试和扩展。
-   **性能**: 通过一次遍历令牌流来构建完整的 AST，避免了不必要的文本拼接和重复解析，有望提升性能。

## 6. 核心解析器架构修正 (V2.2)

**作者**: 咕咕
**日期**: 2025-10-24

### 6.1. 问题诊断：从“统一”到“分层”

经过对 V2 解析器失败的复盘，我们发现 V2.1 中提出的“统一递归下降模型” (`parseNodes`) 存在根本性架构缺陷。它试图在同一个函数（同一套逻辑）中处理**块级（Block）**和**内联（Inline）**两种完全不同的语法上下文，这导致了状态混乱。

**失败的根源**：解析器没有“块”的概念。它无法区分用于分隔段落的“硬换行”（`\n\n`），和段落内文本的“软换行”。因此，当一个 HTML 块结束后，它没有返回到“顶层块级上下文”，而是错误地认为自己仍处于某个内联上下文中，导致后续所有内容被错误地解析。

### 6.2. 修正方案：引入两级解析架构

为了根除此问题，我们必须引入一个标准的、分层的解析模型，将块级解析和内联解析彻底分离。

```mermaid
graph TD
    A[原始文本流] --> B{Tokenizer};
    
    subgraph CustomParser [CustomParser]
        direction LR
        B -- 令牌流 --> C{parseBlocks};
        C -- 识别出段落/标题等块 --> E[AST 块节点];
        C -- 将块内容令牌交给 --> D{parseInlines};
        D -- 识别出粗体/斜体/链接等 --> E;
        D -- 递归处理内联嵌套 --> D;
    end
    
    E --> F[统一 AST];
    F --> G{Renderer};

    note right of C: 顶层循环，识别块结构<br>如 Paragraph, Heading, List, HTML Block...
    note right of D: 二级循环，在块内部<br>识别内联格式
```

### 6.3. 具体实施计划

1.  **重构 `CustomParser.ts`**:
    *   创建 `private parseBlocks()`: 作为新的顶层解析循环。它的职责是消费令牌流，识别出一个个独立的“块”，并创建对应的块级节点（如 `ParagraphNode`, `HeadingNode`, `GenericHtmlNode` 等）。
    *   改造 `parseNodes` 为 `private parseInlines(tokens: Token[])`: 作为二级解析函数。它接收由 `parseBlocks` 传入的、属于某个块的内部内容令牌，并在这些令牌中解析出内联节点（如 `StrongNode`, `EmNode`, `TextNode`）。

2.  **`parseBlocks` 的工作逻辑**:
    *   它会不断循环，直到令牌耗尽。
    *   在循环中，它会根据当前令牌的类型（如 `heading_marker`, `list_marker`, `html_open`）来决定要解析哪种块。
    *   如果遇到的是普通 `text` 令牌，它会开启一个“段落收集模式”，持续收集令牌，直到遇到一个块级分隔符（如两个以上的换行符）或另一个块的开始。
    *   当它为一个块收集完所有**内容令牌**后，它会调用 `parseInlines(contentTokens)` 来获取子节点，然后将子节点填充到块级节点中。

3.  **`parseInlines` 的工作逻辑**:
    *   这基本就是 V2.1 计划中的 `parseNodes`，但它的工作范围被严格限定在 `parseBlocks` 传给它的令牌子集内。
    *   它使用递归下降来处理 `**...**` 或 `<span>...</span>` 这样的内联嵌套。

### 6.4. 更新实施路线图

对 `阶段二` 进行修正：

2.  **阶段二：实现分层解析器 (Code Mode)**
    - [ ] 在 `CustomParser.ts` 中实现 `Tokenizer`。（已完成大部分）
    - [ ] **(新)** 在 `CustomParser.ts` 中实现顶层的 `parseBlocks()` 方法，用于识别块级结构。
    - [ ] **(新)** 将现有的 `parseNodes` 重构为 `parseInlines(tokens: Token[])`，专门处理内联内容。
    - [ ] 确保 `parseBlocks` 能正确调用 `parseInlines` 并组装完整的 AST。