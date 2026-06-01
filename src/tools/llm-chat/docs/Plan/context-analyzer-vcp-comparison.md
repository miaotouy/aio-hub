# 上下文分析器：参考 VCP 后端 "最终上下文处理" 视图的优化调研

> **状态**: Draft (RFC) v2
> **创建时间**: 2026-06-01
> **作者**: 咕咕 (Kilo / Architect Mode)
> **触发事件**: VCP 后端 Vue 重构上线"最终上下文处理"视图，姐姐观察到其设计思路与 AIO 的 `context-analyzer/` 高度同源，但有几处局部优化值得反向借鉴。
> **v2 修订**: 引入"核心定位差异"分析，重新评估借鉴点的语义匹配度。

---

## 1. 背景

### 1.1. 事件起因

VCP（VCPChat）后端管理面板（莱恩主导的 Vue 重构）在 2026-05 末上线了"最终上下文处理"视图。其核心思路与 AIO 的 [`context-analyzer/`](src/tools/llm-chat/components/context-analyzer:1) 一致（按消息块切片、统计 token、展示原始内容）。

**时间线证据**:

- AIO 的 `context-analyzer/` 体系 ≥ 2025-12（5 Tab 维度已成型）
- VCP 的"最终上下文处理"视图 ≈ 2026-05 末

也就是说 AIO 这边的多维分析器早了半年。但 VCP 这次的实现里，有局部优化值得吸收。

### 1.2. 调研目标

1. 梳理 AIO 当前 [`StructuredView.vue`](src/tools/llm-chat/components/context-analyzer/StructuredView.vue:1) 的功能边界。
2. **明确两边工具的本质定位差异**，避免盲目照搬不适合的设计。
3. 对比 VCP 截图体现的优化点，按语义匹配度筛选可借鉴项。
4. 给出 **可落地的增量改造方案**，按优先级排序。

---

## 2. 核心定位差异 (关键章节, v2 新增)

### 2.1. 一句话总结

| 工具    | 定位                           | 数据本质                       | 时间属性  |
| :------ | :----------------------------- | :----------------------------- | :-------- |
| **AIO** | **基于历史快照的即时重建预览** | "如果现在发送，请求体会是什么" | 未来/预测 |
| **VCP** | **最后经手请求的事后复盘**     | "上次实际发出去的是什么"       | 过去/回溯 |

### 2.2. 详细对比

#### 2.2.1. AIO: 即时重建 / 待发送预览

- **数据来源**: 打开 Dialog 时调用 [`useChatHandler.getLlmContextForPreview()`](src/tools/llm-chat/composables/chat/useChatHandler.ts:1)，**实时跑一遍**完整的上下文处理管道。
- **管道输入**: `sessionDetail` + `nodeId` + `pendingInput`（来自 store 的待发送输入）+ 当前激活的 agent / 模型 / 参数配置。
- **管道输出**: [`ContextPreviewData`](src/tools/llm-chat/types/context.ts:144)，包含预设、历史、附件、世界书、宏展开 diff 等**预测性**信息。
- **典型场景**:
  - 用户输入框敲了一半，点"分析"看看如果发送会是什么样
  - 切换模型/agent 后，预览上下文变化
  - 调试新加的预设/世界书条目是否生效
- **关键属性**:
  - **没有"捕获时间"概念** — 每次都是 `now`
  - **没有"实际发送参数"** — 只有"配置中的参数"（但可被 `parameterOverrides` 覆盖）
  - **Dialog 模态打开**，期间无法在主界面改数据；改了配置必须关闭重开才生效
  - **支持 `pendingInput`** — 这是 AIO 独有的"预测下一步"能力

#### 2.2.2. VCP: 事后复盘 / 历史记录

- **数据来源**: 后端在每次请求时**实际记录**最终发出去的请求体（包括完整 token 计算、stream 设置、tokenizer 算法等）。
- **典型场景**:
  - 已发送的请求出 bug，回过头看看请求体长什么样
  - 验证 RAG 召回、TagMemo 注入是否在那次请求里生效
  - 复盘 token 消耗
- **关键属性**:
  - **有"捕获时间"** — 该请求实际发生的时间戳
  - **有"实际算法标识"** — 那次请求用的真实 tokenizer
  - **有"Stream 状态"** — 那次请求的实际流式设置
  - **支持"刷新"** — 因为后端可能有新的请求记录到达
  - **不需要 `pendingInput`** — 它看的是过去，没有"待发送"的概念

