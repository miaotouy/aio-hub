# 连续紧凑消息：本机同类项目调查

> 日期：2026-10-31  
> 方法：阅读本机检出的源码、相关调用与已有测试。未拉取远端，结论限定于下列本地版本；未启动这些应用进行视觉与性能实测。

关联：[AIO Hub 当前结构评估](./message-compact-layout-investigation.md)。

## 1. 结论与选型

当前需求优先对应“连续 AI / 工具消息共享角色头，正文继续可见”。“将中间过程折成一行，只突出最终回答”属于另一层展示策略，适合单独提供。

同类项目有三条实现路线：

1. **单消息内的内容块编排**：VCPChat、Cherry Studio、RikkaHub 把工具过程放在消息内容内部处理，身份头和消息操作天然只出现一次。
2. **外部消息到展示消息的适配**：assistant-ui 可以将连续 assistant / tool 转为一条展示消息，保留原消息引用。
3. **回合与展示节点投影**：本机 OpenCode 主时间线先归回合、再生成正文 / 工具 / 状态 / 错误等展示行，逐展示行虚拟化。DSH 将原事件投影成 assistant-step、过程组与独立回合尾栏，集中管理过程可见性与回合操作。

补查 DSH 后，回合尾栏、过程策略与用量累计应优先参考 DSH，展示行与来源回溯继续参考 OpenCode、assistant-ui。对 AIO Hub，最合适的是借用展示投影与原节点回溯，同时保留现有逐消息行壳。角色头、组尾操作与统计统一编排；工具结果延续现有节点组件。随后可以在相同投影基础上加入可选过程折叠。

### 本地样本

| 项目 | 本机路径 | 本地 HEAD | 本次参考价值 |
| --- | --- | --- | --- |
| DSH / DeepSeek Harness | `E:/git/deepseek-harness` | `f3803c9697`，2026-10-28 | 独立回合尾栏、过程折叠策略、稳定展示容器与严格多请求用量累计。 |
| VCPChat | `E:/rc20/vcp/VCPChat` | `36050512`，2026-10-31 | 工具展示模式、过程折叠、延迟解析和展开状态记忆。 |
| OpenCode | `E:/git/opencode` | `fb61043f`，2026-10-19 | 展示行投影、原消息映射、稳定行 key 与虚拟列表。 |
| Cherry Studio | `E:/git/cherry-studio` | `cc3d44024`，2026-02-18 | 连续工具块分组、组头优先展示待审批工具、统计移到操作区。 |
| RikkaHub | `E:/git/rikkahub` | `bc9d258`，2026-09-12 | 按顺序编排正文、推理和工具；尾部操作与统计的组件边界。 |
| assistant-ui | `E:/git/assistant-ui` | `1ef7e20a`，2025-03-06 | 连续 assistant / tool 的展示适配与原消息回溯；样本较旧。 |
| TauriTavern | `E:/git/TauriTavern` | `a598379`，2026-05-07 | 文档样式与独立工具记录，作为 CSS 密度调整的对照。 |

另查看了 `E:/git/pi` 的交互组件入口，该本地检出的相关实现以终端组件为主，本次桌面 WebView 展示方案以表内项目为主要依据。

## 2. VCPChat：最接近工具过程收缩的现成方案

### 2.1 展示选项已经分层

源码入口：

- `E:/rc20/vcp/VCPChat/modules/ui-system/appearance-studio.js:145–146`
- `E:/rc20/vcp/VCPChat/modules/renderer/toolPresentation.js`
- `E:/rc20/vcp/VCPChat/styles/ui-system/tool-presentation.css`

本地版本有五种工具展示：原有卡片、紧凑单行、分组折叠、单行合并、整轮折叠；展开策略独立设置为仅异常、全收起、全展开。

`toolPresentation.js:146–157` 将展示模式限定在 next UI 下，并按 `.message-item` 保存展开状态。`domBuilder.js:88–152` 每条消息创建一份头像、身份和内容骨架，工具展示主要发生在该消息的 `.md-content` 内部。

因此，它对跨消息头部合并的参考是间接的；单消息内部的过程收缩实现更值得看。

### 2.2 有四个具体值得借鉴的细节

