# 会话变量系统设计方案 (Session Variable System)

> **设计理念**: 依附于上下文管道的自然特性，实现零缓存、实时计算的变量系统。
>
> **状态**: 📋 设计审查中 | **版本**: v0.2

---

## 1. 核心机制

### 1.1 管道天然支持分支 (路径已过滤)

由于上下文管道在 [`session-loader`](../core/context-processors/session-loader.ts) 阶段已完成了从 `activeLeafId` 到根节点的路径提取，变量处理器面对的是一个**纯粹的线性消息流**：

- **无状态计算**：处理器无需感知对话树的分支结构。
- **天然隔离**：不同分支的变量状态通过 `PipelineContext` 的生命周期自然隔离。
- **无需回溯**：由于 `context.messages` 仅包含当前路径，处理器只需从前往后单向扫描。

### 1.2 实时计算与快照继承

变量状态作为管道执行的派生数据，支持基于快照的增量计算：

| 特性           | 说明                                                                    |
| -------------- | ----------------------------------------------------------------------- |
| **触发时机**   | 每次构建上下文（发送消息、打开分析器、预览 Token）时自动运行            |
| **存储位置**   | 仅存在于 `PipelineContext.sharedData` 中，供后续处理器消费              |
| **持久化策略** | 变量配置存储在 Agent 中，计算出的变量值**不持久化**                     |
| **快照机制**   | **【核心】** 压缩节点会持久化变量快照，处理器支持从最近快照开始增量计算 |

### 1.3 管道集成与渲染架构

本系统采用 **"计算与渲染分离"** 的架构，并引入 **"动态资产注入"** 机制以支持字体等富媒体资源：

1.  **上下文管道 (Context Pipeline)**: 负责解析变量操作、维护变量状态，但不修改消息内容。
2.  **资产加载器 (Asset Loader)**: 负责动态注册 Agent 专属资源（如自定义字体）。
3.  **富文本渲染器 (Rich Text Renderer)**: 负责将变量标签 `<var>` 渲染为可视化的 UI 组件。

```
┌─────────────────────────────────────────────────────────────────┐
│                     上下文管道 (Context Pipeline)                │
├─────────────────────────────────────────────────────────────────┤
│  session-loader (100)                                           │
│       ↓                                                         │
│  injection-assembler (400)  ← 宏处理 (var/getvar)               │
│       ↓                                                         │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  variable-processor (450)  ← 【新增】会话变量处理         │   │
│  │    - 扫描 context.messages                               │   │
│  │    - 解析 <var> 标签属性 (name, op, value)                │   │
│  │    - 计算最终状态 → sharedData.sessionVariables          │   │
│  │    - 【注意】保留原始 <var> 标签供前端渲染                 │   │
│  │    - 调用宏引擎处理 {{svar::xxx}}                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│       ↓                                                         │
│  transcription-processor (500)                                  │
│       ↓                                                         │
│  worldbook-processor (600)                                      │
│       ↓                                                         │
│  token-limiter (700)                                            │
│       ↓                                                         │
│  message-formatter (800)                                        │
│       ↓                                                         │
│  asset-resolver (900)                                           │
└─────────────────────────────────────────────────────────────────┘
```

**宏系统关系**:

| 宏             | 注册位置      | 触发时机            | 说明                                     |
| -------------- | ------------- | ------------------- | ---------------------------------------- |
| `var`/`getvar` | MacroRegistry | injection-assembler | 现有局部变量                             |
| `svar`         | MacroRegistry | variable-processor  | 计算完成后，处理器主动调用宏引擎进行替换 |

**设计理念**：宏系统是通用的文本处理基础设施，可被任何处理器按需调用。`svar` 宏注册到全局 `MacroRegistry`，但其执行时机由 `variable-processor` 主动控制——在变量状态计算完成后立即调用宏引擎处理消息中的 `{{svar::xxx}}`。这既保证了数据生产与消费的同步性，又复用了宏引擎的统一解析能力。

---

### 1.4 字体资产联动 (Font Asset Integration)

为了增强表现力，系统支持将字体文件作为 Agent 资产进行管理，并与变量样式联动。

1.  **配置定义**: 在 `variableConfig.fontAssets` 中定义字体名称与资产路径的映射。
2.  **动态注册**: 会话加载时，系统解析 `agent-asset://` 路径，使用 `FontFace` API 将字体注册到全局（命名空间隔离，如 `Agent_{ID}_FontName`）。
3.  **样式引用**: 在 `customStyles` 中通过 `font-family` 引用这些字体。

## 2. 压缩支持与快照机制 (Compression & Snapshots)

为了应对长对话触发的“上下文压缩”，变量系统必须支持快照继承。

### 2.1 快照存储

压缩节点（`isCompressionNode: true`）的 `metadata` 中将包含变量快照：

```typescript
// 扩展 ChatMessageMetadata (src/tools/llm-chat/types/message.ts)
export interface ChatMessageMetadata {
  // ... 现有字段
  sessionVariableSnapshot?: {
    /** 压缩发生时的变量最终值 (保持嵌套结构) */
    values: Record<string, VariableValue>;
    /** 压缩时的累计变更历史条数 (可选) */
    historyCount?: number;
  };
}
```

### 2.2 增量计算流程

`variable-processor` 的执行逻辑更新为：

