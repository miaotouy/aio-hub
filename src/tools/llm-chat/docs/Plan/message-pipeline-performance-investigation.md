# 对话消息处理与显示管线性能调查

> 日期：2026-10-28  
> 状态：五项修复已完成，相关回归与隔离 Tauri 验证通过。调查代码基线：`f4e745259`。
> 范围：桌面端对话的接收、状态更新、跨窗口同步、正文 / 思考 / 工具结果显示及保存触发。

## 调查阶段结论

近期富文本优化已覆盖解析器缓存、Worker 增量传输、历史正文延迟解析、整消息与块级显示树回收。下一轮值得优先处理的是这些优化之外的路径：

1. 默认折叠的 reasoning 正文持续挂载，更新时调用静态全量解析。
2. 分离窗口反复开关后，同步初始化创建的 watcher 累积，重复调用当前引擎。
3. 有分离组件窗口时，会话详情的深度监听仍随响应式更新遍历整棵树。
4. 工具结果及时显示后，长结果的全文格式化与文本节点更新成本更容易暴露。
5. 平滑输出恢复长文本时，队列的参数展开在 V8 可触发 `RangeError`。

这些问题有不同触发条件，不能合并成一个“聊天整体耗时”。下文分别记录代码路径、局部回放和后续处理方向。

## 近期提交基线

| 提交 | 已落地内容 | 对本轮调查的影响 |
| --- | --- | --- |
| `c49c2f4ea`、`61b436998`、`7c4fd6b63` | 停用页面与阅读区外历史显示树回收、行壳占位联动 | 区分显示树回收和解析 / 状态层仍执行的工作 |
| `716b8272d`、`3ec6f05a3` | 未阅读历史延迟解析、按需创建纯渲染解析器 | 首次加载已有优化，重点查持续更新路径 |
| `2ad4e554a`、`044a281cb`、`99a8ba9ae`、`a9070e9c5` | Worker 文本 / token 前缀、稳定区解析、边界分行复用 | 确认哪些调用仍重置解析器并绕开增量缓存 |
| `afb93d713`、`3a3468b19` | Mermaid 合并排版、长消息块级挂载回收 | 重型展示已有专项结果，避免重复实施 |
| `4f9e7660e`、`3fd413c1b` | 统计阶段延后媒体物化、避免预览触发转写 | 上下文统计保留现有成果，另观察保存与发送结束的竞争 |
| `f4e745259` | 工具结果流式到达立即写入节点 | 修复及时显示；需要单独控制后续格式化和显示工作量 |

已完成的原生数据见[富文本当前清单](../../../rich-text-renderer/docs/Plan/current-worklist.md)与[聊天显示生命周期专项](../../../rich-text-renderer/docs/Plan/chat-dom-retention-investigation.md)。

## 当前链路

```text
useSingleNodeExecutor
  ├─ 请求前：上下文 PipelineEngine
  └─ API / VCP 分段回调
      └─ useChatResponseHandler.handleStreamUpdate
          ├─ assistant 正文
          │   ├─ ReplayableMessageStreamSource：累计原文、通知订阅者
          │   ├─ RichTextRenderer → 平滑控制器 → 预处理 → 增量解析
          │   └─ 降频写 node.content → 触发保存
          ├─ reasoning
          │   └─ rAF 写 metadata.reasoningContent
          │       └─ MessageContent → LlmThinkNode → RichTextRenderer.content
          ├─ tool 正文
          │   └─ 立即写 node.content → ToolCallMessage 全文处理 → pre 文本
          ├─ rAF 合并流增量 → 跨窗口总线
          └─ 增量保存触发 → 会话计数 / 索引 → 协调器 → JSON 快照 → IPC

有分离组件窗口：currentSessionDetail → deep watch → 防抖推送 → diff / 快照
```

默认配置使用 V2 解析器、启用平滑输出，增量保存间隔为 2 秒。assistant 正文已把显示和节点持久化更新分开；reasoning 与工具结果使用各自的显示路径。

## 1. 折叠 reasoning 仍持续静态全量解析

### 代码依据

