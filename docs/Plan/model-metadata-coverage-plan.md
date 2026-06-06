# 📝 模型元数据覆盖分析与规则合并链功能设计方案

> **状态**: Implemented — 2026-06-06 已完成桌面端覆盖分析入口与规则合并链 UI
> 核心变更：将"规则面包屑链"的展示语义从"单一决定性规则"修正为**"规则合并链"**，与现有 `getMatchedModelProperties()` 的 lodash.merge 合并逻辑对齐。
>
> 实施记录：落地时将 `effectiveFields` / `overriddenFields` 细化为点路径（例如 `capabilities.vision`），以贴合嵌套属性的实际 merge 语义；`buildCoverageItems()` 在单次计算内按 `${modelId}|${provider ?? ''}` 缓存规则链和最终属性，降低重复模型匹配成本。

本方案旨在为 AIO Hub 的模型元数据管理系统（`ModelMetadataSettings.vue`）引入**"覆盖分析"**功能。通过交叉比对用户已添加的渠道模型与现有的元数据规则，帮助用户直观地掌握模型元数据的覆盖情况，并提供优雅的"规则合并链"交互，实现快速补全与调试。

实施时须根据实际情况灵活应变，有和计划不一致的须更新到计划中说明

---

## 1. 核心痛点与设计目标

### 1.1 痛点分析

1. **覆盖情况不透明**：用户在"LLM 服务"中添加了许多渠道和模型，但无法全局、直观地看到哪些模型已经成功匹配了精美的图标和分组，哪些模型仍处于"未匹配（裸奔）"状态。
2. **调试成本高**：现有的"测试模式"只能手动输入单个模型 ID 进行测试，无法批量排查。
3. **合并逻辑不透明**：一个模型可能同时命中多条规则（如 `provider` 规则、`modelPrefix` 规则、`model` 规则），这些规则的属性按优先级逐层 merge。用户无法直观看到哪条规则贡献了图标、哪条规则贡献了分组，以及哪些字段被高优规则覆盖了。

### 1.2 设计目标

1. **全局覆盖率看板**：提供直观的统计数据（总模型数、已覆盖数、未覆盖数、覆盖率进度条）。
2. **覆盖明细列表**：列出所有渠道中的所有模型，并清晰展示其匹配状态。
3. **规则合并链 (Rule Merge Chain)**：用节点链展示模型命中的所有规则，并标注每个规则在最终属性中贡献了哪些字段（哪些被高优规则覆盖，哪些最终生效）。支持悬浮 Tooltip 和点击 Popover 快捷编辑。
4. **一键快捷补全**：对于未覆盖的模型，提供一键"创建规则"按钮，智能预填表单，降低配置门槛。

---

## 2. 架构设计与数据流

### 2.1 数据源集成

- **渠道模型数据**：通过 `useLlmProfiles` 获取 `profiles` 列表。
- **元数据规则数据**：通过 `useModelMetadata` 获取 `rules` 列表（即 `store.rules`）。

### 2.2 新增底层工具函数：`getMatchedRuleChain()`

> **为什么需要新函数**
>
> 现有代码中有两个匹配函数，均不能直接满足需求：
>
> - [`getMatchedRule()`](src/stores/modelMetadataStore.ts:336)：遇到第一条匹配规则就 return，只返回**单条规则**。
> - [`getMatchedModelProperties()`](src/config/model-metadata.ts:105)：返回合并后的**属性对象**，丢失了中间的规则链信息。
>
> 覆盖分析需要的是**合并链上的规则列表**（含 exclusive 截断后的结果），因此需要从 `getMatchedModelProperties` 中抽取出这段逻辑。

在 [`src/config/model-metadata.ts`](src/config/model-metadata.ts) 中新增导出函数：