1.  **寻找基准点**: 在 `context.messages` 中从后往前搜索，找到第一个包含 `sessionVariableSnapshot` 的节点。
2.  **初始化**:
    - 若找到，则 `state.values = snapshot.values`。
    - 若未找到，则 `state.values = config.initialValues`。
3.  **扫描**: 从基准点之后的第一个消息开始扫描，直到最后一个消息。

---

## 3. 数据结构

### 3.1 变量配置 (VariableConfig)

存储在 [`ChatAgent`](../types/agent.ts) 中。

```typescript
// 文件: src/tools/llm-chat/types/sessionVariable.ts

/** 变量值类型 (支持嵌套和列表) */
export type VariableValue = string | number | boolean | null | VariableValue[] | { [key: string]: VariableValue };

/** 变量操作类型 */
export type VariableOperation =
  | "set" // 直接赋值 (支持 JSON 字符串转对象)
  | "add" // 数值加法 / 路径数值增加
  | "sub" // 数值减法
  | "mul" // 数值乘法
  | "div" // 数值除法
  | "append" // 字符串追加
  | "push" // 向数组添加元素
  | "remove" // 从数组移除元素 (匹配值)
  | "merge" // 对象属性合并 (Object.assign)
  | "reset"; // 重置为初始值

/**
 * 路径访问支持:
 * 变量名支持点号路径 (如 "stats.hp") 和数组索引 (如 "inventory.0")
 * 系统将自动解析路径并更新嵌套对象
 */

/** 数值边界定义 */
export interface VariableBoundary {
  /** 最小值 */
  min?: number;
  /** 最大值 */
  max?: number;
  /** 步长 (可选，用于对齐) */
  step?: number;
}

/** 变量类型定义 */
export type VariableType = "string" | "number" | "boolean" | "object" | "array" | "any";

/** 变量定义 */
export interface VariableDefinition {
  /**
   * 初始值
   * 系统将根据初始值自动推断变量类型 (Schema)
   * 例如: initialValue: { hp: 100 } -> 推断为 object，且包含数值型 hp 属性
   */
  initialValue: VariableValue;

  /**
   * 显式类型声明 (可选)
   * 用于 initialValue 为 null 或空数组时明确类型
   */
  type?: VariableType;

  /** 数值边界 (仅对数值类型有效) */
  boundary?: VariableBoundary;

  /**
   * 计算表达式 (派生变量)
   * 如果提供此项，变量将变为只读，其值由表达式实时计算
   * 示例: "stats.str * 2 + equipment.atk"
   */
  computed?: string;

  /**
   * 是否隐藏 (默认: false)
   * true: 不会在 {{svars}} 宏或通用 UI 列表中展示，仅用于后台逻辑或显式引用
   */
  hidden?: boolean;

  /**
   * 是否只读 (默认: false)
   * true: 禁止通过 <var> 标签进行修改
   */
  readonly?: boolean;

  /** 显示名称 (用于 UI 展示) */
  displayName?: string;
  /** 描述 */
  description?: string;
}

/** 扫描范围配置 */
export interface VariableScanScope {
  /** 是否扫描预设消息 (System/Character Card) */
  includePresets: boolean;
  /** 是否扫描用户消息 */
  includeUser: boolean;
  /** 是否扫描助手消息 */
  includeAssistant: boolean;
  /** 排除的消息来源类型 */
  excludeSourceTypes?: string[];
}

/** 变量配置 (存储在 ChatAgent 中) */
export interface VariableConfig {
  enabled: boolean;

  /**
   * 严格模式 (默认: true)
   * true: 仅允许操作 definitions 中已定义的变量 (包括嵌套路径必须存在于初始结构中)
   * false: 允许 LLM 动态创建新变量
   */
  strictMode?: boolean;

  /** 变量定义 (Key 为变量名) */
  definitions: Record<string, VariableDefinition>;

  /**
   * 自定义样式类映射
   * Key: 类名 (如 "hp-critical")
   * Value: CSS 样式字符串 (如 "color: red; font-weight: bold;")
   */
  customStyles?: Record<string, string>;

  /**
   * 字体资产配置
   * Key: 字体名称 (如 "PixelFont")
   * Value: 资产协议路径 (如 "agent-asset://fonts/pixel.woff2")
   */
  fontAssets?: Record<string, string>;

  /** 扫描范围配置 */
  scanScope?: VariableScanScope;
}
```

**默认扫描范围**:

```typescript
const DEFAULT_SCAN_SCOPE: VariableScanScope = {
  includePresets: false, // 不扫描预设，避免示例被误执行
  includeUser: true,
  includeAssistant: true,
  excludeSourceTypes: [],
};
```

### 3.2 运行态状态 (VariableState)

存在于 `PipelineContext.sharedData`，键名为 `sessionVariables`。

```typescript
/** 变量变更记录 */
export interface VariableChange {
  /** 消息在 context.messages 中的索引 */
  messageIndex: number;
  /** 消息来源 ID */
  sourceId?: string;
  /** 执行的操作 */
  op: VariableOperation;
  /** 变量名 */
  name: string;
  /** 操作前的值 */
  previousValue: string | number | undefined;
  /** 操作后的值 */
  newValue: string | number;
  /** 原始匹配文本 */
  rawMatch?: string;
}

/** 变量运行态状态 */
export interface VariableState {
  /** 当前变量值 (支持嵌套对象和数组) */
  values: Record<string, VariableValue>;
  /** 变更历史 (用于 UI 调试展示) */
  changeHistory: VariableChange[];
  /** 处理过程中的错误 */
  errors?: Array<{
    messageIndex: number;
    ruleId: string;
    error: string;
  }>;
}
```

