# Rich Text Renderer 性能优化调查报告

## 背景

本报告基于 `src/tools/rich-text-renderer` 当前实现进行代码走查，重点判断后续性能优化空间，以及是否已经接近 Vue 渲染上限。

结论先行：当前还没有证据表明已经摸到 Vue 的硬上限。现有瓶颈更像是富文本流式系统的综合压力，包括完整 buffer 的预处理与边界扫描、AST diff 与索引维护、Vue 组件实例数量、DOM 规模，以及 Mermaid、HTML iframe、KaTeX、代码块编辑器等重型节点的生命周期成本。

## 当前实现概览

- `RichTextRenderer.vue` 是统一入口，支持静态 `content` 和流式 `streamSource`。
- 默认 V2 路径使用 `StreamProcessorV2` + `CustomParser` + AST Patch 渲染。
- `useMarkdownAst` 使用 `shallowRef` 保存 AST，避免深层响应式代理。
- `TokenizerService` 使用 Web Worker 进行异步分词，主线程仍负责后续 block/inline parse、diff、patch 应用和 Vue commit。
- 代码块组件已做 `IntersectionObserver` 懒初始化，进入视口前使用 `PreCodeNode` 轻量预览。
- 聊天消息列表层已经在 `MessageList.vue` 使用消息级 `content-visibility: auto`，并对最后一条消息保持可见以稳定底部滚动。
- `MessageContent.vue` 已对不可见消息冻结渲染配置，避免设置引用变化导致大量历史消息全量重渲染。

## 调查发现

### 1. 不是单纯 Vue 上限

当前 renderer 已经做了几项关键避险：

- AST 是 `shallowRef`，不是深响应式树。
- Patch 批处理通过 rAF 节流，避免每个 token 都触发 AST 引用更新。
- 代码块编辑器懒初始化，避免历史消息里大量 Monaco/CodeMirror 常驻。
- HTML 预览支持 `shouldFreeze`，深层历史消息可冻结 iframe。

这些说明瓶颈不在“Vue 能不能渲染 Markdown”这个单点，而在流式过程中多个系统共同抢主线程和内存。

### 2. 流式路径仍有完整 buffer 成本

`RichTextRenderer.vue` 在流式模式下会累计 `buffer`，每次准备渲染时对完整 buffer 做预处理，再调用 `streamProcessor.setContent(bufferToProcess)`。

`StreamProcessorV2` 内部会：

- 扫描完整 buffer，寻找稳定区/待定区边界。
- 当稳定区文本未变化时复用 `stableAst`。
- 每轮重新解析 pending 区。
- 将 `stableAst + pendingAst` 做整体 diff。

这套机制在普通长度下合理，但当平滑输出粒度很细、消息很长、pending 区长期无法闭合时，完整 buffer 扫描和重复调度会成为主要压力。

### 3. AST 索引维护还有确定性优化空间

`useMarkdownAst.applyPatches` 当前在结构性 patch 中可能重建 `nodeMap`，批末又完整重建一次。对于包含多个 `replace-node` / `insert-after` 的 patch 批次，这会产生重复 O(n) 成本。

可优化方向：

- 批内结构性 patch 只标记 `nodeMapDirty`。
- 批末统一重建一次 `nodeMap`。
- `text-append` / `set-prop` 不触发索引重建。
- 长期可以探索局部维护路径索引，但第一阶段不必上复杂度。

### 4. 重型节点是高风险区

#### Mermaid

`MermaidNode.vue` 会监听内容和节点状态变化，内容变更时重新渲染 Mermaid。流式 pending 阶段虽然有 `trimLastLine`，但仍可能在频繁变化中多次调用 `mermaid.render`。

建议：

- pending 阶段降低渲染频率。
- 优先保留上一份成功 SVG。
- stable 后做一次最终渲染。

#### HTML iframe

`HtmlInteractiveViewer.vue` 会构造 `srcDoc`，注入 CSP、日志代理、主题和自适应高度脚本，并可进行 CDN 本地化。iframe 内部还会创建 `ResizeObserver` / `MutationObserver`。

建议：

- 默认只在 stable 或用户明确预览时挂载 iframe。
- pending 阶段展示源码/占位。
- CDN 本地化结果可按内容 hash 缓存。

