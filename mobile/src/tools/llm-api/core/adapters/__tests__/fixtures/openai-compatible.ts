export const OPENAI_COMPATIBLE_STREAM_FIXTURE = [
  'data: {"choices":[{"delta":{"reasoning_content":"先分析"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":"结果"}}]}\n\n',
  'data: {"choices":[],"usage":{"prompt_tokens":11,"completion_tokens":7,"total_tokens":18,"prompt_tokens_details":{"cached_tokens":3},"completion_tokens_details":{"reasoning_tokens":4}}}\n\n',
  "data: [DONE]\n\n",
] as const;
