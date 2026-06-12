# 会话树图 (conversation-tree-graph) 性能优化调查报告

## 背景

本报告基于 `src/tools/llm-chat/components/conversation-tree-graph` 当前实现进行代码走查，定位树图视图在大会话（节点多、内容长）和流式生成期间的性能瓶颈，并给出分阶段优化建议。

结论先行：瓶颈不在 Vue Flow 或 D3 本身，而集中在三类问题：

1. **全量重建链路被高频触发**：`watch(session, { deep: true })` → `updateChart()` 每次从零重建所有节点数据（含多处 O(N²) 算法和对全文的正则扫描），且所有 `data` 对象身份改变导致全部节点组件重渲染。流式生成期间该链路每 250ms~2s 被触发一次。
2. **每节点常驻重组件树**：每个节点常驻挂载约 10 个 ElTooltip、1 个 ElDropdown、1 个 ElPopconfirm 以及 ExportBranchDialog、MessageDataEditor 两个对话框组件，N 个节点即 N 份，纯粹的隐藏（opacity: 0）不卸载。
3. **若干每帧热路径的 O(N²) 查找与深层响应式遍历**：D3 tick 回调内 `find`、对 Vue Flow 全部内部节点的 deep watch（会连带遍历 `data._node` 携带的完整原始消息）。

## 当前实现概览

- `FlowTreeGraph.vue`（约 1470 行）：主组件，挂载 VueFlow、HUD、调试叠加层、详情弹窗、历史面板。仅在 `viewMode === 'force-graph'` 时挂载（`ChatArea.vue:520`）。
- `useFlowTreeGraph.ts`：核心数据转换，`updateChart()` 把 `session.nodes` 转为 Vue Flow nodes/edges。
- `useGraphD3Simulation.ts`：D3 力导向 / 静态树布局，tick 回调把 d3 坐标写回 Vue Flow 节点。
- `GraphNode.vue` → `GraphNodeContent.vue` + `GraphNodeMenubar.vue`：单节点渲染。
- 流式期间，正文内容经 StreamSource 渲染（线性视图），但**落盘降频写入** `session.nodes[id].content`（`useChatResponseHandler.ts` 的 `flushContentToNode`，间隔为 `max(250ms, incrementalSaveInterval)`，未开增量保存时 2s），每次写入都会触发树图的 session deep watch。

## 调查发现（按影响排序）

### 1. session deep watch → updateChart 全量重建，流式期间反复执行

`FlowTreeGraph.vue:884-897`：

```ts
watch(
  () => props.session,
  () => {
    updateChart();
  },
  { deep: true }
);
```

三个叠加问题：

**1a. deep watch 遍历范围过大。** `ChatSessionDetail.history` 是撤销栈，其中 `HistoryEntry.snapshot` 为 `Record<string, ChatMessageNode>` 全量节点快照（`types/history.ts:92-105`）。deep watch 触发时 Vue 需要递归遍历整个 session 对象图——包括历史栈里每份快照的全部节点与内容字符串。会话越久、撤销栈越深，单次触发的遍历成本越高，且与树图本身无关的字段（如 `historyIndex`）变化也会触发。

**1b. `updateChart()` 内部多处 O(N²) / 重复正则扫描。** 即使拓扑指纹未变走"早退"分支（`useFlowTreeGraph.ts:389-393`），下列每节点成本依然全额发生：

- `calculateNodeDepth`（`useFlowTreeGraph.ts:115-131`）：每节点向上走父链，整体 O(N·D)；线性长对话即 O(N²)。
- `getNodeColor` → `BranchNavigator.isNodeInActivePath`（`BranchNavigator.ts:192-207`）：每节点从 activeLeaf 向上走整条活动路径，又一处 O(N·D)；边构建时每条边还要再调 2 次（`useFlowTreeGraph.ts:369-371`）。
- `stripThinkingBlocks` + `hasThinkingContent` + `extractThinkingPreview`（`graphContentUtils.ts`）：每节点对**完整消息内容**运行多个 `new RegExp`（3 个标签名 × 多次构造），长消息（几十 KB）× 全部节点 × 每次 updateChart。这是长内容会话下 updateChart 的主要 CPU 项。
- 边构建 `flowNodes.some(n => n.id === sourceId)`（`useFlowTreeGraph.ts:368`）：每条边线性扫节点数组，O(E·N)。