- `components/message/MessageContent.vue:1163–1188`：reasoning 以普通 `content` 属性传给独立的 RichTextRenderer；外层有 `is-thinking`，内部 Renderer 未传 `isStreaming` 或 StreamSource。
- `rich-text-renderer/components/nodes/LlmThinkNode.vue:78–84`：折叠使用 `v-show`，默认插槽持续挂载。
- `rich-text-renderer/RichTextRenderer.vue:561–605`：静态监听在首次初始化后继续跟随源码更新；默认 `isStreaming=false` 时调用 `setStaticContent`。
- `rich-text-renderer/core/StreamProcessorV2.ts:716–738`：`setStaticContent` 重置边界与解析器，再解析全文。

### 局部复现

临时组件回放使用实际 LlmThinkNode、RichTextRenderer 和 V2 解析器，Worker 传输替换为同进程生产 Tokenizer：

- 初始保持默认折叠，正文元素 `display: none`。
- 初始触发 1 次 `setStaticContent`。
- reasoning 追加 3 次后，调用累计 4 次，隐藏正文中存在 4 个段落元素。

另对同一 31,500 码元输入按 2,048 码元前缀回放 16 次，静态路径记录 32 次共享 parser reset 包装调用，增量路径为 0 次。静态路径重置稳定区与待定区共享的传输状态，近期前缀缓存难以发挥作用。该 CPU 回放包含冷启动，计时不用于宣称实际聊天加速倍数。

### 建议

首先延后折叠思考正文的首次挂载，保留标题、计时和预览。展开时从当前完整 reasoning 恢复；已展开的持续更新走显式流式路径，并在思考结束时收尾。仅增加 `isStreaming` 可改变解析入口，折叠状态的无效正文工作仍需单独处理。

## 2. 同步初始化的 watcher 随开关窗口累积

### 代码依据

`composables/chat/useLlmChatSync.ts`：

- `initialize()` 内创建 `watch(isSending, ...)`（192 行）和分离组件数量监听（302 行）。
- 初始化由下游窗口状态的 watcher 间接调用（520 行），运行在后续回调中。
- `cleanupEngines()` 仅清理 `stateEngines`，未保存 / 停止上述 watcher。
- 这些闭包引用外层可变的 `sessionDataEngine`，重复初始化后会共同操作最新引擎。

### 局部复现

使用真实 useLlmChatSync，以轻量 store / 总线 / 引擎替身记录业务层调用，重复三轮“出现下游窗口 → 发送开始 / 结束 → 关闭下游窗口”：

| 开窗轮次 | 本轮生成结束的 manualPush 调用 | setDebounce 调用 |
| --- | ---: | ---: |
| 1 | 1 | 2 |
| 2 | 2 | 4 |
| 3 | 3 | 6 |

关闭下游窗口后切换发送状态，仍记录 3 次 manualPush；组件卸载后再次切换也记录 3 次。这里统计引擎方法调用，真实传输还受总线消费者检查约束；关闭窗口后的调用次数不能直接换算成实际广播数。

### 建议

将一轮初始化包进可停止的 effect scope，或显式收集 watch stop handle；清理时一并停止并清空当前引擎引用。生成已开始时再打开窗口，也应按当前 `isSending` 初始化同步间隔，避免一直沿用初始 100ms 配置。

通用 `useStateSyncEngine.cleanup()` 同时值得检查：当前未取消待执行的 debouncedPushState，且未使 pushState 失效。需要保留清理后无尾部同步的契约。

## 3. 深度监听的成本发生在发送防抖之前

### 代码依据

- `useLlmChatSync.ts:110–112, 185–188` 将完整 currentSessionDetail 交给同步引擎。
- `src/composables/useStateSyncEngine.ts:372–394` 使用 `{ deep: true }`；回调随后才调用 `debouncedPushState()`。
- `useLlmChatSync.ts:192–205` 将发送期间的发送间隔调整为 2 秒，未改变 deep watch 的依赖遍历频率。

reasoning 每个有效帧更新 metadata，工具结果直接更新 content；这些更新可触发整棵会话树的遍历。未显示分支也在 `detail.nodes` 中。此路径仅在有下游分离组件窗口、同步引擎已初始化时成立；主窗口独立运行已按需清理同步引擎。

