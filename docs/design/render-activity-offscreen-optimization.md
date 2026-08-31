# 消息渲染活动级别与离屏资源调度方案

> 状态：提案（未实现）  
> 创建日期：2026-08-31  
> 关联范围：`llm-chat`、`rich-text-renderer`

## 1. 背景与目标

`llm-chat` 已经具备较好的流式与富文本分层：流式消息源负责将上游输出分发给实时渲染，消息节点内容则以降频方式写入持久化状态。与此同时，长会话中的消息可能包含 Markdown AST、代码编辑器、Mermaid、HTML 预览、媒体和其他可交互节点。即使用户已经滚动到其他位置，这些节点仍可能继续请求动画帧、解析内容或因全局设置变化而重渲染。

本方案引入**消息级渲染活动状态（Render Activity）**，在不停止模型请求、流式数据接收或会话持久化的前提下，按消息与视口距离限制无用户价值的前端工作。

目标：

1. 离屏消息不应持续消耗动画帧、Canvas / Mermaid / HTML 预览等动态资源。
2. 离屏期间不应因主题、样式或思考规则变动导致整条富文本消息重建。
3. 流式源、最终消息内容与持久化必须持续正确；暂停的是**展示工作**，不是生成工作。
4. 重新进入视口时恢复正确内容、可交互状态和媒体语义，且不破坏滚动位置或自动跟底行为。
5. 方案需保持 Vue 组件边界、类型边界和既有安全策略；不引入全局 DOM 动画劫持。

非目标：

- 不将 `llm-chat` 改造成命令式 DOM 渲染器。
- 不暂停 LLM 网络请求、工具调用、会话持久化或跨窗口同步。
- 不在第一阶段实现完整虚拟列表。
- 不让正在生成的最后一条消息失去正确的高度、滚动范围或终稿能力。

## 2. 当前基础与缺口

### 2.1 已有基础

| 现有能力           | 位置                                                                                    | 作用                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 可回放流式源       | [`useStreamingMessageSources.ts`](../../composables/chat/useStreamingMessageSources.ts) | 每个节点拥有独立 buffer、订阅 / 完成通知和延迟释放能力。                                      |
| 渲染与持久化解耦   | [`useChatResponseHandler.ts`](../../composables/chat/useChatResponseHandler.ts)         | 实时 chunk 进入 `StreamSource`，节点内容以降频方式写入会话状态。                              |
| 流式平滑与背压     | [`StreamController.ts`](../../../rich-text-renderer/core/StreamController.ts)           | 使用 `requestAnimationFrame` 消费语义块，并提供积压加速和紧急冲刷。                           |
| 浏览器离屏渲染提示 | [`MessageList.vue`](../../components/message/MessageList.vue)                           | 对消息应用 `content-visibility: auto` 和 `contain-intrinsic-size`。                           |
| 渲染配置冻结       | [`MessageContent.vue`](../../components/message/MessageContent.vue)                     | 使用 `IntersectionObserver`，仅在消息处于视口附近时更新思考规则和样式配置，避免大范围重渲染。 |
| 滚动跟底意图       | [`MessageList.vue`](../../components/message/MessageList.vue)                           | 通过 `isNearBottom`、`shouldStickToBottom` 与 `ResizeObserver` 管理内容增长时的滚动。         |

### 2.2 当前缺口

1. `StreamController` 没有接收消息可见性，也没有 `suspend` / `resume` 生命周期；离屏时仍可继续申请 rAF 并触发 AST 更新。
2. Mermaid、HTML 交互预览、视频、音频、Canvas 等重型节点没有统一的消息级暂停 / 恢复协议。
3. 可见性定义分散：`MessageList` 负责 `content-visibility`，`MessageContent` 独立观察配置冻结，未来动态节点容易各自再建一套观察器。
4. 最后一条消息当前强制 `content-visibility: visible`，这是保护流式高度和自动跟底的必要保守策略。

## 3. 核心模型：Render Activity

每条消息的展示层拥有一个活动等级：