**sharedData 读写示例**:

```typescript
// 写入 (variable-processor)
context.sharedData.set("sessionVariables", state);

// 读取 (svar 宏)
const state = context.sharedData.get("sessionVariables") as VariableState | undefined;
const value = state?.values[varName] ?? "";
```

---

## 4. 处理器实现

### 4.1 处理器定义

```typescript
// 文件: src/tools/llm-chat/core/context-processors/variable-processor.ts

import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import type { ProcessableMessage } from "../../types/context";
import type {
  VariableConfig,
  VariableState,
  VariableChange,
  VariableOperation,
  VariableScanScope,
} from "../../types/sessionVariable";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("primary:variable-processor");

const DEFAULT_SCAN_SCOPE: VariableScanScope = {
  includePresets: false,
  includeUser: true,
  includeAssistant: true,
  excludeSourceTypes: [],
};

export const variableProcessor: ContextProcessor = {
  id: "primary:variable-processor",
  name: "会话变量处理器",
  description: "从消息历史中提取变量操作并计算当前状态",
  priority: 450,
  defaultEnabled: true,

  execute: async (context: PipelineContext) => {
    const config = context.agentConfig.variableConfig as VariableConfig | undefined;

    if (!config?.enabled || !config.definitions) {
      logger.debug("变量处理器已跳过：未启用或无定义");
      return;
    }

    // --- 寻找快照基准 ---
    let startIndex = 0;
    let currentValues: Record<string, VariableValue> = {};

    // 初始化：从 definitions 中提取初始结构
    for (const [key, def] of Object.entries(config.definitions)) {
      // 只有根变量（不含点号的）才直接放入初始 values
      if (!key.includes(".")) {
        currentValues[key] = cloneDeep(def.initialValue);
      }
    }

    for (let i = context.messages.length - 1; i >= 0; i--) {
      const msg = context.messages[i] as ProcessableMessage;
      const snapshot = msg.metadata?.sessionVariableSnapshot;
      if (snapshot) {
        currentValues = cloneDeep(snapshot.values);
        startIndex = i + 1;
        break;
      }
    }

    const state: VariableState = {
      values: currentValues,
      changeHistory: [],
      errors: [],
    };

    const scope = config.scanScope ?? DEFAULT_SCAN_SCOPE;

    for (let i = startIndex; i < context.messages.length; i++) {
      const msg = context.messages[i] as ProcessableMessage;

      if (!shouldScanMessage(msg, scope)) continue;

      try {
        // 使用正则提取 <var> 标签属性
        const changes = extractVariableOperations(msg.content, i, msg.sourceId);
        for (const change of changes) {
          applyVariableChange(state, change, config.definitions);
        }
      } catch (error) {
        state.errors?.push({
          messageIndex: i,
          ruleId: "parse-error",
          error: error instanceof Error ? error.message : String(error),
        });
        logger.warn("变量解析失败", { messageIndex: i, error });
      }
    }

    // --- 计算派生变量 (Computed Variables) ---
    for (const [key, def] of Object.entries(config.definitions)) {
      if (def.computed) {
        try {
          // 简单的表达式求值 (实际实现时建议使用安全沙箱或简单的数学解析器)
          const result = evaluateExpression(def.computed, state.values);
          set(state.values, key, result);
        } catch (err) {
          logger.warn(`派生变量 '${key}' 计算失败`, { expression: def.computed, err });
        }
      }
    }

    context.sharedData.set("sessionVariables", state);
    logger.info("变量处理完成", {
      variableCount: Object.keys(state.values).length,
      changeCount: state.changeHistory.length,
      errorCount: state.errors?.length ?? 0,
    });

    context.logs.push({
      processorId: "primary:variable-processor",
      level: "info",
      message: `变量处理完成，当前 ${Object.keys(state.values).length} 个变量`,
    });
  },
};
```

### 4.2 辅助函数

