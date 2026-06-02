/**
 * LLM Inspector — SSE 流式响应合并器
 *
 * 把流式 SSE 文本合并为「等价于非流式响应」的完整 JSON，便于用户像查看普通响应一样
 * 审视模型输出的整体结构（content / tool_calls / usage / finish_reason 等）。
 *
 * 核心原则：
 * - 输出与厂商原生非流式响应**结构兼容**，方便复制到 Playground 或其他工具直接使用。
 * - 解析失败不抛错，统一返回 `{ merged: null, warnings, raw }` 让 UI 决定如何提示。
 * - 不做内容修改 / 截断，所有原始字段都尽量保留。
 */

import { createModuleLogger } from "@utils/logger";
import type { ApiFormat } from "./apiFormat";

const logger = createModuleLogger("LlmInspector/StreamMerger");

// ===================================================================
// 类型
// ===================================================================

export interface StreamMergeResult {
  /** 合并后的标准化 JSON 对象（合并失败时为 null） */
  merged: unknown | null;
  /** 合并过程中收集到的警告信息 */
  warnings: string[];
  /** 解析到的 SSE 事件数（用于调试 / UI 展示） */
  eventCount: number;
}

interface SSEEvent {
  /** event: 字段（一般是 Anthropic 用的） */
  event?: string;
  /** data: 字段解析后的 JSON */
  data: any;
  /** 原始 data 字符串（用于解析失败时回退） */
  raw: string;
}

// ===================================================================
// 入口
// ===================================================================

export function mergeStreamToFinalJson(
  body: string,
  format: ApiFormat
): StreamMergeResult {
  const warnings: string[] = [];

  if (!body || !body.trim()) {
    return { merged: null, warnings: ["SSE 响应体为空"], eventCount: 0 };
  }

  const events = parseSSEEvents(body);
  if (!events.length) {
    return {
      merged: null,
      warnings: ["未解析到任何 SSE 事件"],
      eventCount: 0,
    };
  }

  try {
    let merged: unknown;
    switch (format) {
      case "openai-chat":
      case "openai-completions":
        merged = mergeOpenAIChat(events, warnings);
        break;
      case "openai-responses":
        merged = mergeOpenAIResponses(events, warnings);
        break;
      case "anthropic":
        merged = mergeAnthropic(events, warnings);
        break;
      case "gemini":
        merged = mergeGemini(events, warnings);
        break;
      case "cohere":
        merged = mergeCohere(events, warnings);
        break;
      case "ollama":
        merged = mergeOllama(events, warnings);
        break;
      default:
        warnings.push(`未识别的 API 格式：${format}，已返回 chunk 数组`);
        merged = events.map((e) => e.data);
        break;
    }
    return { merged, warnings, eventCount: events.length };
  } catch (error) {
    logger.warn("流式合并异常", { error: String(error), format });
    warnings.push(`合并异常：${(error as Error).message ?? String(error)}`);
    return {
      merged: events.map((e) => e.data),
      warnings,
      eventCount: events.length,
    };
  }
}

// ===================================================================
// SSE 解析
// ===================================================================

