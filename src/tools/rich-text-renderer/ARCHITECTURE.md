# 富文本渲染引擎架构文档

## 1. 项目概述

**Rich Text Renderer** 是一个专为 LLM（大语言模型）流式输出场景设计的高性能富文本渲染引擎。它旨在解决传统 Markdown 渲染器在处理流式数据时常见的闪烁、性能瓶颈以及对复杂结构（如嵌套 HTML、自定义思考标签）支持不足的问题。

### 核心目标

- **流式友好**: 采用增量解析和更新策略，实现打字机般的流畅体验。
- **零闪烁**: 通过精细的 Diff 算法和 Patch 系统，仅更新变化的部分，避免全量重绘。
- **复杂结构支持**: 深度支持 HTML 与 Markdown 混合排版、代码块、数学公式、Mermaid 图表以及 LLM 特有的 `<think>` 思考过程。
- **可扩展性**: 基于统一的 AST 设计，易于扩展新的节点类型和渲染规则。

## 2. 系统架构

系统采用分层架构设计，数据单向流动。

```mermaid
graph TD
    Input[输入源 (Stream/Static)] --> Processor[流式处理器 (Processor Layer)]
    
    subgraph "Processor Layer"
        Detector[边界检测器 (Boundary Detector)]
        Parser[解析器 (Parser V1/V2)]
        Differ[Diff 引擎]
    end
    
    Processor -->|Patches| State[状态管理 (State Layer)]
    
    subgraph "State Layer"
        Store[AST Store (useMarkdownAst)]
        Queue[Patch Queue]
    end
    
    State -->|Reactive AST| View[视图层 (View Layer)]
    
    subgraph "View Layer"
        Root[RichTextRenderer]
        NodeRenderer[AstNodeRenderer (递归组件)]
        Components[具体节点组件 (CodeBlock, Table...)]
    end
```

### 2.1 核心模块

1.  **Processor Layer (处理层)**
    *   **职责**: 接收文本流，解析为 AST，计算变更并生成 Patch 指令。
    *   **核心组件**:
        *   `StreamProcessor` (V1): 基于 `markdown-it`，利用边界检测实现块级增量更新。
        *   `StreamProcessorV2` (V2): 基于自研 `CustomParser`，支持更复杂的 HTML 嵌套和自定义标签。
        *   `MarkdownBoundaryDetector`: 智能识别文本中的"安全断点"（Stable Boundary），将文本流划分为**稳定区 (Stable)** 和 **待定区 (Pending)**。

2.  **State Layer (状态层)**
    *   **职责**: 维护当前的 AST 结构，应用 Patch 指令更新状态。
    *   **核心组件**:
        *   `useMarkdownAst`: Vue Composable，提供 AST 的响应式状态和 Patch 应用逻辑（如 `text-append`, `replace-node`, `insert-after`）。

3.  **View Layer (视图层)**
    *   **职责**: 将 AST 渲染为 Vue 组件树。
    *   **核心组件**:
        *   `AstNodeRenderer`: 基于 JSX 的递归渲染组件，根据节点类型分发到具体的 Vue 组件。
        *   **节点组件**: `CodeBlockNode`, `MermaidInteractiveViewer`, `KatexRenderer`, `LlmThinkNode` 等。

## 3. 核心机制

### 3.1 稳定区与待定区 (Stable vs Pending)

为了解决流式渲染中的语法不完整问题（如未闭合的代码块），引擎引入了**双区域策略**：

- **稳定区 (Stable Region)**:
    - 内容已确认为语法完整，不会再发生语义变化。
    - 策略：**增量 Diff**。只对新增部分进行解析和比对，生成 Patch。
    - 优势：性能极高，随着文本增长，解析开销不随之线性增长。

- **待定区 (Pending Region)**:
    - 位于文本流末尾，可能包含未闭合的标签或标记。
    - 策略：**全量重解析**。每次有新 Chunk 到达时，重新解析整个待定区。
    - 优势：确保未完成的语法能被临时正确处理（如显示为普通文本或临时状态），一旦闭合立即转为稳定状态。

### 3.2 自研解析器 (CustomParser - V2)

为了克服 `markdown-it` 在处理 HTML 嵌套和自定义标签时的局限性，V2 版本引入了自研的 `CustomParser`。

- **两级解析**: 先进行块级解析 (Block Parsing)，再进行内联解析 (Inline Parsing)。
- **HTML 深度支持**: 将 HTML 标签视为一等公民，支持任意深度的 HTML 与 Markdown 混合嵌套。
- **LLM 思考块**: 原生支持 `<think>`、`<guguthink>` 等自定义标签，将其解析为结构化的 `LlmThinkNode`，支持折叠交互和流式动画。

### 3.3 Patch 系统

视图更新完全由 Patch 指令驱动，支持以下操作：

| 操作 (Op) | 描述 | 场景 |
| :--- | :--- | :--- |
| `text-append` | 向文本节点追加内容 | 打字机效果 |
| `replace-node` | 替换整个节点 | 节点状态/类型变更 |
| `insert-after` | 在指定节点后插入新节点 | 新段落/块生成 |
| `remove-node` | 删除节点 | 待定区重组 |
| `set-prop` | 更新节点属性 | 属性变化 |
| `replace-root` | 替换根节点 | 初始化或全量重置 |

## 4. 目录结构说明

```
src/tools/rich-text-renderer/
├── components/             # 视图层组件
│   ├── nodes/              # 具体 AST 节点的 Vue 组件实现
│   ├── AstNodeRenderer.tsx # 核心递归渲染器
│   ├── KatexRenderer.vue   # 数学公式渲染
│   └── ...
├── composables/            # 组合式函数
│   └── useMarkdownAst.ts   # AST 状态管理与 Patch 逻辑
├── CustomParser.ts         # V2 自研解析器核心逻辑
├── StreamProcessor.ts      # V1 处理器 (基于 markdown-it)
├── StreamProcessorV2.ts    # V2 处理器 (基于 CustomParser)
├── types.ts                # 核心类型定义 (AST, Patch, Config)
├── store.ts                # 全局配置状态 (Pinia)
├── RichTextRenderer.vue    # 统一入口组件
└── RichTextRendererTester.vue # 交互式测试工具
```

## 5. 扩展性设计

### 5.1 添加新节点类型

1.  在 `types.ts` 中定义新的节点接口（继承 `BaseAstNode`）。
2.  在 `CustomParser.ts` (V2) 或 `StreamProcessor.ts` (V1) 中添加解析逻辑。
3.  在 `AstNodeRenderer.tsx` 中注册新的节点类型与 Vue 组件的映射。
4.  在 `components/nodes/` 下实现具体的 Vue 组件。

### 5.2 自定义 LLM 思考标签

通过 `store.ts` 中的 `llmThinkRules` 配置，可以动态添加新的思考标签规则：

```typescript
{
  id: 'deepseek-reasoning',
  kind: 'xml_tag',
  tagName: 'reasoning',
  displayName: '深度推理',
  collapsedByDefault: false
}
```

引擎会自动识别这些标签并将其渲染为可交互的思考块组件。