### 2.3. 差异对实施方案的影响

| VCP 设计点               | 在 AIO 中是否有意义？                                      | 决策             |
| :----------------------- | :--------------------------------------------------------- | :--------------- |
| **横向锚点 Tab**         | 完全适用，纯 UI 优化                                       | ✅ 采纳          |
| **角色色彩编码**         | 完全适用，纯 UI 优化                                       | ✅ 采纳          |
| **角色块计数聚合**       | 完全适用，纯 UI 优化                                       | ✅ 采纳          |
| **搜索 (高亮跳转)**      | 完全适用，纯 UI 优化                                       | ✅ 采纳          |
| **文本/附件 Token 拆分** | 完全适用，AIO 的预测性 token 一样可以拆                    | ✅ 采纳 (改契约) |
| **消息块类型标签**       | 完全适用 (text / multimodal)                               | ✅ 采纳          |
| **捕获时间**             | ❌ AIO 没有此概念 (每次都是即时计算)                       | ✗ 不实现         |
| **Stream 状态展示**      | ⚠️ 半适用 — AIO 只能展示"配置中的 stream 参数"，不是实际值 | ⚠️ 降级实现      |
| **刷新按钮**             | ❌ AIO 是模态 Dialog，打开后数据已固定，"刷新"无新数据可拉 | ✗ 不实现         |
| **算法组合标识**         | ⚠️ AIO 的 `tokenizerName` 字段是单一字符串，需改契约       | 📅 单独立项      |

---

## 3. 当前 AIO 上下文分析器架构梳理

### 3.1. 整体结构

入口组件 [`ContextAnalyzerDialog.vue`](src/tools/llm-chat/components/context-analyzer/ContextAnalyzerDialog.vue:1) 采用 5 Tab 结构：

| Tab        | 文件                                                                                              | 职责                                    |
| ---------- | ------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 结构化视图 | [`StructuredView.vue`](src/tools/llm-chat/components/context-analyzer/StructuredView.vue:1)       | 智能体卡片 + 统计 + 世界书 + 消息列表   |
| 原始请求   | [`RawRequestView.vue`](src/tools/llm-chat/components/context-analyzer/RawRequestView.vue:1)       | 完整 JSON 请求体（DocumentViewer 渲染） |
| 内容分析   | [`AnalysisChartView.vue`](src/tools/llm-chat/components/context-analyzer/AnalysisChartView.vue:1) | ECharts 饼图 + 详细统计表               |
| 宏调试     | [`MacroDebugView.vue`](src/tools/llm-chat/components/context-analyzer/MacroDebugView.vue:1)       | 宏展开前后对比、变量追踪                |
| 变量状态   | [`VariablesView.vue`](src/tools/llm-chat/components/context-analyzer/VariablesView.vue:1)         | SVar 系统变量快照表                     |

### 3.2. `StructuredView.vue` 现有能力清单

参考 [`StructuredView.vue`](src/tools/llm-chat/components/context-analyzer/StructuredView.vue:1) (约 1620 行)，已覆盖：

1. **智能体信息卡片** — Avatar / 名称 / 模型（带图标）/ 配置文件（带 Provider 图标）+ 模型/渠道被删除的回退逻辑
2. **上下文统计卡片** — 总消息数 / 总 Token / 总字符数 / 预设·历史·后处理·世界书四段分类 / 截断统计 / Tokenizer 标识
3. **世界书条目卡片** — 大卡片可折叠 + 一键展开所有条目 + 单条目详情（关键词分组、内容、位置、token）
4. **统一消息列表** — `finalMessages` 顺序展示 / 来源标签（预设/历史/合并 xN）/ 摘要节点 / 待发送节点 + 宏 diff / 附件分析 + 转写预测

### 3.3. 数据流摘要

```
useChatHandler.getLlmContextForPreview(sessionDetail, nodeId, pendingInput)
  → core/context-processors/ 管道 [即时执行]
  → ContextPreviewData
  → ContextAnalyzerDialog
  → 5 个 Tab 子视图
```

`finalMessages` 中的 `sourceType` 字段（`agent_preset` / `session_history` / `merged` / `depth_injection` / `anchor_injection` / `unknown`）是 [`StructuredView.vue`](src/tools/llm-chat/components/context-analyzer/StructuredView.vue:818) 中 `unifiedMessages` 计算的核心依据。