function parseSSEEvents(body: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  // 按空行分组（SSE 协议事件分隔符）
  const blocks = body.split(/\n\n+/);

  for (const block of blocks) {
    const lines = block.split("\n");
    let eventType: string | undefined;
    let dataLines: string[] = [];

    for (const line of lines) {
      if (!line) continue;
      if (line.startsWith("event:")) {
        eventType = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
      // 忽略 id: / retry: / 注释行
    }

    if (!dataLines.length) continue;
    const raw = dataLines.join("\n");
    if (raw === "[DONE]") continue;

    try {
      const data = JSON.parse(raw);
      events.push({ event: eventType, data, raw });
    } catch {
      // 非 JSON 的 SSE data 直接忽略
    }
  }

  return events;
}

// ===================================================================
// OpenAI Chat / Completions 合并
// ===================================================================

function mergeOpenAIChat(events: SSEEvent[], warnings: string[]): any {
  if (!events.length) return null;

  // 取第一个事件作为元数据基底
  const first = events[0].data ?? {};
  const last = events[events.length - 1].data ?? {};

  // 累积各 choice 的字段
  const choicesMap = new Map<
    number,
    {
      index: number;
      message: {
        role?: string;
        content: string;
        reasoning_content?: string;
        refusal?: string;
        tool_calls?: any[];
        function_call?: { name?: string; arguments: string };
      };
      finish_reason?: string;
      logprobs?: any;
    }
  >();

  for (const ev of events) {
    const choices = ev.data?.choices;
    if (!Array.isArray(choices)) continue;

    for (const choice of choices) {
      const idx = typeof choice?.index === "number" ? choice.index : 0;
      let bucket = choicesMap.get(idx);
      if (!bucket) {
        bucket = {
          index: idx,
          message: { role: "assistant", content: "" },
        };
        choicesMap.set(idx, bucket);
      }

      const delta = choice?.delta ?? {};

      if (typeof delta.role === "string") {
        bucket.message.role = delta.role;
      }
      if (typeof delta.content === "string") {
        bucket.message.content += delta.content;
      }
      if (typeof delta.reasoning_content === "string") {
        bucket.message.reasoning_content =
          (bucket.message.reasoning_content ?? "") + delta.reasoning_content;
      } else if (typeof delta.reasoning === "string") {
        // 某些非 DeepSeek 兼容实现
        bucket.message.reasoning_content =
          (bucket.message.reasoning_content ?? "") + delta.reasoning;
      } else if (typeof delta.thinking === "string") {
        bucket.message.reasoning_content =
          (bucket.message.reasoning_content ?? "") + delta.thinking;
      }
      if (typeof delta.refusal === "string") {
        bucket.message.refusal = (bucket.message.refusal ?? "") + delta.refusal;
      }

      // tool_calls 增量
      if (Array.isArray(delta.tool_calls)) {
        if (!bucket.message.tool_calls) bucket.message.tool_calls = [];
        for (const tcDelta of delta.tool_calls) {
          const tcIdx =
            typeof tcDelta?.index === "number"
              ? tcDelta.index
              : bucket.message.tool_calls.length;
          let tc = bucket.message.tool_calls[tcIdx];
          if (!tc) {
            tc = {
              index: tcIdx,
              type: "function",
              function: { arguments: "" },
            };
            bucket.message.tool_calls[tcIdx] = tc;
          }
          if (tcDelta.id) tc.id = tcDelta.id;
          if (tcDelta.type) tc.type = tcDelta.type;
          if (tcDelta.function?.name) tc.function.name = tcDelta.function.name;
          if (typeof tcDelta.function?.arguments === "string") {
            tc.function.arguments =
              (tc.function.arguments ?? "") + tcDelta.function.arguments;
          }
        }
      }

      // legacy function_call 增量
      if (delta.function_call) {
        if (!bucket.message.function_call) {
          bucket.message.function_call = { arguments: "" };
        }
        if (delta.function_call.name) {
          bucket.message.function_call.name = delta.function_call.name;
        }
        if (typeof delta.function_call.arguments === "string") {
          bucket.message.function_call.arguments +=
            delta.function_call.arguments;
        }
      }

      if (typeof choice?.finish_reason === "string") {
        bucket.finish_reason = choice.finish_reason;
      }
      if (choice?.logprobs !== undefined) {
        bucket.logprobs = choice.logprobs;
      }
    }
  }

  if (!choicesMap.size) {
    warnings.push("未在 SSE 中发现任何 choices 字段，无法合并");
    return null;
  }

  // 按 index 排序
  const choices = Array.from(choicesMap.values()).sort(
    (a, b) => a.index - b.index
  );

  // 清理空字段
  for (const c of choices) {
    if (!c.message.reasoning_content) delete c.message.reasoning_content;
    if (!c.message.refusal) delete c.message.refusal;
    if (!c.message.tool_calls?.length) delete c.message.tool_calls;
    if (!c.message.function_call?.name && !c.message.function_call?.arguments) {
      delete c.message.function_call;
    }
  }

  // 元数据：优先用最后一个事件的（usage 通常在最后），其余字段从首个事件来
  const merged: any = {
    id: first.id ?? last.id,
    object: first.object ?? "chat.completion",
    created: first.created ?? last.created,
    model: first.model ?? last.model,
    choices,
  };

  // 系统指纹
  if (first.system_fingerprint ?? last.system_fingerprint) {
    merged.system_fingerprint =
      last.system_fingerprint ?? first.system_fingerprint;
  }
  // usage
  if (last.usage) {
    merged.usage = last.usage;
  } else if (first.usage) {
    merged.usage = first.usage;
  } else {
    warnings.push("SSE 中未发现 usage 字段");
  }

  return merged;
}

// ===================================================================
// OpenAI Responses API 合并
// ===================================================================

function mergeOpenAIResponses(events: SSEEvent[], warnings: string[]): any {
  // 优先寻找 response.completed / response.created 事件中的完整 response 对象
  let finalResponse: any = null;
  let initialResponse: any = null;
  const outputTextDeltas = new Map<string, string>(); // item_id -> 累积文本
  const reasoningDeltas = new Map<string, string>(); // item_id -> 累积思维链
  const functionCallArgs = new Map<string, string>(); // item_id -> 累积参数

  for (const ev of events) {
    const data = ev.data ?? {};
    const type = data.type;

    if (type === "response.created" && data.response) {
      initialResponse = data.response;
    } else if (type === "response.completed" && data.response) {
      finalResponse = data.response;
    } else if (type === "response.output_text.delta") {
      const id = data.item_id ?? "default";
      outputTextDeltas.set(
        id,
        (outputTextDeltas.get(id) ?? "") + (data.delta ?? "")
      );
    } else if (type === "response.reasoning_summary_text.delta") {
      const id = data.item_id ?? "default";
      reasoningDeltas.set(
        id,
        (reasoningDeltas.get(id) ?? "") + (data.delta ?? "")
      );
    } else if (type === "response.function_call_arguments.delta") {
      const id = data.item_id ?? "default";
      functionCallArgs.set(
        id,
        (functionCallArgs.get(id) ?? "") + (data.delta ?? "")
      );
    }
  }

  // 1. 如果有 response.completed，直接使用其内置 response 对象（最权威）
  if (finalResponse) {
    return finalResponse;
  }

  // 2. 否则用 initialResponse 作为基底，加上增量累积
  if (initialResponse) {
    const merged = { ...initialResponse };
    // 累积 output_text 到 output 数组中的对应 message
    if (Array.isArray(merged.output)) {
      merged.output = merged.output.map((item: any) => {
        if (item?.type === "message" && Array.isArray(item.content)) {
          item.content = item.content.map((c: any) => {
            if (c?.type === "output_text" && outputTextDeltas.has(item.id)) {
              return {
                ...c,
                text: (c.text ?? "") + outputTextDeltas.get(item.id),
              };
            }
            return c;
          });
        } else if (
          item?.type === "function_call" &&
          functionCallArgs.has(item.id)
        ) {
          return {
            ...item,
            arguments: (item.arguments ?? "") + functionCallArgs.get(item.id),
          };
        } else if (item?.type === "reasoning" && reasoningDeltas.has(item.id)) {
          const summaryText = reasoningDeltas.get(item.id) ?? "";
          return {
            ...item,
            summary: [
              ...(item.summary ?? []),
              { type: "summary_text", text: summaryText },
            ],
          };
        }
        return item;
      });
    }
    return merged;
  }

  // 3. 都没有：从 deltas 自建一个简化对象
  warnings.push(
    "未发现 response.created/completed 事件，已根据 delta 重建简化结构"
  );

  const output: any[] = [];

  for (const [id, text] of reasoningDeltas.entries()) {
    output.push({
      type: "reasoning",
      id,
      summary: [{ type: "summary_text", text }],
    });
  }
  for (const [id, text] of outputTextDeltas.entries()) {
    output.push({
      type: "message",
      id,
      role: "assistant",
      content: [{ type: "output_text", text }],
    });
  }
  for (const [id, args] of functionCallArgs.entries()) {
    output.push({
      type: "function_call",
      id,
      arguments: args,
    });
  }

  if (!output.length) {
    warnings.push("Responses API 流式未识别任何有效内容");
    return null;
  }

  return { object: "response", output };
}

// ===================================================================
// Anthropic 合并
// ===================================================================

function mergeAnthropic(events: SSEEvent[], warnings: string[]): any {
  let message: any = null;
  const blocksByIndex = new Map<
    number,
    {
      type: string;
      text?: string;
      thinking?: string;
      signature?: string;
      name?: string;
      input?: any;
      input_json_str?: string;
      id?: string;
    }
  >();
  let stopReason: string | undefined;
  let stopSequence: string | null | undefined;
  let usage: any;

  for (const ev of events) {
    const data = ev.data ?? {};
    const type = data.type ?? ev.event;

    if (type === "message_start" && data.message) {
      message = { ...data.message };
    } else if (type === "content_block_start") {
      const idx = data.index ?? 0;
      const block = data.content_block ?? {};
      const entry: any = { type: block.type };
      if (block.type === "text") entry.text = block.text ?? "";
      if (block.type === "thinking") entry.thinking = block.thinking ?? "";
      if (block.type === "tool_use") {
        entry.id = block.id;
        entry.name = block.name;
        entry.input = block.input ?? {};
        entry.input_json_str = "";
      }
      blocksByIndex.set(idx, entry);
    } else if (type === "content_block_delta") {
      const idx = data.index ?? 0;
      const delta = data.delta ?? {};
      const block = blocksByIndex.get(idx);
      if (!block) continue;

      if (delta.type === "text_delta") {
        block.text = (block.text ?? "") + (delta.text ?? "");
      } else if (delta.type === "thinking_delta") {
        block.thinking = (block.thinking ?? "") + (delta.thinking ?? "");
      } else if (delta.type === "signature_delta") {
        block.signature = (block.signature ?? "") + (delta.signature ?? "");
      } else if (delta.type === "input_json_delta") {
        block.input_json_str =
          (block.input_json_str ?? "") + (delta.partial_json ?? "");
      }
    } else if (type === "content_block_stop") {
      const idx = data.index ?? 0;
      const block = blocksByIndex.get(idx);
      if (block && block.type === "tool_use" && block.input_json_str) {
        try {
          block.input = JSON.parse(block.input_json_str);
        } catch {
          // 保留原始字符串，让用户能看到不完整的 JSON
        }
      }
    } else if (type === "message_delta") {
      const delta = data.delta ?? {};
      if (typeof delta.stop_reason === "string") stopReason = delta.stop_reason;
      if (delta.stop_sequence !== undefined) stopSequence = delta.stop_sequence;
      if (data.usage) {
        usage = { ...usage, ...data.usage };
      }
    } else if (type === "message_stop") {
      // 仅用作终止标志
    }
  }

  if (!message) {
    warnings.push("未发现 message_start 事件，无法重建完整 Anthropic 响应");
    return null;
  }

  // 按 index 排序
  const content = Array.from(blocksByIndex.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, block]) => {
      // 清理临时字段
      const clean: any = { type: block.type };
      if (block.type === "text") clean.text = block.text ?? "";
      if (block.type === "thinking") {
        clean.thinking = block.thinking ?? "";
        if (block.signature) clean.signature = block.signature;
      }
      if (block.type === "tool_use") {
        clean.id = block.id;
        clean.name = block.name;
        clean.input = block.input ?? {};
      }
      return clean;
    });

  const merged: any = { ...message, content };
  if (stopReason !== undefined) merged.stop_reason = stopReason;
  if (stopSequence !== undefined) merged.stop_sequence = stopSequence;
  if (usage) merged.usage = { ...(merged.usage ?? {}), ...usage };

  return merged;
}