- **请求与结果成对展示**：`presentCalls()`（362–385）将相邻请求与同名结果关联，单行展示结果状态，两个区域一起开合。
- **按工具类别合并**：`groupFamilies()`（515–542）把连续读取 / 搜索归成“查阅”，命令归成“终端”；正文与其他类型会形成边界。
- **完成后再折过程**：`foldTurn()`（545–558）在流式结束后，将第一个至最后一个工具块之间的内容，包括中间正文，折成过程组；工具之后的最终正文留在外面。
- **保留用户展开选择，按需挂载内容**：通过 owner 级 Map 保存用户操作过的展开状态；`syncLazy()`、`mountRequest()` 与组开合联动，关闭时卸载工具正文。

已有测试 `tests/message-renderer-tool-cards.test.mjs:441–452` 覆盖：整轮关闭时失败结果正文也保持未解析，展开后解析，重新关闭后释放。这是源码与测试契约，未在本次重新执行。

### 2.3 借鉴边界

- VCPChat 的分组是渲染后 DOM 编排，使用 WeakMap、属性标记、节点移动与原始头部恢复。AIO Hub 的 Vue 节点适合用数据投影声明式渲染，避免复制这套 DOM 变换。
- 请求 / 结果配对采用相邻位置和工具名（371），AIO Hub 已有 requestId，应优先按明确 ID 关联并校验归属。
- “整轮折叠”默认会隐藏中间正文，和当前需要保留正文的连续紧凑模式应分别配置。
- 过程组统计主要是工具次数和状态；本次所读代码未提供可直接移植的多请求 Token / TTFT 汇总方案。
- 消息编辑、复制、重试等能力在 `modules/renderer/messageContextMenu.js` 的右键菜单中提供。可以借用次级动作集中管理的方向，常用动作仍应有可发现入口。

## 3. OpenCode：最值得借鉴的展示结构

### 3.1 先确认主界面实际用哪条路径

仓库有 `packages/session-ui/src/components/session-turn.tsx`，它按 user 消息收集所有 `parentID` 指向该 user 的 assistant 消息，再统一渲染。

本机主界面的 `packages/app/src/pages/session/timeline/message-timeline.tsx` 使用了更细的 `createTimelineProjection`，再对投影行虚拟化。调查时要区分这两条入口。

### 3.2 主时间线的层级

```text
原始 Message / Part
  → 按 user 父节点归回合
  → 扁平展示行：UserMessage / AssistantPart / Thinking / Error / DiffSummary ...
  → 稳定行 key、消息与行索引映射
  → 逐展示行虚拟化与测量
```

关键源码：

- `packages/app/src/pages/session/timeline/rows.ts:34–231`：归回合并生成展示行。
- `packages/app/src/pages/session/timeline/projection.ts`：持有消息索引、回合成员、首末行索引与最后 assistant 组索引。
- `packages/app/src/pages/session/timeline/row-reconciliation.ts`：复用未变行对象，分组改变时尽量延续 context 行的 key。
- `packages/app/src/pages/session/timeline/message-timeline.tsx:439–464`：虚拟列表的条目数取展示行数，key 使用投影行身份。

这条路径明确支持“多条底层消息在同一段视觉对话中连续呈现”，同时避免把整轮变成一个巨大虚拟条目。

### 3.3 过程压缩与尾部信息

`packages/session-ui/src/components/message-part.tsx:609–706` 只将连续 `read / glob / grep / list` 工具归为 context 组。组成员保留 `{messageID, partID}`，组 key 初始采用首个 part ID；其他正文与工具会中断该组。

`message-timeline.tsx:1008–1043` 计算回合耗时与最后可复制文本段：执行中不显示最终复制入口，完成后找到最后一个非空 text part。

`message-part.tsx:1722–1760` 让指定文本段显示复制与元信息。`handleCopy()` 复制当前文本段，不能将这个行为理解为复制整个回合。耗时按 user 创建至最晚 assistant 完成计算，也包含了用户提交后的等待。

### 3.4 对 AIO Hub 的启发

- 角色组与渲染行可以分离，组无需直接对应一个 DOM 大容器。
- 投影需要保留源节点引用，并明确消息到行的定位映射。
- key 稳定和对象复用直接影响流式追加时的局部状态与测量缓存。
- 组尾操作应明确是最终正文、最后节点还是整组。
- 可以将错误、等待等信息作为独立展示职责，避免依附于可隐藏的普通统计。

