# LLM Chat 上下文管道架构 (Context Pipeline Architecture)

## 1. 设计概述

LLM Chat 的上下文构建采用 **双管道架构 (Dual-Pipeline Architecture)**，将复杂的上下文组装流程清晰地划分为两个阶段：**主上下文管道** 和 **后处理管道**。

这种设计的核心理念是 **"两级火箭"** 模型：

1.  **第一级 - 主上下文管道 (Primary Context Pipeline)**：负责将各种来源的数据（会话历史、预设、注入）通过一系列精密工序组装成初步的上下文消息列表。
2.  **第二级 - 后处理管道 (Post-processing Pipeline)**：对初步上下文进行最终调整（如应用模型特定规则），然后发送给 LLM。

## 2. 架构总览

### 2.1. 数据流向

以下 Mermaid 图展示了从用户输入到最终发送给 LLM 的完整流程（已根据最新实现更新）：

```mermaid
graph TD
    subgraph A [useChatHandler - 指挥中心]
        A1(用户输入) --> A2{宏与附件处理}
        A2 --> A3[创建消息节点]
    end

    subgraph B [useChatExecutor - 执行器]
        B1(调用主上下文管道)
        B_Merge(合并后处理配置)
        B2(调用后处理管道)
    end

    subgraph PrimaryPipeline [主上下文管道]
        direction TB
        P1[1. 会话加载器]
        P2[2. 正则处理器]
        P3[3. Token 限制器]
        P4[4. 注入组装器]
        P1 --> P2 --> P3 --> P4
    end

    subgraph PostPipeline [后处理管道 (可配置)]
        direction TB
        S1[合并 System 消息]
        S2[合并连续角色]
        S3[转换 System 为 User]
        S4[确保角色交替]
        S5[插件扩展点]
        S1 --> S2 --> S3 --> S4 --> S5
    end

    A3 --> B1
    B1 --> PrimaryPipeline
    P4 -- "初步上下文" --> B_Merge
    B_Merge --> B2
    B2 --> PostPipeline
    S5 --> Final((发送至 LLM))

    classDef stage fill:#f9f9f9,stroke:#333,stroke-width:2px;
    class A,B stage;
    style S5 fill:#fff3e0,stroke:#ff6f00
```

### 2.2. 核心概念

| 概念                        | 说明                                                                                                |
| :-------------------------- | :-------------------------------------------------------------------------------------------------- |
| **PipelineContext**         | 在管道中流动的统一数据载体，包含消息列表、元数据和共享黑板                                          |
| **ContextProcessor**        | 负责单一功能的模块化处理单元，可配置、可排序、可启用/禁用。支持通过 `configFields` 自动生成配置界面 |
| **Infrastructure Services** | 如 `MacroProcessor`，作为基础能力被处理器按需调用，而非管道步骤                                     |

## 3. 主上下文管道

主上下文管道负责将原始数据组装成初步的上下文。其内部执行严格遵循以下顺序：

### 3.1. 执行顺序

1.  **加载与转换**：加载会话历史，并将每条消息（含附件）转换为多模态格式。
2.  **正则处理**：**就地修改**消息内容，应用正则替换规则。
3.  **Token 限制**：对历史消息进行截断。**此步骤发生在注入之前**，确保注入内容不会被截断。
4.  **注入与组装**：将 Agent 预设消息分类为骨架、深度注入、锚点注入，然后与截断后的历史消息精密组装。

### 3.2. 内置处理器

| ID                            | 名称         | 职责                                        | 核心算法来源                                     |
| :---------------------------- | :----------- | :------------------------------------------ | :----------------------------------------------- |
| `primary:session-loader`      | 会话加载器   | 加载并转换会话历史为 `ProcessableMessage[]` | `context-utils/builder`                          |
| `primary:regex-processor`     | 正则处理器   | 对历史消息应用正则规则                      | `context-utils/regex`                            |
| `primary:token-limiter`       | Token 限制器 | 根据预算截断历史消息                        | `context-utils/limiter`                          |
| `primary:injection-assembler` | 注入组装器   | 处理预设、注入、宏，并与历史消息组装        | `context-utils/injection`, `context-utils/macro` |

> **设计要点**：宏处理 (`macro`) 不是独立的管道处理器，而是被 `regex-processor` 和 `injection-assembler` 按需调用的基础能力。这确保了宏在正确的上下文中被解析。

## 4. 后处理管道 (已重构)