```typescript
function shouldScanMessage(msg: ProcessableMessage, scope: VariableScanScope): boolean {
  if (msg.sourceType === "agent_preset" && !scope.includePresets) return false;
  if (msg.role === "user" && !scope.includeUser) return false;
  if (msg.role === "assistant" && !scope.includeAssistant) return false;
  if (scope.excludeSourceTypes?.includes(msg.sourceType || "")) return false;
  return true;
}

function extractVariableOperations(content: string, messageIndex: number, sourceId?: string): VariableChange[] {
  const changes: VariableChange[] = [];
  // 匹配 <var ... /> 或 <var ...>...</var>
  // 捕获属性字符串
  const tagRegex = /<var\s+([^>]+)(?:\/>|>(.*?)<\/var>)/gi;

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(content)) !== null) {
    const attrsString = match[1];
    const attrs = parseAttributes(attrsString);

    if (!attrs.name || !attrs.value) continue;

    // 解析 op (默认为 set)
    const op = (attrs.op as VariableOperation) || "set";

    // 解析 value (支持 JSON 对象解析)
    let value: any;
    try {
      // 尝试解析为 JSON (对象/数组/布尔/数字/null)
      value = JSON.parse(attrs.value);
    } catch {
      // 解析失败则回退为数值或原始字符串
      const numValue = Number(attrs.value);
      value = isNaN(numValue) ? attrs.value : attrs.value;
    }

    changes.push({
      messageIndex,
      sourceId,
      op,
      name: attrs.name,
      previousValue: undefined,
      newValue: value as any,
      rawMatch: match[0],
    });
  }

  return changes;
}

function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // 简单的属性解析正则: name="value" 或 name='value' 或 name=value
  const attrRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;

  let match;
  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = match[1];
    const value = match[2] || match[3] || match[4];
    attrs[key] = value;
  }
  return attrs;
}

import { get, set, cloneDeep } from "lodash-es"; // 假设引入 lodash 工具

function applyVariableChange(state: VariableState, change: VariableChange, config: VariableConfig): void {
  const { name, op } = change;
  const definitions = config.definitions || {};
  const strictMode = config.strictMode ?? true;

  // 1. 严格模式检查
  // 检查变量是否已定义（支持嵌套路径检查）
  // 逻辑：如果 definitions["stats"] 存在且 initialValue 包含 hp，则 "stats.hp" 合法
  if (strictMode && !isValidPath(name, definitions)) {
    throw new Error(`变量 '${name}' 未定义且 strictMode=true`);
  }

  // 1.1 只读检查
  const definition = definitions[name]; // 优先精确匹配
  if (definition?.readonly || definition?.computed) {
    throw new Error(`变量 '${name}' 是只读的，无法修改`);
  }

  // 2. 获取当前值 (支持嵌套路径)
  const currentValue = get(state.values, name);

  // 3. 获取元数据定义 (用于边界和类型检查)

  change.previousValue = currentValue as string | number | undefined;

  let newValue: any;
  const numCurrent = Number(currentValue);
  const numChange = Number(change.newValue);

  // 3. 执行计算
  switch (op) {
    case "set":
      newValue = change.newValue;
      break;
    case "add":
      newValue = (isNaN(numCurrent) ? 0 : numCurrent) + numChange;
      break;
    case "sub":
      newValue = (isNaN(numCurrent) ? 0 : numCurrent) - numChange;
      break;
    case "mul":
      newValue = (isNaN(numCurrent) ? 0 : numCurrent) * numChange;
      break;
    case "div":
      newValue = numChange !== 0 ? (isNaN(numCurrent) ? 0 : numCurrent) / numChange : 0;
      break;
    case "append":
      newValue = String(currentValue ?? "") + String(change.newValue);
      break;
    case "push":
      // 数组操作：确保当前值是数组
      const arr = Array.isArray(currentValue) ? [...currentValue] : [];
      arr.push(change.newValue);
      newValue = arr;
      break;
    case "merge":
      // 对象合并
      newValue = { ...(typeof currentValue === "object" ? currentValue : {}), ...change.newValue };
      break;
    case "reset":
      // 重置逻辑：
      // 1. 优先使用精确定义的 initialValue
      // 2. 如果没有精确定义（嵌套路径场景），尝试从父级定义的 initialValue 中提取
      if (definition?.initialValue !== undefined) {
        newValue = definition.initialValue;
      } else {
        // 回溯查找父级初始值 (Smart Reset)
        // 例如 name="stats.hp"，若无直接定义，则查找 definitions["stats"] 并提取 .hp 属性
        newValue = findInitialValueFromParent(name, definitions) ?? "";
      }
      break;
    default:
      newValue = change.newValue;
  }

  // 4. 应用边界约束 (仅对数值有效)
  if (typeof newValue === "number" && definition?.boundary) {
    const { min, max } = definition.boundary;
    if (min !== undefined && newValue < min) newValue = min;
    if (max !== undefined && newValue > max) newValue = max;
  }

  // 5. 更新状态 (支持嵌套路径写入)
  // 注意：直接修改 state.values
  set(state.values, name, newValue);

  // 更新 change 记录
  change.newValue = newValue;
  state.changeHistory.push(change);
}
```

### 4.3 处理器注册

在 [`contextPipelineStore.ts`](../stores/contextPipelineStore.ts) 中注册：

```typescript
import { variableProcessor } from "../core/context-processors/variable-processor";

const getInitialProcessors = (): ContextProcessor[] => {
  return [
    sessionLoader, // 100
    regexProcessor, // 200
    injectionAssembler, // 400
    variableProcessor, // 450 【新增】
    transcriptionProcessor, // 500
    worldbookProcessor, // 600
    tokenLimiter, // 700
    messageFormatter, // 800
    assetResolver, // 900
  ];
};
```

---

## 5. 集成点

### 4.1 Agent 类型扩展

在 [`ChatAgent`](../types/agent.ts) 接口中添加：

```typescript
export interface ChatAgent {
  // ... 现有字段 ...

  /** 会话变量配置 */
  variableConfig?: VariableConfig;
}
```

### 4.2 宏系统集成

#### 4.2.1 宏定义

参考 [`{{assets}}`](../macro-engine/macros/assets.ts) 宏的实现模式，在 [`macro-engine/macros/sessionVariables.ts`](../macro-engine/macros/sessionVariables.ts) 中创建会话变量宏模块：

