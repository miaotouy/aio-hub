# Chat 上下文变化诊断与缓存用量分析方案

> 日期：2026-10-29
> 状态：待实施，已完成既有样例及动态锚点落地后的离线验证并据此修订采集、比较与存储契约。
> 范围：桌面端 `llm-chat` 上下文分析器、实发请求快照、`@aiohub/llm-core` 缓存用量归一化。

## 1. 目标与观察口径

[`ContextAnalyzerDialog.vue`](../../components/context-analyzer/ContextAnalyzerDialog.vue) 当前按最新配置重跑预览，适合查看组装结果。新增“变化与缓存”页签，用实发快照回答相邻请求的内容从哪里开始变化、变化由哪个处理阶段产生，以及上游报告了多少缓存读取与写入量。

分别记录三类信息：

1. **输入结构与变化**：适配后的工具定义、顶层指令、有序消息及内容块，定位首个变化消息和消息内部差异。
2. **来源与转换**：预设、宏、Recall、世界书、历史节点及后处理的贡献关系，解释拼接、合并、移动和裁剪。
3. **服务端 Usage**：保留上游上报值，补齐 Anthropic 缓存写入与总输入口径，本地分词结果单独标记。

本地公共前缀描述输入相似程度。服务端缓存命中还受渠道能力、缓存配置与有效期影响，界面分别呈现结构变化和实际读写量。自动优化安排在 [动静分离方案](./context-cache-auto-optimization-investigation.md) 中。

## 2. 现有代码与采集边界

| 入口 | 当前行为 / 缺口 | 接入动作 |
| --- | --- | --- |
| [`anthropic-messages.ts`](../../../../../packages/llm-core/src/providers/anthropic-messages.ts) | 非流式 `parseAnthropicUsage()` 与流式 `mergeUsage()` 只用 `input_tokens` 计算总输入，遗漏缓存写入 | 两条路径统一缓存读写及总输入口径，保留字段是否上报的事实 |
| [`useChatResponseHandler.ts`](../../composables/chat/useChatResponseHandler.ts) | `validateAndFixUsage()` 在 Usage 缺失或全零且有输出时用本地结果覆盖 | 覆写前保存上游 Usage，估算结果独立存储 |
| [`useSingleNodeExecutor.ts`](../../composables/chat/useSingleNodeExecutor.ts) | 掌握管道来源和助手节点，外层重试沿用节点 `requestId`；此时消息尚未完成 Provider 转换 | 提供来源账本及业务关联，每次发送尝试独立标识 |
| [`useLlmRequest.ts`](../../../../composables/useLlmRequest.ts) | 解析实际执行路由、能力过滤并分发适配器 | 传递实际路由和采集观察者，组合已有观察者回调 |
| [`TransportObserver`](../../../../../packages/llm-core/src/types/transport.ts) 与 [`executor.ts`](../../../../../packages/llm-core/src/executor.ts) | 已有 `onRequest`、响应、流块与错误观察接口；Provider 构造 `WireRequest` 后发送 | 复用 `transportObserver` 采集最终请求体投影，将其与本次尝试、解码后的 Usage 关联 |
| [`MacroProcessor.ts`](../../macro-engine/MacroProcessor.ts) | 宏执行摘要仅输出到 debug 日志 | 增加可选收集回调，按来源与宏出现次序记录摘要 |
| [`ContextAnalyzerDialog.vue`](../../components/context-analyzer/ContextAnalyzerDialog.vue) | 当前页签基于预览管道 | 新页签优先读取实发记录，缺少快照时提示可开启记录 |

### 2.1. 一次发送对应一条尝试

- 业务层保留节点 `requestId`；每次发送另生成唯一 `attemptId`，并在该 `requestId` 内按实际发送顺序递增 `attemptIndex`。外层重试、下层再次发送均对应各自的尝试，避免覆盖前一次记录。
- 管道完成后先冻结来源账本；在适配完成、传输发送前冻结请求投影，结束时补充成功、失败、取消状态及 Usage，异步写盘。构建阶段失败可沿用现有错误日志，实发列表只收录进入传输发送边界的尝试；进入该边界也可能遇到网络失败。
- VCP 将一次客户端请求切成多个显示节点时，共享一个 `attemptId` 并关联节点列表。服务端内部续轮保持“服务端处理范围”说明；服务端的分段用量只有可明确归属时才参与统计，避免重复累加。
- 复用现有传输观察接口，记录开关由本功能独立控制。LLM Inspector 的全局捕获状态保持独立，防止快照采集意外启用原始请求广播。

