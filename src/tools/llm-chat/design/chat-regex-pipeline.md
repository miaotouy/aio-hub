# Chat 正则管道系统设计文档 (Chat Regex Pipeline System)

## 1. 概述 (Overview)

本设计旨在为 `llm-chat` 工具引入正则规则管道能力，实现对消息内容的动态清洗、格式转换和角色扮演增强。

### 核心设计原则

1.  **自主设计**: 优先保证自身设计的清晰性和可维护性，术语命名遵循项目既有风格（参考 `regex-applier` 工具）。
2.  **统一模型**: 采用统一的规则列表，每条规则通过属性声明其生效阶段和目标。
3.  **按需实现**: 只实现核心且明确的功能，对于外部工具的特有参数，按需在导入层处理。
4.  **兼容导入**: 提供从外部格式（如酒馆 SillyTavern）到自身格式的转换逻辑，但不影响核心设计。

### 核心目标

1.  **层级化配置模型**: 建立 **Config -> Preset (预设/组) -> Rule** 的三层结构，支持按组管理规则。
2.  **三层配置体系**: 支持 **Global (全局)**、**User (用户)**、**Agent (智能体)** 三层配置。
3.  **灵活的目标控制**: 所有规则都支持按 `targetRoles` (system/user/assistant 多选) 进行过滤。
4.  **外部格式兼容**: 支持导入 SillyTavern 等外部正则配置，在导入层完成格式转换。

---

## 2. 核心概念 (Core Concepts)

### 2.1 数据结构

#### `ChatRegexRule` (单条正则规则)

定义最小执行单元。相比 `regex-applier` 的基础 `RegexRule`，增加了聊天场景特有的配置项。

```typescript
interface ChatRegexRule {
  id: string;
  enabled: boolean; // 规则级开关
  name?: string; // 规则名称 (可选)

  // === 核心：正则配置 ===
  regex: string; // 正则表达式 (命名与 regex-applier 保持一致)
  replacement: string; // 替换内容
  flags?: string; // 默认 'gm'

  // === 聊天场景特有配置 ===
  applyTo: {
    render: boolean; // 是否应用于渲染层
    request: boolean; // 是否应用于请求层
  };
  targetRoles: MessageRole[]; // 目标消息角色
  depthRange?: {
    // 消息深度范围
    min?: number;
    max?: number;
  };

  // === 宏替换模式 (兼容 SillyTavern) ===
  substitutionMode?: "NONE" | "RAW" | "ESCAPED"; // 默认 'NONE'
  trimStrings?: string[]; // 从捕获组中移除的字符串列表 (后处理)

  // === 排序与调试 ===
  order?: number; // 组内排序
  testInput?: string; // 测试用例
}
```

#### `ChatRegexPreset` (正则预设/规则组)

规则的容器，与 `regex-applier` 的 `RegexPreset` 概念一致。

```typescript
interface ChatRegexPreset {
  id: string;
  name: string; // 预设名称 (如 "Markdown清洗", "猫娘口癖")
  description?: string;
  author?: string; // 作者
  version?: string; // 版本
  createdAt?: number; // 创建时间
  updatedAt?: number; // 更新时间
  enabled: boolean; // 预设级开关 (关闭后内部所有规则失效)

  // === 规则列表 ===
  rules: ChatRegexRule[];

  // === 排序 ===
  order?: number; // 预设间排序
}
```

#### `ChatRegexConfig` (配置根对象)

用于 Global, Agent, User 三层配置。

```typescript
interface ChatRegexConfig {
  presets: ChatRegexPreset[]; // 预设列表
}
```

### 2.2 三层配置架构 (Three-Layer Architecture)

所有层级共享同一套 `ChatRegexConfig` 结构，提供了极大的灵活性和一致性。