```typescript
/**
 * 获取模型的规则合并链（参与最终属性合并的所有规则，含 exclusive 截断）
 * 返回结果按优先级从低到高排列（index 0 = 最低优先级，最后一条 = 最高优先级）
 * 与 getMatchedModelProperties() 的 matchedRules 逻辑完全对齐
 */
export function getMatchedRuleChain(
  rules: ModelMetadataRule[],
  modelId: string,
  provider?: string
): ModelMetadataRule[] {
  const sortedEnabledRules = rules
    .filter((r) => r.enabled !== false)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));

  let matchedRules = sortedEnabledRules.filter((rule) =>
    testRuleMatch(rule, modelId, provider)
  );

  if (matchedRules.length === 0) return [];

  // 处理 exclusive 独占规则截断（与 getMatchedModelProperties 逻辑一致）
  const highestExclusiveRule = matchedRules.find((r) => r.exclusive === true);
  if (highestExclusiveRule) {
    const exclusivePriority = highestExclusiveRule.priority || 0;
    matchedRules = matchedRules.filter(
      (r) => (r.priority || 0) >= exclusivePriority
    );
  }

  // 按优先级从低到高排列（便于 UI 从左到右展示合并过程）
  return matchedRules.reverse();
}
```

> **重构建议**：同时将 `getMatchedModelProperties()` 内部改为调用 `getMatchedRuleChain()`，消除重复逻辑。

### 2.3 覆盖分析数据结构

```typescript
interface RuleContribution {
  rule: ModelMetadataRule;
  /** 该规则最终贡献到合并结果中的属性字段名列表 */
  effectiveFields: string[];
  /** 该规则定义了但被更高优先级规则覆盖的属性字段名列表 */
  overriddenFields: string[];
}

interface CoverageItem {
  profileId: string;
  profileName: string;
  profileType: string; // profile.type（仅用于展示）
  modelId: string;
  modelName: string;
  modelProvider?: string; // model.provider（用于匹配，不使用 profile.type 替代）
  /** 规则合并链，按优先级从低到高排列（含 exclusive 截断后的结果） */
  ruleChain: RuleContribution[];
  /** 最终合并属性 */
  finalProperties: ModelMetadataProperties | undefined;
  isMatched: boolean; // ruleChain.length > 0
}
```

> **注意**：`modelProvider` 只使用 `model.provider` 字段原值，不以 `profile.type` 作为 fallback。`profile.type` 描述的是 API 协议兼容类型（如 `openai-compatible`），语义上与规则的 provider 匹配字段不同，不可混用。

### 2.4 `effectiveFields` / `overriddenFields` 的计算方法

对规则链中每条规则，遍历其 `properties` 中的非 undefined 字段：

- 对每个字段 `key`，检查在该规则之后（更高优先级）的规则是否也定义了同一字段。
- 若存在更高优先级规则定义了同一字段 → `overriddenFields`。
- 否则 → `effectiveFields`。

### 2.5 性能考量

覆盖分析计算的复杂度为 O(模型数 × 规则数)，在规则库较大时可能引起 UI 卡顿。

**建议**：

- `coverageItems` 使用 `computed` 是合适的（规则或 profiles 变化时自动更新），但需要注意：
  - 避免在搜索/过滤操作中触发重新计算——搜索过滤应在 `coverageItems` 结果之上进行（即先算好全量，再过滤展示），而不是每次过滤都重算匹配。
  - 如果实测发现性能问题，可以以 `${modelId}|${provider ?? ''}` 为 key 对 `getMatchedRuleChain` 结果做 `Map` 缓存。

---

## 3. 详细交互与 UI 设计

### 3.1 入口设计

在 `ModelMetadataSettings.vue` 的 `header-actions` 区，在"查看预设"按钮旁边添加"覆盖分析"按钮：

- 点击按钮 → 打开 `BaseDialog`（全屏大弹窗）。
- **不引入 `coverageMode` ref**，不与 `testMode` 互斥；测试模式保持在工具栏中独立使用。
- 弹窗关闭后回到规则卡片列表，无状态残留。