// ===================================================================
// Gemini 合并
// ===================================================================

function mergeGemini(events: SSEEvent[], warnings: string[]): any {
  if (!events.length) return null;

  const last = events[events.length - 1].data ?? {};

  // 累积所有 candidates 的 parts
  // Gemini 流式每个 chunk 都是完整结构，但 parts 是增量
  const candidatesMap = new Map<
    number,
    {
      index: number;
      content: {
        role?: string;
        parts: any[]; // 合并后的 parts
      };
      finishReason?: string;
      safetyRatings?: any[];
      citationMetadata?: any;
    }
  >();

  for (const ev of events) {
    const candidates = ev.data?.candidates;
    if (!Array.isArray(candidates)) continue;

    for (const candidate of candidates) {
      const idx = typeof candidate?.index === "number" ? candidate.index : 0;
      let bucket = candidatesMap.get(idx);
      if (!bucket) {
        bucket = {
          index: idx,
          content: {
            role: candidate?.content?.role,
            parts: [],
          },
        };
        candidatesMap.set(idx, bucket);
      }

      const parts = candidate?.content?.parts ?? [];
      for (const part of parts) {
        // 文本 part：合并到最后一个相同 thought 状态的 text part
        if (typeof part?.text === "string") {
          const lastPart =
            bucket.content.parts[bucket.content.parts.length - 1];
          if (
            lastPart &&
            typeof lastPart.text === "string" &&
            !!lastPart.thought === !!part.thought
          ) {
            lastPart.text += part.text;
          } else {
            const newPart: any = { text: part.text };
            if (part.thought) newPart.thought = true;
            bucket.content.parts.push(newPart);
          }
        } else if (part?.functionCall) {
          bucket.content.parts.push({ functionCall: part.functionCall });
        } else if (part?.inlineData || part?.fileData) {
          bucket.content.parts.push(part);
        } else {
          bucket.content.parts.push(part);
        }
      }

      if (typeof candidate?.finishReason === "string") {
        bucket.finishReason = candidate.finishReason;
      }
      if (candidate?.safetyRatings) {
        bucket.safetyRatings = candidate.safetyRatings;
      }
      if (candidate?.citationMetadata) {
        bucket.citationMetadata = candidate.citationMetadata;
      }
    }
  }

  if (!candidatesMap.size) {
    warnings.push("未在 Gemini SSE 中发现任何 candidates 字段");
    return null;
  }

  const candidates = Array.from(candidatesMap.values()).sort(
    (a, b) => a.index - b.index
  );

  const merged: any = {
    candidates,
  };

  if (last.modelVersion) merged.modelVersion = last.modelVersion;
  if (last.responseId) merged.responseId = last.responseId;
  if (last.usageMetadata) merged.usageMetadata = last.usageMetadata;
  if (last.promptFeedback) merged.promptFeedback = last.promptFeedback;

  return merged;
}

