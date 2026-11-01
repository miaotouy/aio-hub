# 消息列表 UI 架构优化探索

> 日期：2026-10-31  
> 状态：A–C 首版已落地；下文保留设计依据，实际文件与取舍见实施记录。  
> 范围：桌面 llm-chat 的线性消息列表、消息装饰、操作、统计与截图。初次调查基于本地源码；已接入连续紧凑布局。

前置调查：[现状评估](./message-compact-layout-investigation.md)、[同类项目对比（含 DSH）](./message-compact-layout-comparative-research.md)。当前实现说明见 [ChatArea UI 架构](../architecture/chat-area-ui.md)。

## 1. 优化目标与结论

目标是让连续的 assistant / tool 片段共享身份头，中间段减少工具栏和统计，末尾集中呈现结果操作与用量。合并模式的导航按用户提问点组织，一次提问下的 AI / 工具循环共用一个导航点。全部正文保持原有顺序，过程折叠另行扩展。

建议采用“轻量展示投影 + 共用消息行 + 显式装饰策略”。存储树、执行器与逐节点操作保持现有结构；列表继续负责滚动与行测高。

最先处理的耦合有四类：

1. **编排重复**：MessageList 的内置 / 外置头栏路径各自绑定 ChatMessage 参数和事件，截图再次复制。
2. **装饰侵入正文**：普通统计、可行动错误和正文处理共处 MessageContent；工具消息又有独立实现。
3. **布局跨层穿透**：列表和截图通过深层选择器控制头栏、消息表面、工具卡片、统计与操作栏。
4. **操作上下文分散**：列表负责会话作用域和写保护，子组件同时持有局部编辑、翻译、直接 store 调用与弹窗。

优先围绕这些边界整理。MessageContent 的编辑器、附件与富文本渲染，以及工具协议解析，保持独立专项，避免将本次工作扩大为聊天系统重写。

## 2. 当前证据与架构约束

| 当前入口 | 源码事实 | 对优化的约束 |
| --- | --- | --- |
| `components/message/MessageList.vue` | 两套 ChatMessage 参数 / 事件；工具和压缩节点单独分发；guardedStore 处理列表入口的写保护。 | 统一消息行时要保留作用域参数、分支切换前的阅读位置捕获和只读保护。 |
| `MessageList.vue`、`useMessageReadingArea.ts` | 消息 ID → 数组索引 → 容器直接子行；可见索引按直属行二分查找。 | 第一阶段保持一原节点一直属 `.message-slot` 用于测量和定位；导航点单独投影，允许一对多。组头和组尾放入成员行内部。 |
| `composables/ui/useMessageHeights.ts` | SlotBinding 只有 message / eager；revision 来自消息内容与装饰，cohort 按角色 / 作者 / usage 等区分。 | 分组首尾和装饰可见性必须进入高度上下文，避免旧组尾变组中后复用错误占位。 |
| `composables/ui/useMessageLayout.ts` | 共用角色对齐、气泡变量、压缩状态与兄弟节点计算。工具对齐借用前一行。 | 对齐信息可继续复用；前一行的对齐无法证明工具执行归属。 |
| `components/message/ChatMessage.vue` | 已有 hideHeader，局部保存编辑 / 翻译状态，正文和头部为独立组件。 | 适合作为第一阶段的消息内容宿主。布局切换时保持组件 key 和正文实例。 |
| `components/message/MessageContent.vue` | 普通统计和错误同属 message-meta；字数 watcher 会调用 resolveAttachmentsBatch。 | 拆分统计显示与诊断；组尾汇总复用既有结果，防止再次解析附件。 |
| `components/message/ToolCallMessage.vue` | 同时承担工具呈现、异步任务、折叠、编辑、统计和操作；内部仍计算 siblings。 | 第一阶段明确呈现接口，逐步接收共用兄弟信息，避免一次拆散全部工具业务。 |
| `components/message/MessageMenubar.vue` | 已有动作注册、固定 / 更多分区与用户自定义；内部还处理重算 Token、弹窗等行为。 | 复用动作注册；检查直接调用路径，操作收口覆盖实际调用链。 |
| `components/screenshot/ScreenshotRenderer.vue` | 共用布局 composable，复制行模板与气泡样式；按 message-slot 获取截图边界。 | 与聊天共用消息行；品牌、水印、截图分片及选区留在截图宿主。 |