**1c. 所有 `data` 对象身份每次都变。** `flowNodes.push({ ... data: { ... } })` 每次生成全新对象（`colors`、`tokens`、`subtitleInfo`、`attachments` 引用全新），`nodes.value = flowNodes` 后每个 `GraphNode` 的 `props.data` 引用变化 → **全部节点组件及其子树（Content、Menubar、AttachmentCard）重渲染**，即使没有任何可见变化。

综合效果：流式生成时，每次内容落盘（250ms~2s 一次）+ reasoning 落盘，都会执行一次"O(N²) 计算 + 全文正则 + 全节点重渲染"。这是树图视图在生成期间掉帧的首要原因。

### 2. 每节点常驻 Menubar 组件树

`GraphNode.vue:27-41` 无条件渲染 `GraphNodeMenubar`，仅靠 CSS `opacity: 0` 隐藏（`GraphNode.vue:153-157`）。每个 Menubar 包含（`GraphNodeMenubar.vue`）：

- 7+ 个 `ElTooltip`（每个都是独立组件实例与 popper 逻辑）；
- 1 个 `ElDropdown` + 6 个 dropdown item；
- 1 个 `ElPopconfirm`；
- `ExportBranchDialog` 和 `MessageDataEditor` 两个对话框组件**每节点各一份**。

100 节点 ≈ 1000+ 个 Tooltip 实例 + 200 个对话框组件实例常驻。这部分主导了**初次挂载耗时**和**内存占用**，也放大了发现 1c 的重渲染成本。

另外 `GraphNode.vue:31` 把 `viewport.zoom` 作为 prop 传给 Menubar，`menubarStyle` computed（`GraphNodeMenubar.vue:77-89`）依赖它——**缩放/捏合期间每帧 N 个（不可见的）Menubar 更新 inline style**。

### 3. 对 Vue Flow 全部内部节点的 deep watch（每 tick 触发）

`FlowTreeGraph.vue:994-1014`：

```ts
watch(() => getNodes.value, (vueFlowNodes) => { ...构建 dimensionsMap... updateNodeDimensions(...) },
  { deep: true, flush: "post" });
```

- 力仿真运行时，tick 回调每帧改写所有节点 `position`（见发现 4），该 deep watch **每帧触发**，每次重建整张 dimensions Map 并调用 `updateNodeDimensions`（再 O(N) 扫一遍仿真节点）。
- 更隐蔽的是遍历深度：Vue Flow 内部节点的 `data` 携带 `_node`（完整原始 `ChatMessageNode`，含全文 content、metadata、attachments），deep watch 的 traverse 会**每次触发都递归走完这些大对象**。
- 而 `_node` 在整个 graph 代码中**只写不读**（仅 `useFlowTreeGraph.ts:335` 写入，无任何消费方），是纯死负载。

### 4. D3 tick 回调内 O(N²) 查找

`useGraphD3Simulation.ts:328-339`：

```ts
sim.on("tick", () => {
  for (const d3Node of sim.nodes()) {
    const vueNode = nodes.value.find((n) => n.id === d3Node.id); // O(N) × N
    ...
  }
});
```

tree 模式 alphaDecay 0.04 约 170 tick/轮，physics 模式约 300 tick/轮；拖拽时 `alphaTarget(0.3)` 让仿真在拖拽全程以 60fps 持续运行。200 节点时每秒约 240 万次 id 比较，叠加每帧 N 次深响应式 position 写入（每次写入又触发发现 3 的 deep watch 和 Vue Flow 自身的 nodes 同步）。