### 2.2. 来源映射随转换传递

用 `sourceKey` 标识一次具体贡献，保留原有 `sourceType`、`sourceId` 和出现次序。沿用 `_mergedSources` 的递归关系，并给 Recall 拼接片段补充来源。适配器抽取 System、展开多模态块或拆分消息时，将来源引用传递到最终投影位置。跨请求按来源类型、原始 ID 与出现次序对齐贡献，`sourceKey` 用于当前快照内的准确引用。

最终请求的来源通过 `sourceKeys` 反查账本。适配前数组索引仅供管道内部定位；消息数、角色与位置在转换后均可能变化。无法建立准确映射的片段标记为来源未知，分析器保留这一状态。

## 3. 数据契约

### 3.1. Usage 归一化

在 [`TokenUsage`](../../../../../packages/llm-core/src/types/response.ts) 现有字段上扩展，保留音频和输出推理等详情：

```typescript
export interface PromptTokensDetails {
  cachedTokens?: number;
  cacheWriteTokens?: number;
  cacheWrite5mTokens?: number;
  cacheWrite1hTokens?: number;
  audioTokens?: number;
}

// TokenUsage 的增量字段；其余现有字段保持原样。
export interface TokenUsageExtensions {
  promptTokensDetails?: PromptTokensDetails;
  isLocalEstimated?: boolean;
}
```

归一化规则：

- Anthropic 总输入为 `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`，缺失项在求和时按零处理；5m / 1h 创建量属于创建总量的细分，避免再次加总。
- 其他协议保留已覆盖缓存量的总输入字段，按现有适配器提取缓存详情。总量统一为归一化输入与输出之和。
- 流式保留已经上报的读写值，后续只有输出计数的事件继续更新输出；按协议的累计 / 增量语义合并。
- 在解析器填零前，记录支持字段的实际上报状态。`providerUsageStatus` 区分缺失、部分上报与已上报；完整程度按该协议的输入与输出主计数判断，缓存详情另行保留未知状态；稀疏数值字段保留显式 `0`。未知缓存量显示“未上报”，分母为零或缺失时读取占比显示“—”。
- `providerUsage` 是经过统一口径转换的上游用量，`estimatedUsage` 是本地补算值。补算保留现有业务展示逻辑，分析页只用前者计算服务端缓存读取占比。

### 3.2. 请求投影与来源

以下为首期实现契约，放在 `src/tools/llm-chat/types/requestSnapshot.ts`。摘要默认记录，文本预览按 §5 选择开启。

```typescript
export interface ExecutedMacroSummary {
  name: string;
  occurrence: number;
  argsHash?: string;
  outputLength: number;
  outputHash: string;
  preview?: string;
}

export interface SnapshotSource {
  sourceKey: string;
  occurrence: number;
  sourceType?: string;
  sourceId?: string | number;
  sourceName?: string;
  parentSourceKeys?: string[];
  contentHash: string;
  charLength: number;
  executedMacros?: ExecutedMacroSummary[];
}

export interface SnapshotContentPart {
  // text / image / tool_use / tool_result / reasoning 等协议块。
  kind: string;
  contentHash: string;
  charLength?: number;
  textPreview?: string;
  textState?: "omitted" | "full" | "truncated" | "redacted";
  sourceKeys: string[];
}

export interface SnapshotMessageItem {
  role: string;
  // 整条适配后消息的规范化摘要，覆盖正文及协议字段。
  wireHash: string;
  parts: SnapshotContentPart[];
  sourceKeys: string[];
}

export interface ChatRequestAttemptSnapshot {
  attemptId: string;
  requestId: string;
  attemptIndex: number;
  sessionId: string;
  assistantNodeIds: string[];
  triggerNodeId?: string;
  startedAt: number;
  endedAt?: number;
  status: "completed" | "error" | "aborted";
  route: {
    logicalProfileId: string;
    logicalModelId: string;
    actualProfileId: string;
    actualModelId: string;
    providerType: string;
    adapterId?: string;
    // 仅使用安全的配置身份；可缺失，保留未知状态。
    cacheScopeFingerprint?: string;
  };
  captureQuality: "complete" | "partial" | "summaryOnly";
  // 完整输入投影摘要，精简明细后仍可判断整体是否变化。
  inputHash: string;
  promptOptionsHash?: string;
  topLevelSystem?: {
    wireHash: string;
    parts: SnapshotContentPart[];
    sourceKeys: string[];
  };
  messages: SnapshotMessageItem[];
  nativeToolsDigest?: { count: number; schemaHash: string };
  sources: SnapshotSource[];
  providerUsageStatus: "missing" | "partial" | "reported";
  // 仅保存已识别的 Usage 数值路径，保留缺失与显式 0。
  reportedUsageFields?: Record<string, number>;
  providerUsage?: TokenUsage;
  estimatedUsage?: TokenUsage;
}

export interface SessionRequestSnapshotFile {
  schemaVersion: 1;
  sessionId: string;
  updatedAt: number;
  attempts: ChatRequestAttemptSnapshot[];
}
```

