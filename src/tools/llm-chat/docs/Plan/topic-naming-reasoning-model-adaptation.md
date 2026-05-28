# LLM Chat 话题命名适配思考模型方案

> 状态: Draft
>
> 调查日期: 2026-05-28
>
> 范围: `src/tools/llm-chat/composables/chat/useTopicNamer.ts` 及其设置、LLM 请求参数、响应解析链路。

## 背景

当前话题命名会把最近几条会话消息拼成一个单次 Prompt，然后调用配置模型生成会话标题。现有实现里，命名请求固定传入:

- `stream: false`
- `thinkingEnabled: false`
- `maxTokens: namingConfig.maxTokens`

默认 `maxTokens` 是 30。这个策略对普通短文本模型比较省，但对思考模型不稳:

1. 有些模型即使关闭思考，也会把思考过程混在 `content` 正文里输出。
2. 有些模型会把前几十个 token 都消耗在思考或复述任务上，导致真正标题没有出来。
3. 当前清洗只处理首尾引号、末尾标点和长度截断；如果模型返回 Prompt 复述、`<think>...</think>`、JSON、`标题：xxx` 或多行内容，可能会把脏内容直接保存成会话名。
4. 上下文构建直接使用 `node.content`，如果历史助手消息本身包含内联 `<think>`，命名 Prompt 会被思考块干扰。

## 现状调查

核心文件:

- `src/tools/llm-chat/composables/chat/useTopicNamer.ts`
  - 负责选择命名模型、拼接上下文、调用 `useLlmRequest().sendRequest()`、清洗标题、更新会话。
  - 当前在请求中硬编码 `thinkingEnabled: false`。
- `src/tools/llm-chat/types/settings.ts`
  - `topicNaming.maxTokens` 默认 30，设置结构没有思考模型适配项。
- `src/tools/llm-chat/components/settings/settingsConfig.ts`
  - UI 明确提示“不建议使用推理/思考模型”，但没有主动适配能力。
- `src/composables/useLlmRequest.ts`
  - 会按 Profile/Model 能力调用 `filterParametersByCapabilities()`，支持 `responseFormat`、`thinkingEnabled`、`thinkingBudget`、`reasoningEffort` 等统一字段。
- `src/llm-apis/request-builder.ts`
  - 会根据 provider 和 model capabilities 过滤思考参数。
  - `maxTokens` 会按模型输出上限裁剪。
- `src/llm-apis/adapters/openai/chat.ts`
  - 支持 `response_format`、`reasoning_effort`，并把 `reasoning_content` / `reasoning` / `thinking` 等字段映射到 `response.reasoningContent`。
  - DeepSeek 模型会在 `thinkingEnabled` 存在时注入 `extra_body.thinking.type`。
- `src/llm-apis/adapters/gemini/utils.ts`
  - 支持 `responseFormat` 转成 Gemini 的 `responseMimeType` / `responseSchema`。
  - 支持 `thinkingLevel` / `reasoningEffort` / `thinkingBudget` / `includeThoughts` 转成 `thinkingConfig`。
- `src/tools/llm-chat/components/conversation-tree-graph/flow/composables/graphContentUtils.ts`
  - 已有 `stripThinkingBlocks()`，但只在关系图展示链路使用，且标签列表固定为 `think/guguthink/thinking`。

## 判断

单纯“把 maxTokens 拉大”能减少空正文，但不能保证标题干净。单纯“允许 low 思考”对能正确分离 `reasoningContent` 的模型有帮助，但对会把思考泄漏到 `content` 的模型仍然会污染标题。

更稳的策略应该是分层:

1. 请求层尽量让模型输出结构化字段。
2. 参数层给思考模型足够的隐藏推理空间。
3. 解析层只从允许的字段或格式中提取标题。
4. 兜底层宁可不改名，也不要保存 Prompt 复述或思考文本。

## 推荐设计

### 1. 输出格式优先改为结构化

新增内部固定 schema，不一定暴露给用户:

```ts
const TOPIC_TITLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: {
      type: "string",
      description: "简短会话标题，不含标点，建议 4 到 18 个中文字符",
    },
  },
  required: ["title"],
};
```

命名请求优先传:

```ts
responseFormat: {
  type: "json_schema",
  json_schema: {
    name: "topic_title",
    strict: true,
    schema: TOPIC_TITLE_SCHEMA,
  },
}
```

适用范围:

- OpenAI / OpenAI Responses / Gemini / VertexAI 等已有 `responseFormat` 支持的渠道优先使用。
- 对不可靠的 OpenAI-Compatible 中转，不把失败视为功能失败；捕获“response_format 不支持”类错误后自动降级为文本模式重试。

Prompt 同时强化为:

```text
你正在为聊天会话生成侧边栏标题。
只输出 JSON 对象: {"title":"..."}
title 必须是最终标题，不要包含思考、解释、引号外文本、标点符号或换行。
```

保留用户自定义 Prompt，但在请求前追加一段不可关闭的“输出协议”更稳。否则用户的旧 Prompt 很容易和结构化输出冲突。

### 2. 增加思考模型自适应策略

新增内部策略函数 `buildTopicNamingRequestOptions()`，基于模型能力决定参数。

建议默认策略:

