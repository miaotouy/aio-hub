/**
 * Server-Sent Events (SSE) compatibility facade.
 * Framing lives in the platform-neutral shared LLM core.
 */

export {
  extractReasoningFromSSE,
  extractTextFromSSE,
  parseSSEStream,
} from "@aiohub/llm-core";