后处理管道对主管道输出的初步上下文进行最终调整。**该管道已重构为完全可配置的处理器模式**，取代了旧的硬编码逻辑。所有后处理器都作为 `ContextProcessor` 实现，并由 `postProcessingPipelineStore` 统一管理。

### 4.1. 内置处理器

以下是系统内置的核心后处理器，定义于 `core/context-processors/post/builtin-processors.ts`：

| ID                              | 名称                   | 职责                                                                       | 优先级 |
| :------------------------------ | :--------------------- | :------------------------------------------------------------------------- | :----- |
| `post:merge-system-to-head`     | 合并 System 消息到头部 | 将所有 `system` 角色的消息合并为一条，并放在列表最开头。                   | 100    |
| `post:merge-consecutive-roles`  | 合并连续相同角色       | 合并连续出现的相同角色消息（如两个 `user` 消息相邻）。                     | 200    |
| `post:convert-system-to-user`   | 转换 System 为 User    | 将所有 `system` 角色转换为 `user` 角色（用于不支持 `system` 角色的模型）。 | 300    |
| `post:ensure-alternating-roles` | 确保角色交替           | 在 `user` 和 `assistant` 角色之间强制实现严格的交替对话模式。              | 400    |

### 4.2. 插件扩展点

插件可以通过 `postProcessingPipelineStore` 的 `registerProcessor` 方法向后处理管道动态注册新的处理器。

### 4.3. 配置合并策略 (Agent 与模型的协同)

为了兼顾灵活性与一致性，后处理规则的配置采用两级合并策略，遵循 **“Agent 优先，模型兜底”** 的原则。

**关键设计变更：统一配置结构**

为了提供一致的用户体验，**模型层面的后处理配置将升级为与 Agent 层面完全一致的结构**。这意味着：
1.  `LlmModelInfo` 中的 `defaultPostProcessingRules` 将不再是简单的 ID 列表，而是包含完整参数配置的对象数组。
2.  现有的 `PostProcessingPanel.vue` 组件将被重构为通用组件，同时用于 Agent 编辑器和模型编辑器。

**合并逻辑**:

在 `useChatExecutor` 执行后处理管道之前，会进行以下合并：

1.  **加载模型配置**: 获取当前模型定义的默认规则列表（包含参数）。
2.  **加载 Agent 配置**: 获取当前 Agent 定义的规则列表（包含参数）。
3.  **执行合并**:
    - 如果某个规则仅在模型配置中存在，则直接使用模型配置。
    - 如果某个规则仅在 Agent 配置中存在，则直接使用 Agent 配置。
    - 如果某个规则在两者中都存在（ID 相同），则**Agent 配置完全覆盖模型配置**。这是为了确保 Agent 的特定需求（如特定的 Prompt 风格）总是优先于模型的默认行为。

通过这种方式，模型可以携带一套“最佳实践”的默认后处理参数（例如，为某个特定模型预设好最佳的 System 消息转换逻辑），而 Agent 依然拥有最终的决定权。

## 5. 接口定义

### 5.1. PipelineContext

```typescript
import type { ChatSession, UserProfile } from "../types";
import type { ProcessableMessage } from "../types/context";
import type { ModelCapabilities } from "@/types/llm-profiles";

export interface PipelineContext {
  // --- 核心可变数据 ---
  /**
   * 当前正在构建的消息列表。
   * 处理器可以直接修改此数组（增删改）。
   */
  messages: ProcessableMessage[];

  // --- 只读元数据 ---
  readonly session: ChatSession;
  readonly userProfile?: UserProfile;
  readonly agentConfig: any; // 完整的智能体配置
  readonly capabilities?: ModelCapabilities;
  readonly timestamp: number;

  // --- 共享黑板 (Shared Blackboard) ---
  /**
   * 用于处理器之间传递临时数据。
   * 例如：图像分析器提取的描述可以存放在这里，供后续的 Prompt 处理器读取。
   */
  sharedData: Map<string, any>;

  // --- 日志记录 ---
  /**
   * 处理器可以记录处理日志，用于调试和可视化展示。
   */
  logs: Array<{
    processorId: string;
    level: "info" | "warn" | "error";
    message: string;
    details?: any;
  }>;
}
```

### 5.2. ContextProcessor