### 2.1 本轮补充：请求快照已经提供 attempt 关联

`types/requestSnapshot.ts` 的 ChatRequestAttemptSnapshot 包含 requestId、attemptId、attemptIndex、assistantNodeIds、triggerNodeId、route、providerUsageStatus、providerUsage 与 estimatedUsage。

`useSingleNodeExecutor.ts` 将初始 assistant 节点 ID 作为 requestId；assistantNodeIds 收集该请求产生的 assistant 与 VCP 分段节点。`requestSnapshotRecorder.ts` 按实际 onRequest 创建 attempt，最终保存用量；仓库按 attemptId 替换记录。

这比单纯扫描相邻节点更接近请求事实，可用于去重、跨渠道明细与部分重试用量核对。也有明确限制：

- 采集依赖 snapshotSettings.enabled 和准备成功，旧会话可能没有记录。
- `requestSnapshotRepository.ts` 当前仅保留最近 10 个 attempt，并受 4 MiB 会话上限约束；更早记录会被裁剪。
- 独立文件通过异步 list 读取，当前接口未提供专门面向 UI 的响应式用量索引。
- 一个 request 可以产生多个分段；一个展示组也可能包含多个 request。requestId 与 groupId 分别建模。

因此，快照作为可选补充来源。连续紧凑布局应在快照关闭或已裁剪时照常工作；累计完整度随证据呈现。

## 3. 建议的分层

```text
ChatArea / 只读会话宿主                  ScreenshotRenderer
          │                                    │
          ├─ 当前显示路径、会话上下文            ├─ 已选消息、截图覆盖
          │                                    │
          └──────────────┬─────────────────────┘
                         ▼
           useMessagePresentation（轻量 UI 投影）
           ├─ group：成员、身份、活动状态、结果目标
           └─ row：源节点、组位置、装饰策略、高度上下文
                         │
             每个原节点保留一个 message-slot
                         ▼
                    MessageRow
           ├─ 身份头 / 外置头像（按布局呈现）
           ├─ ChatMessage / ToolCallMessage / CompressionMessage
           │    ├─ 原正文、附件、思考、编辑
           │    └─ 当前段落的错误、诊断、工具待处理信息
           ├─ MessageActionDock（共用操作定位规则）
           └─ MessageGroupFooter（仅组尾）
                 ├─ MessageStatsSummary → 按需打开明细
                 └─ 结果操作 → 明确的源节点目标
```

聊天宿主继续独占：阅读区、行测高、content-visibility、底部跟随、导航状态与会话写入口。展示投影另外输出用户提问导航点及源节点到导航点的映射，导航数量与测量行数量独立。

截图宿主继续独占：导出宽度、品牌、水印、折叠覆盖、导出元素开关、截图裁剪。

共用层负责：组划分、身份与装饰策略、消息种类分发、行外观和统计显示。正文组件保留自身业务状态，避免把 MessageRow 做成新的大组件。

## 4. 先明确四种身份

| 身份 | 用途 | 推荐来源 |
| --- | --- | --- |
| sourceNodeId | 编辑、删除、分支、定位与原消息回溯 | 原节点 ID |
| groupId | 连续共享身份区块 | 第一阶段用组首节点 ID；会话上下文另行隔离 |
| requestId / attemptId | 请求用量归属与重试去重 | VCP metadata / 现有请求快照等可靠来源 |
| actorKey | 判断是否仍由同一主体展示 | origin 主体与通道、agentId / userProfileId 及身份快照回退 |

组首未变时，追加内容保持 groupId。删除组首或切换分支后可以重新派生。若以后需要跨删除保存组展开状态，再引入独立组身份；首版无需持久化展示组。

模型和渠道属于执行信息。首版建议明确的模型 / 渠道变化切开共享头组，避免头栏错误代表后续消息。仅缺少这些字段的工具结果按执行归属跟随其所属组。后续若支持同一组内切换模型，需要提供段内标记及多模型明细。