```typescript
// 文件: src/tools/llm-chat/macro-engine/macros/sessionVariables.ts

/**
 * 会话变量相关宏
 * 提供 {{svar}} 和 {{svars}} 宏，用于读取和展示会话变量
 *
 * 设计参考: assets.ts 的实现模式
 */

import type { MacroRegistry } from "../MacroRegistry";
import { MacroPhase, MacroType } from "../MacroRegistry";
import type { MacroDefinition } from "../MacroRegistry";

/**
 * 注册会话变量宏
 */
export function registerSessionVariableMacros(registry: MacroRegistry): void {
  const sessionVariableMacros: MacroDefinition[] = [
    // 获取单个会话变量值
    {
      name: "svar",
      type: MacroType.VARIABLE,
      phase: MacroPhase.SUBSTITUTE,
      description: "获取会话变量值（从消息历史中实时计算）",
      example: "{{svar::mood}}",
      acceptsArgs: true,
      argCount: 1,
      priority: 85,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 1) {
          return "[错误: svar 需要1个参数]";
        }
        const varName = args[0];
        const sessionVars = context.sessionVariables;
        if (!sessionVars) {
          // 静默返回空字符串，避免在未启用变量系统时产生噪音
          return "";
        }
        const value = sessionVars.values[varName];
        return value !== undefined ? String(value) : "";
      },
    },

    // 列出所有会话变量（参考 {{assets}} 的设计）
    {
      name: "svars",
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: "列出当前会话的所有变量及其值。可选参数：format (json/table/list)",
      example: "{{svars}}",
      acceptsArgs: true,
      argCount: 1,
      priority: 85,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        const sessionVars = context.sessionVariables;
        if (!sessionVars || Object.keys(sessionVars.values).length === 0) {
          return "No session variables available.";
        }

        const format = args?.[0] || "list";
        const definitions = context.agent?.variableConfig?.definitions || {};

        // 过滤掉隐藏变量
        const varNames = Object.keys(sessionVars.values)
          .filter((name) => !definitions[name]?.hidden)
          .sort();

        if (varNames.length === 0) {
          return "No visible session variables.";
        }

        const values = sessionVars.values;

        switch (format) {
          case "json":
            return JSON.stringify(values, null, 2);

          case "table":
            // Markdown 表格格式
            let table = "| Variable | Value | Description |\n";
            table += "|----------|-------|-------------|\n";
            for (const name of varNames) {
              const value = values[name];
              const desc = definitions[name]?.description || "-";
              table += `| ${name} | ${value} | ${desc} |\n`;
            }
            return table.trim();

          case "list":
          default:
            // 简洁列表格式（默认）
            let output = "Session Variables:\n";
            for (const name of varNames) {
              const value = values[name];
              const desc = definitions[name]?.description;
              output += `- ${name}: ${value}`;
              if (desc) {
                output += ` (${desc})`;
              }
              output += "\n";
            }
            return output.trim();
        }
      },
    },

    // 检查变量是否存在
    {
      name: "svar_exists",
      type: MacroType.FUNCTION,
      phase: MacroPhase.SUBSTITUTE,
      description: '检查会话变量是否存在，返回 "true" 或 "false"',
      example: "{{svar_exists::mood}}",
      acceptsArgs: true,
      argCount: 1,
      priority: 85,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        if (!args || args.length < 1) {
          return "false";
        }
        const varName = args[0];
        const sessionVars = context.sessionVariables;
        if (!sessionVars) {
          return "false";
        }
        return varName in sessionVars.values ? "true" : "false";
      },
    },
  ];

  registry.registerMany(sessionVariableMacros);
}
```

**宏功能对照表**（参考 Agent 资产宏设计）：

| 宏名称        | 类似于   | 功能             | 示例                             |
| ------------- | -------- | ---------------- | -------------------------------- |
| `svar`        | -        | 获取单个变量值   | `{{svar::mood}}` → `65`          |
| `svars`       | `assets` | 列出所有变量     | `{{svars}}` / `{{svars::json}}`  |
| `svar_exists` | -        | 检查变量是否存在 | `{{svar_exists::mood}}` → `true` |

#### 4.2.2 MacroContext 扩展

在 [`MacroContext.ts`](../macro-engine/MacroContext.ts) 中扩展接口：

```typescript
import type { VariableState } from "../types/sessionVariable";

export interface MacroContext {
  // ... 现有字段 (参考 agent?: ChatAgent 的模式) ...

  /** 会话变量状态 (由 variable-processor 计算并注入) */
  sessionVariables?: VariableState;
}
```

同时更新 [`createMacroContext()`](../macro-engine/MacroContext.ts:65) 函数：

```typescript
export function createMacroContext(options: {
  // ... 现有参数 ...
  sessionVariables?: VariableState;
}): MacroContext {
  return {
    // ... 现有字段 ...
    sessionVariables: options.sessionVariables,
  };
}
```

#### 4.2.3 宏注册入口

在 [`macro-engine/index.ts`](../macro-engine/index.ts) 中注册会话变量宏：

```typescript
// 新增导入
import { registerSessionVariableMacros } from "./macros/sessionVariables";

export function initializeMacroEngine(): void {
  const registry = MacroRegistry.getInstance();
  registry.clear();

  // 注册所有内置宏
  registerCoreMacros(registry);
  registerDateTimeMacros(registry);
  registerVariableMacros(registry);
  registerFunctionMacros(registry);
  registerSystemMacros(registry);
  registerAssetMacros(registry);
  registerSessionVariableMacros(registry); // 【新增】
}
```