| 模型能力                       | 首次请求                                          | 失败或脏输出后的重试                                               |
| ------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------ |
| 非思考模型                     | `maxTokens = titleOutputTokens`                   | 降级文本解析                                                       |
| `thinkingConfigType: "effort"` | `reasoningEffort: "low"`，`maxTokens >= 256`      | `maxTokens >= 512`                                                 |
| `thinkingConfigType: "budget"` | 优先 `thinkingEnabled: false`，`maxTokens >= 128` | `thinkingEnabled: true`，`thinkingBudget: 256`，`maxTokens >= 384` |
| `thinkingConfigType: "switch"` | 优先 `thinkingEnabled: false`，`maxTokens >= 128` | `thinkingEnabled: true`，`maxTokens >= 512`                        |

说明:

- `effort` 型模型通常没有真正的“关闭思考”，用 `low` 比硬关更符合这类 API 的语义。
- `budget` 型模型要保证 `maxTokens > thinkingBudget`，否则会出现只有思考、没有正文。
- 不建议默认把所有命名请求都拉到很大；只对模型能力显示为 thinking 的场景提高预算。
- 如果模型返回了独立 `response.reasoningContent` 且 `response.content` 为空，可以直接进入重试，不保存标题。

### 3. 响应解析改成白名单提取

新增纯函数，例如:

```ts
extractTopicTitle(response: LlmResponse, options: {
  maxTitleLength: number;
  allowJson: boolean;
  thinkTagNames: string[];
}): string | null
```

解析顺序:

1. 优先解析 JSON 对象里的 `title`。
2. 支持从 fenced code block 中提取 JSON。
3. 移除已知思考块:
   - `<think>...</think>`
   - `<thinking>...</thinking>`
   - `<guguthink>...</guguthink>`
   - 全局 `llmThinkRules` 里的标签名
4. 处理常见标题前缀:
   - `标题:`
   - `title:`
   - `会话标题:`
5. 多行文本取最后一个“看起来像标题”的非空行，而不是第一行。
6. 执行标题归一化:
   - 去首尾引号
   - 去首尾标点
   - 折叠空白
   - 限长
7. 执行拒绝规则:
   - 为空
   - 包含 `<think` / `</think>` / JSON 残片
   - 包含明显 Prompt 复述，如 `以下对话`、`直接输出`、`不可使用任何标点`
   - 超过硬上限且无法合理截断
   - 多句解释文本

关键取舍: 自动命名是低价值但高可见的功能，误改名比不改名更烦。因此解析不确定时返回 `null`。

### 4. 上下文输入先清洗再发送

构建 `contextText` 时，不直接使用 `node.content`，而是做轻量清洗:

- 剥离内联思考块。
- 不拼入 `metadata.reasoningContent`。
- 单条消息设置最大字符数，例如 1200 字符，避免大段代码或长回答挤占命名任务。
- 角色标签保留为 `用户:` / `助手:`，但去掉空消息。

这样能减少历史消息中的思考块诱导命名模型继续思考。

### 5. 设置项建议

第一版不建议增加太多 UI 开关。可以只调整默认值和文案:

- `topicNaming.maxTokens` 默认从 30 提到 128 或 256。
- UI 输出上限 slider 从 `10-200` 改为 `16-1024`。
- 命名模型提示从“不建议使用思考模型”改为“普通模型更快；思考模型会自动使用低预算/结构化输出兜底”。

如需暴露高级项，建议只加一个:

```ts
thinkingStrategy: "auto" | "off" | "low";
```

默认 `auto`。不要暴露过多 provider 细节给普通用户。

## 实施步骤

1. 新增 `src/tools/llm-chat/utils/topicNamingUtils.ts`
   - `stripConfiguredThinkingBlocks()`
   - `extractJsonObjectCandidate()`
   - `normalizeTopicTitle()`
   - `extractTopicTitle()`
   - 单元测试覆盖脏输出场景。
2. 修改 `useTopicNamer.ts`
   - 清洗上下文。
   - 构造结构化输出请求。
   - 对思考模型使用自适应 token/effort/budget。
   - 失败或脏输出时最多重试一次。
   - 解析失败不更新会话名。
3. 修改设置默认值和 UI 文案。
4. 添加测试:
   - JSON schema 输出。
   - fenced JSON 输出。
   - `<think>...</think>\n标题`。
   - 关闭思考仍泄漏的长正文。
   - Prompt 复述拒绝。
   - 空 content + reasoningContent 触发重试。
5. 可选: 在日志里记录 `finishReason`、`hasReasoningContent`、`contentLength`、`parseMode`，但不要记录完整上下文。

## 风险与边界

- 某些 OpenAI-Compatible 服务声称兼容 `response_format`，实际会 400；必须有文本模式降级。
- Stop sequence 可能截断 JSON，不建议与 JSON schema 同时启用。
- 对 Claude/Gemini 等预算型思考模型，`maxTokens` 和 `thinkingBudget` 的关系要保守处理。
- 标题清洗不能太激进，避免把英文技术标题、版本号、路径名误删。末尾标点清理可以保留 `+`, `#`, `/`, `-` 等技术字符。
- 用户自定义 Prompt 可能要求非 JSON 输出；结构化输出协议需要作为系统级约束追加，并允许设置降级。

## 推荐结论

不要在“拉大 maxTokens”和“限定输出格式”之间二选一。推荐默认走:

1. 结构化 JSON schema 输出。
2. 思考模型自动给 low effort 或小预算重试。
3. 对正文里的思考块和 Prompt 复述做白名单解析。
4. 无法确认是标题时不更新。

这样能让支持结构化输出的模型直接干净返回 `{ title }`，也能让没练好的思考模型有足够 token 走完内部过程，同时避免把思考文本、任务复述或整段解释保存进会话标题。