```typescript
export interface ContextProcessor {
  /** 唯一标识符 (例如: 'primary:regex-processor') */
  id: string;

  /** 显示名称 (例如: '正则处理器') */
  name: string;

  /** 描述信息 */
  description: string;

  /**
   * 执行优先级 (数字越小越靠前)
   * 用于处理器的排序，核心处理器应有固定的优先级。
   */
  priority: number;

  /** 图标 (Lucide 图标名或 URL) */
  icon?: string;

  /** 是否为系统核心处理器 (不可删除，但可能允许禁用) */
  isCore?: boolean;

  /** 默认启用状态 */
  defaultEnabled?: boolean;

  /**
   * 核心执行逻辑
   * @param context 管道上下文
   */
  execute(context: PipelineContext): Promise<void>;

  /**
   * 配置组件 (可选)
   * 如果处理器有自定义配置，可以返回一个 Vue 组件名称
   */
  configComponent?: string;

  /**
   * 配置字段定义 (可选)
   * 用于自动生成简单的配置 UI，无需编写自定义组件
   */
  configFields?: ProcessorConfigField[];
}

export interface ProcessorConfigField {
  key: string;
  label: string;
  type?: "text" | "number" | "boolean" | "select";
  placeholder?: string;
  default?: any;
  options?: { label: string; value: any }[];
}
```

## 6. 存储与状态管理

使用两个独立的 Pinia Store 分别管理两个管道，它们位于 `src/tools/llm-chat/stores/` 目录下：

- **`primaryContextPipelineStore.ts`**：管理主上下文管道的处理器注册、排序、启用/禁用和执行调度。
- **`postProcessingPipelineStore.ts`**：管理后处理管道的处理器注册、排序、启用/禁用和执行调度。

## 7. 实施路线图

### Phase 1: 基础架构

1.  定义 `PipelineContext` 和 `ContextProcessor` 接口。
2.  创建 `usePrimaryContextPipelineStore` 和 `usePostProcessingPipelineStore`。
3.  创建目录结构：
    - `src/tools/llm-chat/core/context-utils/` （核心算法工具函数）
    - `src/tools/llm-chat/core/context-processors/primary/`
    - `src/tools/llm-chat/core/context-processors/post/`

### Phase 2: 核心算法提取

将现有 composables 中的**无状态核心算法**提取到 `context-utils` 目录：

| 原 Composable             | 提取目标                     | 说明                     |
| :------------------------ | :--------------------------- | :----------------------- |
| `useMessageBuilder.ts`    | `context-utils/builder.ts`   | 消息构建与多模态转换算法 |
| `useChatRegexResolver.ts` | `context-utils/regex.ts`     | 正则匹配与替换算法       |
| `useContextLimiter.ts`    | `context-utils/limiter.ts`   | Token 计数与截断算法     |
| `useContextInjection.ts`  | `context-utils/injection.ts` | 注入点计算与消息组装算法 |
| `useMacroProcessor.ts`    | `context-utils/macro.ts`     | 宏解析与替换算法         |

> **设计原则**：`context-utils` 中的函数应为**纯函数**，不依赖 Vue 响应式系统或 Pinia Store。这使得它们易于测试且可在任何上下文中复用。

### Phase 3: 主上下文管道实现

1.  基于 `context-utils` 中的工具函数，实现四个主管道处理器。
2.  重构 `useChatExecutor`，使其直接调用 `primaryPipelineStore.executePipeline`。
3.  **移除 `useChatContextBuilder.ts`**：该文件的职责已被管道机制完全取代。

### Phase 4: 后处理管道实现

1.  **[已完成]** `useMessageProcessor` 的核心逻辑已全部迁移至 `core/context-processors/post/builtin-processors.ts`。
2.  **[已完成]** 已基于迁移的逻辑创建了符合规范的可注册处理器，并建立了注册机制。
3.  **[已完成]** `useChatExecutor` 已调用新的后处理管道，旧模块已被架空。
4.  **[已完成]** 旧的 `useMessageProcessor.ts` 已移除。

### Phase 5: UI 配置界面与组件复用

1.  **[已完成]** 在 **设置 → 聊天设置** 中创建 "主上下文构建" 配置面板。
2.  **[进行中]** 重构 `PostProcessingPanel.vue`，使其与其依赖的数据源解耦，成为一个纯粹的 UI 组件，接受 `rules` 和 `onChange` props。
3.  **[计划中]** 在 `ModelEditDialog.vue` 中集成重构后的 `PostProcessingPanel`，替换原有的简单多选框，实现模型层面后处理规则的可视化配置。
4.  **[计划中]** 更新 `LlmModelInfo` 类型定义，使其 `defaultPostProcessingRules` 字段支持复杂的配置对象结构。