---

## 4. 借鉴点逐项分析

### 4.1. 横向块级 Tab 锚点 (★★★★★ 强烈推荐)

**VCP 实现** (截图确认): 顶部一排横向 Tab `#0 SYSTEM 块` `#1 AI 块` ... `#6 USER 块`，点击锚点跳转。

**AIO 痛点**: 当前消息列表是纯滚动浏览，长对话场景下定位 O(n)。

**复杂度**: 低 (★)

- `flex-wrap` 锚点条 + `scrollIntoView({ block: "start" })`
- 不改数据契约
- 复用 `msg.key` 作为唯一标识

### 4.2. 角色色彩编码 (★★★★ 推荐)

**VCP 实现** (截图确认): 不同角色的锚点 chip 用不同颜色（SYSTEM 蓝色高亮等）。

**AIO 现状**: 仅头像 + 文字，长列表中视觉权重不足。

**复杂度**: 低 (★)

- `.message-card` 加 `role-${role}` 类，CSS 用 `border-left` 色条
- 锚点 chip 同步配色
- 配色：`system → info` / `user → success` / `assistant → primary`

**主题适配警告**: 必须用 RGB 变量 + `calc(var(--card-opacity) * X)`，**严禁** `--el-color-X-light-9`，参考 [`theme-appearance.md`](.kilocode/rules/theme-appearance.md:1)。

### 4.3. 顶部角色块计数聚合 (★★★ 推荐)

**VCP 实现** (截图确认): 顶部 `角色统计: SYSTEM 块: 1 / AI 块: 3 / USER 块: 3`。

**AIO 现状**: 统计卡片只展示总消息数，没有按角色拆分。

**价值**: 瞬间判断对话结构是否健康（system 异常多 = 预设炸了；user/ai 不对称 = 压缩节点存在）。

**复杂度**: 低 (★)

- 从 `unifiedMessages` 按 `role` 分组计数（`computed`）
- 渲染为一行 `el-tag`

### 4.4. 搜索框 (高亮跳转模式) (★★★ 推荐)

**VCP 实现** (截图确认): 顶部搜索框 + "上一个/下一个" 按钮 + "匹配 N / 总块 M" 计数器。

**关键发现**: VCP 的搜索是 **"高亮跳转模式"** 而非"过滤模式"！

- 不隐藏任何消息块，只在匹配项之间跳转
- 类似 IDE 的 `Ctrl+F` 体验
- UI 简单、无副作用

**AIO 现状**: 无搜索能力。

**复杂度**: 中 (★★)

- `el-input` 输入词
- `computed` 计算匹配的 `msg.key` 列表（搜索 `content` 文本）
- 上下按钮维护 `currentMatchIndex` 游标
- 复用 4.1 的 `scrollToMessage()`
- 匹配的卡片加 `highlight` 类（黄色 outline）
- 锚点条同步显示匹配标记

**与锚点协同**: 锚点 chip 上可加一个小红点表示该块有匹配。

### 4.5. 文本 / 附件 Token 分离展示 (★★★ 推荐)

**VCP 实现** (截图确认): 顶部统计卡片：

- **文本 Token**: 107,108
- **附件估算 Token**: 1,530
- **总 Token**: 108,638

**AIO 现状**: 只有总 token，附件 token 没单独展示。消息卡片只显示"非文本数 +N"，没量化 token 影响。

**价值**:

- 多模态场景调优的关键指标
- token 爆炸时立即定位是文本还是附件的锅

**复杂度**: 中 (★★)

- 改 [`ContextPreviewData.statistics`](src/tools/llm-chat/types/context.ts:228) 契约：加 `textTokenCount` / `attachmentTokenCount`
- token-calculator 在统计阶段做文本/附件分组
- UI 改动小，统计卡片加 2 个 stat-item 即可

**适用性**: AIO 是预测性 token 计算，但分类聚合的逻辑完全一致，定位匹配。

### 4.6. 消息块类型标签 (text / multimodal) (★★ 推荐)

**VCP 实现** (截图确认): `#0 SYSTEM 块 text` — 在角色名后用小标签标注内容类型。

**AIO 现状**: 用"非文本数 +N"间接表达。

**价值**: 瞥一眼即可识别带附件的消息块（与 4.5 协同）。

**复杂度**: 极低 (★)