AIO Hub 首版继续保留一节点一行；若未来要折叠跨多个原节点的完整过程，OpenCode 提供了进一步演进为显式展示行模型的参考。

## 4. Cherry Studio：一条消息含多个工具块

### 4.1 单头部来自数据与组件层级

- `src/renderer/src/types/newMessage.ts:198–213`：消息持有 askId、usage 和 block ID 列表。
- `src/renderer/src/services/messageStreaming/callbacks/toolCallbacks.ts:24–98`：工具回调通过 toolCallId → blockId 映射，向指定 assistantMsgId 追加或更新 TOOL block。
- `src/renderer/src/pages/home/Messages/Message.tsx`：外层渲染消息头，内容交给 block renderer。

工具循环内容在 assistant 消息内部编排，因此无需为每个工具 block 重复身份头。

仓库中的 `MessageGroup` 还服务于多模型 / 多回复展示；不能仅凭组件名将它当作多轮工具循环合并实现。

### 4.2 连续工具组与审批可见性

`Messages/Blocks/index.tsx:69–108` 对连续 TOOL block 分组；文本会中断工具组。多个工具使用 `ToolBlockGroup`，单个工具直接显示。

`index.tsx:175–181` 特意使用首个工具 block ID 生成稳定 group key，避免追加工具时整组重挂载。

`ToolBlockGroup.tsx:175–235` 的组头按如下顺序呈现信息：

1. 全部结束时显示工具数量。
2. 有待审批项时显示待审批工具与审批动作。
3. 否则显示当前运行工具。

组默认关闭（267），展开后的工具列表限高 300px（样式部分），执行项变化时滚向当前工具（285–289）。

### 4.3 操作与统计

`MessageMenubar.tsx:525–563` 在特定消息布局下将 `MessageTokens` 放进消息操作栏。`MessageTokens.tsx` 把 Token、成本与性能信息集中展示，部分指标通过 Popover 展开。

可借鉴的是统计有独立组件、放在低优先级消息操作区。其 usage 是单消息维度，AIO Hub 的多请求组汇总仍需自行定义口径。

展开工具组后的内部滚动属于有取舍的方案：占用更少空间，同时带来嵌套滚动。AIO Hub 已有相关滚动归属边界，首版可以先保持自然纵向展开。

## 5. RikkaHub：按原顺序分出正文与过程

### 5.1 内容模型

- `ai/src/main/java/me/rerere/ai/ui/Message.kt:17–30`：UIMessage 包含 parts、usage、模型和起止时间。
- `UIMessagePart.kt:184–199`：Tool part 同时持有 toolCallId、输入、输出和审批状态。
- `Message.kt:323` 起有旧 TOOL 结果合入 assistant Tool part 的迁移代码。

这解释了它的头栏、消息操作和统计为何能按一条 UIMessage 放置。

### 5.2 连续过程分组保持正文顺序

Android 的 `ChatMessageCot.kt:26–69` 将连续 Reasoning / Tool / ServerTool 归为 ThinkingBlock；遇到其他正文时结束过程组。

Web 的 `web-ui/app/components/message/message-part.tsx:37–63` 有对应的 reasoning / tool 分组函数。

`chain-of-thought.tsx:40–50` 默认只呈现过程组最后两个步骤，展开后显示全部。该组件还用数组位置作为可见步骤的 React key；窗口随追加变化时，这是迁移时需改进的状态身份风险。AIO Hub 宜使用原节点或调用 ID。

### 5.3 消息边界较清楚

Web `chat-message.tsx:541–593` 顺序组合：

```text
头像 / 身份
→ MessageParts
→ MessageActions
→ Annotations
→ NerdLine 统计
```

统计在 `ChatMessageNerdLineRow` 单独实现（480–511），读取消息 usage 与时间字段。这个边界可以直接启发 AIO Hub 拆开正文与统计。

它的速度计算使用 completionTokens / 消息跨度（129 起的 getNerdStats），包含了跨度内的过程等待。AIO Hub 若提供模型生成速度和整组过程耗时，应分别命名和计算。

## 6. assistant-ui：和“多个 AI / 工具循环合到一头”最直接的适配示例

该本地样本较旧；以下只描述其本地源码。

`packages/react/src/runtimes/external-store/external-message-converter.tsx`：