#### 关于“请求后处理” (`ContextPostProcessing`) 的特别说明

与主上下文构建器不同，“请求后处理”步骤（例如合并连续角色、转换 System 消息等）具有**强逻辑关联性**和**固定的执行顺序**，不适合设计为可由用户自由排序的流水线。例如，“合并连续角色”应在“转换 System 为 User”之后执行，以处理可能出现的连续 User 消息。

此外，这些后处理规则通常与特定大语言模型（LLM）的能力高度相关（例如，某些模型不支持 `system` 角色）。因此，将其作为全局配置是不合适的。

**最终设计决策**：将“请求后处理”作为 **Agent** 或 **模型配置** 的一部分是更合理的设计。当前已在 Agent 参数设置中实现 (`src/tools/llm-chat/components/agent/parameters/PostProcessingPanel.vue`)，允许针对每个 Agent 进行独立的后处理配置，这符合预期的使用场景。因此，该功能**不应**在全局设置中创建。

### 架构优化：引入注册机制以提高扩展性

**当前问题**: 目前的后处理逻辑虽然功能正确，但在架构上存在不足。所有的后处理规则都**硬编码**在 `src/tools/llm-chat/composables/useMessageProcessor.ts` 中，通过一个 `switch` 语句进行分发。这导致系统缺乏扩展性，无法动态添加新的后处理规则（例如通过插件系统）。

**优化方向**:

1.  **建立注册机制**: 参照“主上下文构建器”的实现，为“请求后处理器”也建立一个全局的注册表。系统各部分（包括插件）都可以向该注册表注册新的处理器。
2.  **处理器定义**: 每个处理器应包含 `id`, `name`, `description`，以及一个执行函数 `(messages, options) = messages`。
3.  **动态 UI**: `PostProcessingPanel.vue` 组件应进行改造，不再使用静态的 `availableRules` 数组，而是从注册表中动态获取所有可用的后处理器，并渲染成列表。
4.  **保留配置层级**: 改造后，配置界面依然保留在 **Agent** 参数设置中。用户可以在此界面启用/禁用从注册表中获取的处理器，并根据 `priority` 属性进行默认排序，同时允许用户手动拖拽调整顺序（UI 中应提示默认推荐顺序和排序风险）。

通过此项重构，可以在保留 Agent 级别配置灵活性的同时，极大地提升后处理管道的可扩展性和可维护性。

### Phase 6: 插件集成

1.  插件 API 暴露两个注册函数：`registerPrimaryProcessor` 和 `registerPostProcessor`。
2.  支持插件将自定义处理器注入到任一管道的任意位置。

### Phase 7: 清理废弃代码

完成所有迁移后，移除以下已废弃的 composables：

- `useChatContextBuilder.ts` - 职责已被主管道取代
- `useMessageBuilder.ts` - 核心逻辑已迁移至 `context-utils/builder.ts`
- `useChatRegexResolver.ts` - 核心逻辑已迁移至 `context-utils/regex.ts`
- `useContextLimiter.ts` - 核心逻辑已迁移至 `context-utils/limiter.ts`
- `useContextInjection.ts` - 核心逻辑已迁移至 `context-utils/injection.ts`
- `useMacroProcessor.ts` - 核心逻辑已迁移至 `context-utils/macro.ts`
- `useMessageProcessor.ts` - 硬编码逻辑已拆分为独立处理器

## 8. 文件结构规划

```
src/tools/llm-chat/
├── core/
│   ├── context-utils/            # 【新增】核心算法工具函数层
│   │   ├── index.ts              # 统一导出
│   │   ├── builder.ts            # 消息构建算法 (来自 useMessageBuilder)
│   │   ├── regex.ts              # 正则处理算法 (来自 useChatRegexResolver)
│   │   ├── limiter.ts            # Token 截断算法 (来自 useContextLimiter)
│   │   ├── injection.ts          # 注入组装算法 (来自 useContextInjection)
│   │   └── macro.ts              # 宏解析算法 (来自 useMacroProcessor)
│   ├── context-processors/
│   │   ├── primary/
│   │   │   ├── index.ts
│   │   │   ├── session-loader.ts
│   │   │   ├── regex-processor.ts
│   │   │   ├── token-limiter.ts
│   │   │   └── injection-assembler.ts
│   │   └── post/
│   │       ├── index.ts
│   │       └── builtin-processors.ts
├── types/
│   └── pipeline.ts               # PipelineContext, ContextProcessor 接口
├── stores/
│   ├── primaryContextPipelineStore.ts
│   └── postProcessingPipelineStore.ts
└── components/
    └── settings/
        ├── PrimaryPipelineConfig.vue
        └── PostPipelineConfig.vue
```