摘要在发送边界根据完整内容计算，再生成去敏预览。使用稳定的 SHA-256 等摘要算法；规范化对象键，保留数组及内容块顺序。摘要覆盖范围：

- 消息角色、文本、多模态源标识与参数、工具名称 / 参数 / 调用 ID / 结果关联、推理内容与有效回放产物、续写标记，以及块级 `cache_control`。
- 工具定义整体与顺序、顶层指令，以及适配器识别的输入相关配置，例如工具选择、结构化输出和缓存引用。`promptOptionsHash` 的字段清单由各适配器维护。
- 传输认证头、URL 鉴权参数和追踪 ID 与输入投影分开处理。未知扩展字段可能影响输入时标为 `partial`，分析器说明比较覆盖范围。

同一附件的业务 `assetId` 只用于来源关联；请求中的资源引用或内容变化应反映在摘要中。完整摘要相同可判断所覆盖字段一致；存在摘要差异时，具体文本位置还取决于预览留存范围。

## 4. 比较与归因

### 4.1. 选择比较对象

选中消息若关联多个尝试，默认显示最近一次已完成尝试；全部失败或取消时显示最近一次。默认对照为同分支祖先链中最近的已记录请求。重试可切换到同一逻辑调用的前一次尝试；VCP 的同次分段折叠为一个请求。其他分支允许手动比较，并显示跨分支状态。

### 4.2. 比较最终输入

1. **路由与配置**：比较实际模型、适配器、安全缓存范围标识，以及原生工具和输入配置摘要。配置变化先说明变化内容；Profile ID 的相同或不同都只作为配置身份线索。供应商缓存范围与共享能力需要协议依据，未知时保留未知状态。
2. **工具与顶层指令**：比较其摘要及有序子块，找出变化来源。顶层指令有差异时继续分析其内部相同部分。
3. **消息边界**：从头比较 `role`、`wireHash` 和有序内容块，记录 `firstDiffIndex`。它表示首个变化消息。若任一数组提前结束，分别识别相同、尾部追加与尾部缩短；所有前置输入摘要也一致时，才能将整次投影归类为纯尾部追加。
4. **消息内部**：先定位首个变化块；两侧都有完整、可比较的文本时计算字符级公共前缀。只有截断或去敏预览时，显示已确认范围及其限制。Token 前缀另需对应模型分词与协议格式，本地字符数和消息数分别展示。
5. **覆盖质量**：`partial`、`summaryOnly` 或缺少预览时保留能够确认的摘要变化，其余位置显示“详细内容未记录”。

### 4.3. 来源解释

通过最终位置的 `sourceKeys` 反查递归来源及转换记录：

- **动态宏**：按来源与宏出现次序比较输出摘要，同名宏的多次调用分别处理。
- **Recall / 世界书**：比较注入片段与召回集合，定位拼入已有消息的内容。
- **同角色合并**：子来源保持相同且有新来源追加时，说明“消息合并扩展了末条内容”。
- **位置漂移**：相同来源正文稳定但位置变化时，说明移动边界与注入策略。
- **历史裁剪 / 压缩 / 转写**：旧节点消失或内容变化时，结合管道中实际处理记录归因。来源不足时展示候选原因，保留待确认状态。