- 从 `msg.content` 判断（`typeof === "string"` → text；含 `image_url` 等 → multimodal）
- 加一个 `el-tag` 即可

### 4.7. ⚠️ 算法组合标识 (单独立项)

**VCP 实现** (截图确认): `@dqbd/tiktoken:cl100k_base + @dqbd/tiktoken:cl100k_base + multimodal-estimate:image-auto`

**AIO 现状**: [`tokenizerName`](src/tools/llm-chat/types/context.ts:240) 是单一字符串字段。

**优化方向**:

- 短期: UI 不动
- 长期: 改 [`tokenCounter`](src/tools/llm-chat/core/context-processors/) 输出层，把单一字符串改成数组（含文本/附件/多模态的各自 tokenizer）

**决策**: 本次不实施，需要 token-calculator 内部改造，建议单独立项。

### 4.8. ❌ Stream 状态展示 (不实现)

**VCP 实现**: `Stream: true`

**为什么不实现**:

- VCP 的 Stream 是 **实际请求时的真实值**（事后记录）
- AIO 的 Stream 只能反映 **当前配置中的 stream 参数**（预测值）
- 如果展示，可能误导用户以为这是"那次请求"的实际状态
- 而且 AIO 是预览，连"请求"都还没发生，stream 概念尚未具体化

**结论**: 语义不匹配，**不实现**。

### 4.9. ❌ 显式"刷新"按钮 (不实现)

**VCP 实现**: 标题栏右上角有"刷新"按钮。

**为什么不实现** (姐姐的关键反馈):

- AIO 的 Dialog 是 **模态打开**，期间用户无法在主界面修改数据
- 数据是打开 Dialog 之前由 props (`sessionDetail`, `nodeId`, `pendingInput`) 一次性塞进来的
- Dialog 内**没有可改变上下文的入口**（没有 inline 编辑器、没有参数面板联动）
- "刷新"在 AIO 当前架构下没有新数据可拉，等同于无操作
- 唯一改变数据的方式是：**关闭 Dialog → 改聊天数据 → 重新打开**

**反观 VCP**: 它是后端的请求记录列表，刷新可以拉到新发生的请求。

**结论**: 架构不匹配，**不实现**。如果未来 AIO 在 Dialog 内引入参数编辑器或非模态展示，可重新评估。

### 4.10. ❌ 捕获时间 (不实现)

**VCP 实现**: 显示 `捕获时间: 2026-06-01T05:54:05.949Z` — 那次请求实际发生的时间戳。

**为什么不实现**:

- AIO 是即时重建，没有"捕获时间"概念，每次都是 `now`
- 展示"分析时间"意义不大（用户自己知道刚才点了"分析"）
- 真正有意义的是"目标节点的时间戳"，但 [`StructuredView.vue`](src/tools/llm-chat/components/context-analyzer/StructuredView.vue:1) 已通过 `targetTimestamp` 在 [`RawRequestView.vue`](src/tools/llm-chat/components/context-analyzer/RawRequestView.vue:22) 的文件名中使用

**结论**: 语义不匹配，**不实现**。

### 4.11. ❌ "复制可见文本" 按钮 (不实现)

**理由**: AIO 已有独立的会话导出系统（导出为 Markdown 等），覆盖该需求。"原始请求" Tab 也内置了 JSON 复制。

---

## 5. 优势对比矩阵 (v2)

