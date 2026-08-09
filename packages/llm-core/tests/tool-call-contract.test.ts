import { describe, expect, it } from "vitest";
import {
  buildAnthropicMessagesRequest,
  buildCohereChatRequest,
  buildGoogleGenerateContentRequest,
  buildOpenAiCompatibleRequest,
  type LlmRequest,
  type ProviderProfile,
} from "../src";
import { TOOL_CALL_CONTRACT_FIXTURE } from "../src/testing/transport-contract";

const { definition, call, toolUse, toolResult } = TOOL_CALL_CONTRACT_FIXTURE;

const messages: LlmRequest["messages"] = [
  { role: "assistant", content: [toolUse] },
  { role: "tool", content: [toolResult] },
];

function buildRequest(model: string): LlmRequest {
  return { model, messages, tools: [definition] };
}

function jsonBody(request: ReturnType<typeof buildOpenAiCompatibleRequest>) {
  if (request.body?.kind !== "json") {
    throw new Error("Expected JSON wire body");
  }
  return request.body.value as Record<string, any>;
}

describe("cross-provider tool call contract fixture", () => {
  it("preserves the canonical declaration and replay identifiers across provider encoders", () => {
    const openAi = jsonBody(
      buildOpenAiCompatibleRequest(
        {
          provider: "openai-compatible",
          baseUrl: "https://api.example.com",
        },
        buildRequest("gpt-contract")
      )
    );
    expect(openAi.tools).toEqual([definition]);
    expect(openAi.messages).toEqual([
      {
        role: "assistant",
        content: [],
        tool_calls: [call],
      },
      {
        role: "tool",
        tool_call_id: toolResult.toolUseId,
        content: JSON.stringify(toolResult.content),
      },
    ]);

    const anthropic = jsonBody(
      buildAnthropicMessagesRequest(
        {
          provider: "claude",
          baseUrl: "https://api.anthropic.com",
        },
        buildRequest("claude-contract")
      )
    );
    expect(anthropic.tools).toEqual([
      {
        type: "custom",
        name: definition.function.name,
        description: definition.function.description,
        input_schema: definition.function.parameters,
      },
    ]);
    expect(anthropic.messages).toEqual([
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: call.id,
            name: call.function.name,
            input: { query: "aio" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolResult.toolUseId,
            content: toolResult.content,
          },
        ],
      },
    ]);

    const gemini = jsonBody(
      buildGoogleGenerateContentRequest(
        {
          provider: "gemini",
          baseUrl: "https://generativelanguage.googleapis.com",
        },
        buildRequest("gemini-contract")
      )
    );
    expect(gemini.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: definition.function.name,
            description: definition.function.description,
            parameters: definition.function.parameters,
          },
        ],
      },
    ]);
    expect(gemini.contents).toEqual([
      {
        role: "model",
        parts: [
          {
            functionCall: {
              id: call.id,
              name: call.function.name,
              args: { query: "aio" },
            },
          },
        ],
      },
      {
        role: "user",
        parts: [
          {
            functionResponse: {
              id: toolResult.toolUseId,
              name: toolResult.name,
              response: { result: JSON.stringify(toolResult.content) },
            },
          },
        ],
      },
    ]);

    const cohere = jsonBody(
      buildCohereChatRequest(
        {
          provider: "cohere",
          baseUrl: "https://api.cohere.com",
        } satisfies ProviderProfile,
        buildRequest("command-contract")
      ) as ReturnType<typeof buildOpenAiCompatibleRequest>
    );
    expect(cohere.tools).toEqual([
      {
        type: "function",
        function: definition.function,
      },
    ]);
    expect(cohere.messages).toEqual([
      {
        role: "assistant",
        tool_calls: [call],
      },
      {
        role: "tool",
        tool_call_id: toolResult.toolUseId,
        content: [
          {
            type: "document",
            document: { data: toolResult.content },
          },
        ],
      },
    ]);
  });
});
