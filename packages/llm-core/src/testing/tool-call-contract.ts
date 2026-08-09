import type { JsonValue } from "../types/json";
import type { LlmMessageContent, LlmToolDefinition } from "../types/request";
import type { LlmToolCall } from "../types/response";

/**
 * Canonical Tool IR fixture shared by provider contract tests.
 *
 * The fixture intentionally carries an explicit call ID, function name, JSON
 * arguments, and a matching named result: these are the values that must
 * survive every protocol's declaration, call, and result-replay encoding.
 */
export const TOOL_CALL_CONTRACT_FIXTURE: {
  definition: LlmToolDefinition;
  call: LlmToolCall;
  toolUse: Extract<LlmMessageContent, { type: "tool_use" }>;
  toolResult: Extract<LlmMessageContent, { type: "tool_result" }>;
} = {
  definition: {
    type: "function",
    function: {
      name: "lookup",
      description: "Look up a value",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      } satisfies JsonValue,
    },
  },
  call: {
    id: "call_lookup_1",
    type: "function",
    function: { name: "lookup", arguments: '{"query":"aio"}' },
  },
  toolUse: {
    type: "tool_use",
    id: "call_lookup_1",
    name: "lookup",
    input: { query: "aio" },
  },
  toolResult: {
    type: "tool_result",
    toolUseId: "call_lookup_1",
    name: "lookup",
    content: { answer: "AIO Hub" },
  },
};
