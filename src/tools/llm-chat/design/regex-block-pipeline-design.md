# 正则块管道扩展设计想法草案

## 1. 设计目标

扩展现有的 `ChatRegexRule` 系统，支持：

1. **复杂首尾定界符匹配** - 识别特殊格式的块级内容
2. **多正则顺序处理** - 对块内容应用子规则管道
3. **直接生成 HTML** - 绕过富文本渲染器的 Tokenizer/Parser，直接输出 HTML

### 核心价值

```
传统流程：  原始文本 → Tokenizer → Parser → AST → Renderer → HTML
新增流程：  原始文本 → Regex Block Pipeline → HTML（预处理插入）→ Tokenizer...
```

通过在渲染管道的**最前端**插入正则块处理，可以：

- 支持任意自定义格式（VCP、SillyTavern 特殊块等）
- 复用成熟的正则系统基础设施
- 无需修改富文本渲染器核心

---

## 2. 类型系统扩展

### 2.1 块模式规则 `ChatRegexBlockRule`

```typescript
// src/tools/llm-chat/types/chatRegex.ts

/**
 * 定界符定义
 * 支持字符串字面量或正则表达式
 */
export type DelimiterDef =
  | string // 字面量，如 '<<<[TOOL_REQUEST]>>>'
  | {
      /** 正则表达式模式 */
      regex: string;
      /** 正则标志，默认 '' */
      flags?: string;
    };

/**
 * 块模式配置
 */
export interface BlockModeConfig {
  /** 起始定界符 */
  start: DelimiterDef;
  /** 结束定界符 */
  end: DelimiterDef;
  /** 是否在最终输出中保留定界符，默认 false */
  keepDelimiters?: boolean;
  /** 是否允许嵌套（同类型块），默认 false */
  allowNesting?: boolean;
  /** 未闭合时的行为：'keep' 保留原文，'remove' 移除，'partial' 部分处理 */
  unclosedBehavior?: "keep" | "remove" | "partial";
}

/**
 * 包装器配置
 * 用于将处理后的内容包装成 HTML
 */
export interface WrapperConfig {
  /**
   * HTML 模板
   * 可用占位符：
   * - $content: 管道处理后的内容
   * - $raw: 原始块内容（未经处理）
   * - $start: 起始定界符
   * - $end: 结束定界符
   * - $1, $2, ...: 起始定界符正则的捕获组
   */
  template: string;
}

/**
 * 块级正则规则
 * 继承自 ChatRegexRule，新增块模式和管道能力
 */
export interface ChatRegexBlockRule extends ChatRegexRule {
  /** 块模式配置 */
  blockMode: BlockModeConfig;

  /**
   * 子规则管道
   * 按顺序应用于块内容，每条规则的输出是下一条规则的输入
   */
  pipeline?: ChatRegexRule[];

  /**
   * 最终包装器
   * 将管道处理后的内容包装成 HTML
   */
  wrapper?: WrapperConfig;

  /**
   * 是否跳过 HTML 转义
   * 默认 false：对块内容进行 HTML 实体转义（安全）
   * 设为 true 时，块内容和管道输出将被信任（危险，仅用于受信任的规则）
   */
  trustHtml?: boolean;
}

/**
 * 类型守卫：判断是否为块级规则
 */
export function isBlockRule(rule: ChatRegexRule): rule is ChatRegexBlockRule {
  return "blockMode" in rule && rule.blockMode !== undefined;
}
```

### 2.2 扩展 `ChatRegexPreset`

块级规则和普通规则可以混合存放在同一个预设中：

```typescript
export interface ChatRegexPreset {
  // ...现有字段...

  /** 规则列表（可包含普通规则和块级规则） */
  rules: (ChatRegexRule | ChatRegexBlockRule)[];
}
```

---