- `chunkExternalMessages()`（156–206）把连续 assistant / tool 收为 chunk，遇到 user / system 切开；支持 joinStrategy 为 concat-content 或 none。
- `joinExternalMessages()`（44–152）拼接 assistant 内容，tool result 按 toolCallId 回填原 tool-call 内容块；找不到调用或工具名冲突时抛错。
- 转换结果持有 `symbolInnerMessage`，记录贡献到展示消息的原始输入；内容块也保存原始来源引用。
- `getExternalStoreMessage.tsx` 提供 getExternalStoreMessages，从展示消息或内容块取回原始来源。
- `274–311` 的 chunk / converter 缓存尽量复用稳定转换结果。

这说明原始消息保持独立时，也可以在适配层形成共享头栏的展示消息。

但其默认分组只按角色边界，AIO Hub 还需要加入 agent / origin、预设、压缩、模型变化和分支语义。UI 适配回溯也需要与原节点操作一一对齐。

`packages/react-ui/src/ui/assistant-action-bar.tsx:72–105` 提供 hideWhenRunning、autohide=not-last 等策略，展示层与动作能力可用性分开。`assistant-message.tsx` 则将身份、内容、分支选择与操作栏组合在同一展示消息内。

## 7. TauriTavern：CSS 调密度的适用边界

`src/scripts/power-user.js:1055–1082` 在默认、气泡和文档样式间切换 body class。

`src/css/toggle-dependent.css:321–363` 的文档样式缩短间距，隐藏头像、姓名、时间和历史消息按钮；它没有在该路径中计算角色组首身份。

`src/scripts/tool-calling.js:868–891` 将一次工具调用集合保存成独立 small system message，再加入聊天列表。

这个对照表明：纯 CSS 可以快速实现阅读密度变化，角色归组、组状态与统计范围仍需要显式展示模型。当前需求直接套“文档样式”会丢失需要保留的组首身份。

## 8. DSH：回合尾栏、过程策略与统计最完整的参考

> 本节为 2026-10-31 补查。第一轮详细调查遗漏了 `E:/git/deepseek-harness`，本节补充后调整了上方结论与下方统计建议。

### 8.1 正文、过程控制与回合尾栏分别建模

主要入口在 `E:/git/deepseek-harness/packages/client/ui-chat/src/client/`。

- `chat/AssistantNodeView.tsx:13–74`：渲染 assistant-step 内容与推理可见性；该渲染入口没有给每个 step 再挂身份头和完整操作栏。
- `conversation-nodes/turn-process.ts`、`turn-process-presentation.ts`：派生回合过程范围、最终回答边界、外部过程与交错输入等事实。
- `conversation-nodes/turn-tail.ts:62–102`：完成回合后，找出最后一个有正文的持久 assistant 作为 closing，并汇总该回合用量。
- `chat/TurnTailNodeView.tsx:27–90`：独立渲染回合尾栏，承载扩展内容、复制、分支、时间和用量入口。尾栏独立于 assistant 行的位置。

这层划分与当前“中间消息减少头栏和统计，末尾集中呈现”的目标非常接近。AIO Hub 可以给连续角色组派生自己的尾栏展示描述，继续保留组内原始节点。

尾栏复制的是 closing assistant 的正文；分支使用真实 turn/end 边界，并在后续仍有工具或其他内容时限制操作。该契约说明最后一段正文与完整回合的操作边界仍需分别定义。

### 8.2 展示密度、收起时机和保留正文分别配置

`presentation-policy.ts:7–97` 与 `../chat-settings.ts:9–65` 分别定义：

- 细节密度：compact / standard / detailed / verbose。
- 收起时机：completion / next-input，默认 completion。
- 收起后保留回复：all / final，默认 all。
- 性能与用量展示：compact / detailed，和过程展示分开。

`AssistantNodeView.tsx:30–42` 与 `ChatNodeSeat.tsx` 按 foldedReplies 判断哪些正文行继续显示、哪些推理或过程隐藏。因此，“所有 AI 正文仍可见，工具和推理收紧”与“只保留最终回答”确实可以共用一套过程模型。

对 AIO Hub，首版宜固定为正文全部可见，避免一下增加大量设置；架构上保留这几个独立维度。后续需要自动折叠时，“下一次输入再收起”可用于减少刚生成完成时的突发高度变化，真实滚动效果仍需验证。