```ts
export type RenderActivity = "visible" | "nearby" | "offscreen";
```

| 等级        | 判定                     | 文本流与持久化                         | AST / 富化          | 动画与动态资源                         |
| ----------- | ------------------------ | -------------------------------------- | ------------------- | -------------------------------------- |
| `visible`   | 实际处于消息列表可见区域 | 正常接收和展示                         | 正常更新            | 正常运行                               |
| `nearby`    | 不可见但处于预热边距内   | 正常接收；可保持低延迟展示             | 可预热或降频        | 默认暂停高成本动画，按节点能力选择恢复 |
| `offscreen` | 超出预热边距             | 持续接收和持久化；展示层只保留最新状态 | 延后重型解析 / 物化 | 暂停 rAF、媒体和可暂停交互资源         |

建议预热边距首版使用上下 `400px`，与 `MessageContent.vue` 当前的策略一致。若需精确区分 `visible` 与 `nearby`，可以使用两个观察器（`rootMargin: 0` 与 `rootMargin: 400px 0px`），或由消息列表统一根据容器几何计算。

### 3.1 所有权

- `MessageList` 是消息列表滚动容器与可见性判定的**唯一属主**。
- `MessageContent` 接收活动等级，只负责冻结与消息内容相关的配置和渲染。
- `RichTextRenderer` / `StreamController` 接收活动等级，只决定文本展示调度。
- 具体富节点（Mermaid、HTML、媒体、Canvas 等）自行实现资源暂停，不直接窥探外层滚动容器。
- `StreamSource`、会话 store、持久化、请求取消、工具调用不依赖活动等级。

这样可以避免每个节点各建一套 `IntersectionObserver`，也避免可见性策略在不同组件中产生不一致。

## 4. 建议接口

### 4.1 消息活动控制器

建议在 `llm-chat` 与 `rich-text-renderer` 的共享边界定义最小接口；具体文件位置在实施阶段确定。

```ts
export type RenderActivity = "visible" | "nearby" | "offscreen";

export interface ActivityAwareRenderUnit {
  setRenderActivity(activity: RenderActivity): void;
  dispose(): void;
}

export interface PausableMessageResource {
  pause(): void | Promise<void>;
  resume(): void | Promise<void>;
  dispose(): void | Promise<void>;
}
```

约束：

- `setRenderActivity` 必须幂等；重复设置同一状态不得重复启动动画、订阅或请求。
- `dispose` 必须释放 rAF、计时器、观察器、媒体监听器和异步任务引用。
- `pause` 不是销毁。恢复后应尽量保持当前交互状态；无法保持时应从稳定消息状态重新构建。
- 资源注册应是显式、组件协作式的，不应修改全局 `Element.prototype.animate` 或全局计时器 API。

### 4.2 StreamController 的活动语义

建议扩展 `StreamController`：

```ts
class StreamController implements ActivityAwareRenderUnit {
  setRenderActivity(activity: RenderActivity): void;
  suspend(): void;
  resume(): void;
  dispose(): void;
}
```

`offscreen` 时：

1. 保留上游 chunk 和语义队列，不丢失数据；
2. 取消尚未执行的 rAF，不继续触发 `onContent`；
3. 不调用 AST `setContent`，从而避免离屏 Vue 子树和解析器反复更新；
4. 记录最新展示快照或待追赶标志；
5. 流结束时仍完成源、持久化和节点终态，但重型终稿物化可以延后到重新进入 `nearby` / `visible` 或明确的空闲预算中执行。

恢复时不应盲目同步冲刷全部积压。实现需要根据积压长度选择：

- 小积压：按现有平滑逻辑恢复；
- 大积压：将最新完整 buffer 作为一次可控更新输入 AST，并关闭无意义的逐字入场动画；
- 已结束消息：直接进入终稿路径，避免重新播放打字机效果。

## 5. 分阶段实施计划

### Phase 0：基线、可观测性与回归保护

**目标：** 在不改变行为前确认耗时来源与滚动约束。