## 3. 处理流程

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        消息内容处理流程                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  原始文本                                                        │
│      │                                                          │
│      ▼                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           Regex Block Pipeline (新增)                   │    │
│  │  ┌─────────────────────────────────────────────────┐    │    │
│  │  │  1. 扫描所有块级规则的起始定界符                   │    │    │
│  │  │  2. 找到最早的匹配 → 定位块边界                   │    │    │
│  │  │  3. 提取块内容                                    │    │    │
│  │  │  4. 应用子规则管道                                │    │    │
│  │  │  5. 应用包装器生成 HTML                           │    │    │
│  │  │  6. 替换原文中的块                                │    │    │
│  │  │  7. 继续扫描剩余内容                              │    │    │
│  │  └─────────────────────────────────────────────────┘    │    │
│  └─────────────────────────────────────────────────────────┘    │
│      │                                                          │
│      ▼ 预处理后的文本（块已转为 HTML）                           │
│      │                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           普通正则规则 (现有逻辑)                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│      │                                                          │
│      ▼ 正则处理后的文本                                         │
│      │                                                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           Rich Text Renderer                            │    │
│  │           (Tokenizer → Parser → AST → Render)           │    │
│  └─────────────────────────────────────────────────────────┘    │
│      │                                                          │
│      ▼ 最终 HTML                                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 块处理核心算法

```typescript
// src/tools/llm-chat/utils/regexBlockProcessor.ts

import { escapeHtml } from "@/utils/html";
import type { ChatRegexBlockRule, ChatRegexRule, DelimiterDef } from "../types/chatRegex";
import { isBlockRule } from "../types/chatRegex";
import { applyRegexRules } from "./chatRegexUtils";

/**
 * 将定界符定义转换为正则表达式
 */
function delimiterToRegex(def: DelimiterDef): RegExp {
  if (typeof def === "string") {
    // 字符串字面量 → 转义为正则
    return new RegExp(escapeRegExp(def), "g");
  }
  return new RegExp(def.regex, def.flags || "g");
}

/**
 * 查找块的边界
 * @returns [startIndex, endIndex, startMatch, innerStart, innerEnd] 或 null
 */
function findBlockBoundaries(
  text: string,
  rule: ChatRegexBlockRule,
  startFrom: number = 0
): {
  blockStart: number;
  blockEnd: number;
  innerStart: number;
  innerEnd: number;
  startMatch: RegExpMatchArray;
} | null {
  const startRegex = delimiterToRegex(rule.blockMode.start);
  const endRegex = delimiterToRegex(rule.blockMode.end);

  // 重置正则状态
  startRegex.lastIndex = startFrom;

  // 查找起始定界符
  const startMatch = startRegex.exec(text);
  if (!startMatch) return null;

  const blockStart = startMatch.index!;
  const innerStart = blockStart + startMatch[0].length;

  // 查找结束定界符（从 innerStart 开始）
  endRegex.lastIndex = innerStart;
  const endMatch = endRegex.exec(text);

  if (!endMatch) {
    // 未闭合处理
    if (rule.blockMode.unclosedBehavior === "partial") {
      // 部分处理：使用到文本末尾
      return {
        blockStart,
        blockEnd: text.length,
        innerStart,
        innerEnd: text.length,
        startMatch,
      };
    }
    // 'keep' 或 'remove' 都返回 null，让上层决定
    return null;
  }

  return {
    blockStart,
    blockEnd: endMatch.index! + endMatch[0].length,
    innerStart,
    innerEnd: endMatch.index!,
    startMatch,
  };
}

/**
 * 处理单个块
 */
function processBlock(
  innerContent: string,
  rule: ChatRegexBlockRule,
  startMatch: RegExpMatchArray
): string {
  let result = innerContent;

  // 1. 安全处理：HTML 转义（除非明确信任）
  if (!rule.trustHtml) {
    result = escapeHtml(result);
  }

  // 2. 应用子规则管道
  if (rule.pipeline && rule.pipeline.length > 0) {
    result = applyRegexRules(result, rule.pipeline);
  }

  // 3. 应用包装器
  if (rule.wrapper) {
    let template = rule.wrapper.template;

    // 替换占位符
    template = template.replace(/\$content/g, result);
    template = template.replace(/\$raw/g, innerContent);

    // 替换捕获组 $1, $2, ...
    for (let i = 1; i < startMatch.length; i++) {
      template = template.replace(new RegExp(`\\$${i}`, "g"), startMatch[i] || "");
    }

    result = template;
  }

  return result;
}

/**
 * 应用所有块级规则到文本
 *
 * 处理策略：
 * 1. 收集所有块级规则
 * 2. 在文本中扫描，找到最早匹配的块
 * 3. 处理该块，替换文本
 * 4. 从替换后的位置继续扫描
 * 5. 直到没有更多匹配
 */
export function applyBlockRules(
  text: string,
  rules: (ChatRegexRule | ChatRegexBlockRule)[]
): string {
  // 1. 筛选出块级规则
  const blockRules = rules.filter(isBlockRule);
  if (blockRules.length === 0) return text;

  let result = text;
  let cursor = 0;
  const maxIterations = 10000; // 防止无限循环
  let iterations = 0;

  while (cursor < result.length && iterations < maxIterations) {
    iterations++;

    // 2. 在所有块规则中找到最早的匹配
    let earliestMatch: {
      rule: ChatRegexBlockRule;
      boundaries: NonNullable<ReturnType<typeof findBlockBoundaries>>;
    } | null = null;

    for (const rule of blockRules) {
      const boundaries = findBlockBoundaries(result, rule, cursor);
      if (boundaries) {
        if (!earliestMatch || boundaries.blockStart < earliestMatch.boundaries.blockStart) {
          earliestMatch = { rule, boundaries };
        }
      }
    }

    if (!earliestMatch) {
      // 没有更多匹配，结束
      break;
    }

    const { rule, boundaries } = earliestMatch;

    // 3. 提取内容并处理
    const innerContent = result.slice(boundaries.innerStart, boundaries.innerEnd);
    const processedContent = processBlock(innerContent, rule, boundaries.startMatch);

    // 4. 构建替换内容
    let replacement: string;
    if (rule.blockMode.keepDelimiters) {
      // 保留定界符
      const startDelim = result.slice(boundaries.blockStart, boundaries.innerStart);
      const endDelim = result.slice(boundaries.innerEnd, boundaries.blockEnd);
      replacement = startDelim + processedContent + endDelim;
    } else {
      replacement = processedContent;
    }

    // 5. 替换并更新游标
    result =
      result.slice(0, boundaries.blockStart) + replacement + result.slice(boundaries.blockEnd);
    cursor = boundaries.blockStart + replacement.length;
  }

  if (iterations >= maxIterations) {
    console.warn("[RegexBlockProcessor] 达到最大迭代次数，可能存在无限循环");
  }

  return result;
}
```