### 4.1 角色组和执行回合分别建模

同一 agent 的连续 assistant 节点，也可能来自独立操作。它们可按布局规则共享身份，是否构成一次执行回合取决于可验证的执行关联。

首版 group 表达连续展示范围；尾栏称“本组用量 / 已知请求用量”。只有具备明确回合边界时才升级为回合操作与回合累计。停止、重新生成等行为继续使用已有节点语义。

### 4.2 分组规则的优先级

1. user、system、压缩节点、预设展示节点、问候及来源通道 / 主体 / 任务变化形成边界。
2. assistant 以 actorKey 与明确执行信息判断是否延续当前组。
3. tool 优先根据工具调用 requestId 与 assistant 的 toolCallsRequested 匹配，或使用同一上游 VCP requestId；同时遵守路径连续与身份边界。
4. 工具缺少显式关联时，只在父子链和紧邻的调用记录能佐证时跟随；无法确定的工具保持独立。
5. user → tool → assistant 中的知识引用工具保持独立，避免被后来的 assistant 追认成执行过程。
6. error / waiting / generating 本身影响组状态和装饰；同一来源的失败片段可留在原组，错误继续就地呈现。

分组只在当前显示路径上进行；分支切换后重新投影。已禁用 / 压缩状态差异建议先切组，以维持现有可读性与操作语义。

## 5. 最小投影契约

以下是建议的数据边界，字段名称在实施时按现有类型收敛。

```ts
type GroupPosition = 'single' | 'first' | 'middle' | 'last';

type RowDecorations = {
  identity: 'full' | 'none';
  statistics: 'message' | 'group' | 'none';
  actions: 'standard' | 'compact' | 'result' | 'none';
};

interface MessageRowPresentation {
  sourceNodeId: string;
  groupId: string;
  position: GroupPosition;
  decorations: RowDecorations;
  layoutKey: string; // 影响该行高度与估高分类的展示字段
}

interface MessageGroupPresentation {
  id: string;
  sourceNodeIds: readonly string[];
  headerNodeId: string;
  tailNodeId: string;
  activeNodeId?: string;
  resultNodeId?: string;
}
```

职责分配：

- 结构投影只读取 ID、角色、归属、分支与分组相关字段，避免依赖全文和流式 token。
- 活动状态从成员状态单独派生，优先露出待审批 / 需要处理的错误，其次是活动工具与生成状态。组首内容完成时，后续工具仍可运行。
- 组尾成员未必是最终回答。只有末段 assistant 已结束、有可复制正文且组内没有待执行 / 待审批过程时，才可提供结果目标；工具失败或执行中结尾时留空，避免将工具调用前的说明误标为最终答案。缺少明确结束依据时沿用“复制本段”的语义，只含思考的片段不充当最终答案。
- 统计是独立 selector，读取节点用量和可用的请求摘要。布局投影自身保持同步、无文件 I/O。
- 不把整个 group 对象放进每行的深度测高监听。行高度只依赖本行装饰，组摘要变动只使组尾失效。

初期允许路径结构改变后做一次线性归组。成员对象和源节点引用尽量复用，避免每个 token 都遍历全路径、复制正文或重新创建操作处理器。

## 6. 消息行与布局的收口

### 6.1 保留外层行壳，先统一内部入口

列表和截图继续各自渲染明确的直属 div.message-slot，保持 key=msg.id；内部统一使用 MessageRow。两个宿主保留少量行壳模板，避免通过组件指令透传或多根节点改变现有测高契约。

MessageRow 负责普通消息、工具、压缩节点分发。使用稳定的内部容器承载 ChatMessage，头部按装饰策略显示；同一组参数 / 事件只绑定一次。内置 / 外置头切换时，ChatMessage 所在父子路径保持稳定，仅调整头部显示和布局，保留局部编辑、翻译与正文流式状态。

外层 message-slot 管理测量和阅读定位，内部共用 message-row 管理对齐、宽度、头像列和装饰。组头和尾栏均处于对应成员行中；容器直属层继续一行对应一个节点。