界面默认展示缓存读写量、首个变化位置、来源解释和可展开的预览差异。哈希、来源内部 ID、适配器标识和采集覆盖详情放入调试明细。服务端读取占比仅在输入与读取计数可用时计算，缓存写入量单列。

## 5. 存储、隐私与生命周期

### 5.1. 开关与留存

- “记录请求摘要”默认开启，保存结构、来源标识、完整摘要和 Usage。“保存去敏文本预览”单独选择，默认关闭；后续开启从新请求生效。
- 预览覆盖用户正文、推理、工具结果和宏输出前统一去敏，处理凭据、联系方式、本机路径、URL 鉴权参数等已识别模式。宏参数默认只保留摘要；媒体二进制、认证头、Cookie 和原始鉴权 URL 留在传输流程。
- 去敏只能覆盖已知模式，可读预览仍可能包含私人语境。配置入口说明保存范围和本机留存位置，并提供清空当前会话记录的操作。
- 来源名等展示字段同样受去敏和长度限制。预览被隐藏或脱敏后仍以完整内容摘要判断是否变化，具体正文显示受留存策略限制。

### 5.2. 总量预算

通过 [`getAppConfigDir()`](../../../../utils/appPath.ts) 解析 `{appConfigDir}/llm-chat/request-snapshots/{sessionId}.json`，首期使用以下默认上限：

| 维度 | 上限 / 处理 |
| --- | --- |
| 单会话条数 | 最近 10 次实际发送尝试 |
| 单文本块预览 | 完整文本超过 64 KiB 时，最多留前 16 KiB 去敏预览；摘要始终基于完整输入 |
| 单次快照 | 1 MiB |
| 单会话文件 | 4 MiB |

预算按最终序列化 JSON 的 UTF-8 字节计量，覆盖顶层指令、正文、宏预览、工具与来源元数据。达到上限时先缩减预览，再精简来源明细并标注覆盖质量；单条仍超限时仅保存固定大小的整体摘要与业务标识，使用 `summaryOnly`。会话总量超限从最旧记录淘汰。

关闭文本预览时保持摘要记录；超出上限仍可提示内容已变化。摘要计算与去敏开销在请求路径中需控制，写盘放在收尾阶段异步完成，实际耗时通过实现后的样例测量确认。

### 5.3. 并发与删除

同会话串行更新并原子替换文件，避免并发完成的请求覆盖彼此。清空记录或删除会话时使旧写入失效，防止迟到的收尾任务恢复已删除记录。清理失败使用现有日志与可行动提示处理。

VCP 渠道界面说明：“此处记录 AIO Hub 发往 VCP 服务端的内容；服务端插件改写与内部续轮请结合服务端日志查看。”

## 6. 既有样例验证（2026-10-29）

使用本机已处理的 8 组样例，共 361 个消息树节点；通过现有会话加载器、Recall、消息合并与 Provider 构造函数做离线回放，尾部注入和存储规则由临时探针模拟。5 个测试文件、39 项检查通过，其中现有测试 26 项、临时诊断 13 项。

| 观察项 | 结果 | 设计调整 |
| --- | --- | --- |
| 121 对相邻用户轮次 | 受控头部召回变化均落在首条 System；模拟尾部注入后完整消息级追加为 0 对 | 保留消息与消息内部两层比较，收益按实际前缀位置描述 |
| 关闭动态注入的对照 | 5 对发生旧历史节点移除；另有 6 对只追加历史却因同角色合并扩展旧消息 | 增加历史移除与边界合并归因 |
| 工具结果候选边界 | 长会话 11 个、工具会话 7 个，均按现有默认规则转为 User | 来源保留原始节点身份；候选边界数量与实发次数分别记录 |
| 长回答尾部时间变化 | 首个变化消息索引为 0，消息内部仍有 316,775 个公共前缀字符 | 消息级索引只用于定位；内部字符前缀另算 |
| 受控推理与工具参数变化 | 正文比较相同，实际请求体不同 | 摘要覆盖协议块及消息附加字段 |
| 顶层指令抽取 | 14 条适配前消息在 Anthropic / Gemini 内容数组中变为 12 条 | 来源引用随协议投影转换；Gemini 字段为 `systemInstruction` |
| 受控 Anthropic Usage | 输入 100、读取 900、创建 200、输出 20；流式与非流式当前均给出输入 100、总量 120，创建量遗漏 | 按目标口径归一化为输入 1200、总量 1220，避免得出 900% 读取占比 |