### CPU 量级回放

Bun 1.4.2 / 项目已安装 Vue；构造带正文、metadata、attachments 的合成节点，每次更新末尾 reasoning 并等待 nextTick。预热 5 次后记录 30 次。数值为修改到该 flush 完成的耗时：

| 会话总节点数 | deep watch 中位数 | P95 | 无该 watcher 的中位数 |
| --- | ---: | ---: | ---: |
| 100 | 0.792ms | 1.057ms | 0.007ms |
| 500 | 3.288ms | 5.227ms | 0.005ms |
| 1,000 | 8.373ms | 12.489ms | 0.003ms |
| 3,000 | 24.265ms | 28.554ms | 0.002ms |

该回放定位 Vue 遍历开销，未包含组件、布局、IPC 和 WebView2，数据不能直接当作实际帧耗时。

### 建议

用明确的会话结构 / 内容修订信号驱动同步；正文与 reasoning 按节点增量同步，切会话、分支及恢复时补快照。过渡期可先把流字段从完整会话深度监听中拆出。继续拉大发送防抖间隔，无法解决前面的遍历。

## 4. 工具结果即时显示带来的全文处理

### 代码依据

- `useChatResponseHandler.ts:303–312`：tool 每次收到正文就刷新节点。
- `ToolCallMessage.vue:489–554`：displayContent 每次失效会规范化全文、匹配 JSON、尝试 JSON.parse，再做递归格式化。
- 展开正文为单个 `<pre>`（1188 行）；折叠摘要同样读取 displayContent（1251 行）。

Vue 会合并同一个 tick 内的更新，所以实际格式化频率取决于 chunk 分发节奏，不能机械地认定每个网络 chunk 都执行一次。不同 tick 持续到达时仍会反复处理增长的全文。

### CPU 量级回放

直接从当前 SFC 提取原格式化函数，构造逐步增长的 JSON 工具结果，每次增加 4,096 码元：

| 最终长度 | 前缀次数 | 全部格式化累计 CPU | 最终完整内容格式化中位数 |
| --- | ---: | ---: | ---: |
| 44,224 | 11 | 2.47ms | 0.435ms |
| 445,824 | 109 | 95.25ms | 3.275ms |
| 1,341,824 | 328 | 719.45ms | 10.798ms |

数据为合成输入 / Bun 同进程回放；CPU 累计值分散在整轮到达期间，未包含 DOM 文本替换、布局与绘制。它证明增长趋势，不能据此声称真实聊天连续卡住 719ms。

### 建议

保留工具结果及时显示的行为。将即时原文 / 短摘要与完整 JSON 美化拆开；流式阶段合并展示更新，结束或展开详情时美化。折叠卡片的短摘要避免依赖完整结果格式化。超大展开正文沿用项目现有的大文本查看能力。

## 5. 长文本恢复进入平滑队列时有参数展开风险

### 代码依据与触发路径

- `useStreamingMessageSources.ts:30–38`：新订阅者在微任务中一次收到已累计的全文。
- `RichTextRenderer.vue:759–766`：平滑模式直接将该文本交给 `StreamController.push()`。
- `StreamController.ts:385–387`：语义分块后使用 `semanticQueue.push(...chunks)`。
- `markMounted()` 的预缓冲回放也使用相同展开方式（441 行）。

正在流式输出的长消息重新挂载时可能走到此路径。紧急冲刷发生在后续 tick，无法保护前面的入队参数展开。

### V8 局部复现

使用 Bun 将生产 StreamController 打包为 Node 入口，在 Node 22.17.0 / V8 调用实际 push：

| 一次投递中文长度 | 语义块数量 | 结果 |
| --- | ---: | --- |
| 100,000 | 50,000 | 入队成功 |
| 200,000 | 100,000 | 入队成功 |
| 250,000 | 125,000 | 入队成功 |
| 300,000 | 150,000 | `RangeError: Maximum call stack size exceeded` |
| 500,000 | 250,000 | 相同异常 |

Bun / JavaScriptCore 下相同长度均可入队，说明必须区分引擎。Node 的参数上限也不能直接当成 WebView2 的精确阈值；真实窗口中的恢复场景仍需复核。