### 3.2 覆盖分析弹窗布局

覆盖分析内容全部放在 `BaseDialog` 内部，弹窗属性：

- `width="90%"` / `height="85vh"`
- `close-on-backdrop-click` / `show-close-button`
- 弹窗 body 使用 `flex column`，`height: 100%`

弹窗内部从上到下分为三个区域：

#### 1. 统计看板 (Stats Banner)

展示全局覆盖指标：

- **总模型数**：`coverageStats.total`
- **已覆盖数**：`coverageStats.matched`
- **未覆盖数**：`coverageStats.unmatched`
- **覆盖率**：使用 `el-progress` 条形图展示（`coverageStats.rate%`）。

#### 2. 过滤与搜索工具栏

- **搜索框**：支持按模型 ID、模型名称、渠道名称进行模糊搜索（作用于已计算的 `coverageItems`，不触发重新匹配）。
- **状态筛选**：全部、仅显示已匹配、仅显示未匹配。
- **渠道筛选**：全部渠道、或指定某个渠道。

#### 3. 明细表格 (`el-table`)

展示所有模型的覆盖明细：

| 列名           | 渲染内容                                                         | 说明                                           |
| :------------- | :--------------------------------------------------------------- | :--------------------------------------------- |
| **渠道信息**   | `row.profileName` + `row.profileType`（小字）                    | 展示所属渠道及协议类型                         |
| **模型信息**   | `row.modelName` + `row.modelId`（code，支持一键复制）            | 展示模型名称和 ID                              |
| **规则合并链** | **已匹配**：展示规则合并链节点<br>**未匹配**：红色 `未匹配` 标签 | 核心交互区域，详见第 4 节                      |
| **最终图标**   | 展现最终生效的图标预览                                           | 使用 `DynamicIcon` 渲染 `finalProperties.icon` |
| **操作**       | **已匹配**：编辑最高优先级规则<br>**未匹配**：一键创建规则       | 快捷操作入口                                   |

> **弹窗内表格高度**：`el-table` 设置 `height="calc(85vh - 220px)"`，使表格 body 在弹窗内滚动，表头固定。表格外层容器 `flex: 1; overflow: hidden`。

> **弹窗叠加交互**：点击“编辑此规则”或“创建规则”时，在覆盖分析弹窗之上叠加 `ModelMetadataConfigEditor`。保存/取消后编辑器关闭，覆盖分析弹窗继续显示（数据自动 computed 更新）。

---

## 4. 核心交互：规则合并链节点

### 4.1 节点渲染

对 `row.ruleChain`（按优先级从低到高，从左到右）：

- 遍历渲染为 `el-tag` 节点，中间用 `➔` 箭头连接。
- **每个节点**默认使用 `type="info"` 灰色展示，节点文本显示规则的 `matchType` + `matchValue` 缩写（如 `prefix: gpt`）。
- **节点右上角徽标（角标）**：
  - 若该节点存在 `effectiveFields`（有字段被最终采用）：显示绿色小点 `●`。
  - 若该节点所有字段均被覆盖（`effectiveFields` 为空）：显示灰色小圆，表示"完全被覆盖"，仅参与基础奠定。
- **末尾节点**（最高优先级）：若有 `effectiveFields` 则加绿色边框高亮，因为它通常贡献最多字段。

> 与原计划的区别：不再有单一的"最终决定性节点"高亮，改为按字段贡献情况标注每个节点的有效性。

### 4.2 悬浮提示 (Tooltip)

鼠标悬浮时展示：

- 匹配类型与匹配值（`matchType: matchValue`）。
- 优先级。
- **最终贡献的字段**：列出 `effectiveFields`，格式如 `✓ icon、group`。
- **被覆盖的字段**：列出 `overriddenFields`，格式如 `✗ icon（被更高优规则覆盖）`。
- 备注说明（`rule.description`）。
- 若为 `exclusive: true` 规则，显示"独占规则（截断了更低优先级的匹配）"提示。

