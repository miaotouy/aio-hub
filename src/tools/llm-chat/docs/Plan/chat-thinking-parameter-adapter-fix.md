# Chat 思考参数与 Gemini 摘要适配修复计划

## 背景

Chat 将模型思考能力抽象为四个参数：

- `thinkingEnabled`：启用或关闭思考；
- `thinkingBudget`：Gemini 2.5、Claude 等预算型模型的思考 Token 预算；
- `reasoningEffort`：Gemini 3、OpenAI 推理模型等等级型模型的思考等级；
- `includeThoughts`：请求返回 Gemini 思考摘要。

调查发现，原生 Gemini Provider 的请求构建和响应解析基本完整，但 Gemini 模型经 OpenAI / OpenAI-Compatible 渠道（典型场景为本地 NewAPI 转发到 Gemini 官方 Key）访问时，UI、参数过滤和 Adapter 的能力判断不一致。用户可以在 Chat 中设置思考等级，但最终请求可能静默丢失该参数；思考摘要开关也没有转换为 Google / NewAPI 所需的请求结构。

## 当前链路

```text
ModelParametersEditor
  -> Agent LlmParameters / enabledParameters
  -> buildEffectiveParameters
  -> useSingleNodeExecutor.sendRequest
  -> useLlmRequest.filterParametersByCapabilities
  -> OpenAI 或 Gemini Adapter
  -> @aiohub/llm-core wire builder
  -> Provider / NewAPI
  -> reasoning delta / reasoningContent
  -> useChatResponseHandler
```

## 已确认问题

### 1. UI 显示与发送过滤不一致

思考控件按模型 `capabilities.thinkingConfigType` 显示，并绕过 Provider 支持检查；发送阶段则再次依赖 Provider `supportedParameters`。

- `openai-compatible` 没有声明 `thinking` 和 `reasoningEffort`；
- `openai` 的 `reasoningEffort` 过滤只允许 OpenAI、Doubao、Seed、GLM、DeepSeek 等模型家族；
- Gemini 模型即使显示 `high` 等级，最终也可能没有 `reasoning_effort` 或 Gemini `thinking_config`。

这会形成“配置已保存，但 wire payload 未生效”的假成功状态。

### 2. OpenAI/NewAPI 路径没有生成 Gemini thinking_config

Google OpenAI-Compatible API 与当前 NewAPI 均支持以下结构：

```json
{
  "extra_body": {
    "google": {
      "thinking_config": {
        "thinking_level": "high",
        "include_thoughts": true
      }
    }
  }
}
```

Gemini 2.5 预算型模型使用 `thinking_budget` 替代 `thinking_level`。

当前 OpenAI Adapter 会清理 `includeThoughts`、`thinkingBudget` 等内部字段，但不会把它们转换为上述 `extra_body.google.thinking_config`。通用 `thinking: { type, budget_tokens }` 也不是 NewAPI Gemini 转换器所使用的 Google 扩展结构。

### 3. 返回解析不是主要断点

当前 NewAPI 会把 Gemini `part.thought === true` 转为 OpenAI Chat Completions 的 `reasoning_content`。AIO 的共享 OpenAI-Compatible parser 已支持非流式 `message.reasoning_content` 和流式 `delta.reasoning_content`，Chat 也会把它写入节点 `metadata.reasoningContent`。

因此“完全没有摘要”的首要原因是请求没有启用 `include_thoughts`，不是 Chat 最终展示层丢失了已返回的标准 `reasoning_content`。

### 4. Agent 自定义参数无法可靠兜底

`LlmParameters.custom` 的当前结构是 `{ enabled, params }`，但 `buildEffectiveParameters` 仍按旧版扁平对象合并。结果是 UI 中配置的 `extra_body` 不能被正确解包并发送，现有测试也仍使用旧结构，未覆盖真实 UI 数据形状。

## 修复方案

### 参数能力与过滤

1. OpenAI-Compatible Provider 声明通用 `thinking` 和 `reasoningEffort` 能力。
2. 发送过滤按“Provider Adapter 能力 + 模型家族”处理 Gemini，不再把 Gemini 从 OpenAI 兼容推理参数链路中静默排除。
3. `includeThoughts` 对 Gemini 模型可见并保留；其他模型不生成 Google 扩展字段。

### OpenAI/NewAPI Gemini 请求映射

在桌面 OpenAI Chat Adapter 中识别 Gemini 模型家族并生成：