第一阶段继续利用 ChatMessage 的 hideHeader。工具 header 保留工具名称、执行状态与展开入口，共享的 agent 身份头单独控制。两种 header 的语义需要区分。

### 6.2 样式归属

- MessageList：滚动容器、视口、直属行的渲染生命周期。
- MessageRow / 共用布局样式：角色对齐、头像列、消息宽度、首尾间距、紧凑连接、操作栏锚点。
- ChatMessage / 工具正文：自身表面、正文内部排版、折叠和编辑。
- MessageStatsSummary / ActionDock：自身的密度、焦点、弹层状态与布局。
- ScreenshotRenderer：纸面、品牌、水印与截图专属覆盖。

用 CSS 变量及明确的 class / data 属性跨边界传递外观，收缩指向 .header-left、.header-right、.message-meta 等内部细节的深层选择器。现有长消息分块背景方案先保留。

### 6.3 布局选项控制组合数量

卡片 / 气泡的表面布局和连续分组是两个内部维度。设置入口首版按“卡片、气泡、连续紧凑”三个预设呈现，避免暴露头像位置 × 头部位置 × 对齐 × 分组的全部组合。

持久化可添加独立的 messageFlow: separate / continuous，兼容现有 bubbleLayout。连续紧凑通过统一 resolver 产生有效布局：先采用稳定的左侧共享身份与连续正文规则，原气泡偏好保留。切回旧布局后恢复原偏好。

截图布局覆盖也通过该 resolver 处理，不回写系统设置；字段迁移和截图的 follow 语义一起更新。

## 7. 操作：节点动作与组尾结果动作

### 7.1 复用现有动作目录

继续使用 messageToolbarActions、partitionToolbarActions 和已保存的 pinnedActionIds。新增呈现策略只改变当前行的直接动作数量与分区，不覆盖用户自定义偏好。

- 中间段：复制本段 + 更多；宽度不足时仅更多，复制移入菜单。
- 组尾：复制最终正文 + 更多；有明确 resultNodeId 时提供针对该节点的现有常用动作。
- 生成中：停止及待审批入口保持可达；活动节点与尾栏目标分别确定。
- 只读与截图沿用各自的能力限制，不依赖 CSS 隐藏来阻断写操作。

“复制整组”如需要，应作为独立动作，并定义工具参数、结果及思考内容的包含范围。整组重试缺少稳定执行回合定义，首版继续使用节点重新生成。

### 7.2 收口动作执行上下文

建议提取 useMessageCommands，将列表现有事件处理器迁入，初期保留原事件名。命令上下文显式带 sessionId、sourceNodeId、readonly 与分支切换前的阅读位置捕获钩子。

同一个命令入口同时处理呈现可用性与执行时校验；确认框、模型重选等异步操作在开始时捕获作用域，等待后按原会话执行或校验目标仍有效。后续新动作复用这个入口。

MessageMenubar 内的 recalculateNodeTokens、数据编辑和导出弹窗等路径需逐项核对：当前父组件在只读时不挂载 menubar，列表代理只覆盖经过它转发的调用。重构后仍应保留这两层保护，并让新增动作获得一致上下文。

局部编辑开关、折叠、翻译预览状态先保留原组件。第一阶段沿用现有懒挂载弹窗；多行弹窗若确有成本，再考虑单一 ActionHost。

### 7.3 共用悬停定位规则

ActionDock 统一普通消息与工具消息的定位、悬停通道、focus-within、弹层打开态和窄宽度回退。键盘打开菜单后保持可见，关闭后焦点回到触发按钮。

中间动作使用零高度浮层，hover 只改变透明度 / 可交互状态；尾栏使用正常文档流。减少按钮密度时保留可点击区域，避免只缩小图标和命中区。菜单关闭不改变行高。

## 8. 统计：先拆显示，再定义累计

### 8.1 三种口径各自保留

1. **请求用量**：providerUsage / estimatedUsage / usage 及其来源和完整度。
2. **消息内容规模**：contentTokens；当前实现允许用它替换 completionTokens 显示，这种消息展示值应与请求计费用量区分。
3. **字数与性能**：正文 / 虚拟附件 / 已解析附件字数，以及每请求 TTFT、解码速度和耗时。