### 建议

改用无大规模参数展开的入队方式；超出平滑窗口的历史回放直接提交或分批追赶，后续新到达内容继续平滑。优先保护全文顺序、完成事件和恢复期间的新 chunk，避免为展示回放制造大队列。

## 其他观察

### 跨窗口增量接收入口需要一并理顺

全仓 `chat:streaming-delta` 的接收处理位于 useLlmChatSync.initialize() 的 detached-component 分支；该文件底部仅对 main / detached-tool 初始化。分离组件使用的 useLlmChatStateConsumer 目前只注册常规状态引擎，未发现同名流增量接收入口。

从静态接线看，增量通道存在可达性疑问；工具正文增量分支也只追加 StreamSource，ToolCallMessage 依赖的 node.content 未更新。实施同步优化时需在真实分离聊天窗口确认这一链路，避免保留深度遍历成本却仍依赖尾部快照显示。

### “增量保存”仍提交全会话快照

默认 2 秒触发保存。useSessionManager.persistSession 会重新统计整棵树消息数量；storage 创建索引条目时再次计数，并在协调器真正提交时同步 JSON.stringify 完整会话。协调器已有单写者和 dirty 合并，频率层面有保护。

这是长历史和大工具结果下的周期性主线程候选，当前未取得真实长会话保存 profile，暂不据此安排存储架构重写。应先观察保存时刻与帧长任务的重合情况。

## 建议处理顺序

1. 收口同步初始化 / 清理，消除重复调用；同一轮核对分离组件的流增量接收。
2. 延后折叠 reasoning 正文，给展开思考接入正确的流式解析生命周期。
3. 分离会话树结构变化和流字段同步，移除逐帧全树遍历。
4. 拆分工具结果摘要、流式原文和完成态格式化。
5. 修正大块入队方式，补充长消息重新订阅的恢复路径。

验证围绕各自公开行为：反复分离 / 还原后同步次数保持、折叠思考展开可见当前全文、工具结果首段及时显示、长消息恢复无丢字 / 重复、完成后最终内容一致。性能复核使用真实 Tauri 窗口，按问题分别采集。

## 初始调查产物与边界

临时回放及 JSON 均位于已忽略的 `.tmp/chat-pipeline-investigation/`：

- `probe.ts` / `probe-results.json`：合成 Vue 深度监听、工具格式化、解析入口与队列 CPU 回放。
- `sync-lifecycle.test.ts` / `sync-lifecycle-results.json`：实际业务 composable 的重复初始化观察；总线与引擎替身化。
- `reasoning-component.test.ts` / `reasoning-component-results.json`：实际默认折叠组件和 Renderer 的挂载 / 解析观察；分词使用同进程生产 Tokenizer。
- `v8-replay.mjs` / `v8-replay-results.json`：生产平滑控制器在 V8 的大块入队回放。

初始调查时，两个临时 Vitest 观察入口均执行完成，用于调查取证；正式回归与原生复核结果见下方实施记录。当时开发控制发现 `panel-click` 的就绪登记，但实际连接返回 `CONNECTION_FAILED`，本轮未取得新的真实 WebView2 profile；未操作其会话数据。文中原生历史数据均指向既有专项，新增局部数据已明确标识运行环境。

## 实施记录

### 同步生命周期

每轮下游窗口初始化使用独立 effect scope，窗口关闭和组件卸载统一停止业务监听及同步引擎；清理取消待执行防抖并禁止后续推送。发送中打开窗口立即采用流式间隔。正式回归覆盖三轮开关各一次收尾同步、关闭 / 卸载停止监听，以及通用引擎清理后的尾部任务取消。

### 折叠思考与解析入口

思考正文首次展开才挂载。已展开的查看器在折叠时保留实例，插槽内容固定为最后一次阅读快照，再次展开追上当前全文；MessageContent 为展开思考显式传递 isStreaming，生成期间使用增量解析。标题、预览、复制和计时继续读取实时原文。