存储实验按原方案的单消息 64 KiB / 16 KiB 规则计算，仅包含消息投影和基础标识：

| 样例 | 活动分支窗口 | 受控重复最近请求 10 次 |
| --- | ---: | ---: |
| 多分支 | 约 694 KiB | 约 1.27 MiB |
| 媒体 | 约 584 KiB | 约 1.07 MiB |

重复请求是容量实验；来源、路由和工具定义尚未计入，所以体积属于下界。这些结果促成本方案新增会话总字节预算。

样例已移除原始请求参数、预设与服务端 Usage。回放保留压缩过滤，关闭 HTML 转写和资源解析；验证结果用于确认结构与实现缺口。服务端缓存门槛、有效期、显式缓存配置与渠道共享范围，在实施对应协议时结合官方说明及真实请求记录核对。临时脚本、结构化结果与日志留在本机忽略目录 `.tmp/context-cache-review/`。

## 7. 实施顺序

1. **Usage 与上报状态**：统一 Anthropic 流式 / 非流式口径，在解析器填零和本地补算前保留上报事实。相关单测保护部分上报、显式零和流式后续事件合并。
2. **发送边界与来源**：组合已有 `transportObserver`，建立独立尝试标识与实际路由；将宏摘要、Recall 片段和递归来源关联到最终请求投影。
3. **有界存储**：实现会话串行写入、条数与字节淘汰、清空和删除后的迟到写入处理；用既有长会话与分支样例验证总量边界。
4. **分析页签**：接入记录选择、结构变化、内部前缀和服务端读写量；预览按留存范围展开，调试信息按需显示。前端实现按项目要求完成类型检查、Vite 构建与真实窗口走查。

回归用例优先保护实发尝试关联、协议字段变化、来源映射和有界写入等公开行为；样例用于规模与复杂结构回放。具体自动优化按关联方案后续实施。

## 8. 动态锚点结构复测（2026-10-29）

动态消息注入已由桌面与移动共用的预设核心落地。基于同一批 8 组、361 个节点重新执行 5 个文件的 39 项检查，尾部探针改为调用真实桌面组装器；Recall 输出、User 环境块载体和快照存储仍为受控实验。结果写入 `.tmp/context-cache-review/anchor-report.json`，旧报告保留供比较。

| 观察项 | 新结构结果与实施约束 |
| --- | --- |
| 用户轮次前缀 | 121 对，头部变化 121 / 121；动态锚点后完整消息级追加 0 / 121。继续同时比较消息边界和消息内部前缀 |
| 历史归因 | 5 对旧节点移除、6 对同角色边界扩展，和旧回放一致 |
| 工具候选边界 | 18 个；`_historyRole` 保留 Tool 身份，工具轮次采用 `last_message / after`。其中 17 个落在完整结果之后，1 个因并行结果缺失跳过注入并记录原因。候选次数继续与实发尝试数分开 |
| 来源记录 | 动态预设保留 `sourceType: anchor_injection`、`sourceId`、`sourceIndex`；组装诊断额外给出缺失/区段调整原因。分析器需在角色合并与协议投影后维护这些关联 |
| 协议与用量 | 14 条适配前消息在 Anthropic/Gemini 内容数组中仍为 12 条；受控 Anthropic 输入总量仍被解析为 100、总量 120，预期 1200 / 1220 的修复继续排首位 |
| 容量下界 | 多分支窗口 710,998 字节、媒体窗口 597,812 字节；重复最近请求 10 次分别 1,329,860 和 1,119,660 字节。统计排除新增 `_historyRole` 等来源明细，保持与旧报告可比，继续采用总字节预算 |

因此实施顺序保持 Usage → 实发尝试与来源 → 有界存储 → 分析界面。动态锚点提供可复用的定位基础；变化分析、自动缓存优化与服务端 Usage 观测仍按各自方案实施。