#### 4.2.4 处理器内调用宏引擎

在 `variable-processor` 中，计算完变量状态后**立即调用宏引擎**处理消息：

```typescript
// variable-processor.ts execute 方法末尾

import { MacroProcessor } from "../../macro-engine/MacroProcessor";
import { createMacroContext } from "../../macro-engine/MacroContext";

// ... 在 execute 方法末尾 ...

// 1. 计算完成，存入 sharedData
context.sharedData.set("sessionVariables", state);

// 2. 构建包含 sessionVariables 的宏上下文
//    参考 assets 宏的数据注入方式：通过 context.agent 访问
const macroContext = createMacroContext({
  agent: context.agentConfig,
  session: context.session,
  userName: context.userProfile?.name,
  charName: context.agentConfig.displayName || context.agentConfig.name,
  sessionVariables: state, // 关键：注入刚计算的状态
});

// 3. 调用宏引擎处理所有消息中的 svar/svars 宏
const macroProcessor = new MacroProcessor();
const svarPattern = /\{\{svar[s_]?/; // 匹配 svar, svars, svar_exists

for (const msg of context.messages) {
  if (svarPattern.test(msg.content)) {
    const result = await macroProcessor.process(msg.content, macroContext);
    msg.content = result.text;
  }
}

logger.debug("会话变量宏处理完成", {
  processedMessages: context.messages.filter((m) => svarPattern.test(m.content)).length,
});
```

**设计要点**（参考 `{{assets}}` 宏的设计理念）：

| 设计原则     | `{{assets}}` 实现          | `{{svar}}` 实现                             |
| ------------ | -------------------------- | ------------------------------------------- |
| **数据来源** | `context.agent?.assets`    | `context.sessionVariables?.values`          |
| **数据注入** | 通过 `MacroContext.agent`  | 通过 `MacroContext.sessionVariables`        |
| **执行时机** | `injection-assembler` 阶段 | `variable-processor` 阶段（计算后立即处理） |
| **错误处理** | 返回友好提示文本           | 静默返回空字符串（避免噪音）                |

**关键差异**：

- `assets` 是静态配置，可在任意阶段读取
- `sessionVariables` 是动态计算的，必须在 `variable-processor` 计算完成后才能读取
- 因此 `svar` 宏的执行由 `variable-processor` 主动触发，而非依赖管道的默认宏处理流程

### 4.3 UI 展示

参考 [`useChatExecutor.getContextForPreview()`](../composables/useChatExecutor.ts:703) 的实现模式：

1. **上下文分析器**: 在现有分析器中增加"变量状态"标签页
2. **数据来源**: 从 `PipelineContext.sharedData.get('sessionVariables')` 获取
3. **展示内容**: 当前变量值表格、变更历史时间线、错误信息

```typescript
export interface ContextPreviewData {
  // ... 现有字段 ...

  /** 会话变量状态 */
  sessionVariables?: VariableState;
}
```

---

## 5. 待优化项

### 5.1 性能优化 (可延后)

虽然路径已被过滤，但对于超长对话（1000+ 消息），每次从头或从快照遍历全部历史仍有计算开销。

**增量方案**:

- 在 `ChatMessageNode.metadata` 中持久化单条消息产生的变量操作增量（Delta）。
- 当对话路径未发生变化（仅新增消息）时，直接在 `sharedData` 的现有状态上应用新增消息的 Delta。

**当前决策**: 优先实现基于压缩节点的快照机制，增量 Delta 视性能表现而定。

### 5.2 标签模式支持 (可延后)

当前仅支持正则模式，标签模式 `<var name="mood" op="add" value="5" />` 可作为后续增强。

**可选方案**:

- 提供内置的标签解析规则
- 在文档中提供标签模式的正则示例

---

## 6. 实现步骤

### Phase 1: 核心实现

1. 创建类型定义 `src/tools/llm-chat/types/sessionVariable.ts`
2. 创建处理器 `src/tools/llm-chat/core/context-processors/variable-processor.ts`
3. 在 `contextPipelineStore.ts` 中注册处理器
4. 扩展 `ChatAgent` 类型定义

### Phase 2: 宏集成

5. 扩展 `MacroContext` 接口，添加 `sessionVariables` 字段
6. 创建 `macro-engine/macros/sessionVariables.ts`，实现 `svar`/`svars`/`svar_exists` 宏
7. 在 `macro-engine/index.ts` 中注册会话变量宏
8. 修改 `createMacroContext()` 支持注入会话变量

### Phase 3: UI 集成

9. 扩展 `ContextPreviewData` 接口
10. 在上下文分析器中增加"变量状态"标签页
11. 在 Agent 编辑器中增加变量规则配置界面

### Phase 4: 测试与文档

12. 单元测试：正则匹配和数值运算
13. 集成测试：端到端变量计算流程
14. 用户文档：变量系统使用指南

---

## 7. 使用示例

### 7.1 基础用法：RPG 角色属性 (嵌套结构)

**Agent 配置**:

