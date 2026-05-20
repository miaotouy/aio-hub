# 统一联网搜索（Grounding）实施计划

**状态**: Implementing  
**创建时间**: 2025-05-20  
**涉及范围**: 全局基础设施 + LLM Chat 工具

## 背景

用户反馈 AIO 不支持 Grounding（联网搜索），特别是 Gemini 的 Google Search Grounding。
经调查，OpenAI 的 `webSearchOptions` 已有部分支持（透传），但 Gemini 和 Claude 完全缺失。

## 设计方案

添加统一的 `webSearchEnabled: boolean` 开关，在参数面板中以 Switch 形式展示。
各适配器根据 provider 类型转换为对应的 API 格式：

| Provider                   | API 格式                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------- |
| OpenAI / OpenAI-Compatible | `body.web_search_options = { search_context_size: "medium" }`                       |
| Gemini / VertexAI          | `body.tools.push({ googleSearch: {} })`                                             |
| Claude                     | `body.tools.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 })` |

高级用户仍可通过 `webSearchOptions`（OpenAI）或自定义参数精细控制搜索行为。

## 修改清单

### Phase 1: 类型与配置层

1. `src/tools/llm-chat/types/llm.ts` — `LlmParameters` 添加 `webSearchEnabled?: boolean`
2. `src/llm-apis/common.ts` — `LlmRequestOptions` 添加 `webSearchEnabled?: boolean`
3. `src/tools/llm-chat/config/parameter-config.ts` — 添加参数配置项 + 白名单
4. `src/config/llm-providers.ts` — Gemini/VertexAI/Claude 添加 `webSearch: true`

### Phase 2: 参数过滤层

5. `src/llm-apis/request-builder.ts` — `KNOWN_NON_MODEL_OPTIONS_KEYS` + `filterParametersByCapabilities`

### Phase 3: 适配器层

6. `src/llm-apis/adapters/gemini/utils.ts` — `GeminiTool` 接口 + `buildGeminiTools()`
7. `src/llm-apis/adapters/gemini/chat.ts` — `parseGeminiResponse()` 解析 `groundingMetadata`
8. `src/llm-apis/adapters/openai/chat.ts` — `webSearchEnabled` 自动注入默认 `web_search_options`
9. `src/llm-apis/adapters/anthropic/chat.ts` — 注入 `web_search_20250305` tool

### Phase 4: UI 文案

10. `src/tools/llm-chat/components/agent/parameters/ModelParametersEditor.vue` — 更新提示文字

### Phase 5: 响应展示

11. 确认 annotations 渲染组件可复用（Gemini groundingMetadata → annotations 格式）

## 技术细节

### Gemini Grounding 响应格式

```json
{
  "candidates": [
    {
      "content": { "parts": [{ "text": "..." }] },
      "groundingMetadata": {
        "webSearchQueries": ["query1", "query2"],
        "groundingChunks": [{ "web": { "uri": "https://...", "title": "..." } }],
        "groundingSupports": [
          {
            "segment": { "startIndex": 0, "endIndex": 50, "text": "..." },
            "groundingChunkIndices": [0],
            "confidenceScores": [0.95]
          }
        ]
      }
    }
  ]
}
```

### Claude Web Search 响应格式

Claude 会返回 `web_search_tool_result` content block，包含 citations。
解析为统一的 `annotations` (UrlCitation) 格式。

## 注意事项

- **费用**: Gemini Grounding ~$35/1000次，OpenAI web search 也有额外费用
- **免费 Key**: 可能不支持 grounding，错误提示中应引导用户
- **向后兼容**: `webSearchEnabled` 默认 undefined/false，不影响现有行为
- **版本**: Claude 使用 `web_search_20250305`（稳定版本，兼容性好）
