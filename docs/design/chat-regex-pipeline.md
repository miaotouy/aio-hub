# Chat 正则管道系统设计文档 (Chat Regex Pipeline System)

## 1. 概述 (Overview)

本设计旨在为 `llm-chat` 工具引入类似“酒馆 (SillyTavern)”的正则脚本能力。通过支持 **Input (Prompt)** 和 **Output (Render)** 两个方向的正则处理管道，实现对对话内容的动态清洗、格式转换和角色扮演增强。

核心目标：

1.  **渲染层支持**: `RichTextRenderer` 原生支持正则替换，实现“流式内容的实时处理”。
2.  **三层配置体系**: 支持 **Global (全局)**、**User (用户)**、**Agent (智能体)** 三层配置叠加，满足不同维度的需求。
3.  **严格顺序控制**: 规则集（Rule Sets）和规则（Rules）必须支持严格的顺序编排，确保处理逻辑的可预测性。
4.  **统一管道架构**: 将正则处理作为标准环节集成到现有的消息处理管道 (`useMessageProcessor`) 中，避免逻辑碎片化。

---

## 2. 核心概念 (Core Concepts)

### 2.1 数据结构

#### `RegexRule` (正则规则)

定义单个正则替换规则的标准结构。

```typescript
interface RegexRule {
  id: string; // 唯一标识
  enabled: boolean; // 开关
  name: string; // 规则名称
  regex: string; // 正则表达式字符串
  replacement: string; // 替换内容 (支持 $1, $2 等捕获组)
  flags?: string; // 正则标志 (g, i, m 等，默认为 gm)
  order?: number; // 排序权重 (可选，UI 拖拽排序使用)
  testCase?: string; // 测试用例 (可选，用于测试规则效果)
}
```

#### `RegexRuleSet` (正则规则集)

定义一组相关的规则，支持整组开关。

```typescript
interface RegexRuleSet {
  id: string;
  name: string; // 规则集名称 (如 "Markdown清洗", "角色修正")
  enabled: boolean; // 整组开关
  rules: RegexRule[]; // 规则列表 (有序)
  description?: string; // 描述
}
```

#### `RegexPipelineConfig` (管道配置)

集成在 Global, Agent, UserProfile 中的通用配置结构。

```typescript
interface RegexPipelineConfig {
  output: RegexRuleSet[]; // 输出管道：处理模型返回的内容，用于显示
  input: RegexRuleSet[]; // 输入管道：处理发送给模型的 Prompt
}
```

### 2.2 三层配置架构 (Three-Layer Architecture)

系统支持三个层级的配置，优先级和作用范围不同：

1.  **Global (全局设置)**
    - **位置**: `ChatSettings.regexConfig` (in `useChatSettings`)
    - **作用**: 系统级通用处理，如通用的 Markdown 格式修复、敏感词过滤等。
    - **生效范围**: 所有会话。

2.  **User (用户档案)**
    - **位置**: `UserProfile.regexConfig`
    - **行为控制**: `regexPipelineBehavior` ("merge" | "replace")
    - **作用**: 用户个人偏好，如特定的称呼替换、阅读习惯调整。
    - **生效范围**: **按节点生效**。仅作用于关联了该用户档案的消息节点（通常是 Role 为 `user` 的节点，通过 `metadata.userProfileId` 关联）。

3.  **Agent (智能体)**
    - **位置**: `ChatAgent.regexConfig`
    - **作用**: 角色扮演特性增强，如解析特定的 XML 标签、角色口癖修正。
    - **生效范围**: **按节点生效**。仅作用于关联了该智能体的消息节点（通常是 Role 为 `assistant` 的节点，通过 `metadata.agentId` 关联）。

### 2.3 处理流程 (Pipeline Flow)

#### **Output Pipeline (显示层)**

处理消息节点的文本内容，用于渲染显示。**规则的应用是基于节点的，而非基于当前会话状态。**

- **执行逻辑**:
  1.  **确定上下文**: 渲染器获取当前消息节点的 `metadata` 以及**当前会话激活的智能体 (Current Active Agent)**。
  2.  **获取规则**:
      - **Self Rules (自身规则)**:
        - 如果是 Assistant 节点，加载 `metadata.agentId` 对应 Agent 的 Output 规则。
        - 如果是 User 节点，加载 `metadata.userProfileId` 对应 UserProfile 的 Output 规则。
      - **Context Rules (上下文规则)**:
        - 获取 **Current Active Agent** 的 Output 规则（用于 User 消息的动态渲染）。
  3.  **组合规则**:
      - **Assistant 角色**: 应用 `[Self Rules (Agent)] -> [Global Output Rules]`。
        - _保持历史一致性，Assistant 的消息由生成它的 Agent 负责解释。_
      - **User 角色**: 根据 UserProfile 的 `regexPipelineBehavior` 决定:
        - **Merge (默认)**: 应用 `[Self Rules (User)] -> [Context Rules (Current Agent)] -> [Global Output Rules]`。
        - **Replace**: 应用 `[Context Rules (Current Agent)] -> [Global Output Rules]` (完全由当前 Agent 视角解释用户的话)。
        - **Ignore**: 应用 `[Self Rules (User)] -> [Global Output Rules]` (仅保留用户自己的习惯)。
  - _注: User 消息引入 Current Agent 规则，是为了实现“状态切换”的动态效果（如切换到“猫娘”模式后，用户历史消息中的特定词汇也被动态修饰）。_