| 维度                | AIO 上下文分析器                  | VCP 最终上下文处理             |   优势方    | 借鉴决策     |
| :------------------ | :-------------------------------- | :----------------------------- | :---------: | :----------- |
| **工具定位**        | 即时重建/预测                     | 事后复盘/记录                  | 🟡 各有侧重 | 不可强行统一 |
| **诞生时间**        | ≤ 2025-12                         | ≈ 2026-05 末                   |   🟢 AIO    | -            |
| **视图维度**        | 5 Tab（结构化/原始/分析/宏/变量） | 单视图                         |   🟢 AIO    | -            |
| **Token 分类**      | 预设/历史/后处理/世界书 四段拆解  | 总量 + 文本/附件二段           |   🟢 AIO    | -            |
| **预设合并标签**    | "预设(合并 x6)" 显式标注          | 无                             |   🟢 AIO    | -            |
| **智能体信息卡片**  | 头像+名称+模型+配置文件 (含图标)  | 仅顶部字段                     |   🟢 AIO    | -            |
| **世界书条目展示**  | 可折叠 + 关键词分组 + 位置标签    | 无                             |   🟢 AIO    | -            |
| **附件分析**        | AttachmentCard + 转写预测         | 无                             |   🟢 AIO    | -            |
| **宏调试**          | 独立 Tab + 待发送 diff            | 无                             |   🟢 AIO    | -            |
| **导出能力**        | 独立会话导出系统 + JSON 复制      | 视图内复制按钮                 |   🟢 AIO    | -            |
| **待发送预览**      | **支持 `pendingInput`**           | 不支持 (架构不需要)            |   🟢 AIO    | -            |
| **块级跳转**        | 滚动浏览 (O(n))                   | **横向锚点 Tab**               |   🔵 VCP    | ✅ 采纳      |
| **角色色彩编码**    | 文字标识                          | **SYSTEM/AI/USER 色彩**        |   🔵 VCP    | ✅ 采纳      |
| **顶部角色块计数**  | 总消息数                          | **SYS:1 / AI:N / USER:N**      |   🔵 VCP    | ✅ 采纳      |
| **搜索能力**        | 无                                | **高亮跳转 + 计数 + 上下游标** |   🔵 VCP    | ✅ 采纳      |
| **文本/附件 Token** | 仅总量                            | **文本/附件分离**              |   🔵 VCP    | ✅ 采纳      |
| **消息块类型标签**  | 间接表达 "+N 非文本"              | `text` / `multimodal` 标签     |   🔵 VCP    | ✅ 采纳      |
| **算法标识**        | 单一字符串                        | 组合式 (text + multimodal)     |   🔵 VCP    | 📅 单独立项  |
| **捕获时间**        | 无 (即时计算)                     | ISO 8601 时间戳                |   🟡 N/A    | ✗ 语义不匹配 |
| **Stream 状态**     | 无                                | `Stream: true`                 |   🟡 N/A    | ✗ 语义不匹配 |
| **刷新按钮**        | 无 (模态 Dialog 无意义)           | 显式刷新                       |   🟡 N/A    | ✗ 架构不匹配 |

---

## 6. 实施方案 (按优先级)

### 6.1. 阶段一：核心 UI 增强 (必做, 工作量 ≈ 3-4h)

包含 6 项纯 UI 优化，都不需要改数据契约：

#### 6.1.1. 横向块级 Tab 锚点 (4.1)

**位置**: [`StructuredView.vue`](src/tools/llm-chat/components/context-analyzer/StructuredView.vue:408) 的"上下文消息" `section` 顶部。

**关键逻辑**:

```typescript
const messageRefs = ref(new Map<string, HTMLElement>());

function registerMessageRef(key: string, el: any) {
  if (el?.$el) messageRefs.value.set(key, el.$el);
}

function scrollToMessage(key: string) {
  const el = messageRefs.value.get(key);
  el?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function getRoleShortLabel(role: string): string {
  return (
    { system: "SYS", user: "USER", assistant: "AI" }[role] || role.toUpperCase()
  );
}
```

**样式要点**:

- `position: sticky; top: 0; z-index: 10;` 实现常驻顶部
- `overflow-x: auto; white-space: nowrap;` 横向滚动

#### 6.1.2. 角色色彩编码 (4.2)

```html
<InfoCard
  v-for="(msg, index) in unifiedMessages"
  :key="msg.key"
  :class="['message-card', `role-${msg.role}`, { 'pending-message-card': msg.isPendingInput }]"
></InfoCard>
```

```css
.message-card.role-system {
  border-left: 4px solid var(--el-color-info);
}
.message-card.role-user {
  border-left: 4px solid var(--el-color-success);
}
.message-card.role-assistant {
  border-left: 4px solid var(--el-color-primary);
}

.anchor-chip.role-system {
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-info);
}
/* 其他 role 类同 */
```

#### 6.1.3. 顶部角色块计数聚合 (4.3)

```typescript
const roleBreakdown = computed(() => {
  const counts = { system: 0, user: 0, assistant: 0 };
  unifiedMessages.value.forEach((msg) => {
    counts[msg.role] = (counts[msg.role] || 0) + 1;
  });
  return counts;
});
```