- 为 `StreamController` 增加仅开发环境可用的计数：rAF 请求数、执行帧数、积压长度、`onContent` 次数。
- 为重型节点记录 mount、pause、resume、dispose 次数与持续时间。
- 为 `MessageList` 记录自动跟底被触发、取消和用户主动上滚的次数。
- 建立长文本、Mermaid、HTML 预览、媒体、快速滚动、分离窗口和会话切换的基准场景。

**完成标准：** 能够区分“网络 / store / AST / 动态节点 / 布局”各自的工作量，而不是只观察整体 CPU。

### Phase 1：安全的离屏资源暂停

**目标：** 先冻结动态富内容，不暂停普通文本流与最后消息的尺寸维护。

- 由 `MessageList` 统一提供消息活动等级，或先将现有 `MessageContent` 可见性结论向下传递。
- 为 Mermaid、HTML Interactive Viewer、音视频和 Canvas 类节点增加协作式 `pause` / `resume` / `dispose`。
- `offscreen` 时关闭节点进入动画、动画循环和媒体播放；`visible` / `nearby` 时按节点语义恢复。
- 继续保留 `MessageContent` 的样式与思考规则冻结逻辑，并收敛到统一活动等级。

**完成标准：** 离屏富节点不持续运行自主动画或媒体；回到视口后内容正确且无重复挂载泄漏。

### Phase 2：离屏流式展示暂停

**目标：** 让 `StreamController` 在 `offscreen` 时停止申请展示 rAF。

- 实现 `StreamController.setRenderActivity()`、`suspend()`、`resume()`、`dispose()`。
- `RichTextRenderer` 将消息活动状态传入控制器。
- 在 feature flag 下仅对“用户已离开底部且流式消息已出预热区”的场景启用；保持默认回退路径。
- 明确处理已结束但尚未富化的消息：优先保证终稿正确，其次才是离屏节流。

**完成标准：** 在受控场景中，离屏流式消息的 `StreamController` 不再持续产生 rAF / AST 更新；数据、完成态和重新进入后的终稿均正确。

### Phase 3：滚动意图代际保护

**目标：** 防止内容高度变化和延迟滚动把正在阅读历史的用户拉回底部。

- 在用户滚轮、触摸、滚动条拖动等意图发生时递增 `scrollIntentGeneration`。
- 自动跟底请求捕获当前 generation，并在 `ResizeObserver` 回调、节流回调或下一动画帧执行前再次校验。
- generation 改变时取消过期自动滚动；用户发送新消息或显式“跳到底部”可重新接管跟底。

**完成标准：** 快速流式输出、布局变化和用户上滚并发时，用户不会被过期自动滚动拉回底部。

### Phase 4：可选的更精细预算

在前述阶段稳定后再评估：

- 对 `nearby` 设置较低的渲染频率或关闭入场动画；
- 对超长静态历史采用更精确的固有尺寸估算；
- 研究虚拟列表，但仅在 `content-visibility` 与活动调度不足以解决内存/布局瓶颈时启动；
- 为 detached window、截图渲染和导出明确单独的活动策略，避免普通消息列表策略误影响非交互场景。

## 6. 滚动与尺寸约束

离屏展示暂停不能与以下约束冲突：

1. **流式尾消息高度：** 用户在底部时，尾消息必须持续参与布局，保证 `scrollHeight` 和自动跟底正确。
2. **用户阅读优先：** 用户离开底部后，过期自动滚动不能覆盖其滚动意图。
3. **重新进入正确性：** 离屏期间积压的文本回到视口后必须一次性或受控地收敛到正确状态，不能漏 chunk、重放旧动画或显示中间错误 AST。
4. **固有尺寸误差：** `contain-intrinsic-size: auto 500px` 只是估算。暂停前后不得因为错误估算造成无法接受的滚动跳跃；需要通过实测决定是否记录每条消息的最终高度。
5. **KeepAlive / 分离窗口：** deactivate、activate、detach、窗口关闭都必须视为生命周期事件，清理或恢复对应的观察器与资源。