### 3.3 集成到现有管道

修改 `chatRegexUtils.ts` 中的 `applyRegexRules` 函数，在处理普通规则之前先处理块规则：

```typescript
// src/tools/llm-chat/utils/chatRegexUtils.ts

import { applyBlockRules } from "./regexBlockProcessor";

/**
 * 应用正则规则到内容（升级版）
 */
export function applyRegexRules(
  content: string,
  rules: (ChatRegexRule | ChatRegexBlockRule)[]
): string {
  // 阶段 1：处理块级规则
  let result = applyBlockRules(content, rules);

  // 阶段 2：处理普通规则
  const normalRules = rules.filter((r) => !isBlockRule(r));
  for (const rule of normalRules) {
    // ...现有的普通规则处理逻辑...
  }

  return result;
}
```

---

## 4. 使用示例

### 4.1 VCP 工具调用块

```typescript
const vcpToolRequestRule: ChatRegexBlockRule = {
  id: "vcp-tool-request",
  enabled: true,
  name: "VCP 工具调用块",

  // 基础配置（继承自 ChatRegexRule，这里留空因为主要靠 blockMode）
  regex: "", // 块规则不使用这个
  replacement: "", // 块规则不使用这个
  applyTo: { render: true, request: false },
  targetRoles: ["assistant"],

  // 块模式配置
  blockMode: {
    start: "<<<[TOOL_REQUEST]>>>",
    end: "<<<[END_TOOL_REQUEST]>>>",
    keepDelimiters: false,
    unclosedBehavior: "keep",
  },

  // 子规则管道：解析 VCP 参数格式
  pipeline: [
    {
      id: "vcp-param",
      enabled: true,
      regex: "([\\w_]+):「始」([^「」]*)「末」",
      replacement:
        '<div class="vcp-param"><span class="vcp-key">$1</span>: <span class="vcp-value">$2</span></div>',
      flags: "g",
      applyTo: { render: true, request: false },
      targetRoles: ["assistant"],
    },
  ],

  // 包装器：整体容器
  wrapper: {
    template: `
      <div class="vcp-tool-request" data-tool="$1">
        <div class="vcp-header">🔧 工具调用</div>
        <div class="vcp-body">$content</div>
      </div>
    `.trim(),
  },

  trustHtml: true, // 信任管道输出的 HTML
};
```