同类问题：

- `initD3Simulation` 内 `simulation.value?.nodes().find(...)`（`useGraphD3Simulation.ts:124-126`）：O(N²) / 每次布局初始化。
- 静态布局应用 `nodes.value.find(...)`（`useGraphD3Simulation.ts:262`）：O(N²)。
- 子树拖拽 `handleNodeDrag`（`useGraphSubtreeDrag.ts:88-121`）：每个 mousemove 做 `nodes.value.findIndex` + 对每个仿真节点 `allNodeIds.includes(...)`（数组 includes，O(N·M)）。应使用 Set 与 Map。

### 5. 结构变化后重新等待全部节点尺寸

`startWaitingForDimensions(flowNodes)`（`useGraphD3Simulation.ts:395-411`）把 `pendingNodeIds` 设为**全部**节点，包括早已测量过、尺寸不会变的旧节点。新增一条消息也要等所有节点的 dimensions 回报或 300ms 超时，造成结构变化后布局启动的固定延迟。只等新增/未测量节点即可。

### 6. 杂项（单项小，但常驻或易放大）

- **HUD 关闭时 RAF 仍常驻**：`updateStats`（`FlowTreeGraph.vue:964-985`）无条件每帧运行；`viewSettings.showHud` 为 false 时应停止。
- **调试模式 50ms interval 是无效代码**：`FlowTreeGraph.vue:1122-1138` 在 interval 里裸调 `getViewport()` 并不会让任何 computed 失效（非响应式上下文），调试层实际靠 tick 内 `d3Nodes.value = [...sim.nodes()]` 更新。该定时器可直接删除。
- **主题 MutationObserver 触发全量重建**：`useGraphThemePalette.ts:85-94` 监听 `documentElement` 的 `class` **和 `style`** 属性，任何代码碰一下 html 的 style 都会重建调色板并 `paletteVersion++` → `updateChart()` 全量重建。应在 bump 版本号前比较新旧调色板是否真的变化，并考虑去掉 `style` 监听。
- **`getWillUseTranscription` 每次渲染重算**：`GraphNodeContent.vue:137` 在模板中以函数调用形式逐附件执行转写判定逻辑，叠加发现 1c（每次 updateChart 全节点重渲染）后变成"每次落盘 × 每个附件"执行。
- **`formatRelativeTime` 每次渲染重算**（且不随时间自动刷新）——一致性问题大于性能问题。
- **边/节点 style 对象每次重建**：edge 的 `style` 对象身份每次 updateChart 都变，触发边重渲染（与 1c 同根因）。

## 不构成问题的点（核对过）

- `useChatSettings` / `useTranscriptionManager` 为模块级单例，GraphNodeContent 中逐节点调用开销可忽略。
- 树图组件随 `viewMode` 条件挂载，线性视图下不产生任何成本。
- `getStructureFingerprint` 的 O(N log N) 字符串拼接单独看可接受（在 1b 解决后可保留）。
- contentPreview 截断 150 字符，节点尺寸在流式早期即稳定，`updateNodeDimensions` 引发的 `alpha(0.3).restart()` 不会被流式持续踢动。
- 调试叠加层（debugNodeRects/debugLinkPaths 的 O(E·N) 与每 tick 数组复制）仅 debugMode 下生效，可接受。

## 优化建议（分阶段）

### 阶段一：确定性收益、低风险（优先做）【已施工】

1. **updateChart 预计算消除 O(N²)**：
   - 进函数先构建一次 `activePathSet`（从 activeLeaf 上溯一次，O(D)），节点与边判定改 O(1)；
   - 一次 BFS/遍历得到 `depthMap`（O(N)）替代逐节点上溯；
   - 边构建用 `Set<nodeId>` 替代 `flowNodes.some(...)`。