// ===================================================================
// Cohere 合并
// ===================================================================

function mergeCohere(events: SSEEvent[], warnings: string[]): any {
  let messageStart: any = null;
  const blockByIndex = new Map<number, any>();
  let finishReason: string | undefined;
  let usage: any;
  let id: string | undefined;

  for (const ev of events) {
    const data = ev.data ?? {};
    const type = data.type;

    if (type === "message-start") {
      messageStart = data;
      id = data.id;
    } else if (type === "content-start") {
      const idx = data.index ?? 0;
      const startContent = data.delta?.message?.content;
      const block: any = startContent
        ? { ...startContent }
        : { type: "text", text: "" };
      // 确保 text/thinking 字段存在
      if (block.type === "text" && typeof block.text !== "string")
        block.text = "";
      if (block.type === "thinking" && typeof block.thinking !== "string") {
        block.thinking = "";
      }
      blockByIndex.set(idx, block);
    } else if (type === "content-delta") {
      const idx = data.index ?? 0;
      const delta = data.delta?.message?.content;
      let block = blockByIndex.get(idx);
      if (!block) {
        // 没遇到 content-start，自动建一个
        block =
          delta?.type === "thinking"
            ? { type: "thinking", thinking: "" }
            : { type: "text", text: "" };
        blockByIndex.set(idx, block);
      }
      if (delta?.type === "text" && typeof delta.text === "string") {
        block.text = (block.text ?? "") + delta.text;
      } else if (
        delta?.type === "thinking" &&
        typeof delta.thinking === "string"
      ) {
        block.thinking = (block.thinking ?? "") + delta.thinking;
      } else if (typeof delta?.text === "string") {
        // 一些早期版本直接 delta.text
        block.text = (block.text ?? "") + delta.text;
      }
    } else if (type === "content-end") {
      // 仅作为结束标记
    } else if (type === "message-end") {
      const delta = data.delta ?? {};
      if (typeof delta.finish_reason === "string") {
        finishReason = delta.finish_reason;
      }
      if (delta.usage) {
        usage = delta.usage;
      }
    } else if (type === "tool-call-start" || type === "tool-call-delta") {
      // 简化处理：直接累加到 contentBlocks（Cohere v2 工具调用结构相对复杂，这里只保留原始事件）
      warnings.push("Cohere 工具调用流式合并暂未完整支持，仅显示文本/思考部分");
    }
  }

  if (!messageStart && !blockByIndex.size) {
    warnings.push("未发现 Cohere message-start 事件");
    return null;
  }

  const sortedBlocks = Array.from(blockByIndex.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, b]) => b);

  const merged: any = {
    id,
    finish_reason: finishReason,
    message: {
      role: "assistant",
      content: sortedBlocks,
    },
    usage,
  };

  // 清理 undefined
  if (!merged.id) delete merged.id;
  if (!merged.finish_reason) delete merged.finish_reason;
  if (!merged.usage) delete merged.usage;

  return merged;
}