```json
{
  "variableConfig": {
    "enabled": true,
    "definitions": {
      // 定义根对象
      "stats": {
        "initialValue": {
          "hp": 100,
          "mp": 50,
          "str": 10
        },
        "displayName": "角色属性"
      },
      // 为嵌套路径定义边界 (可选)
      "stats.hp": {
        "initialValue": 100,
        "boundary": { "min": 0, "max": 100 },
        "displayName": "生命值"
      },
      "inventory": {
        "initialValue": [],
        "displayName": "背包"
      },
      // 派生变量示例：攻击力
      "stats.atk": {
        "initialValue": 0,
        "computed": "stats.str * 2 + 5", // 自动根据力量计算
        "readonly": true,
        "displayName": "攻击力",
        "description": "基于力量自动计算"
      },
      // 隐藏变量示例：好感度内部计数
      "internal_trust": {
        "initialValue": 0,
        "hidden": true, // 不会在 {{svars}} 中显示
        "description": "内部精确好感度"
      }
    },
    "customStyles": {
      "mood-up": "color: #67c23a; font-weight: bold;",
      "trust-up": "color: #409eff;"
    },
    "fontAssets": {
      "PixelFont": "agent-asset://fonts/pixel-operator.woff2",
      "HandWriting": "agent-asset://fonts/dancing-script.ttf"
    }
  }
}
```

**对话示例 (LLM 输出)**:

```xml
User: 攻击史莱姆！
Assistant: 你挥剑砍向史莱姆！<var name="stats.hp" op="sub" value="10" class="hp-damage">受到反击伤害</var>
同时你获得了一个道具。<var name="inventory" op="push" value="史莱姆凝液" />
```

**添加复杂物品示例 (JSON 支持)**:

```xml
Assistant: 你打开了宝箱。<var name="inventory" op="push" value='{"name":"治疗药水","effect":"恢复50HP","count":1}' />
```

**计算结果**:

```json
{
  "values": {
    "stats": { "hp": 90, "mp": 50, "str": 10, "atk": 25 },
    "inventory": ["史莱姆凝液"]
  },
  "changeHistory": [
    { "messageIndex": 1, "op": "sub", "name": "stats.hp", "previousValue": 100, "newValue": 90 },
    {
      "messageIndex": 1,
      "op": "push",
      "name": "inventory",
      "previousValue": [],
      "newValue": ["史莱姆凝液"]
    }
  ]
}
```

### 7.2 在 System Prompt 中使用

```
你是一个情绪敏感的角色。当前情绪值: {{svar::mood}}，信任度: {{svar::trust}}。

根据这些数值调整你的回复风格：
- mood < 30: 表现得沮丧或冷淡
- mood 30-70: 正常友好
- mood > 70: 非常热情开朗
```

### 7.3 使用 `{{svars}}` 宏展示所有变量

**在 System Prompt 中注入变量状态**（参考 `{{assets}}` 的用法）：

```
# 角色状态

{{svars}}

请根据以上状态值调整你的行为和语气。
```

**输出示例**：

```
# 角色状态

Session Variables:
- mood: 65 (角色的情绪值，0-100)
- trust: 45 (对用户的信任度)
- energy: 80

请根据以上状态值调整你的行为和语气。
```

**JSON 格式输出**（适合需要结构化数据的场景）：

```
当前角色状态：
{{svars::json}}
```

输出：

```
当前角色状态：
{
  "mood": 65,
  "trust": 45,
  "energy": 80
}
```

# 会话变量系统 UI 设计方案 (Session Variable UI Design)

> **设计目标**: 提供直观的变量规则配置界面和透明的运行态调试工具，确保用户能理解并掌控变量的演变过程。

---

## 1. Agent 编辑器配置界面 (SessionVariableConfigPanel)

### 1.1 入口位置

在 `EditAgentDialog.vue` 的 `el-collapse` 中新增 **"会话变量规则"** 折叠项，或者作为一个独立的 Tab。鉴于系统复杂度，建议在 `el-collapse` 中新增一个项，与 "文本替换规则" 并列。

### 1.2 界面布局

#### A. 基础设置与扫描范围

- **启用开关**: 控制该 Agent 是否启用变量系统。
- **扫描范围配置**:
  - `includePresets`: 勾选框，"扫描预设消息"（默认关闭，防止示例干扰）。
  - `includeUser`: 勾选框，"扫描用户消息"。
  - `includeAssistant`: 勾选框，"扫描助手消息"。
  - `excludeSourceTypes`: 标签输入框，用于排除特定的消息来源（如 `plugin_output`）。

#### B. 变量定义 (Variable Definitions)

- **交互**:
  - **树形/嵌套编辑器**: 支持对象和数组的层级化编辑。用户应能像操作 JSON 树一样添加子属性，而非手动输入点号路径。
  - **自动路径推导**: 系统应根据嵌套结构自动派生点号路径 (如 `stats.hp`)。
  - **局部覆盖支持**: 允许用户为嵌套路径单独定义“显示名称”或“边界约束”，而不必破坏父级对象的完整性。
- **列定义**:
  - **变量名/路径**: 唯一标识符，支持树形层级展示。
  - **初始值**: 变量的起始值（支持基础类型或复杂的 JSON 对象/数组）。
  - **显示名称**: UI 展示用的友好名称。
  - **边界约束**: 最小值/最大值 (仅数值类型可用，支持对嵌套数值属性的单独约束)。
  - **描述**: 备注说明。

#### C. 样式配置 (Style Configuration)

- **自定义样式表 (Custom Styles)**:
  - **交互**: 键值对编辑器。
  - **Key**: 样式类名 (如 `hp-critical`, `gold-gain`)。
  - **Value**: CSS 样式字符串 (如 `color: red; font-weight: bold;`)。
  - **预览**: 提供一个示例文本，实时应用当前编辑的样式。