```
┌─────────────────────────────────────────────────────────────┐
│                     Global (全局设置)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ presets: ChatRegexPreset[]                              │   │
│  │   └─ rules[]: applyTo, targetRoles, depthRange         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                           ↓ 生效于所有会话                   │
├─────────────────────────────────────────────────────────────┤
│        Agent (智能体)              User (用户档案)            │
│  ┌──────────────────────┐    ┌──────────────────────┐      │
│  │ presets: [...]       │    │ presets: [...]       │      │
│  └──────────────────────┘    └──────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

1.  **Global (全局设置)**: `ChatSettings.regexConfig: ChatRegexConfig`
2.  **Agent (智能体)**: `ChatAgent.regexConfig: ChatRegexConfig`
3.  **User (用户档案)**: `UserProfile.regexConfig: ChatRegexConfig`

### 2.3 处理流程 (Pipeline Flow)

#### **Render Pipeline (渲染层)**

在 `RichTextRenderer` 中执行，处理消息内容用于显示。

- **逻辑**:
  1.  **收集规则**: 遍历所有配置 (Global, Agent, User)，提取其中所有 `enabled` 的预设，再将这些预设中的 `rules` 收集到一个扁平化的列表中。
  2.  **计算深度**:
      - 渲染的消息列表来自于 `useLlmChatStore` 的 `currentActivePath` getter，其数组索引 `i` 是从旧到新 ( `i=0` 为最旧消息)。
      - 而 `depthRange` 的判断基准是 `0` 代表**最新**消息。
      - 因此，在进行深度判断前，需要进行坐标转换：`messageDepth = totalMessages - 1 - i`。
  3.  **规则级过滤**: 遍历这个扁平列表，并为每条消息计算出对应的 `messageDepth`，然后根据 `rule.enabled`, `rule.applyTo[stage]`, `rule.targetRoles`, `rule.depthRange` 对每一条规则进行独立过滤。
  4.  **排序**: 对通过过滤的规则列表进行排序 (按 `order` 字段)。
  5.  **宏预处理**: 在应用规则前，使用 `processRulesWithMacros` 对规则列表中的 `regex` 和 `trimStrings` 字段进行宏替换。
  6.  **应用**: 依次应用所有通过的规则。

#### **Request Pipeline (请求层)**

在 `useMessageProcessor` 中执行，处理发送给模型的 Prompt。

- **逻辑**:
  1.  **执行位置**: 在 `useChatContextBuilder.ts` 的 `buildLlmContext` 函数内部。
  2.  **作用范围**: **仅处理会话历史消息** (`sessionContext`)，不处理 Agent 的预设消息。
  3.  **执行时机**: 在从 `activePath` 生成原始历史消息列表后，但在应用 **Token 限制** (`applyContextLimit`) 之前。
  4.  **处理步骤**:
      - a. **收集规则**: 遍历所有配置 (Global, Agent, User)，收集所有启用的、`applyTo.request=true` 的规则，形成一个扁平化的规则池。
      - b. **宏预处理**: 使用 `processRulesWithMacros` 对整个规则池进行宏替换，生成待执行的规则列表。
      - c. **应用规则**: 遍历 `sessionContext` (历史消息列表)，对**每条消息**：
          - i. 计算其 `messageDepth`。
          - ii. 从宏处理过的规则列表中，根据 `targetRoles` 和 `depthRange` 过滤出适用于当前消息的最终规则。
          - iii. 对消息内容应用这些规则。
      - d. **返回**: 返回经过正则处理的 `sessionContext`，用于后续的 Token 限制和上下文拼接。

---

## 3. 外部格式导入 (Import Compatibility)

本节描述如何将外部工具（如 SillyTavern）的正则配置导入为本系统的格式。导入逻辑是**单向转换**，不影响核心设计。

### 3.1 SillyTavern 导入

#### 转换规则

| 酒馆字段                                  | 处理方式                           |
| ----------------------------------------- | ---------------------------------- |
| `scriptName`                              | → `ChatRegexPreset.name`           |
| `findRegex`                               | → `ChatRegexRule.regex`            |
| `replaceString`                           | → `ChatRegexRule.replacement`      |
| `placement`, `markdownOnly`, `promptOnly` | → `applyTo` 字段                   |
| `minDepth`, `maxDepth`                    | → `depthRange`                     |
| `trimStrings`                             | → `ChatRegexRule.trimStrings` 字段 |
| `substituteRegex`                         | → `substitutionMode` 字段          |
| `runOnEdit`                               | 忽略（暂不支持）                   |

#### 转换函数

酒馆的一个 `Script` 对应我们的一个 `ChatRegexPreset`：

```typescript
import { escapeRegExp } from "lodash-es";
import { v4 as uuidv4 } from "uuid";

