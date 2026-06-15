# 会话树图 (conversation-tree-graph) 性能优化调查报告

> **施工状态追踪**（最后更新: 2026-06-15）
>
> | 阶段                       | 状态      | 进度  |
> | -------------------------- | --------- | ----- |
> | 阶段一：确定性收益、低风险 | ✅ 已施工 | ≈ 95% |
> | 阶段二：重渲染规模治理     | ✅ 已施工 | ≈ 95% |
> | 阶段三：触发源与大图扩展   | ⏳ 待开始 | ≈ 10% |
>
> **说明**：阶段三第 13 项（只等新增节点）已提前实施，不视为悬空。

## 背景

本报告基于 `src/tools/llm-chat/components/conversation-tree-graph` 当前实现进行代码走查，定位树图视图在大会话（节点多、内容长）和流式生成期间的性能瓶颈，并给出分阶段优化建议。

**注意**：核心 composable 文件实际位于 `composables/` 子目录下（如 `composables/useFlowTreeGraph.ts`），计划中引用的路径省略了该前缀。代码对照时以实际路径为准。

结论先行：瓶颈不在 Vue Flow 或 D3 本身，而集中在三类问题：

1. **全量重建链路被高频触发**：~~`watch(session, { deep: true })`~~ → 当前已改用 `getGraphSessionWatchSource` 投影 watch，但 `updateChart()` 每次仍从零重建所有节点数据，且所有 `data` 对象身份改变导致全部节点组件重渲染。流式生成期间该链路每 250ms~2s 被触发一次。
2. **每节点常驻重组件树**：~~每个节点常驻挂载大量组件~~ → 当前 Menubar 已改为 `v-if` 懒挂载，对话框组件打开才挂载，常驻问题已解决。但 `data` 引用每次重建仍导致全节点重渲染。
3. **若干每帧热路径的 O(N²) 查找与深层响应式遍历**：~~D3 tick 回调内 `find`、对 Vue Flow 全部内部节点的 deep watch~~ → 当前 tick 已改用 `Map` 索引、watch 已改为浅投影。`_node` 死负载已移除。

## 当前实现概览

- `FlowTreeGraph.vue`（约 1583 行）：主组件，挂载 VueFlow、HUD、调试叠加层、详情弹窗、历史面板。仅在 `viewMode === 'force-graph'` 时挂载（`ChatArea.vue:520`）。
- `composables/useFlowTreeGraph.ts`（约 582 行）：核心数据转换，`updateChart()` 把 `session.nodes` 转为 Vue Flow nodes/edges。
- `composables/useGraphD3Simulation.ts`（约 451 行）：D3 力导向 / 静态树布局，tick 回调把 d3 坐标写回 Vue Flow 节点。
- `composables/graphContentUtils.ts`：思考块解析、文本截断工具函数。
- `composables/useGraphThemePalette.ts`：主题色适配，MutationObserver 监听 class/style 变化。
- `composables/useGraphSubtreeDrag.ts`：子树拖拽逻辑。
- `composables/useGraphNodeActions.ts`：节点操作（复制、删除、重新生成等）。
- `components/GraphNode.vue` → `GraphNodeContent.vue` + `GraphNodeMenubar.vue`：单节点渲染。
- 流式期间，正文内容经 StreamSource 渲染（线性视图），但**落盘降频写入** `session.nodes[id].content`（`useChatResponseHandler.ts` 的 `flushContentToNode`，间隔为 `max(250ms, incrementalSaveInterval)`，未开增量保存时 2s），每次写入都会触发树图的 session watch。

## 调查发现（按影响排序）

### 1. session watch → updateChart 全量重建，流式期间反复执行