- **System Prompt 预览**:
  - 自动生成一段说明文本，展示当前配置的变量语法和可用样式类，供用户复制到 System Prompt 中。

---

## 2. 上下文分析器调试界面 (VariableStatusView)

### 2.1 入口位置

在 `ContextAnalyzerDialog.vue` 中新增 **"变量状态" (Variables)** 标签页。

### 2.2 界面布局

#### A. 当前变量值 (Live Values)

- **展示方式**: 顶部展示一组状态卡片（Badge 风格）。
- **内容**: 变量名及其计算后的最终值。
- **状态提示**: 如果变量值相比初始值有变化，高亮显示。

#### B. 变更历史时间线 (Change History)

- **展示方式**: 垂直时间线 (Timeline)。
- **条目内容**:
  - **左侧**: 消息索引/角色图标。
  - **中间**: 变更详情。例如：`mood` + `5` -> `55` (原值: `50`)。
  - **右侧**: 触发该变更的原始文本片段（`rawMatch`），并使用 `mark.highlight-match` 样式高亮。
- **交互**:
  - 点击时间线条目，自动定位并高亮 "结构化视图" 中对应的消息。
  - 悬停在 `rawMatch` 上显示该变更所属的规则名称。

#### C. 错误诊断 (Errors)

- **展示方式**: 仅在有错误时显示的警告列表。
- **内容**: 消息索引、规则 ID、具体的错误信息（如“无法将 'abc' 转换为数字进行加法运算”）。

---

## 3. 富文本渲染集成 (Rich Text Rendering)

### 3.1 VarNode 组件

`<var>` 标签将作为富文本渲染器的一等公民，由 `VarNode.vue` 组件负责渲染。

#### 属性支持

- `name`, `op`, `value`: 核心逻辑属性。
- `class`: 引用内置类或自定义样式类。
- `style`: 内联样式 (经过安全过滤)。
- `icon`: 图标 URL、Emoji 或 Agent 资产协议 (`agent-asset://...`)。
- `silent`: 是否静默 (不渲染任何内容)。

#### 渲染模式

1.  **徽章模式 (Badge)**:
    - 默认外观。
    - 显示图标 + 变化值 (如 `[❤️ +5]`) 或 显示文本。
    - 鼠标悬停显示完整信息 (变量名、当前值、变化前值)。

2.  **内联文本模式 (Inline)**:
    - 当标签内有文本内容且未指定特殊样式类时使用。
    - 融入正文，可应用颜色或下划线装饰。

3.  **静默模式 (Silent)**:
    - 当 `silent` 属性存在时，组件渲染为 `<!-- var -->` 注释，不占据 UI 空间。

#### 交互设计

- **Hover**: 显示 Tooltip，包含变量的完整状态变更信息 (`mood: 50 -> 55`)。
- **Click**: (可选) 在侧边栏的"变量状态"视图中高亮该变量的历史记录。

### 3.2 样式系统

#### 内置语义化类

- `.var-success`: 绿色系，用于正面增益。
- `.var-danger`: 红色系，用于负面减益或警告。
- `.var-warning`: 橙色系，用于一般警告。
- `.var-info`: 灰色/蓝色系，用于中性提示。
- `.var-pulse`, `.var-shake`: 预定义的 CSS 动画类。

#### 动态样式注入

- `RichTextRenderer` 会将 Agent 配置中的 `customStyles` 注入到 CSS 变量或动态 Style 标签中，使得 `VarNode` 可以解析并应用用户定义的类名。

### 3.3 动态排版 (Dynamic Typography)

针对“联动字体”的需求， UI 层需配合 System 层的字体加载机制：

- **场景**: 当角色情绪激动时使用“手写体”，系统警告时使用“像素体”。
- **实现**:
  - `customStyles` 中定义类名：`.mood-angry { font-family: 'MyHandWriting'; color: red; }`
  - `VarNode` 渲染时应用该类名，浏览器自动使用已加载的自定义字体。

### 3.4 示例渲染效果解析

针对 `session-variable-system-design.md` 中的示例：

```xml
Assistant: 你好呀！<var name="mood" op="add" value="5" class="mood-up" icon="😊">心情不错</var> 很高兴见到你！
```

**视觉表现**:

1.  **布局**: 采用 **Inline Mode**，`<var>` 标签内的 "心情不错" 会作为句子的一部分自然流动。
2.  **样式**: 应用 `.mood-up` 类（例如绿色文本）。
3.  **图标**: 在 "心情不错" 文字前插入 "😊" Emoji。
4.  **交互**: 鼠标悬停在 "心情不错" 上时，弹出一个小的 Tooltip 显示：`mood: 50 -> 55 (+5)`。

**最终效果示意**:

> 你好呀！ <span style="color: #67c23a; font-weight: bold;">😊 心情不错</span> 很高兴见到你！

---

## 4. 关键组件结构 (Component Tree)

```text
EditAgentDialog
└── el-collapse
    └── SessionVariableConfigPanel (New)
        ├── InitialValueTable
        └── RuleList
            └── RuleCard
                └── RuleEditorDialog (Popup)

ContextAnalyzerDialog
└── el-tabs
    └── VariableStatusView (New)
        ├── CurrentValuesGrid
        ├── ChangeHistoryTimeline
        └── ErrorList
```
