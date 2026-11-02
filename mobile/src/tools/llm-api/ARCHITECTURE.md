# 移动端 LLM 请求参数

移动端渠道编排在选定物理目标后调用 `sendPhysicalRequest`；`@aiohub/llm-core` 负责协议构建与执行。

## 输出预算

- 新建智能体使用共享的通用预算 `DEFAULT_MAX_OUTPUT_TOKENS`（65,536）。
- 发送前根据物理模型的 `tokenLimits.output` 裁剪 `maxTokens` 与 `maxCompletionTokens`，保留已有的小预算和未知模型的显式预算。
- Anthropic 的必填输出预算在模型感知层补齐后再裁剪；Gemini 的可选预算保持省略语义。
- 虚拟渠道逐个成员应用相同约束。

## 采样参数

- 新建通用智能体默认省略温度；模型未限制的显式采样参数继续透传。
- 请求入口使用模型的 `supportedFeatures.parameters` 与共享模式兼容规则过滤采样字段。
- 共享协议层处理已知推理模型的冲突参数，覆盖 OpenAI Chat Completions、Responses 以及 Anthropic 原生请求。

桌面与共享核心的完整说明见 [LLM API 架构](../../../../docs/architecture/llm-apis-architecture.md)。