/**
 * 将 SillyTavern 的 RegexScript 转换为本系统的 ChatRegexPreset
 */
function convertFromSillyTavern(st: SillyTavernRegexScript): ChatRegexPreset {
  const rules: ChatRegexRule[] = [];
  const applyTo = convertPlacementToApplyTo(st);
  const depthRange =
    st.minDepth !== null || st.maxDepth !== null
      ? { min: st.minDepth ?? undefined, max: st.maxDepth ?? undefined }
      : undefined;

  // 转换 substituteRegex 枚举值到 substitutionMode
  const substitutionMode = convertSubstituteRegex(st.substituteRegex);

  // 1. 主规则
  if (st.findRegex) {
    rules.push({
      id: uuidv4(),
      enabled: true,
      name: "主规则",
      regex: st.findRegex,
      replacement: st.replaceString || "",
      flags: "gm",
      applyTo: applyTo,
      targetRoles: ["system", "user", "assistant"],
      depthRange: depthRange,
      substitutionMode: substitutionMode,
      trimStrings: st.trimStrings?.filter(Boolean),
      order: 0,
    });
  }

  // 3. 构建预设对象
  return {
    id: st.id || uuidv4(),
    name: st.scriptName || "未命名预设",
    enabled: !st.disabled,
    rules: rules,
    order: 0,
  };
}

/**
 * 转换 SillyTavern 的 substituteRegex 枚举值
 * @see SillyTavern: public/scripts/extensions/regex/engine.js
 */
function convertSubstituteRegex(value: number | undefined): "NONE" | "RAW" | "ESCAPED" {
  switch (value) {
    case 1:
      return "RAW";
    case 2:
      return "ESCAPED";
    default:
      return "NONE";
  }
}

function convertPlacementToApplyTo(script: SillyTavernRegexScript): {
  render: boolean;
  request: boolean;
} {
  let render = script.placement.includes(1);
  let request = script.placement.includes(2);
  if (script.markdownOnly) {
    render = true;
    request = false;
  }
  if (script.promptOnly) {
    render = false;
    request = true;
  }
  if (!render && !request) {
    render = true;
    request = true;
  }
  return { render, request };
}
```

---

## 4. 详细设计 (Detailed Design)

### 4.1 类型定义

**新增文件**: `src/tools/llm-chat/types/chatRegex.ts`

```typescript
// === 消息角色类型 ===
export type MessageRole = "system" | "user" | "assistant";

// === 单条规则 (聊天场景扩展) ===
export interface ChatRegexRule {
  id: string;
  enabled: boolean;
  name?: string;

  // 核心配置
  regex: string;
  replacement: string;
  flags?: string;

  // 聊天场景配置
  applyTo: {
    render: boolean;
    request: boolean;
  };
  targetRoles: MessageRole[];
  depthRange?: {
    min?: number;
    max?: number;
  };

  // 宏替换模式
  substitutionMode?: "NONE" | "RAW" | "ESCAPED";
  trimStrings?: string[];

  // 排序与调试
  order?: number;
  testInput?: string;
}

// === 规则预设 (组) - 纯容器 ===
export interface ChatRegexPreset {
  id: string;
  name: string;
  description?: string;
  author?: string;
  version?: string;
  createdAt?: number;
  updatedAt?: number;
  enabled: boolean; // 控制整个预设是否生效
  rules: ChatRegexRule[];
  order?: number; // 预设间排序
}

// === 配置结构 ===
export interface ChatRegexConfig {
  presets: ChatRegexPreset[];
}
```

### 4.2 数据层扩展

**修改文件**:

- `src/tools/llm-chat/types/agent.ts`: 扩展 `ChatAgent`
- `src/tools/llm-chat/types/profile.ts`: 扩展 `UserProfile`
- `src/tools/llm-chat/composables/useChatSettings.ts`: 扩展 `ChatSettings`

```typescript
// ChatAgent, UserProfile, ChatSettings
// ...
  regexConfig?: ChatRegexConfig;