### 4.2 日记写入块

```typescript
const dailyNoteRule: ChatRegexBlockRule = {
  id: "daily-note",
  enabled: true,
  name: "日记写入块",

  regex: "",
  replacement: "",
  applyTo: { render: true, request: false },
  targetRoles: ["assistant"],

  blockMode: {
    start: "<<<DailyNoteStart>>>",
    end: "<<<DailyNoteEnd>>>",
    keepDelimiters: false,
  },

  // 不需要子管道，直接包装
  wrapper: {
    template: `
      <div class="daily-note-block">
        <div class="daily-note-icon">📝</div>
        <div class="daily-note-content">$content</div>
      </div>
    `.trim(),
  },
};
```

### 4.3 带正则定界符的块（高级用法）

```typescript
// 匹配 XML 风格的自定义标签，如 <custom-block type="xxx">...</custom-block>
const customXmlBlockRule: ChatRegexBlockRule = {
  id: "custom-xml-block",
  enabled: true,
  name: "自定义 XML 块",

  regex: "",
  replacement: "",
  applyTo: { render: true, request: false },
  targetRoles: ["assistant"],

  blockMode: {
    start: {
      regex: '<custom-block\\s+type="([^"]+)"[^>]*>',
      flags: "i",
    },
    end: "</custom-block>",
    keepDelimiters: false,
  },

  wrapper: {
    // $1 来自起始定界符的捕获组
    template: '<div class="custom-block custom-block--$1">$content</div>',
  },
};
```

### 4.4 嵌套管道处理

```typescript
// 角色扮演场景：将特定格式转换为带样式的 HTML
const roleplayBlockRule: ChatRegexBlockRule = {
  id: "roleplay-action",
  enabled: true,
  name: "角色动作块",

  regex: "",
  replacement: "",
  applyTo: { render: true, request: false },
  targetRoles: ["assistant"],

  blockMode: {
    start: "【动作",
    end: "】",
  },

  pipeline: [
    // 第一步：高亮动词
    {
      id: "highlight-verb",
      enabled: true,
      regex: "(走|跑|跳|看|说|想|做)",
      replacement: '<span class="action-verb">$1</span>',
      flags: "g",
      applyTo: { render: true, request: false },
      targetRoles: ["assistant"],
    },
    // 第二步：斜体化描述
    {
      id: "italic-desc",
      enabled: true,
      regex: "「([^」]+)」",
      replacement: '<em class="action-desc">$1</em>',
      flags: "g",
      applyTo: { render: true, request: false },
      targetRoles: ["assistant"],
    },
  ],

  wrapper: {
    template: '<span class="roleplay-action">*$content*</span>',
  },

  trustHtml: true,
};
```

---

## 5. 安全性考量

### 5.1 HTML 注入防护

默认情况下（`trustHtml: false`），块内容在进入管道之前会进行 HTML 实体转义：

```typescript
// < → &lt;
// > → &gt;
// & → &amp;
// " → &quot;
// ' → &#39;
```

这确保了用户输入或 LLM 输出中的恶意 HTML 不会被执行。