### 8.3 稳定成员关系与显式锚点

`chat/ChatGroupSeat.tsx` 顶部明确规定：稳定过程容器，展示策略改变可见性，成员父级保持稳定。`132–205` 使用 groupKey、成员引用和独立 disclosure，在展开 / 历史状态间保留同一个容器；公开 `data-chat-anchor-key`、`data-chat-node-key` 等身份用于定位。

`conversation-nodes/process-groups.ts` 持有分组投影与成员映射，按变化判断是否重分组，尽量复用组 key 和摘要。`ChatTurnProcessProjector` 可只重算受影响回合。

`contract/turn-process.ts:53–59` 对运行中、中止、中断、错误回合保持过程展开；组层还识别交错输入。错误、用户介入和当前执行过程具有独立可见性语义。

这里的成员稳定原则可以借鉴。DSH 已具备自己的分组、分页与锚点系统，AIO Hub 直接照搬其层级仍会改变当前 `children[index]` 契约，首版继续保留一消息一直属行壳。

### 8.4 尾部操作栏和用量入口

`TurnTailNodeView.tsx:57–90` 将末尾操作设置为：最后回合确实以回答结束时常显，其他情况悬停显示；复制与分支图标由 `MessageIconActions.tsx` 统一实现。

用量在详细模式下以小型触发入口出现在尾栏，点击打开 `TurnUsagePanel.tsx` 的明细浮层。面板展示总消耗、模型来源、非缓存输入、缓存读写、输出及推理 Token，可选字段按实际可用性呈现。

这比在每个中间 AI 段落下重复列出 usage 更适合当前紧凑模式。局部编辑、删除和分支仍应继续通过源节点入口执行。

### 8.5 多请求 Token 汇总具备完整参考

`E:/git/deepseek-harness/packages/llm/token-meter/src/turn-usage.ts` 的 `deriveTurnTokenUsage()` 消费完整 turn/start → turn/end 生命周期：

- 按 step 和实际重试开始事件建立 attempt。
- 流式 usage 只保留当前样本，最终消息 usage 优先，避免把同一请求多次累加。
- 一次失败 attempt 跨重试边界只计一次，计划重试但尚未开始时不会虚构一次请求。
- 归一化输入、缓存、输出、推理和总量，校验数值安全与总量一致性。
- 可选缓存 / 推理字段及来源，只在所有 attempt 都具备相应事实时提供完整汇总。
- 生命周期、必要用量或总量关系无法确认时，整个精确累计保持不可用。

已有 `tests/turn-usage.spec.ts` 覆盖最终 usage 覆盖流式值、重试去重、跨 step 累计、可选字段缺失和安全整数溢出。本次阅读了对应实现和用例，未执行其测试。

AIO Hub 的消息 metadata 与 VCP 分段缺少完全等价的 attempt 生命周期，不能直接移植状态机。可以复用其计量原则，先明确 providerUsage / estimatedUsage / contentTokens 的来源与请求归属，再区分“完整请求累计”和“已知用量”。缺失项保留未知状态。

### 8.6 速度与耗时有口径划分

`contract/turn-metrics.ts` 将每 step 的 TTFT 与解码时长分开：step/start → first token，以及 first token → completed。

`chat/StatsPills.tsx:53–83, 247–288` 是会话统计入口：汇总有效解码 Token 与解码时长计算速度，同时单列 LLM 耗时、工具耗时和有效样本平均 TTFT。这里是会话 / 窗口统计，不能当成回合尾栏已经展示相同字段。

AIO Hub 可借用“有效输出 Token 总量 / 有效解码总时长”的汇总速度口径，避免平均各段 t/s；回合过程耗时与模型解码速度分别标注。

### 8.7 更新后的参考优先级

1. **DSH**：回合尾栏、正文保留与过程折叠策略、用量累计原则。
2. **OpenCode**：扁平展示行、稳定身份、测量与导航映射。
3. **assistant-ui**：展示归组后的源消息回溯。
4. **VCPChat**：工具行摘要、过程收缩、明细延迟挂载。
5. **Cherry Studio / RikkaHub**：审批优先级、内容与统计组件边界。

## 9. 对 AIO Hub 原评估的修正与细化

### 9.1 两个维度分开