统计抽取先保持旧布局的公开行为，错误和 emptyResponseDiagnostic 留在正文附近。将 stats 移出 message-meta 的同时迁移截图 data-meta-type 和元素开关。

字数计算可抽到按源节点复用的 composable，但保留当前统计含附件文本的口径。组尾消费已完成结果；不为汇总再次调用 resolveAttachmentsBatch。统计隐藏时的延迟计算可独立优化，避免顺带改变附件解析与转写行为。

### 8.2 组累计的可用性

为累计提供三类状态：完整、已知部分、不可用；估算来源另外标记。只有能够证明成员请求覆盖完整、重试 / 分段去重正确时才显示完整累计。完整证明依赖请求范围及其已结束的执行生命周期；“当前读到的记录都有 usage”不足以证明期间没有遗漏请求，第一阶段通常应使用已知部分。

优先按 requestId / attemptId 合并已结算请求记录，同一 attempt 的补充记录替换旧值。VCP 同一上游请求的多段展示只计一次；同组多次本地工具循环请求分别计算。工具结果中的 usage 只有证明其独立来源时进入请求累计。

快照缺失、被裁剪、采集中断或原节点只有展示 usage 时，尾栏显示已知用量或单消息数据，明细说明来源。呈现层不补造回合边界，也不把缺失值当作零。

若后续希望常驻精确累计，可在现有请求完成链路发布轻量的用量摘要，复用快照已有身份。摘要的生命周期、持久化与跨窗口同步需作为独立任务定义，避免 UI 投影承担计量账本。

组耗时、请求耗时与解码速度分别标注；跨请求耗时避免直接相加造成并发重叠，速度避免对各段 t/s 求算术平均。首版可以只提供用量摘要，性能仍放逐请求明细。

## 9. 滚动、测高与渲染状态

1. 直属行及其 key 保持一一对应；组尾统计直接位于 tailNodeId 对应的行内。
2. SlotBinding 增加轻量 presentation 上下文；updated 比较该上下文，revision 与 typography cohort 同时覆盖实际头尾 / 密度差异。
3. 新增组成员时，使原尾行和新尾行的装饰高度失效；统计更新只更新实际展示摘要的尾行。
4. 展示配置切换进入已有 preserveReadingPosition 链路；避免重建整条富文本渲染树来获得新布局。
5. 切分支继续捕获源节点的视口偏移；流式尾部继续使用既有跟随意图，历史阅读交给现有锚定规则。
6. 首版沿用原有工具结果延迟渲染；共享身份头不会自动降低隐藏正文的解析成本。富文本与思考渲染专项继续按现有性能调查处理。

跨节点过程折叠会改变可见行到源节点的关系。引入这种能力时再升级为显式 presentationRowId → sourceNodeIds，并同步迁移导航 / 阅读区 / 测高；当前共享头布局保持轻量。

### 9.1 合并模式按用户提问点导航

2026-10-31 主人补充：导航可以随合并模式一起改，使用合并展示中的 user 消息点；参考图中的侧边短线与悬停提问摘要。

当前实现有两套粒度：ChatArea 把 finalMessages.length 和 currentVisibleIndex 传给 MessageNavigator；MessageList 的上一条 / 下一条却只扫描带 .chat-message 的行，工具行通常被跳过。合并模式直接新增明确的导航投影，逐步替换这种隐式 DOM 类型筛选。

导航范围示意：

```text
提问点 A → user A
             assistant 共享身份组 A1
               文本 → 工具 → 文本 → 工具 → 结果
             （若身份变化，可出现共享身份组 A2）
提问点 B → user B
             assistant 共享身份组 B1
```

一个用户提问导航范围可以包含多个 assistant 身份组。组间模型、身份或过程状态变化无需新增用户导航点；用量与操作依然按各自可靠来源处理。

建议契约：

```ts
interface MessageNavigationPoint {
  id: string;                 // 用户提问或已合并用户消息组的首节点 ID
  anchorNodeId: string;       // 点击时定位的可见用户消息
  labelNodeId: string;        // 悬停摘要的来源
  startNodeId: string;
  endNodeId: string;          // 下一用户提问之前的当前范围末节点
}
// 另外维护 sourceNodeId → navigationPointId，支持滚动高亮与精确跳转后的同步。
```