### 5.2 信任模式

当 `trustHtml: true` 时：

- 块内容**不会**被转义
- 管道输出的 HTML **直接嵌入**最终文档
- **仅应用于受信任的规则**（如系统预设或管理员配置）

### 5.3 最终 Sanitize

无论如何，富文本渲染器的最后一道防线仍然是 DOMPurify：

```typescript
// 在 RichTextRenderer 中
import DOMPurify from 'dompurify';

const sanitizedHtml = DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['div', 'span', 'em', 'strong', ...],
  ALLOWED_ATTR: ['class', 'data-*', 'style', ...],
});
```

---

## 6. 与 CustomBlockRule 草案的对比

| 维度             | CustomBlockRule (草案)       | Regex Block Pipeline (本方案) |
| ---------------- | ---------------------------- | ----------------------------- |
| 实现层           | 富文本渲染器 Tokenizer       | Chat 正则管道                 |
| 输出格式         | AST 节点 (`CustomBlockNode`) | HTML 字符串                   |
| 灵活性           | 需要注册组件                 | 纯配置，无需代码              |
| 嵌套支持         | 复杂（需修改 Parser）        | 简单（正则递归）              |
| 与现有系统的耦合 | 高（需改 Tokenizer）         | 低（独立预处理）              |
| 适用场景         | 复杂交互组件                 | 纯展示型格式转换              |

**建议**：

- 对于**纯展示型**的格式转换（VCP、角色扮演格式化），使用本方案
- 对于需要**复杂交互**的场景（可展开面板、状态管理），继续推进 CustomBlockRule

两者可以共存，各司其职。

---

## 7. 实施路线图

### Phase 1: 核心类型与算法

1. [ ] 新增 `ChatRegexBlockRule` 类型定义
2. [ ] 实现 `regexBlockProcessor.ts` 核心算法
3. [ ] 修改 `applyRegexRules` 集成块处理
4. [ ] 单元测试

### Phase 2: UI 支持

1. [ ] 扩展 `ChatRegexEditor.vue` 支持块规则编辑
2. [ ] 新增「块模式」配置表单
3. [ ] 新增「管道子规则」列表编辑器
4. [ ] 新增「包装器模板」编辑器

### Phase 3: 预设与示例

1. [ ] 创建 VCP 协议规则预设
2. [ ] 创建角色扮演格式规则预设
3. [ ] 编写用户文档和示例

### Phase 4: 高级功能

1. [ ] 支持异步管道（用于需要外部 API 的场景）
2. [ ] 支持条件管道（根据匹配内容动态选择规则）
3. [ ] 支持块间引用（一个块的输出作为另一个块的输入）

---

## 8. 附录：正则表达式安全注意事项

### 8.1 ReDoS 防护

复杂的正则表达式可能导致正则表达式拒绝服务攻击（ReDoS）。建议：

1. 对用户自定义的正则设置超时
2. 使用 `safe-regex` 库检测危险模式
3. 限制正则的复杂度（回溯次数限制）

```typescript
import safeRegex from "safe-regex";

function validateRegex(pattern: string): boolean {
  if (!safeRegex(pattern)) {
    console.warn(`[Security] 潜在的 ReDoS 风险: ${pattern}`);
    return false;
  }
  return true;
}
```

### 8.2 建议的正则复杂度限制

- 最大长度：500 字符
- 最大嵌套深度：5 层
- 禁止的模式：`(.+)+`, `(.*)*`, `([a-z]+)+` 等

---

## 9. 总结

本方案通过扩展现有的 `ChatRegexRule` 系统，以最小的改动成本实现了：

1. **块级内容识别** - 支持任意定界符（字符串或正则）
2. **管道处理** - 对块内容依次应用多个子规则
3. **HTML 输出** - 直接生成样式化的 HTML

这使得 VCP 协议、SillyTavern 特殊格式等需求可以通过**纯配置**方式实现，无需修改富文本渲染器核心代码，同时保持了与现有正则系统的完全兼容。