- Gemini 3.x：`extra_body.google.thinking_config.thinking_level`；
- Gemini 2.5：`extra_body.google.thinking_config.thinking_budget`；
- 摘要：`extra_body.google.thinking_config.include_thoughts`。

生成 Google 扩展后，不再同时发送冲突的顶层 `reasoning_effort` 或通用 `thinking` 对象。用户显式提供的 `extra_body` 与标准参数合并，显式自定义值优先。

原生 Gemini Adapter 继续使用 `generationConfig.thinkingConfig`，不改为 OpenAI wire 格式。

### 自定义参数

修复 `{ enabled, params }` 解包，并保留对旧版扁平 `custom` 数据的兼容。更新测试，确保 Agent 自定义参数可以作为 Provider 特殊字段的显式覆盖入口。

## 测试矩阵

| Profile             | 模型                | 预期请求                                            | 预期响应                              |
| ------------------- | ------------------- | --------------------------------------------------- | ------------------------------------- |
| `gemini`            | Gemini 3.x          | `generationConfig.thinkingConfig.thinkingLevel`     | `thought: true` -> `reasoningContent` |
| `gemini`            | Gemini 2.5          | `generationConfig.thinkingConfig.thinkingBudget`    | 同上                                  |
| `openai`            | Gemini 3.x / NewAPI | `extra_body.google.thinking_config.thinking_level`  | `reasoning_content`                   |
| `openai-compatible` | Gemini 2.5 / NewAPI | `extra_body.google.thinking_config.thinking_budget` | `reasoning_content`                   |
| `openai`            | GPT 推理模型        | 顶层 `reasoning_effort`                             | 现有行为不回归                        |
| `openai-compatible` | DeepSeek 等         | 现有 `thinking` / `reasoning_content` 行为          | 现有行为不回归                        |

同时覆盖：

- `includeThoughts` 开关；
- 流式和非流式 reasoning；
- 标准参数与显式 `extra_body` 合并优先级；
- 新旧两种 Agent `custom` 数据形状；
- Provider / Model 组合过滤。

## 验收标准

- LLM Inspector 中能看到与模型代际匹配的实际 thinking payload；
- Chat 设置的等级或预算不再在 `useLlmRequest` 过滤阶段静默消失；
- NewAPI + Gemini 官方 Key 能返回并展示思考摘要；
- 原生 Gemini、OpenAI 推理模型、DeepSeek 等既有路径无回归；
- 目标单测、前端类型检查和桌面 Vite 构建通过。

## 实施记录

已于 2026-07-16 完成施工。

### 实际改动

- `openai-compatible` Provider 已声明 `thinking` 与 `reasoningEffort`；发送过滤会结合 Profile Adapter、模型元数据家族及模型能力保留 Gemini 等级、预算和摘要参数。
- 参数编辑器与模型切换过滤均使用 Gemini 模型家族判断 `includeThoughts`，避免把 Gemini 摘要参数带给其他思考模型。
- 桌面 OpenAI Chat Adapter 会为 Gemini 3.x 生成 `thinking_level`，为 Gemini 2.5 生成 `thinking_budget`，并按需生成 `include_thoughts`；Gemini 路径不会再并发发送顶层 `reasoning_effort` 或通用 `thinking`。
- 自动生成的 Google 配置会与显式 `extra_body` 深度合并，显式 `google.thinking_config` 值优先，同时保留其他 Google 和 Provider 扩展字段。
- `buildEffectiveParameters` 已支持真实的 `{ enabled, params }` 自定义参数容器、禁用状态及旧版扁平数据。

### 测试与验证

- 目标 Vitest：3 个测试文件、36 个测试全部通过，覆盖 Provider/模型组合过滤、Gemini 3.x、Gemini 2.5、显式覆盖、非流式与流式 reasoning、GPT 推理参数及旧版 DeepSeek 行为。
- 回归 Vitest：桌面原生 Gemini Adapter 7 个测试、`llm-core` Google/OpenAI-Compatible 10 个测试全部通过。
- 相关文件 Oxlint 通过。
- `bun run check:frontend` 通过。
- `bun run build:vite` 通过；仅有仓库既有的 Node 模块浏览器外置、chunk 体积、动态导入和第三方 `eval` 告警。

### 与计划的偏差

无功能性偏差。为确保 Chat 在临时切换、重试、续写和重新解析模型时也能准确判断 Gemini，额外为 `filterParametersForModel` 补充了可选的模型 ID 与 Provider 上下文。
