# Canvas Diff 智能增强方案

> **状态**: RFC  
> **范围**: `src/tools/canvas/utils/diff.ts` 及其调用链  
> **目标**: 让 diff 引擎更智能地反馈匹配质量、检测重复匹配、并在完全失败前提供模糊匹配候选

---

## 1. 现状分析

### 1.1 当前匹配策略（3 级瀑布）

| 级别 | 策略                                  | 说明                         |
| ---- | ------------------------------------- | ---------------------------- |
| L1   | `originalContent.includes(searchStr)` | 精确子串匹配                 |
| L2   | 逐行 `trimEnd()` 比较                 | 忽略行尾空格                 |
| L3   | 逐行 `trim()` 比较                    | 忽略行首尾空格（缩进不敏感） |
| 失败 | `throw Error`                         | 直接报错，无任何候选提示     |

### 1.2 当前问题

1. **无匹配质量反馈** — 函数返回 `string`，调用方不知道用了哪级策略匹配的
2. **无重复匹配检测** — L1 用 `String.replace()` 只替换第一个，但如果 search 出现多次，LLM 不知道
3. **无模糊匹配兜底** — 三级全部失败后直接 throw，即使文件中有 80% 相似的片段也不告知
4. **LLM 反馈固定** — `canvas.registry.ts:247` 永远返回 `"Successfully applied diff to ${args.path}"`，LLM 无法感知匹配质量

### 1.3 调用链

```
LLM Agent
  → canvas.registry.ts :: apply_canvas_diff()     // 返回固定成功字符串
  → canvasStore.ts :: applyDiff()                  // errorHandler.wrapAsync 包装
  → diff.ts :: applySearchReplaceDiff()            // 核心逻辑，返回 string | throw

审批预览
  → canvas.registry.ts :: onToolCallPreview()      // 同上链路

窗口同步
  → useCanvasSync.ts :: apply-diff case            // 同上链路
```

---

## 2. 设计方案

### 2.1 新增 `DiffOptions` 与 `DiffResult` 类型

```typescript
/** 匹配策略枚举 */
type DiffMatchStrategy = "exact" | "trimEnd" | "trim" | "fuzzy";

/** Diff 可选参数 */
interface DiffOptions {
  /**
   * 提示搜索起始行号（1-based，与编辑器行号一致）
   * - 优先在该行附近搜索，显著缩小匹配范围
   * - 当存在重复匹配时，用于消歧义（选择最接近此行号的匹配）
   * - 不强制精确：如果该行号附近没找到，仍会回退到全文搜索
   */
  startLine?: number;
}

/** Diff 应用结果 */
interface DiffResult {
  /** 替换后的完整文件内容 */
  content: string;
  /** 使用的匹配策略 */
  strategy: DiffMatchStrategy;
  /** 匹配置信度 0~1（exact/trimEnd/trim 为 1.0，fuzzy 为实际相似度） */
  confidence: number;
  /** 匹配到的行范围 [startLine, endLine]（1-based，与编辑器行号一致） */
  matchRange: [number, number];
  /** search 在文件中的总匹配次数（含当前匹配） */
  duplicateCount: number;
  /** 警告信息列表 */
  warnings: string[];
}
```

### 2.2 新增 L4：模糊匹配（Fuzzy Match）

当 L1~L3 全部失败时，启动模糊匹配：

**算法**：行级滑动窗口 + 逐行相似度

1. 以 `searchLines.length` 为窗口大小，在 `resultLines` 上滑动
2. 对每个窗口位置，计算**行匹配得分**：
   - 每行用 **bigram Dice coefficient** 计算字符级相似度（轻量、适合代码）
   - 窗口得分 = 所有行相似度的加权平均（首尾行权重略高，因为它们是锚点）
3. 取得分最高的窗口位置
4. 阈值判断：
   - `≥ 0.85`：自动应用，标记为 `fuzzy`，附带警告
   - `0.75 ~ 0.85`：**不自动应用**，throw 一个特殊错误，携带候选信息供 LLM 参考
   - `< 0.75`：按原逻辑 throw 普通错误

**Bigram Dice Coefficient 实现**（纯函数，零依赖）：