2. **思考块/预览派生结果按内容缓存**：`Map<nodeId, { content, reasoning, derived }>`，content 与 reasoningContent 未变则直接复用，避免对全文反复跑正则。正则对象提升为模块级常量（per-tag 预编译）。
3. **移除 `data._node` 死负载**（无消费方），显著缩小响应式遍历范围与内存。
4. **tick 回调与拖拽热路径建索引**：仿真初始化时构建 `Map<id, vueNode>`（nodes.value 替换时重建），tick 内 O(1) 取用；子树拖拽的 `allNodeIds` 改 Set。
5. **替换 getNodes deep watch**：改用 Vue Flow 的 nodes change 事件（dimensions 类变更）或把 watch 源收窄为 `() => getNodes.value.map(n => n.dimensions)` 之类的浅投影，避免每 tick 深遍历全部内部节点。
6. **删除调试 50ms 无效 interval；HUD 隐藏时停掉 RAF**。
7. **主题 palette 变更前做等值比较**，并评估去掉对 html `style` 属性的监听。

### 阶段二：重渲染规模治理

8. **Menubar 懒挂载**：仅当前 hover 的节点 `v-if` 渲染 Menubar（或图级共享单实例，定位到 hover 节点）；`ExportBranchDialog` / `MessageDataEditor` 提升为图级单例，由"当前操作节点 id"驱动。预期把每节点常驻组件数从 ~15 降到 ~3，初次挂载与内存改善最明显。
9. **Menubar 反缩放改 CSS 变量**：容器上维护一个 `--graph-inv-zoom`（每帧 1 次更新），Menubar 样式用 `calc()` 引用，消除缩放时 N 份 inline style 更新。
10. **data 对象引用复用**：updateChart 时若某节点派生数据未变（可用 content/metadata 修订号或字段级比较），沿用上一轮的 `data` 引用，让未变节点的组件更新被 props 引用比较短路。配合 2 的缓存自然达成。

### 阶段三：触发源与大图扩展（需要小设计）

11. **用显式修订号替代 session deep watch**：store 在结构操作与降频落盘点已有清晰的写入入口，可维护 `structureRevision` / `contentRevision` 两个计数器；树图 watch 计数器而非深遍历整个 session（从而也绕开 history 快照遍历）。退而求其次，至少把 watch 源收窄为 `() => [session?.nodes, session?.activeLeafId]` 一类的投影，避开 `history`。
12. **评估 Vue Flow 的 `only-render-visible-elements`**：视口外节点不渲染，对数百节点的大图收益大。注意与 `startWaitingForDimensions` 的全量测量假设冲突（视口外节点不渲染就没有 dimensions），需配合建议 5/估算尺寸兜底。
13. **`startWaitingForDimensions` 只等新增节点**（已测量节点直接用缓存尺寸），消除结构变化后的固定 300ms 级延迟。

## 预期效果

- 阶段一后：流式生成期间每次落盘的成本从 "O(N²)+全文正则+全节点重渲染" 降为 "O(N)+缓存命中+全节点重渲染"；tick 期间 CPU 显著下降（O(N²)→O(N)，deep traverse 消失）。
- 阶段二后：全节点重渲染的单次成本大幅缩小（组件树瘦身 + 引用短路），初次打开大图的挂载时间与内存明显改善。
- 阶段三后：触发频率与渲染规模都与"可见且变化的部分"成正比，支撑数百节点级会话。

## 验证建议

- 用 HUD 的 FPS 面板 + Performance 录制对比：固定一个 100+ 节点、含长消息的会话，分别在 ①静置 ②流式生成 ③拖拽/缩放 三个场景录制火焰图，确认 `updateChart`、`traverse`（Vue reactivity）、`find` 的占比变化。
- `chatSettings.developer.debugModeEnabled` 的调试叠加层可用于确认布局行为未回归（节点速度、固定点、连线参数）。