## 9. 待废弃模块清单

以下 composables 将在重构完成后被移除，其核心逻辑将被迁移到新的架构中：

| 文件                       | 废弃原因                       | 迁移目标                                             |
| :------------------------- | :----------------------------- | :--------------------------------------------------- |
| `useChatContextBuilder.ts` | 职责被管道机制完全取代         | `useChatExecutor` + Pipeline Stores                  |
| `useMessageBuilder.ts`     | 核心算法提取为纯函数           | `core/context-utils/builder.ts`                      |
| `useChatRegexResolver.ts`  | 核心算法提取为纯函数           | `core/context-utils/regex.ts`                        |
| `useContextLimiter.ts`     | 核心算法提取为纯函数           | `core/context-utils/limiter.ts`                      |
| `useContextInjection.ts`   | 核心算法提取为纯函数           | `core/context-utils/injection.ts`                    |
| `useMacroProcessor.ts`     | 核心算法提取为纯函数           | `core/context-utils/macro.ts`                        |
| `useMessageProcessor.ts`   | 硬编码逻辑拆分为可注册的处理器 | `core/context-processors/post/builtin-processors.ts` |

> **注意**：在迁移过程中，应确保所有对这些 composables 的引用都已更新为新的导入路径，避免遗留死代码。

## 10. 施工进度核查 (截至 2025-12-12 12点22分)

根据对 `src/tools/llm-chat/` 目录的文件结构分析，当前重构进度评估如下：

- [x] **Phase 1: 基础架构** - **已完成**
  - [x] `PipelineContext` 和 `ContextProcessor` 接口已定义 (`types/pipeline.ts`)。
  - [x] `usePrimaryContextPipelineStore` 和 `usePostProcessingPipelineStore` 已创建。
  - [x] `context-utils` 和 `context-processors` 目录结构已建立。

- [x] **Phase 2: 核心算法提取** - **已完成**
  - [x] `builder.ts`, `regex.ts`, `limiter.ts`, `injection.ts`, `macro.ts` 均已提取到 `core/context-utils/`。

- [x] **Phase 3: 主上下文管道实现** - **已完成**
  - [x] 四个核心主管道处理器 (`session-loader`, `regex-processor`, `token-limiter`, `injection-assembler`) 已创建。
  - [x] `useChatExecutor` 已完全迁移，其核心函数 `executeRequest` 和 `getContextForPreview` 均已调用新的管道模型。
  - [x] 旧的 `useChatContextBuilder.ts` 已移除。

- [x] **Phase 4: 后处理管道实现** - **已完成**
  - [x] `useMessageProcessor.ts` 的核心逻辑已全部迁移至 `core/context-processors/post/builtin-processors.ts`。
  - [x] 已基于迁移的逻辑创建了符合规范的可注册处理器，并建立了注册机制。
  - [x] `useChatExecutor` 已调用新的后处理管道，旧模块已被架空。
  - [x] 旧的 `useMessageProcessor.ts` 已移除。

- [ ] **Phase 5: UI 配置界面与组件复用** - **进行中**
  - [x] 主管道配置界面 `PrimaryPipelineConfig.vue` 已创建。
  - [x] Agent 级别的后处理配置界面 `PostProcessingPanel.vue` 已创建（待重构为通用组件）。
  - [ ] 模型编辑器中的后处理配置尚未升级为通用组件。

- [ ] **Phase 6: 插件集成** - **未开始**
  - [ ] 尚未提供 `registerPrimaryProcessor` 和 `registerPostProcessor` 的插件 API。

- [x] **Phase 7: 清理废弃代码** - **已完成**
  - [x] `useChatContextBuilder.ts` 已移除。
  - [x] `useMessageBuilder.ts` 已移除。
  - [x] `useChatRegexResolver.ts` 已移除。
  - [x] `useContextLimiter.ts` 已移除。
  - [x] `useContextInjection.ts` 已移除。
  - [x] `useMacroProcessor.ts` 已移除。
  - [x] `useMessageProcessor.ts` 已移除。
  - [x] `useContextPreview.ts` 已移除。

### 总结

项目重构进度约 **90%**。核心架构、模块迁移和废弃代码清理均已完成。目前仅剩插件集成 API 尚未实现。