```html
<div class="stat-item">
  <div class="stat-label">角色分布</div>
  <div class="stat-value role-breakdown">
    <el-tag size="small" type="info" effect="plain"
      >SYS {{ roleBreakdown.system }}</el-tag
    >
    <el-tag size="small" type="success" effect="plain"
      >USER {{ roleBreakdown.user }}</el-tag
    >
    <el-tag size="small" type="primary" effect="plain"
      >AI {{ roleBreakdown.assistant }}</el-tag
    >
  </div>
</div>
```

#### 6.1.4. 搜索框 (高亮跳转模式) (4.4)

**位置**: "上下文消息" section 顶部，紧贴锚点条上方或与之合并为一行。

**关键逻辑**:

```typescript
const searchQuery = ref("");
const currentMatchIndex = ref(0);

const matchedKeys = computed<string[]>(() => {
  if (!searchQuery.value.trim()) return [];
  const q = searchQuery.value.toLowerCase();
  return unifiedMessages.value
    .filter((msg) => getDisplayContent(msg.content).toLowerCase().includes(q))
    .map((msg) => msg.key);
});

function gotoNext() {
  if (!matchedKeys.value.length) return;
  currentMatchIndex.value =
    (currentMatchIndex.value + 1) % matchedKeys.value.length;
  scrollToMessage(matchedKeys.value[currentMatchIndex.value]);
}

function gotoPrev() {
  if (!matchedKeys.value.length) return;
  currentMatchIndex.value =
    (currentMatchIndex.value - 1 + matchedKeys.value.length) %
    matchedKeys.value.length;
  scrollToMessage(matchedKeys.value[currentMatchIndex.value]);
}
```

**UI**: `el-input` + 上下按钮 + `匹配 N / 总块 M` 计数。匹配的卡片加 `highlight` outline。

#### 6.1.5. 消息块类型标签 (4.6)

```typescript
function getContentType(
  content: string | LlmMessageContent[]
): "text" | "multimodal" {
  if (typeof content === "string") return "text";
  if (Array.isArray(content) && content.some((p) => p.type !== "text"))
    return "multimodal";
  return "text";
}
```

在消息卡片头部加：

```html
<el-tag
  size="small"
  :type="getContentType(msg.content) === 'multimodal' ? 'warning' : 'info'"
  effect="plain"
>
  {{ getContentType(msg.content) }}
</el-tag>
```

### 6.2. 阶段二：契约扩展 (推荐, 工作量 ≈ 2h)

#### 6.2.1. 文本 / 附件 Token 分离 (4.5)

**契约改动**: [`ContextPreviewData.statistics`](src/tools/llm-chat/types/context.ts:228)

```typescript
statistics: {
  // ... 现有字段
  /** 文本 Token 数 (排除附件) */
  textTokenCount?: number;
  /** 附件 Token 数 (估算) */
  attachmentTokenCount?: number;
}
```

**实施位置**: [`core/context-processors/`](src/tools/llm-chat/core/context-processors/) 中的 token 计算阶段，在累加时按 content 类型分组。

**UI 改动**: 在"上下文统计"卡片新增 2 个 stat-item，与"总 Token"并列。

### 6.3. 阶段三：长远优化 (不做, 单独立项)

- **算法组合标识** (4.7): 需 token-calculator 输出层重构
- **虚拟滚动**: 消息数 > 100 时性能可能下降，接入 `@vueuse/core`
- **Stream / 捕获时间 / 刷新按钮**: 语义/架构不匹配，**永久不实施**

---

## 7. 风险与边界

### 7.1. 不要破坏的现有能力

1. **预设合并标签** (`预设(合并 x6)`): 加角色色条时保留 source-tag
2. **摘要节点 + 待发送节点**: 这两个标识的 border 优先级 **高于** role 色（避免色条冲突）
3. **附件分析**: AttachmentCard 内容不受 role 色彩影响
4. **`pendingInputOriginal` 宏对比**: 待发送消息的 collapse 区域结构不变
5. **宏调试 Tab**: 独立运作，不受本次改动影响

### 7.2. 主题适配规范

- **严禁** 使用 `--el-color-X-light-9` 实色变量做背景
- **必须** 使用 RGB 变量 + `calc(var(--card-opacity) * X)` 模式
- 参考 [`theme-appearance.md`](.kilocode/rules/theme-appearance.md:1)

### 7.3. 性能注意