// ...
```

### 4.3 工具函数

**新增文件**: `src/tools/llm-chat/utils/chatRegexUtils.ts`

```typescript
/**
 * 获取消息节点最终应用的规则列表
 * @param stage - 当前处理阶段 (render/request)
 * @param role - 消息角色 (system/user/assistant)
 * @param messageDepth - 消息深度 (0=最新)
 * @param configs - 配置列表 (Global, Agent, User)
 */
export function resolveRulesForMessage(
  stage: "render" | "request",
  role: MessageRole,
  messageDepth: number,
  ...configs: (ChatRegexConfig | undefined)[]
): ChatRegexRule[] {
  const allRules: ChatRegexRule[] = [];

  // 1. 收集所有启用的预设中的规则
  for (const config of configs) {
    if (!config?.presets) continue;

    const enabledPresets = config.presets
      .filter((preset) => preset.enabled)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    for (const preset of enabledPresets) {
      allRules.push(...preset.rules);
    }
  }

  // 2. 对扁平化的规则列表进行过滤和排序
  return allRules
    .filter((rule) => {
      if (!rule.enabled) return false;
      if (!rule.applyTo[stage]) return false;
      if (!rule.targetRoles.includes(role)) return false;
      // 深度检查
      if (rule.depthRange) {
        if (rule.depthRange.min !== undefined && messageDepth < rule.depthRange.min) return false;
        if (rule.depthRange.max !== undefined && messageDepth > rule.depthRange.max) return false;
      }
      return true;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}
```

### 4.4 UI 配置层 (Configuration UI)

**新增组件**: `src/tools/llm-chat/components/common/ChatRegexEditor.vue`

采用 **嵌套式管理** 布局，以适应分组管理的层级结构：

1.  **一级层级 (预设组列表)**:
    - 采用 **垂直手风琴 (Accordion)** 或 **可展开卡片** 列表形式。
    - **折叠态**: 显示预设名称、开关、规则数量摘要、拖拽手柄、删除/导出按钮。
    - **展开态**: 显示该预设的详细编辑界面。

2.  **二级层级 (组内规则管理)**:
    - 在预设展开区域内，采用 **左右分栏 (Master-Detail)** 布局。
    - **左侧 (Rule List)**:
      - 该预设下的规则列表。
      - 支持组内拖拽排序。
      - 每项显示：开关、规则名称（或正则预览）。
    - **右侧 (Rule Form)**:
      - 当前选中规则的详细属性编辑表单。
      - 字段分组：
        - _基础_: 正则表达式、替换内容、Flags。
        - _范围_: 应用阶段 (Render/Request)、目标角色、深度限制。
        - _高级_: 宏替换模式、后处理 (Trim Strings)。

**集成点**: `EditAgentDialog.vue`, `UserProfileForm.vue`, `ChatSettingsDialog.vue`

### 4.5 宏替换集成 (Macro Substitution)

当 `ChatRegexRule.substitutionMode` 不为 `'NONE'` 时，需要在应用正则表达式之前，对 `regex` 字段进行宏替换处理。

> **设计原则**: 正则规则的宏处理，是**复用** `llm-chat` 模块已有的宏系统 (`useMacroProcessor`) 的。它作为应用规则前的一个预处理步骤，用于动态地构建正则表达式和 `trimStrings` 的内容。

#### `substitutionMode` 说明

| 模式      | 说明                                              | 用途示例                           |
| --------- | ------------------------------------------------- | ---------------------------------- |
| `NONE`    | 不进行宏替换，`regex` 按字面值使用                | 普通正则规则                       |
| `RAW`     | 将 `{{macro}}` 替换为文本值后，作为正则表达式使用 | 动态匹配（用户名不含特殊字符时）   |
| `ESCAPED` | 替换宏后，对替换进来的值进行正则转义              | **推荐**：安全地动态匹配任意用户名 |

#### 使用场景示例

**场景**: 为角色创建一个通用的昵称规则，无论当前用户叫什么名字，角色在提到用户时都会在名字前加上特定称呼。

```typescript
// 规则配置
const rule: ChatRegexRule = {
  regex: "{{user}}",
  replacement: "我亲爱的 {{user}}",
  substitutionMode: "ESCAPED", // 推荐使用 ESCAPED 模式
  // ...
};
```

**执行流程**:

1. 假设当前用户名为 `C.C.`（含正则特殊字符 `.`）
2. 宏处理器将 `{{user}}` 替换为 `C.C.`
3. 因为是 `ESCAPED` 模式，对替换值进行转义：`C\.C\.`
4. 最终的 `regex` 变为 `/C\.C\./gm`，精确匹配字符串 "C.C."
5. 如果使用 `RAW` 模式，`regex` 会变成 `/C.C./gm`，`.` 会匹配任意字符，导致错误匹配

#### 实现要点

```typescript
import { useMacroProcessor } from "@/tools/llm-chat/composables/useMacroProcessor";
import type { MacroContext } from "@/tools/llm-chat/macro-engine/MacroContext";
import { escapeRegExp } from "lodash-es";

/**
 * 对规则列表中的 `regex` 和 `trimStrings` 字段进行宏处理
 *
 * @param rules - 待处理的规则数组
 * @param macroContext - 用于宏替换的上下文对象
 * @returns 返回一个全新的、经过宏处理的规则数组 Promise
 */
export async function processRulesWithMacros(
  rules: ChatRegexRule[],
  macroContext: MacroContext
): Promise<ChatRegexRule[]> {
  const macroProcessor = useMacroProcessor();
  const processedRules: ChatRegexRule[] = [];

  for (const rule of rules) {
    // 创建副本以避免修改 Pinia store 中的原始状态
    const newRule = JSON.parse(JSON.stringify(rule));

    if (newRule.substitutionMode && newRule.substitutionMode !== "NONE") {
      const transform =
        newRule.substitutionMode === "ESCAPED"
          ? (value: unknown) => escapeRegExp(String(value))
          : undefined;

      // 处理 regex 字段
      newRule.regex = await macroProcessor.process(newRule.regex, macroContext, {
        valueTransformer: transform,
      });

      // 处理 trimStrings 字段
      if (newRule.trimStrings) {
        newRule.trimStrings = await Promise.all(
          newRule.trimStrings.map((str) =>
            macroProcessor.process(str, macroContext, {
              valueTransformer: transform, // 同样对 trimStrings 中的宏应用转义
            })
          )
        );
      }
    }
    processedRules.push(newRule);
  }

  return processedRules;
}
```

---

### 4.6 捕获组后处理 (Trim Strings)

`trimStrings` 字段用于在正则替换过程中，对**捕获组的内容**进行二次清理。这在处理复杂的角色扮演格式时非常有用（例如去除不需要的前缀或标记）。

#### 工作原理

当规则的 `replacement` 字段引用了捕获组（如 `$1`、`$<name>`）时：

1.  获取捕获组的原始值。
2.  遍历 `trimStrings` 列表。
3.  对每个 trim string 进行宏替换（如将 `{{char}}` 替换为角色名）。
4.  使用 `replaceAll` 从捕获组的原始值中移除这些字符串。
5.  使用清理后的值参与最终的 `replacement` 拼接。

#### 示例

**规则配置**:

- `regex`: `/\(思考中：(.*?)\)/`
- `replacement`: `$1`
- `trimStrings`: `["..."]`

**输入**: `(思考中：...我在想什么...)`
**捕获组 $1**: `...我在想什么...`
**应用 Trim**: 移除 `...` -> `我在想什么`
**最终输出**: `我在想什么`

---

## 5. 实现计划

### Phase 1: 基础架构 (一期)

1. [x] **类型**: 定义 `types/chatRegex.ts`
2. [x] **数据层**: 扩展 Agent/User/Settings 类型
3. [x] **工具函数**: 实现 `utils/chatRegexUtils.ts`
4. [x] **导入层**: 实现 SillyTavern 格式转换函数
5. [x] **UI**: 实现 `ChatRegexEditor.vue` 组件
6. [x] **集成**: 将 UI 集成到 Agent/User/Global 配置界面
7. [x] **渲染层**: 实现 Render Pipeline

### Phase 2: 完整功能 (二期)

1. [x] **请求层**: 实现 Request Pipeline
2. [ ] **调试**: 上下文分析器支持
3. [ ] **UX**: 规则模板库、批量操作等