#### KaTeX

`KatexRenderer.vue` 在 content 变化时直接 `katex.render`。大量公式或流式公式未稳定时会造成重复渲染。

建议：

- 使用 content + displayMode 的简单缓存。
- pending 阶段 debounce 或等公式闭合后渲染。

#### 代码块

代码块已懒初始化，但流式大代码块仍会频繁向 CodeMirror/Monaco 同步内容。Monaco 路径依赖 `stream-monaco` 做增量更新，CodeMirror 当前是全 doc replace。

建议：

- CodeMirror 路径优先识别 append-only 更新，使用尾部增量插入。
- 对未初始化编辑器只更新 `PreCodeNode`，避免后台积压编辑器更新。

### 5. 内部块级 content-visibility 目前不应贸然打开

`AstNodeRenderer.tsx` 会给块级节点加 `rich-text-block` class，但 `RichTextRenderer.vue` 中对应 `content-visibility: auto` CSS 是注释状态。架构文档旧版写成“自动应用”，这和代码不一致。

考虑到 `MessageList.vue` 已经做消息级 `content-visibility`，renderer 内部再做块级跳过可能引入滚动估高跳动。只有当“单条消息特别长”成为主要痛点时，才建议做更细颗粒度的 block virtualizer，并且需要配套高度缓存和滚动锚点。

## 优化路线建议

### 第一阶段：先量化

新增 renderer 性能埋点，建议只在 `verboseLogging` 或 tester 中启用：

- 预处理耗时。
- `splitByBlockBoundary` 耗时。
- stable parse / pending parse 耗时。
- diff 耗时。
- patch apply 耗时。
- `nodeMap` rebuild 次数和耗时。
- AST 节点数量、patch 数量、flush 间隔。
- Mermaid / HTML / KaTeX / 代码块渲染耗时。

目标是先建立可重复比较的基线，避免凭感觉优化。

### 第二阶段：低风险修补

1. `useMarkdownAst` 批内只在必要时标记 `nodeMapDirty`，批末统一重建。
2. 流式解析调度增加“最多每 N ms 解析一次”的背压机制，解析中只保留最新 buffer。
3. 图片列表从全 AST 扫描改为 patch 驱动或内容特征触发。
4. 更新文档和 tester 面板，让默认值、阈值、实现状态一致。

### 第三阶段：重型节点治理

1. Mermaid pending 低频渲染，stable 终渲染。
2. HTML iframe stable 后挂载，pending 占位。
3. KaTeX 渲染缓存与 debounce。
4. CodeMirror append-only 增量更新。

### 第四阶段：组件颗粒度优化

当确认 Vue commit / 组件实例数成为瓶颈后，再做：

- parser 合并相邻 text 节点。
- 普通文本节点直接渲染原生 text VNode，绕过 `TextNode.vue`。
- 普通段落快路径：不含复杂内联节点时直接渲染轻量 DOM。
- 针对单条超长消息引入 top-level block virtualizer。

## 不建议优先做的事

- 不建议现在替换 Vue。当前更应减少需要 Vue 管理的节点数量和更新次数。
- 不建议立即打开 renderer 内部块级 `content-visibility`。消息级优化已存在，内部再开需要额外解决滚动估高。
- 不建议先做复杂局部 `nodeMap` 路径维护。批末单次重建更简单，收益也更确定。

## 验证建议

建议准备三类样例：

- 长普通 Markdown：大量段落、列表、表格、链接和图片。
- 长代码流：单个 5k-50k 行代码块，验证 CodeMirror/Monaco 更新。
- 重型混合消息：Mermaid、HTML iframe、KaTeX、图片、VCP 工具调用混合。

每次优化前后记录：

- 首屏解析时间。
- 流式平均帧间隔。
- 最长单帧耗时。
- AST 节点数。
- patch flush 次数。
- WebView 内存峰值。
- 滚动是否跳动。

## 当前判断

Rich Text Renderer 仍有明显优化空间。优先方向不是“突破 Vue 上限”，而是让解析调度、AST 索引、重型节点和消息列表虚拟渲染协同得更克制。只要先把高频重复工作降下来，Vue 这层应该还能继续承载相当一段增长。