```typescript
function bigramDice(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.substring(i, i + 2);
    bigramsA.set(bg, (bigramsA.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.substring(i, i + 2);
    const count = bigramsA.get(bg);
    if (count && count > 0) {
      intersection++;
      bigramsA.set(bg, count - 1);
    }
  }

  return (2 * intersection) / (a.length - 1 + b.length - 1);
}
```

### 2.3 `startLine` 行号提示机制

#### 函数签名变更

```typescript
// Before
function applySearchReplaceDiff(originalContent: string, search: string, replace: string): string;

// After
function applySearchReplaceDiff(
  originalContent: string,
  search: string,
  replace: string,
  options?: DiffOptions,
): DiffResult;
```

#### 行号提示的作用

`startLine` 是一个**软提示**，不是硬约束：

1. **搜索排序优化** — 当存在多个匹配时，优先选择距离 `startLine` 最近的那个
2. **重复消歧义** — `duplicateCount > 1` 时，`startLine` 决定替换哪一个
3. **模糊匹配加速** — 滑动窗口可以从 `startLine` 附近开始，向两侧扩展，提前剪枝
4. **不强制** — 如果 `startLine` 附近没有匹配，仍然回退到全文搜索

#### 实现策略

```typescript
function findBestMatch(candidates: Array<{ index: number /* ... */ }>, startLineHint?: number): (typeof candidates)[0] {
  if (!startLineHint || candidates.length <= 1) return candidates[0];

  // 选择距离 startLine 最近的候选
  return candidates.reduce((best, curr) => {
    const bestDist = Math.abs(best.index - (startLineHint - 1));
    const currDist = Math.abs(curr.index - (startLineHint - 1));
    return currDist < bestDist ? curr : best;
  });
}
```

### 2.4 重复匹配检测

在每个策略匹配成功后，继续扫描剩余位置统计总匹配次数：

- **L1 (exact)**：用 `split(searchStr).length - 1` 快速计数
- **L2/L3 (行级)**：继续滑动窗口计数所有匹配位置
- **L4 (fuzzy)**：统计所有超过阈值的窗口数

当 `duplicateCount > 1` 时：

- 如果提供了 `startLine`：选择最近的匹配，warnings 中提示 `"匹配到 ${count} 处，已根据行号提示选择第 ${line} 行的匹配"`
- 如果未提供 `startLine`：选择第一个匹配，warnings 中提示 `"匹配到 ${count} 处，已替换第一处。建议提供 startLine 参数或更精确的上下文以消歧义"`

### 2.5 匹配反馈字符串生成

新增一个工具函数，将 `DiffResult` 转为 LLM 可读的反馈字符串：

```typescript
function formatDiffFeedback(result: DiffResult, filepath: string): string {
  const parts = [`Applied diff to ${filepath}`];

  // 匹配策略提示
  if (result.strategy !== "exact") {
    const strategyLabels: Record<DiffMatchStrategy, string> = {
      exact: "exact match",
      trimEnd: "matched after trimming trailing whitespace",
      trim: "matched after trimming all whitespace (indentation-insensitive)",
      fuzzy: `fuzzy matched (confidence: ${(result.confidence * 100).toFixed(0)}%)`,
    };
    parts.push(`[${strategyLabels[result.strategy]}]`);
  }

  // 行范围
  parts.push(`at lines ${result.matchRange[0] + 1}-${result.matchRange[1] + 1}`);

  // 警告
  if (result.warnings.length > 0) {
    parts.push(`\nWarnings:\n${result.warnings.map((w) => `- ${w}`).join("\n")}`);
  }

  return parts.join(" ");
}
```

### 2.6 模糊匹配失败时的候选反馈

当相似度在 `0.75 ~ 0.85` 之间时，throw 一个携带候选信息的错误：

```typescript
class DiffFuzzyMatchError extends Error {
  constructor(
    public readonly bestMatch: {
      confidence: number;
      lineRange: [number, number];
      preview: string; // 候选片段的前 5 行预览
    },
  ) {
    super(
      `无法精确匹配代码块，但在第 ${lineRange[0] + 1}-${lineRange[1] + 1} 行找到 ${(confidence * 100).toFixed(0)}% 相似的片段：\n${preview}\n请检查 search 内容是否需要更新。`,
    );
    this.name = "DiffFuzzyMatchError";
  }
}
```

---

## 3. 调用方适配