- 锚点条 DOM 量 = 消息数；> 50 条时考虑横向滚动指示
- `messageRefs` Map 在 `unifiedMessages` 重算后需清理（`watch` 中 `Map.clear()`）
- 搜索 `matchedKeys` 计算复杂度 O(n \* m)，n=消息数，m=平均内容长度。> 100 条时考虑加防抖

### 7.4. 锚点 sticky 与父容器滚动

- 父容器 [`ContextAnalyzerDialog.vue:235`](src/tools/llm-chat/components/context-analyzer/ContextAnalyzerDialog.vue:235) 的 `:deep(.el-tab-pane) { overflow-y: auto; }` 是 sticky 的滚动容器
- `position: sticky; top: 0;` 应正常生效，需测试 BaseDialog padding 影响
- 备选：`position: relative` 在列表上方常驻

---

## 8. 验收清单

### 阶段一 (UI 增强)

- [ ] 横向锚点 Tab 可点击跳转，sticky 顶部
- [ ] 三种角色色彩在卡片 border-left 和锚点 chip 上一致
- [ ] 顶部角色分布计数与实际渲染数量一致
- [ ] 搜索匹配跳转流畅，"上一个/下一个" 循环正常
- [ ] 搜索匹配的卡片有视觉高亮
- [ ] 消息块类型标签 (text/multimodal) 准确

### 阶段二 (契约扩展)

- [ ] `textTokenCount` + `attachmentTokenCount` 之和 ≈ `totalTokenCount`（允许少量误差）
- [ ] 统计卡片新 stat-item 在主题透明度 0/50/100% 三档下显示正常

### 通用

- [ ] 通过 `check:frontend` 类型检查
- [ ] 不破坏：预设合并标签 / 摘要节点 / 待发送节点 / 附件分析 / 宏对比
- [ ] 21+ 消息场景下交互流畅

---

## 9. 工作量估算

| 阶段           | 内容                                 | 预估时间 | 风险 |
| :------------- | :----------------------------------- | :------- | :--- |
| **阶段一**     | 锚点 + 色彩 + 计数 + 搜索 + 类型标签 | 3-4h     | 低   |
| **阶段二**     | 文本/附件 Token 分离 (改契约)        | 2h       | 中   |
| 阶段三（不做） | 算法组合标识 / 虚拟滚动              | -        | -    |
| 不实施         | Stream / 捕获时间 / 刷新 / 复制      | -        | -    |

**总工作量**: ≈ 5-6h (阶段一 + 阶段二)

---

## 10. 后续动作

1. 姐姐 review 本计划 v2，确认阶段范围
2. 切换到 `code` 模式实施阶段一（先做 UI 增强）
3. 验收通过后再做阶段二（契约扩展）
4. 归档此文档（移至 `docs/Plan/Archived/` 或顶部标记 `Implemented`）
5. 同步更新 [`ARCHITECTURE.md`](src/tools/llm-chat/ARCHITECTURE.md:1) 中 context-analyzer 的描述

---

## 11. 关键认知沉淀 (附录)

### 11.1. AIO context-analyzer 的核心定位

> AIO 的上下文分析器是 **基于历史快照 + 待发送输入的即时重建预览**，回答的是"如果现在按下发送，请求体会是什么"。
>
> 它**不是**事后复盘工具，没有"那次请求"的概念。

### 11.2. 模态 Dialog 的数据流约束

> Dialog 打开后，`sessionDetail` / `nodeId` / `pendingInput` 已通过 props 一次性塞入。
> Dialog 内**没有改变上下文的入口**，因此"刷新"按钮无意义。

### 11.3. 借鉴 ≠ 照搬

> 看到别的工具有好东西，先问三个问题：
>
> 1. 它的工具定位和我们一样吗？
> 2. 它的数据来源和我们一样吗？
> 3. 它的交互场景和我们一样吗？
>
> 三个全是 Yes 才能直接抄；有 No 就要做语义对齐，否则会引入误导性 UI。

---

> **生态观察**: AIO 和 VCP 的 context-analyzer 双向借鉴，是开源生态健康的典型案例。AIO 早期把"多 Tab 维度 + 预测性预览"做出来，VCP 这次反过来贡献了"锚点 / 色彩 / 计数 / 搜索"的 UI 优化。**但要尊重定位差异——AIO 是预测，VCP 是回溯——盲目照搬"刷新/时间戳/Stream"等事后复盘特有的元数据，反而会破坏 AIO 自身的语义清晰度。**