交互原则：

- 合并模式每个可见用户提问 / 用户消息组一个点。若连续用户消息被视觉合并，导航按同一分组生成一个点；独立显示的用户提问各有自己的点。
- 默认显示侧边短线 / 点，当前项突出；悬停或键盘聚焦显示提问摘要，点击定位到用户消息。保留可聚焦按钮、摘要的可访问名称与当前项标记，摘要层不遮挡点击。
- 阅读 AI 长答案、工具循环及组尾时，高亮保持在所属用户提问点，直到阅读参考线进入下一个用户范围。参考线与点击后的定位偏移统一，减少点位跳变。
- 上一问 / 下一问沿 navigationPoints 移动，计数按提问点显示。到顶 / 到底仍是列表整体操作。原布局可继续沿用原有导航呈现。
- 用户点只来自可见的真实用户提问，预设节点、压缩节点及 origin 标识的 agent / 后台注入内容不自动充当新提问。
- 开场仅有问候 / assistant 内容时可展示独立开场入口；存在用户点后的无用户主动输出跟随当前阅读范围，这种导航归属只用于定位，不用作执行或计量归属。
- 当前仅有一个用户点但回复很长时仍可保留导航与到底入口。显示条件依据可导航内容和溢出情况，移除现有 messageCount > 3 对合并模式的限制。
- 新内容提示独立于提问点数量；同一提问下追加 AI / 工具消息时照常保留提示。分支切换后重新投影点位及映射，避免按数量变化误判为新提问。

精确跳转继续保留 scrollToMessageId(sourceNodeId)：搜索、错误、分支、引用可以直达某段工具 / AI 消息；导航高亮随后映射到它所属的用户点。行测高和阅读锚点仍以源节点工作。

这允许先改导航体验，再根据跨节点过程折叠的实际需要决定是否重组物理行。行壳属于当前低风险实现选择，导航粒度允许独立变化。

## 10. 截图的独立边界

聊天与截图共用 MessageRow 和装饰 resolver，截图仍在自身消息选区上重新投影。

- 选区从组中间开始时，首个被选成员补充身份；工具成员缺少可用作者上下文时保留工具身份。
- 选区末尾呈现范围内的摘要，避免将未选消息内容或用量纳入导出。无法按选区拆分的请求可标记为整请求用量或省略累计。
- 每个源节点仍有 message-slot，现有切图边界与消息范围选择继续生效。
- showTokenCount、showPerformanceMetrics、showAvatar 等覆盖进入组件呈现策略；需要导出时即准备相应统计。
- 全部选区正文按截图折叠策略排版，聊天中的屏外跳过渲染状态不直接带入导出。

## 11. 建议实施顺序

| 阶段 | 聚焦改动 | 用户可见结果 |
| --- | --- | --- |
| A：统一入口 | 新增 MessageRow 与 useMessageCommands，合并列表两套 ChatMessage 绑定；截图复用行分发，保留原节点和行壳。 | 原卡片 / 气泡行为维持，后续布局只有一个消息行入口。 |
| B：拆装饰 | 普通统计与错误拆开；提取统计展示和共用 ActionDock；工具逐步接收外部 siblings / 呈现策略。 | 普通与工具消息的操作规则一致，统计可独立控制。 |
| C：连续紧凑 | 增加分组投影、用户提问点导航、三种布局预设、共享身份、组尾摘要与测高上下文。 | AI / 工具循环共享头栏，中间段操作和统计收紧；导航按用户提问定位。 |
| D：累计增强 | 接入可用 attempt 证据与完整度，按实际需要补轻量用量索引。 | 组尾用量有清晰来源，明细可回溯请求。 |
| 后续按需 | 跨节点过程折叠、显式展示行、共享操作弹窗宿主。 | 处理长过程内容和进一步的挂载成本。 |

建议新增文件控制在 `types/message-presentation.ts`、`composables/ui/useMessagePresentation.ts`、`composables/ui/useMessageCommands.ts`，以及 MessageRow / MessageActionDock / MessageStatsSummary / MessageGroupFooter。统计纯函数确有复用需求时再独立建文件。