// ===================================================================
// Ollama 合并
// ===================================================================

function mergeOllama(events: SSEEvent[], warnings: string[]): any {
  if (!events.length) return null;

  let content = "";
  let role = "assistant";
  let last: any = events[events.length - 1].data ?? {};
  let model: string | undefined;
  let createdAt: string | undefined;

  for (const ev of events) {
    const data = ev.data ?? {};
    const msg = data.message;
    if (msg) {
      if (typeof msg.content === "string") content += msg.content;
      if (typeof msg.role === "string") role = msg.role;
    } else if (typeof data.response === "string") {
      // /api/generate 端点用 response 字段
      content += data.response;
    }
    if (data.model) model = data.model;
    if (data.created_at) createdAt = data.created_at;
  }

  const merged: any = {
    model,
    created_at: createdAt,
    message: { role, content },
    done: true,
  };

  // 最后一个 chunk 通常带有 done_reason 和性能统计
  if (last.done_reason) merged.done_reason = last.done_reason;
  if (typeof last.total_duration === "number") {
    merged.total_duration = last.total_duration;
  }
  if (typeof last.load_duration === "number") {
    merged.load_duration = last.load_duration;
  }
  if (typeof last.prompt_eval_count === "number") {
    merged.prompt_eval_count = last.prompt_eval_count;
  }
  if (typeof last.prompt_eval_duration === "number") {
    merged.prompt_eval_duration = last.prompt_eval_duration;
  }
  if (typeof last.eval_count === "number") {
    merged.eval_count = last.eval_count;
  }
  if (typeof last.eval_duration === "number") {
    merged.eval_duration = last.eval_duration;
  }

  if (!content && !last.done_reason) {
    warnings.push("Ollama SSE 未发现任何 message.content 增量");
  }

  return merged;
}