### 3.1 `canvasStore.ts :: applyDiff()`

函数签名增加可选 `startLine` 参数：

```diff
- async function applyDiff(canvasId: string, filepath: string, search: string, replace: string)
+ async function applyDiff(canvasId: string, filepath: string, search: string, replace: string, startLine?: number)
```

内部调用适配：

```diff
- const newContent = applySearchReplaceDiff(originalContent, search, replace);
+ const result = applySearchReplaceDiff(originalContent, search, replace, { startLine });
+ const newContent = result.content;

  if (newContent === originalContent) {
    logger.warn("Diff 应用后内容无变化", { filepath });
-   return;
+   return result;  // 仍然返回 result 以便上层获取匹配信息
  }

  // ... 写入文件等逻辑不变 ...

- logger.info("Diff 已应用到物理文件", { filepath });
+ logger.info("Diff 已应用到物理文件", {
+   filepath,
+   strategy: result.strategy,
+   confidence: result.confidence,
+   duplicates: result.duplicateCount,
+ });
+ return result;
```

### 3.2 `canvas.registry.ts :: apply_canvas_diff()`

参数定义增加可选 `start_line`：

```diff
  parameters: [
    { name: "path", type: "string", required: true, description: "文件路径" },
    { name: "search", type: "string", required: true, description: "要查找的代码块" },
    { name: "replace", type: "string", required: true, description: "要替换成的代码块" },
+   { name: "start_line", type: "number", required: false, description: "搜索起始行号提示（1-based），用于缩小搜索范围和重复消歧义" },
  ],
```

调用适配：

```diff
- await canvasStore.applyDiff(canvasId, args.path, args.search, args.replace);
- return `Successfully applied diff to ${args.path}`;
+ const result = await canvasStore.applyDiff(canvasId, args.path, args.search, args.replace, args.start_line);
+ return formatDiffFeedback(result, args.path);
```

这样 LLM 能看到类似：

- `"Applied diff to index.html at lines 15-23"`（精确匹配，简洁）
- `"Applied diff to style.css [matched after trimming all whitespace] at lines 8-12"`（宽松匹配）
- `"Applied diff to app.js [fuzzy matched (confidence: 89%)] at lines 30-45\nWarnings:\n- 匹配到 3 处，已根据行号提示选择第 30 行的匹配"`（模糊 + 重复 + 行号消歧）

### 3.3 `useCanvasSync.ts`

无需改动 — 它只调用 `store.applyDiff()` 且不消费返回值。

---

## 4. 涉及文件清单

| 文件                                                       | 改动类型 | 说明                                                                 |
| ---------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| `src/tools/canvas/utils/diff.ts`                           | **重写** | 核心逻辑重构，新增 DiffResult、模糊匹配、重复检测、startLine 支持    |
| `src/tools/canvas/types/index.ts` (或新建 `types/diff.ts`) | **新增** | DiffResult、DiffOptions、DiffMatchStrategy、DiffFuzzyMatchError 类型 |
| `src/tools/canvas/stores/canvasStore.ts`                   | **小改** | applyDiff 增加 startLine 参数，消费 DiffResult                       |
| `src/tools/canvas/canvas.registry.ts`                      | **小改** | apply_canvas_diff 增加 start_line 参数，返回格式化反馈               |

---

## 5. 性能考量

- **Bigram Dice** 对单行的时间复杂度为 O(n)，n 为行长度
- **滑动窗口** 的时间复杂度为 O(F × S × L)，F=文件行数，S=search行数，L=平均行长度
- 对于典型的 Canvas 文件（几百行）和 search 块（几十行），计算量在毫秒级，无需担心
- 模糊匹配只在 L1~L3 全部失败时才触发，不影响正常路径性能

---

## 6. 边界情况

1. **search 为空** — 保持现有追加逻辑，strategy 标记为 `exact`，confidence 为 1.0
2. **单行 search** — bigram dice 对极短字符串（<2字符）返回 0，需要特殊处理（直接用字符相等判断）
3. **replace 与 search 相同** — content 不变，但仍返回 DiffResult（strategy 正常标记）
4. **文件为空** — 只有 search 也为空时才匹配，否则直接失败
5. **超大文件** — 可设置模糊匹配的文件行数上限（如 5000 行），超过则跳过模糊匹配直接报错
