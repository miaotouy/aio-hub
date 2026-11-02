# 决策模型（System One）与 Decisions API 覆盖

> 状态：候选（按需触发，不着急接入）
> 记录日期：2026-09-30
> 范围：LLM 渠道/适配器/模型元数据；跨模块
> 前置：TypeSafe Jev 渠道已接入（commit `aa75f3300`）

## 1. 背景

2026-09 出现了「决策模型 / System One」这一非文本生成类别。仓库对该类别的**主体接入已完成**，不阻断任何发布；本文件只登记剩余的可选扩展项。

已完成部分：

- 渠道预设 `src/config/llm-presets/presets/typesafe.ts`（默认模型 `jev-latest`）
- 适配器 `src/llm-apis/system-one-core.ts`（`callTypeSafeSystemOneApi`）、端点 `/v1/systemone`、操作 `decision`
- 路由标识 `typesafe-system-one`（`src/config/llm-routing.ts`）
- 能力标签 `decision`（`src/config/model-capabilities.ts`，Choice / Score / Noul）
- 元数据规则 `provider-typesafe` / `model-prefix-jev`（`src/config/model-metadata-presets/providers.ts`）
- 开源复现系列元数据规则 `src/config/model-metadata-presets/models-decision.ts`（Kev / Laya / OpenJev / mini-jev / SemIf / Julia 1）

官方已核实（`https://docs.typesafe.ai/models`）：

- 当前型号 `jev-1.13.0`，别名 `jev-latest` / `jev-preview`，端点 `POST /v1/systemone`
- 文本输入；state 与全部问题合计 64k、单题 32k；$42/Btok ≈ $0.042/百万输入 token，输出免费

## 2. 待办（按需）

### TODO-1：OpenAI（AI Platform）Decisions API 渠道接入（可选）

- 现状：仓库尚无对应渠道预设或适配器；`models.dev` 与 OpenRouter 均无该条目，无法从现有数据源核实。
- 参考：`https://huggingface.co/blog/sora-2/what-is-openai-decisions-api-a-practical-guide`（记录时抓取返回 Transport error，未确认内容有效性）。
- 若确认接入，参照 `typesafe.ts` 增加：渠道类型 + `defaultBaseUrl` + 适配器 + 端点 + 路由标识 + 预设图标/能力声明，并在 `llm-routing.ts` 登记新适配器。
- 触发条件：主人明确要求，且能提供官方接口文档或可访问的模型列表。

### TODO-2：核实开源决策模型的真实模型 id

- `models-decision.ts` 中的 Kev / Laya / Julia 1 / OpenJev / SemIf 规则基于口头信息，模型 id 使用锚定正则，尚未在 `models.dev` / OpenRouter / HuggingFace 中核实。
- 触发条件：拿到真实 repo id（HuggingFace / Ollama / vLLM）后，收敛正则，避免误匹配。

### TODO-3：Bespoke Nimble

- `nimble` 过于泛化、易误匹配，暂未加规则。需要准确模型 id 后再决定是否登记。

## 3. 相关文件

- `src/config/model-metadata-presets/models-decision.ts`
- `src/config/model-metadata-presets/providers.ts`
- `src/config/llm-presets/presets/typesafe.ts`
- `src/llm-apis/system-one-core.ts`
- `src/config/__tests__/model-metadata.test.ts`（决策模型契约测试）