### 4.3 点击气泡 (Popover) 与快捷操作

点击节点时弹出 `el-popover`：

- 展示该规则的完整属性（图标路径、分组、描述等）。
- 展示字段贡献摘要（effectiveFields / overriddenFields）。
- 提供**"编辑此规则"**按钮，点击后打开 `ModelMetadataConfigEditor` 并载入该规则。

### 4.4 一键创建规则

对于未匹配的模型，点击"创建规则"：

- 自动打开规则编辑器。
- 智能预填：
  - `matchType`: `'model'`（精确模型匹配）
  - `matchValue`: `row.modelId`
  - `priority`: `100`（精确匹配给予较高优先级）
  - `description`: `为模型 ${row.modelName}（${row.profileName}）自动生成的匹配规则`
  - `properties.group`：统计该渠道其他已匹配模型的 `finalProperties.group` 值，取**出现频率最高**的分组名作为推荐预填；若出现频率相同则取第一个；若无已匹配模型则不预填。

---

## 5. 样式与主题适配

- **毛玻璃效果**：面板背景 `background-color: var(--container-bg); backdrop-filter: blur(var(--ui-blur));`。
- **未匹配行高亮**：`row-class-name` 回调为未匹配行附加背景色 `rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.05))`。
- **规则合并链间距**：

  ```css
  .rule-merge-chain {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }
  .chain-separator {
    color: var(--text-color-light);
    font-size: 12px;
    user-select: none;
  }
  .chain-node {
    cursor: pointer;
    position: relative;
    transition: all 0.2s;
  }
  .chain-node:hover {
    filter: brightness(0.9);
  }
  .chain-node--has-contribution {
    /* 绿色边框标注有字段贡献的节点 */
    outline: 1px solid var(--el-color-success);
    border-radius: 4px;
  }
  .chain-node__badge {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--el-color-success);
  }
  .chain-node__badge--overridden {
    background: var(--el-color-info);
  }
  ```

---

## 6. 实施步骤

1. **底层函数**（`src/config/model-metadata.ts`）：
   - 新增导出函数 `getMatchedRuleChain(rules, modelId, provider?): ModelMetadataRule[]`。
   - 重构 `getMatchedModelProperties()` 内部调用 `getMatchedRuleChain()` 消除重复逻辑。

2. **工具函数**（新建 `src/views/Settings/model-metadata/utils/coverageAnalysis.ts`）：
   - 实现 `buildRuleContributions(ruleChain): RuleContribution[]`（计算 effectiveFields / overriddenFields）。
   - 实现 `buildCoverageItems(profiles, rules): CoverageItem[]`。

3. **组件修改**（`ModelMetadataSettings.vue`）：
   - 引入 `useLlmProfiles`。
   - `header-actions` 区新增"覆盖分析"按钮，绑定 `coverageDialogVisible` ref。
   - 新增 `BaseDialog` 包裹全部覆盖分析内容（统计看板 + 过滤栏 + 明细表格）。
   - 实现规则合并链子组件（建议拆分为 `RuleMergeChain.vue`）。
   - 弹窗内”点击编辑规则”时叠加打开 `ModelMetadataConfigEditor`。
   - 弹窗内“一键创建规则”时叠加打开 `ModelMetadataConfigEditor` 并预填。

4. **测试与验证**：
   - 验证 `getMatchedRuleChain()` 与 `getMatchedModelProperties()` 在各类规则组合（含 exclusive）下的结果一致性。
   - 验证 `effectiveFields` / `overriddenFields` 的计算在属性嵌套（如 `properties.capabilities.vision`）场景下的准确性。
   - 验证覆盖分析面板在大量模型（>200）下的渲染性能。
   - 验证一键创建规则的表单预填功能，包括 group 频率统计。