~~`FlowTreeGraph.vue:884-897` 原为 `{ deep: true }` 监听 session~~ → 当前已改用 [`getGraphSessionWatchSource`](src/tools/llm-chat/components/conversation-tree-graph/flow/FlowTreeGraph.vue#L936) 显式投影，不再深遍历 `history` 快照。

三个叠加问题的处理进度：

**1a. ~~deep watch 遍历范围过大。~~** ✅ **已解决**。当前 watch 源为 `getGraphSessionWatchSource`，手动提取每个节点的关键字段（id、parentId、content、metadata 等）作投影，不再递归 `history` 栈。

**1b. `updateChart()` 内部多处 O(N²) / 重复正则扫描。**

| 子项                                                                                 | 状态      | 说明                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`calculateNodeDepth` 每节点上溯父链 O(N·D)~~                                       | ✅ 已修复 | 改为 [`buildNodeDepthMap()`](src/tools/llm-chat/components/conversation-tree-graph/flow/composables/useFlowTreeGraph.ts#L135) 栈遍历 O(N)                                                                                                             |
| ~~`getNodeColor` → `BranchNavigator.isNodeInActivePath`~~                            | ✅ 已修复 | 改为 [`buildActivePathSet()`](src/tools/llm-chat/components/conversation-tree-graph/flow/composables/useFlowTreeGraph.ts#L120) 单次上溯 Set                                                                                                           |
| ~~`stripThinkingBlocks` + `hasThinkingContent` + `extractThinkingPreview` 全文正则~~ | ✅ 已修复 | 改为 [`derivedContentCache`](src/tools/llm-chat/components/conversation-tree-graph/flow/composables/useFlowTreeGraph.ts#L56) + 模块级[预编译正则数组](src/tools/llm-chat/components/conversation-tree-graph/flow/composables/graphContentUtils.ts#L8) |
| ~~边构建 `flowNodes.some(n => n.id === sourceId)` O(E·N)~~                           | ✅ 已修复 | 改为 [`flowNodeIds.has(sourceId)`](src/tools/llm-chat/components/conversation-tree-graph/flow/composables/useFlowTreeGraph.ts#L431) Set 查询                                                                                                          |

**1c. ~~所有 `data` 对象身份每次都变。~~** ✅ **已解决**。`updateChart()` 会对下一版节点 `data` 做字段级浅比较，未变化节点复用上一版 `data` 和 node 对象；边对象也按 `id/source/target/animated/style` 复用，避免仅因对象身份变化唤醒整图节点/边重渲染。

综合效果：流式生成时，每次内容落盘（250ms~2s 一次）+ reasoning 落盘，都会执行一次"O(N²) 计算 + 全文正则 + 全节点重渲染"。这是树图视图在生成期间掉帧的首要原因。

### 2. ~~每节点常驻 Menubar 组件树~~ ✅ **已解决**

原问题：~~`GraphNode.vue:27-41` 无条件渲染 `GraphNodeMenubar`，仅靠 CSS `opacity: 0` 隐藏~~。

当前状态：

- **Menubar 懒挂载**：`GraphNode.vue` 通过 `isMenubarMounted` 控制 `v-if` 渲染，hover 时 mount，离开 160ms 后 unmount
- **交互锁**：`interaction-active-change` 事件同步 dropdown/popconfirm/dialog 的打开状态，避免弹层中鼠标移入/出导致提前卸载
- **对话框按需挂载**：`ExportBranchDialog` / `MessageDataEditor` 均为 `v-if="showExportDialog"`，打开时才创建实例
- **反缩放改为 CSS 变量**：`viewport.zoom` 不再作为 prop 传给 Menubar，改为图容器 CSS 变量 `--graph-menubar-scale`，缩放期间只更新单个 CSS 变量

### 3. ~~对 Vue Flow 全部内部节点的 deep watch（每 tick 触发）~~ ✅ **已解决**

~~原实现 `FlowTreeGraph.vue:994-1014` 为 `{ deep: true }` 监听 `getNodes.value`~~ → 当前已改为[浅投影 watch](src/tools/llm-chat/components/conversation-tree-graph/flow/FlowTreeGraph.vue#L1129)：

```ts
watch(
  () =>
    getNodes.value.map((node) => ({
      id: node.id,
      width: node.dimensions?.width ?? 0,
      height: node.dimensions?.height ?? 0,
    })),
  (vueFlowNodes) => {
    /* 构建 dimensionsMap */
  },
  { flush: "post" }
);
```

- ~~力仿真运行时每帧 deep watch 触发~~ → 浅投影 watch 只比较 `{ id, width, height }`，不再递归遍历内部 `data`，tick 期间 watch 不会被踢动
- ~~`_node` 死负载~~ → 已移除，flowNodes data 中无 `_node`

### 4. ~~D3 tick 回调内 O(N²) 查找~~ ✅ **已解决**

~~原实现 `useGraphD3Simulation.ts:328-339` 为 `nodes.value.find(...)` O(N) × N~~ → 当前 tick 已改用 [`getVueNodeById()`](src/tools/llm-chat/components/conversation-tree-graph/flow/composables/useGraphD3Simulation.ts#L115) Map 索引：

```ts
const nodeById = getVueNodeById(); // Map<id, vueNode>
for (const d3Node of sim.nodes()) {
  const vueNode = nodeById.get(d3Node.id); // O(1)
  ...
}
```

同类问题处理进度：

| 子项                                             | 状态      | 说明                                                                                 |
| ------------------------------------------------ | --------- | ------------------------------------------------------------------------------------ |
| ~~`simulation.nodes().find(...)` 初始化~~        | ◐ 仅一次  | `initD3Simulation` 中 `existingD3NodeMap` 已在用 Map，cost 可忽略                    |
| ~~静态布局 `nodes.value.find(...)`~~             | ✅ 已修复 | 改用 `getVueNodeById()` 返回的 Map                                                   |
| ~~子树拖拽 `findIndex` + `allNodeIds.includes`~~ | ✅ 已修复 | `allNodeIds` 已改为 `Set`，不存在数组 `includes`                                     |
| ~~单节点拖拽 `simulation.nodes().find(...)`~~    | ✅ 已修复 | 拖拽开始时建立 `d3NodeById` 索引，拖拽中/结束按 id O(1) 查询，并提供索引缺失兜底刷新 |

### 5. ~~结构变化后重新等待全部节点尺寸~~ ✅ **已提前实施**

~~原实现 `startWaitingForDimensions(flowNodes)` 设为全部节点。~~ → 当前[实现](src/tools/llm-chat/components/conversation-tree-graph/flow/composables/useGraphD3Simulation.ts#L417) 只等未测量节点：

```ts
const pendingIds = flowNodes
  .map((n) => n.id)
  .filter((id) => !measuredDimensions.has(id));
```

若全部已测量则直接 `initD3Simulation()`，否则 300ms 超时兜底。

### 6. 杂项（单项小，但常驻或易放大）

| 杂项                                   | 状态      | 说明                                                                                                                    |
| -------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------- |
| ~~HUD 关闭时 RAF 仍常驻~~              | ✅ 已修复 | `updateStats()` 首行检查 `showHud`，HUD 隐藏时 `animationFrameId = null` 后 return                                      |
| ~~调试模式 50ms interval~~             | ✅ 已修复 | 代码已删除，无此定时器                                                                                                  |
| ~~主题 MutationObserver 触发全量重建~~ | ✅ 已修复 | 添加了 `isPaletteEqual()` 等值比较，style 监听保留但不会误触发                                                          |
| `getWillUseTranscription` 每次渲染重算 | ◐ 已缓解  | `GraphNodeContent.vue:249` 模板函数调用仍存在，但未变化节点现在复用 `data` / node 引用，不再被 `updateChart()` 全量唤醒 |
| `formatRelativeTime` 每次渲染重算      | ◐ 需设计  | 一致性问题 > 性能问题，暂不变                                                                                           |
| ~~边 style 对象每次重建~~              | ✅ 已修复 | 边按结构与 style 等值比较后复用上一版 edge 对象                                                                         |

## 不构成问题的点（核对过）

- `useChatSettings` / `useTranscriptionManager` 为模块级单例，GraphNodeContent 中逐节点调用开销可忽略。
- 树图组件随 `viewMode` 条件挂载，线性视图下不产生任何成本。
- `getStructureFingerprint` 的 O(N log N) 字符串拼接单独看可接受（在 1b 解决后可保留）。
- contentPreview 截断 150 字符，节点尺寸在流式早期即稳定，`updateNodeDimensions` 引发的 `alpha(0.3).restart()` 不会被流式持续踢动。
- 调试叠加层（debugNodeRects/debugLinkPaths 的 O(E·N) 与每 tick 数组复制）仅 debugMode 下生效，可接受。

## 优化建议（分阶段）

### 阶段一：确定性收益、低风险（优先做）【已施工 ≈ 95%】

1. **updateChart 预计算消除 O(N²)**：✅
   - ✅ 进函数先构建一次 `activePathSet`（从 activeLeaf 上溯一次，O(D)），节点与边判定改 O(1)；
   - ✅ 一次 BFS/遍历得到 `depthMap`（O(N)）替代逐节点上溯；
   - ✅ 边构建用 `Set<nodeId>` 替代 `flowNodes.some(...)`。
2. **思考块/预览派生结果按内容缓存**：✅ `derivedContentCache` Map + 模块级预编译正则数组
3. **移除 `data._node` 死负载**：✅ flowNodes data 中无 `_node`
4. **tick 回调与拖拽热路径建索引**：✅ 建 `getVueNodeById()` Map，子树拖拽 `allNodeIds` 改 Set；◐ `initD3Simulation` 的 `find` 余一次（初始化非热路径）；✅ 单节点拖拽改为拖拽生命周期内的 `d3NodeById` 索引
5. **替换 getNodes deep watch**：✅ 改为 `getNodes.value.map(n => ({ id, width, height }))` 浅投影
6. **删除调试 50ms 无效 interval；HUD 隐藏时停掉 RAF**：✅ 均已清理
7. **主题 palette 变更前做等值比较，并评估去掉对 html `style` 属性的监听**：✅ `isPaletteEqual()` 已添加；`style` 监听保留但有等值短路，不会误触发

### 阶段二：重渲染规模治理【已施工 ≈ 95%】

8. **Menubar 懒挂载**：✅ **已施工**
   - ✅ 仅当前 hover/focus 的节点 `v-if` 渲染 Menubar
   - ✅ `interaction-active-change` 挂载锁，避免弹层内提前卸载
   - ✅ `ExportBranchDialog` / `MessageDataEditor` 打开时才 `v-if` 挂载（非图级共享单例，风险可控）
9. **Menubar 反缩放改 CSS 变量**：✅ **已施工** — `--graph-menubar-scale` 图容器 CSS 变量，`GraphNode` 不传 `zoom` prop
10. **data 对象引用复用**：✅ **已施工** — 未变化节点复用上一版 `data` 与 node 对象；变化节点只替换自身对象。边对象同步做等值复用，减少 Vue Flow / 自定义节点的无效更新。

本轮验证：

- `bun run build:tsc`
- `bunx oxlint src\tools\llm-chat\components\conversation-tree-graph\flow\FlowTreeGraph.vue src\tools\llm-chat\components\conversation-tree-graph\flow\components\GraphNode.vue src\tools\llm-chat\components\conversation-tree-graph\flow\components\GraphNodeMenubar.vue`
- `bunx oxlint src\tools\llm-chat\components\conversation-tree-graph\flow\composables\useFlowTreeGraph.ts src\tools\llm-chat\components\conversation-tree-graph\flow\composables\useGraphSubtreeDrag.ts`

### 阶段三：触发源与大图扩展（需要小设计）【待开始 ≈ 10%】

11. **用显式修订号替代 session watch**：❌ 未施工 — 当前已用 `getGraphSessionWatchSource` 投影替代了 deep watch，但 watch 源仍逐字段投影全体节点。可进一步用 `structureRevision` / `contentRevision` 两个计数器替代。
12. **评估 Vue Flow 的 `only-render-visible-elements`**：❌ 未施工 — 注意与 `startWaitingForDimensions` 的测量假设冲突（视口外节点不渲染就没有 dimensions）
13. **`startWaitingForDimensions` 只等新增节点**：✅ **意外已提前实施** — 当前实现已只等 `!measuredDimensions.has(id)` 的未测量节点

## 预期效果（按当前施工状态修正）

- **阶段一（已完工）**：流式生成期间每次落盘的成本从 "O(N²)+全文正则+全节点重渲染" 降为 "O(N)+缓存命中+全节点重渲染"；tick 期间 CPU 显著下降（O(N²)→O(N)），deep traverse 已消除。
- **阶段二（已完工）**：Menubar 组件树瘦身与节点/边引用复用已完成。流式落盘时，未变化节点应保持原 `data` / node 引用，避免整图自定义节点被对象身份变化全量唤醒。
- **阶段三（待开始）**：触发频率与渲染规模将与"可见且变化的部分"成正比，支撑数百节点级会话。

## 验证建议

- 用 HUD 的 FPS 面板 + Performance 录制对比：固定一个 100+ 节点、含长消息的会话，分别在 ①静置 ②流式生成 ③拖拽/缩放 三个场景录制火焰图，确认 `updateChart`、`traverse`（Vue reactivity）、`find` 的占比变化。
- `chatSettings.developer.debugModeEnabled` 的调试叠加层可用于确认布局行为未回归（节点速度、固定点、连线参数）。