正式组件回归覆盖初始延迟、展开看到最新正文、隐藏期间快照稳定、重开追上最终内容与查看器根节点保留。新增 `bun run chat:pipeline:tauri -- --instance <隔离HMR实例>`，复用 Dev Control 身份核验，在真实窗口局部挂载组件并清理，JSON 写入 `.tmp/chat-pipeline/`；结果限定为组件级原生回放。

该项相关 41 个用例、前端和脚本类型检查、Vite 构建通过；独立 `chat-pipeline` 的真实 WebView2 中，折叠延迟、首次展开、隐藏快照与重开恢复四项均通过。

### 流式同步与全树遍历

生成期间暂停 currentSessionDetail 的深度依赖收集；按 2 秒检查点和会话 / 活跃叶变化发送完整快照，生成结束恢复普通监听并立即收尾。其他状态沿用原同步引擎。流增量接收迁入实际加载的 useLlmChatStateConsumer，使用 data 信封和绝对 UTF-16 偏移；独立接收器协调重叠增量、落后检查点、新工具节点暂存与最终权威快照，避免修改同步引擎持有的原始包。会话详情使用完整检查点，避免在本地增量正文上应用基于旧快照的 JSON Patch。

正式回归覆盖暂停期间历史字段零访问、恢复后的最终数据、增量信封与偏移、重叠去重、落后快照、工具节点先到增量和迟到 / 跨请求数据。相关 15 项用例通过。独立真实 Tauri 聊天组件窗口开关三轮，首段正文 / 工具结果分别约 25 / 17 / 19ms 写入消费窗口，均在 2 秒检查点前到达；reasoning、后续正文与工具内容经过检查点后保持完整，结束状态正常同步。原生脚手架增加 `bun run chat:pipeline:tauri -- --instance <隔离HMR实例> --sync`，复用生产 handler、原生窗口分离 / 还原和消费者，结束清理内存样例并恢复设置。

### 工具结果分层显示

摘要仅处理原文前 512 字符；折叠正文停止格式化与更新。展开后的首段立即显示，后续流式原文以 100ms 最新值合并，结束时立即刷新并完成 JSON 格式化。显式预览同样读取最新内容。超过 10 万字符的正文复用 CodeMirrorSourceViewer 虚拟视口，保留完整结果及原有复制、编辑、预览入口。

正式回归保护首段时效、尾段合并、完成与折叠取消、展开恢复以及 JSON 值和转义键保真。相关两项用例、前端 / 脚本类型检查及 Vite 构建通过。原生脚手架补充流式原文、完成态格式化、折叠大结果和展开虚拟化：511,903 字符原文格式化后为 589,911 字符，JSON 语义一致，约 400px 视口挂载 53 行；此前思考组件场景同轮通过。

### 长消息恢复与订阅顺序

平滑控制器在语义分块前检查大块回放，超过已有紧急冲刷阈值时先输出旧队列，再直接提交大块正文；挂载前预缓冲采用同样路径。普通入队改用循环，消除 V8 函数实参数量上限；后续小片段继续平滑输出。

消息源在订阅边界捕获历史快照，回放前或回放回调中收到的新片段排在历史之后，完成通知等待已排定的回放；取消订阅后停止该订阅的历史与增量。修复了原先“先交付新片段，再回放包含该片段的全文”的重复和乱序风险。

正式回归覆盖 50 万字符挂载前 / 后回放、前后片段顺序、订阅后立即追加并完成以及取消回放；连同现有聊天流生命周期和 Renderer 生命周期，共 55 项相关用例通过。真实 WebView2 中两条 50 万字符控制器路径完整恢复，队列清空；30 万字符 Renderer 连续两轮重新挂载，回放前到达的新片段与完成通知保持正确顺序和最终正文。原生脚手架已将这些场景合入默认运行。

### 后续观察

五项改动均经过相关回归、前端类型检查、脚本类型检查和 Vite 构建。原生复核使用独立 `chat-pipeline` 开发实例；组件回放与真实分离窗口同步分别由默认命令和 `--sync` 执行。报告记录局部行为和样例规模，作为后续排查的可复现入口。

全会话保存的同步序列化仍保留为性能采样候选。需要结合真实长历史的保存时刻与主线程 profile，再决定存储路径的调整范围。