#### **Input Pipeline (提示词层)**

处理发送给模型的 Prompt 消息列表。**同样基于消息节点本身的来源应用规则。**

- **执行位置**: 集成在 `useMessageProcessor` 的统一管道中。
- **处理对象**: 遍历 `messages` 数组，对每条消息独立计算规则并处理。
- **执行逻辑**:
  1.  **Global Rules**: 所有消息首先应用全局 Input 规则（通用清洗）。
  2.  **Node Specific Rules**:
      - 对于 **User** 消息: 追加应用该消息所属 UserProfile 的 Input 规则。
      - 对于 **Assistant** 消息: 追加应用该消息所属 Agent 的 Input 规则。
- **最终顺序**: `[Global] -> [Node Specific]`

---

## 3. 详细设计 (Detailed Design)

### 3.1 基础设施 (Infrastructure)

**新增文件**: `src/utils/regexUtils.ts`

**功能**:

- `applyRegexRules(text, rules)`: 核心处理函数。
- `resolveRulesForNode(nodeMetadata, globalConfig, userConfig, agentConfig, direction)`:
  - 根据节点元数据 (`agentId`, `userProfileId`) 动态计算该节点应应用的规则列表。
  - `direction`: 'input' | 'output'
- `exportRegexConfig(config)` / `importRegexConfig(json)`: 支持配置的导入导出。

### 3.2 数据层扩展 (Data Layer)

**修改文件**:

- `src/tools/llm-chat/types.ts`: 扩展 `ChatAgent` 和 `UserProfile`。
- `src/tools/llm-chat/composables/useChatSettings.ts`: 扩展 `ChatSettings`。

```typescript
// UserProfile
export interface UserProfile {
  // ...
  regexConfig?: RegexPipelineConfig;
  regexPipelineBehavior?: "merge" | "replace";
}
```

### 3.3 UI 配置层 (Configuration UI)

**新增组件**: `src/tools/llm-chat/components/common/RegexRulesEditor.vue`

- **功能**: 通用的规则集编辑器，支持拖拽排序、测试、导入导出。

**集成点**:

1.  **Agent**: `EditAgentDialog.vue`
2.  **User**: `UserProfileForm.vue`
3.  **Global**: `ChatSettingsDialog.vue`

#### UI 组件设计细节

**1. `RegexPipelinePanel` (管道编辑器)**

- **复用策略**: 借鉴 `RegexApplier` 中 `VueDraggableNext` 的核心逻辑，复用其拖拽排序、事件处理机制。
- **UI 改进**:
  - 弃用 `RegexApplier` 的简单 Tag 样式。
  - 采用 **垂直卡片列表 (Vertical Card List)** 布局，更符合“管道流”的视觉隐喻。
  - 每个卡片包含：
    - **拖拽手柄**: 明确的排序交互区域。
    - **基本信息**: 名称、描述、规则数量统计。
    - **快捷操作**: 启用/禁用开关 (Switch)、编辑按钮 (Edit)、删除按钮 (Delete)。

**2. `RegexRuleSetEditor` (规则集编辑器)**

- **复用策略**: 深度复用 `PresetManager.vue` 的左右分栏布局。
  - **左侧**: 规则列表，支持拖拽排序。
  - **右侧**: 规则详情编辑 + 实时测试预览。
- **功能增强**:
  - 增加“快捷规则模板” (Quick Patterns)，如一键插入“移除 Markdown 图片”、“匹配 XML 标签”等常用正则。

### 3.4 渲染层改造 (Output Pipeline)

**修改文件**: `src/tools/rich-text-renderer/RichTextRenderer.vue`

**逻辑**:

- 接收 `regexPipelines` prop (扁平化后的规则列表)。
- `ChatMessage.vue` (父组件) 负责根据当前消息节点的 metadata (`agentId` / `userProfileId`)，调用 `resolveRulesForNode` 计算出对应的规则列表，并传递给 `RichTextRenderer`。
- 在渲染管线的最前端应用正则替换。

### 3.5 消息处理层改造 (Input Pipeline)

**核心思想**: 将 Input Regex Pipeline 提升为 `useMessageProcessor` 的核心能力之一，且支持**按节点动态获取规则**。

**修改文件**: `src/tools/llm-chat/composables/useMessageProcessor.ts`

**扩展功能**:

1.  引入 `regexUtils`。
2.  新增 `processMessages` 主函数，统一协调结构处理和内容处理。

```typescript
export interface ProcessedMessage extends ProcessableMessage {
  // 新增：调试信息，记录应用了哪些规则
  _appliedRegexRules?: {
    source: "global" | "agent" | "user";
    ruleName: string;
    originalContentLength: number;
    newContentLength: number;
  }[];
}

export interface MessageProcessingOptions {
  structureRules: ContextPostProcessRule[]; // 结构性规则
  // 提供一个函数，根据消息元数据动态获取规则
  getRulesForMessage: (msg: ProcessableMessage) => RegexRule[];
}

export function useMessageProcessor() {
  // ... 原有的结构处理函数 ...

  /**
   * 应用正则处理
   */
  const applyRegexProcessing = (
    messages: ProcessableMessage[],
    getRules: (msg: ProcessableMessage) => RegexRule[]
  ) => {
    return messages.map((msg) => {
      const rules = getRules(msg);
      if (!rules.length) return msg;

      // 记录应用的规则用于调试
      const appliedRulesInfo = [];
      let currentContent = msg.content;

      // 逐条应用规则并记录
      // (实际实现中 applyRegexRules 可能需要改造以支持返回详细信息，
      // 或者在这里简单记录规则列表)

      // 对 msg.content 进行正则替换 (支持多模态文本部分)
      const newContent = applyRegexRules(msg.content, rules);

      return {
        ...msg,
        content: newContent,
        // 附加调试元数据（注意：这不应污染持久化的消息对象，仅在运行时存在）
        _appliedRegexRules: rules.map((r) => ({ name: r.name, id: r.id })),
      };
    });
  };

  /**
   * 统一消息处理管道
   * 依次执行：结构调整 -> 内容清洗
   */
  const processMessages = (
    messages: ProcessableMessage[],
    options: MessageProcessingOptions
  ): ProcessableMessage[] => {
    let result = [...messages];

    // 1. 结构处理 (Structure Pipeline)
    if (options.structureRules.length > 0) {
      result = applyProcessingPipeline(result, options.structureRules);
    }

    // 2. 内容处理 (Content Pipeline)
    // 此时的消息列表已经是结构调整后的（例如 system 消息已合并），
    // 但每条消息仍应保留原始 metadata 以便正确匹配规则
    result = applyRegexProcessing(result, options.getRulesForMessage);

    return result;
  };

  return {
    processMessages,
    // ...
  };
}
```

**调用点更新**: `src/tools/llm-chat/composables/useChatExecutor.ts`

```typescript
// useChatExecutor.ts
const { processMessages } = useMessageProcessor();

// 准备回调函数
const getRulesForMessage = (msg: ProcessableMessage) => {
  // 根据 msg.metadata.agentId / userProfileId
  // 以及当前的全局配置，动态计算 Input 规则
  return resolveRulesForNode(
    msg.metadata,
    globalConfig,
    userConfigMap, // 需要传入所有 User/Agent 配置以便查找
    agentConfigMap,
    "input"
  );
};

// 调用
messages = processMessages(messages, {
  structureRules,
  getRulesForMessage,
});
```

### 3.6 上下文分析器支持 (Context Analyzer Support)

为了方便调试 Input Pipeline 的效果，上下文分析器需要展示每条消息实际应用了哪些正则规则。

**修改文件**:

1.  `src/tools/llm-chat/composables/useChatContextBuilder.ts`
2.  `src/tools/llm-chat/components/context-analyzer/StructuredView.vue`

**逻辑**:

1.  **数据透传**: `useChatContextBuilder` 在构建上下文预览数据时，需要保留 `processMessages` 返回结果中的 `_appliedRegexRules` 字段。
2.  **UI 展示**: 在 `StructuredView.vue` 的消息卡片 (`InfoCard`) 中，新增一个“正则处理记录”区域。
    - 当 `_appliedRegexRules` 存在且不为空时显示。
    - 展示应用的规则名称列表，使用 `el-tag` 或列表形式。
    - 提供直观的视觉反馈，表明该消息的内容已被修改。

**UI 示例**:

```html
<!-- 在 MessageCard 的 headerTags 中增加一个图标或标签 -->
<el-tooltip v-if="msg._appliedRegexRules?.length" content="已应用正则处理">
  <el-tag type="warning" size="small" effect="plain">
    <i class="i-lucide-regex" /> {{ msg._appliedRegexRules.length }}
  </el-tag>
</el-tooltip>

<!-- 在 MessageCard 的内容区域下方或详情弹窗中 -->
<div v-if="msg._appliedRegexRules" class="regex-debug-info">
  <div class="debug-title">应用规则:</div>
  <div class="rule-list">
    <span v-for="rule in msg._appliedRegexRules" :key="rule.id" class="rule-tag">
      {{ rule.name }}
    </span>
  </div>
</div>
```

---