- **消息布局**：现有卡片、气泡，以及计划中的连续紧凑布局。紧凑布局共享角色头，正文默认可见。
- **过程展开策略**：展开、折叠成功过程、按需查看完整过程。首版可以沿用既有工具折叠行为，后续独立设计。

VCPChat 与 RikkaHub 的“过程折叠”可以作为第二个维度的参考。

### 9.2 首版用轻量投影，保留现有行壳

建议结构：

```text
当前活动路径原节点
  → 连续角色组 + 每节点展示描述
  → 单一 MessageRow 入口
       ├─ 组首身份（身份与活动状态分别派生）
       ├─ 原 ChatMessage / ToolCallMessage 内容
       ├─ 局部操作入口
       └─ 组尾统计与结束操作
```

展示描述保存 groupId、sourceNodeId、组位置和统计 / 操作策略；组摘要保存成员 ID、活动节点与统计。身份变化和特殊节点形成边界。

这里仍是一原节点一测量行，阅读区与源节点定位可继续工作。按主人补充，合并模式导航独立投影为用户提问点，AI / 工具段落映射到所属提问；导航点与测量行可以一对多。中期若加入跨节点过程折叠，可进一步引入独立 presentationRowId 与 sourceNodeIds，届时同步迁移阅读区、源节点定位和测高映射。

### 9.3 首版优先采用的细节

| 细节 | 参考 | AIO Hub 落点 |
| --- | --- | --- |
| 展示结构与存储结构分离 | OpenCode、assistant-ui | 分组投影放在 UI 层，原树节点继续独立。 |
| 组与行的稳定身份 | DSH、OpenCode、Cherry Studio | groupId 首选组首节点 ID，展示变化进入测高上下文。 |
| 源消息回溯 | assistant-ui、OpenCode | 局部编辑、删除、分支操作明确 sourceNodeId。 |
| 待审批优先露出 | Cherry Studio | 折叠头 / 组状态保留审批入口，生成中展示活动工具。 |
| 统计独立组件 | DSH、RikkaHub、Cherry Studio | 从 MessageContent 拆出普通统计，错误继续就地显示。 |
| 工具明细按需挂载 | VCPChat | 继续沿用现有结果延迟渲染，避免只用 CSS 隐藏大正文。 |
| 独立回合尾栏与精确累计 | DSH | 回合操作和用量统一放在组尾，累计按请求来源核对。 |
| 过程折叠与正文保留 | DSH、VCPChat | 作为后续可选能力，首版共享头栏模式保持全部正文顺序。 |
| 次级操作集中 | assistant-ui、VCPChat、现有 AIO 工具栏 | 中间段少量局部动作，低频能力进更多；终止与审批保持可达。 |

### 9.4 统计口径仍由 AIO Hub 定义

DSH 已提供完整 attempt 生命周期的多请求用量汇总参考，修正了第一轮调查只关注统计摆放的缺口。AIO Hub 需要将原消息 metadata、VCP 分段和渠道尝试映射到明确的请求来源，才能按相同原则处理去重、缺失字段与精确累计。

组尾可以使用“请求累计 Token + 过程耗时 + 明细”。完整度不足时明确展示已知用量范围。生成速度 / TTFT 保留逐请求明细；如需汇总速度，可参考 DSH 按有效解码 Token 总量除以有效解码总时长计算。复制最终正文、复制整组、重新生成某段与重试整组也要有明确的操作范围。

## 10. 当前建议

先做连续紧凑模式，围绕消息行入口、普通统计抽取、分组投影与组尾操作完成一次局部整理。保留原消息树、逐节点操作和行壳，控制首版布局选项组合。

后续如果长工具过程仍占据太多空间，再引入可选过程折叠，并参考 OpenCode 的显式展示行与消息映射逐步演进。这样第一阶段就能解决重复头像、头栏、统计和操作噪声，第二阶段处理过程内容本身的长度。

## 11. 架构细化补充

后续方案见[消息列表 UI 架构优化探索](./message-list-ui-architecture-proposal.md)。AIO Hub 已有请求 attempt 快照及 assistantNodeIds 关联，可作为 DSH 计量原则的接入基础；该采集可选、历史有裁剪，仍需保留用量来源与完整度。第一阶段以共用消息行、装饰拆分及轻量分组投影承接连续紧凑模式。