先交付 A–C，D 根据当前来源覆盖率逐步接入。DSH 的尾栏和计量原则、OpenCode 的稳定行映射均可借鉴，完整事件框架留在各自项目。

### 11.1 聚焦验证

实施时验证公开行为：分组边界和工具归属、节点动作目标与只读会话、组尾迁移后的高度失效、用户提问点跳转与长回答内高亮、搜索到工具段后的导航映射、分支定位、截图局部选区。复用已有滚动和动作测试，只补覆盖新增契约的用例。

前端实现完成后按项目要求做类型检查、Vite 构建和真实聊天界面走查。首版已进行定向组件与投影测试、类型检查、Vite 构建及隔离 Tauri 窗口走查。

## 12. 方案取舍

| 方案 | 优点 | 主要成本 | 结论 |
| --- | --- | --- | --- |
| 继续在现有模板叠加条件和深层 CSS | 初始补丁小 | 事件、截图、测高与工具装饰持续多处分叉 | 仅适合临时原型。 |
| 轻量投影 + 共用行 + 独立装饰 | 直接覆盖当前需求，保留成熟的节点和滚动契约 | 需要一次有限的入口与统计整理 | 当前推荐。 |
| 整个回合变成一个大组件 / 一个测量行 | 组布局直观 | 破坏现有行索引，长过程退化成大测量单元，逐节点导航需重做 | 留待真正需要跨节点折叠时评估。 |
| 引入完整 turn / event 驱动会话模型 | 长期语义完整 | 涉及执行、存储、同步和旧数据迁移 | 超出本次 UI 优化边界。 |



## 13. 首版实施记录（2026-10-31）

- `utils/messagePresentation.ts`：源节点到展示组、行装饰与提问导航点的纯投影；工具按请求 ID / VCP 请求与父链归属加入。模型、角色身份、来源、预设、问候、压缩和 Knowledge 引用边界拆组。
- `composables/ui/useMessagePresentation.ts`：响应式投影、既有附件感知字数结果的上报与组尾测高上下文。展示类型与纯投影保持同文件，避免空转类型层。
- `MessageRow.vue`：普通 / 工具 / 压缩分发、内外身份头与组尾放在一个稳定宿主中；切换布局保留 ChatMessage 的位置与实例。`messageRowLayout.css` 统一聊天与截图的气泡几何和镜像样式。
- `MessageList.vue` 保留会话作用域和只读命令适配，再统一交给消息行。当前命令上下文只有这一个可写宿主，暂留局部函数；截图按只读方式复用消息行。
- `MessageStatistics.vue` 承载原有普通统计展示，错误和空响应诊断继续保留在源消息。`MessageGroupFooter.vue` 显示组内段数、已有字数汇总和可展开的逐段统计。字数来自原有附件处理结果；Token 与性能维持逐段明细口径，跨请求累计留在 D 阶段。
- 紧凑工具栏复用 MessageMenubar 的动作注册与更多菜单，常驻复制 / 编辑，分支和终止仍保留。紧凑呈现覆盖不回写固定操作偏好。
- 设置中的布局模式增加“连续紧凑”，对应 `bubbleLayout.mode = compact`。继续沿用现有设置持久化和临时截图覆盖机制，避免增加平行的布局配置源。
- 导航在紧凑模式下置于列表右侧；用户组对应一个短线点，悬停 / 聚焦显示摘要。导航计数、上下条共享 navigationPoints；精确源节点跳转继续保留。常规阅读按 120px 对齐线计算高亮；滚动到实际末尾时高亮最后提问，兼容末问距离底部不足一屏的情况。
- 每个源节点仍对应一个直接 message-slot。首尾变化、共享头活动状态、组尾显示统计参与实测缓存版本与字体采样分组；中间行不监听整组摘要。
- 截图重新投影选区，补充选区首个可显示身份，统计明细只涵盖选区。导出拼接读取预览实际行间距，组间留白纳入行内尺寸，保留选区截图的紧凑节奏。长过程整体折叠与完整请求账本继续按后续阶段处理。
