// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { inspectorHookRegistry } from "@/tools/llm-inspector/core/hookRegistry";
import type { InspectorContextMetadata } from "@/tools/llm-inspector/types/hooks";

const logger = createModuleLogger("llm-apis/common");

/**
 * 默认配置
 */
export const DEFAULT_TIMEOUT = 145000; // 145秒，不同于常规时间，用于排查是否是这里的超时

/**
 * 媒体生成默认超时时间（图片/视频/音频通常较慢）
 */
export const DEFAULT_MEDIA_TIMEOUT = 600000; // 600秒 (10分钟)

/**
 * 视频元数据（Gemini 特有）
 * 用于控制视频输入的处理方式
 */
export interface VideoMetadata {
  /** 视频剪辑开始时间（格式：MM:SS 或秒数字符串如 "1250s"） */
  startOffset?: string;
  /** 视频剪辑结束时间（格式：MM:SS 或秒数字符串如 "1570s"） */
  endOffset?: string;
  /** 采样帧率（每秒帧数），默认 1 FPS */
  fps?: number;
}

/**
 * LLM 请求的消息内容
 */
/**
 * 媒体内容的数据源定义
 */
export type MediaSource =
  | {
      /** 内联数据（Base64 字符串或二进制 Buffer） */
      type: "base64";
      media_type: string;
      data: string | ArrayBuffer | Uint8Array;
    }
  | {
      /** 通过文件服务（如 Gemini Files API）上传后获得的 URI */
      type: "file_uri";
      file_uri: string;
      mime_type: string;
    };

// =================================================================
// 定义不同类型的消息内容
// =================================================================

export interface TextContent {
  type: "text";
  text: string;
}

export interface ImageContent {
  type: "image";
  /** 图片数据（Base64 字符串或二进制 Buffer） */
  imageBase64: string | ArrayBuffer | Uint8Array;
  // 未来可以扩展 source 以支持 URL
}

export interface AudioContent {
  type: "audio";
  source: MediaSource;
}

export interface VideoContent {
  type: "video";
  source: MediaSource;
  videoMetadata?: VideoMetadata;
}

export interface ToolUseContent {
  type: "tool_use";
  toolUseId: string;
  toolName: string;
  toolInput: Record<string, any>;
}

export interface ToolResultContent {
  type: "tool_result";
  toolResultId: string;
  toolResultContent: string | LlmMessageContent[];
  isError?: boolean;
}

/**
 * 文档类型（用于 PDF、TXT 等通用文件）
 */
export interface DocumentContent {
  type: "document";
  source: MediaSource;
}

/**
 * LLM 请求的消息内容 - 统一的、结构化的多模态内容格式
 */
export type LlmMessageContent =
  | TextContent
  | ImageContent
  | AudioContent
  | VideoContent
  | DocumentContent
  | ToolUseContent
  | ToolResultContent;

/**
 * Provider-owned reasoning state that may need exact replay in future turns.
 *
 * This is intentionally separate from reasoningContent:
 * - reasoningContent is display/search/export text.
 * - reasoningArtifacts are opaque API state and must not be rewritten.
 */
export interface LlmReasoningArtifact {
  provider: string;
  kind: string;
  replayPolicy: "always" | "with_tool_calls" | "never";
  payload: unknown;
  visibleText?: string;
}

/**
 * LLM 消息结构
 */
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string | LlmMessageContent[];
  /**
   * 推理内容（DeepSeek reasoning 等）
   * 在多轮对话中，如果存在工具调用，必须回传此内容
   */
  reasoningContent?: string;
  /**
   * Provider-owned reasoning state for exact replay.
   */
  reasoningArtifacts?: LlmReasoningArtifact[];
  /**
   * 是否作为续写前缀 (DeepSeek / Claude Prefill)
   * 如果为 true，该消息必须是列表中的最后一条，且 role 通常为 assistant
   */
  prefix?: boolean;
}

/**
 * LLM 请求参数
 */
export interface LlmRequestOptions {
  profileId: string;
  modelId: string;
  /** 可选：显式指定 API Key，如果不提供则根据 profileId 自动选取 */
  apiKey?: string;
  /** 完整的消息列表（包括 role 和 content），现已支持 system 角色 */
  messages?: LlmMessage[];
  maxTokens?: number;
  temperature?: number;
  /** 是否启用流式响应 */
  stream?: boolean;
  /** 流式响应回调 */
  onStream?: (chunk: string) => void;
  /** 流式推理内容回调（DeepSeek reasoning 等） */
  onReasoningStream?: (chunk: string) => void;
  /** 流式预览图回调 (OpenAI Responses gpt-image-2 特性) */
  onPartialImage?: (base64: string, index: number) => void;
  /** 请求超时时间（毫秒），默认 60000 */
  timeout?: number;
  /** 用于中止请求的 AbortSignal */
  signal?: AbortSignal;
  /** 用于主动停止请求的唯一标识符 */
  requestId?: string;
  /** 是否静默记录请求错误（用于有明确降级路径的探测性请求） */
  suppressErrorLog?: boolean;
  /** 是否允许测试/探测请求绕过 profile 启用状态检查 */
  allowDisabledProfile?: boolean;

  // --- 特种模型参数 ---
  /** 嵌入 (Embedding) 输入内容 */
  embeddingInput?: string | string[];
  /** 重排 (Rerank) 查询内容 */
  rerankQuery?: string;
  /** 重排 (Rerank) 待排序文档列表 */
  rerankDocuments?: string[] | Array<{ text: string; [key: string]: any }>;

  // OpenAI 兼容的高级参数
  /** Top-p 采样参数，介于 0 和 1 之间 */
  topP?: number;
  /** Top-k 采样参数（某些模型支持） */
  topK?: number;
  /** 频率惩罚，介于 -2.0 和 2.0 之间 */
  frequencyPenalty?: number;
  /** 存在惩罚，介于 -2.0 和 2.0 之间 */
  presencePenalty?: number;
  /** 重复惩罚，介于 0.0 和 2.0 之间 */
  repetitionPenalty?: number;
  /** 停止序列，最多 4 个 */
  stop?: string | string[];
  /** 生成的响应数量 */
  n?: number;
  /** 随机种子，用于确定性采样 */
  seed?: number;
  /** 是否返回 logprobs */
  logprobs?: boolean;
  /** 返回的 top logprobs 数量（0-20） */
  topLogprobs?: number;
  /** 响应格式配置 */
  responseFormat?: {
    type: "text" | "json_object" | "json_schema";
    json_schema?: {
      name: string;
      schema: Record<string, any>;
      strict?: boolean;
    };
  };
  /** 工具列表（函数调用） */
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters?: Record<string, any>;
      strict?: boolean;
    };
  }>;
  /** 工具选择策略 */
  toolChoice?:
    | "none"
    | "auto"
    | "required"
    | { type: "function"; function: { name: string } };
  /** 是否启用并行工具调用 */
  parallelToolCalls?: boolean;
  /** 流式选项 */
  streamOptions?: {
    includeUsage?: boolean;
  };
  /** 用户标识符 */
  user?: string;
  /** 标记偏差配置 */
  logitBias?: Record<string, number>;
  /** 补全中可生成的最大标记数（替代 maxTokens） */
  maxCompletionTokens?: number;
  /** 是否存储输出用于模型蒸馏 */
  store?: boolean;
  /** OpenAI Responses: 是否在服务器端保留对话状态 */
  responsesStore?: boolean;
  /** OpenAI Responses: 期望的流式预览图数量 (0-3) */
  partialImages?: number;
  /** OpenAI Responses: 输入忠实度 (low | high) */
  inputFidelity?: "low" | "high";
  /** OpenAI Responses: 包含的响应内容类型 (如 ["reasoning.encrypted_content"]) */
  include?: string[];
  /** o系列模型的推理工作约束 */
  reasoningEffort?: string;
  /** 是否启用思考模式 */
  thinkingEnabled?: boolean;
  /** 是否包含思考内容（Gemini 特有） */
  includeThoughts?: boolean;
  /** 思考预算 Token 数 */
  thinkingBudget?: number;
  /** 元数据键值对 */
  metadata?: Record<string, string>;
  /**
   * LLM Inspector 内部监控上下文（仅前端使用，绝不会透传到上游 LLM API）
   *
   * 注意：**不能复用 `metadata` 字段** — 该字段已被 OpenAI/Anthropic 的
   * `metadata` API 参数占用，混用会污染 LLM 请求。本字段由 `useLlmRequest`
   * 自动补全 profileId/modelId/requestId，并由 `fetchWithTimeout` 在
   * `inspectorHookRegistry.triggerRequest` 时塞入 `InspectorRequestEvent.metadata`。
   * 同时它已加入 `KNOWN_NON_MODEL_OPTIONS_KEYS` 与 `cleanPayload` 的禁用列表，
   * 确保不会被透传到 API 请求体。
   */
  inspectorContext?: {
    sessionId?: string;
    toolName?: string;
    purpose?: string;
  };
  /** 额外的请求体参数（透传给 API） */
  extraBody?: Record<string, any>;
  /** 网络请求策略 */
  networkStrategy?: "auto" | "proxy" | "native";
  /** 是否包含本地文件协议 (local-file://)，若为 true 则强制走 Rust 代理以避免 IPC 阻塞 */
  hasLocalFile?: boolean;
  /** 是否强制走后端代理 */
  forceProxy?: boolean;
  /** 放宽证书校验 */
  relaxIdCerts?: boolean;
  /** 强制 HTTP/1.1 */
  http1Only?: boolean;
  /** 输出模态类型 */
  modalities?: Array<"text" | "audio">;
  /** 预测输出配置 */
  prediction?: {
    type: "content";
    content:
      | string
      | Array<{
          type: "text";
          text: string;
        }>;
  };
  /** 音频输出参数 */
  audio?: {
    voice:
      | "alloy"
      | "ash"
      | "ballad"
      | "coral"
      | "echo"
      | "fable"
      | "nova"
      | "onyx"
      | "sage"
      | "shimmer";
    format: "wav" | "mp3" | "flac" | "opus" | "pcm16";
  };
  /** 服务层级 */
  serviceTier?: "auto" | "default" | "flex";
  /** 是否启用联网搜索（统一开关，各 Provider 自动适配格式） */
  webSearchEnabled?: boolean;
  /** 网络搜索选项（OpenAI 高级配置） */
  webSearchOptions?: {
    searchContextSize?: "low" | "medium" | "high";
    userLocation?: {
      approximate: {
        city?: string;
        country?: string;
        region?: string;
        timezone?: string;
        type: "approximate";
      };
    };
  };

  // ===== Claude 特有参数 =====
  /** Claude: 停止序列 */
  stopSequences?: string[];
  /** Claude: 元数据（用户ID等） */
  claudeMetadata?: {
    user_id?: string;
  };
}

/**
 * 媒体生成通用选项
 */
export interface MediaGenerationOptions extends Omit<
  LlmRequestOptions,
  "responseFormat"
> {
  /** 单次生成的提示词，若提供则自动包装为 user 消息 */
  prompt?: string;
  /** 负面提示词 (Negative Prompt) */
  negativePrompt?: string;
  /** 随机种子 (Seed) */
  seed?: number;
  /** 重复惩罚 */
  repetitionPenalty?: number;
  /** 生成数量 (OpenAI n) */
  n?: number;
  /** 分辨率 (e.g., "1024x1024", "1K", "2K", "720p", "1080p") */
  size?: string;
  /** 质量级别 (standard, hd, low, high) */
  quality?: string;
  /** 风格控制 (vivid, natural, cinematic, etc.) */
  style?: string;
  /** 响应格式 (url, b64_json) */
  responseFormat?: "url" | "b64_json" | string | Record<string, any>; // 覆盖基类的响应格式，支持更广泛的媒体格式
  /** 分辨率级别 (Gemini Veo: 720p, 1080p, 4k) */
  resolution?: string;
  /** 宽高比 (e.g., "1:1", "16:9", "9:16") */
  aspectRatio?: string;
  /** 引导系数 (CFG Scale / Guidance Scale) */
  guidanceScale?: number;
  /** 推理步数 (Inference Steps) */
  numInferenceSteps?: number;
  /** 提示词增强开关 (Prompt Enhancement) */
  promptEnhancement?: boolean;
  /** 安全过滤等级 (Safety Setting: block_none, block_few, etc.) */
  safetySetting?: string;
  /** 是否生成视频音频轨或背景音乐 */
  generateAudio?: boolean;
  /** 是否添加水印 */
  watermark?: boolean;
  /** 是否固定镜头 */
  cameraFixed?: boolean;
  /** 运动幅度 / 动态强度 */
  movementAmplitude?: string;
  /** 输入忠实度 (OpenAI input_fidelity: low | high) */
  inputFidelity?: "low" | "high";
  /** 视频时长 (秒) */
  durationSeconds?: number;
  /** 蒙版图片 (用于局部重绘，Base64 或 URL) */
  mask?: string;
  /** 参考附件 (用于以图生图、参考图引导) */
  inputAttachments?: Array<{
    /** 远程 URL (如果模型支持) */
    url?: string;
    /** Base64 Data URL (由前端预处理) */
    b64?: string;
    type: "image" | "video" | "audio" | "mask";
    role?: "reference" | "first_frame" | "last_frame";
    path?: string;
    mimeType?: string;
    id?: string;
    name?: string;
    size?: number;
  }>;
  /** 音频控制 */
  audioConfig?: {
    voice?: string;
    speed?: number;
    pitch?: number;
    responseFormat?: "mp3" | "wav" | "opus" | "aac";
  };
  /** 扩展透传参数 */
  params?: Record<string, any>;
}

/**
 * URL 引用注释（网络搜索工具）
 */
export interface UrlCitation {
  type: "url_citation";
  urlCitation: {
    startIndex: number;
    endIndex: number;
    url: string;
    title: string;
  };
}

/**
 * 文件引用注释（文件搜索工具）
 */
export interface FileCitation {
  type: "file_citation";
  fileCitation: {
    startIndex: number;
    endIndex: number;
    fileId: string;
    quote?: string;
  };
}

/**
 * 注释类型联合
 */
export type Annotation = UrlCitation | FileCitation;

/**
 * LLM 响应结果
 */
export interface LlmResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** 提示token详细信息 */
    promptTokensDetails?: {
      cachedTokens?: number;
      audioTokens?: number;
    };
    /** 完成token详细信息 */
    completionTokensDetails?: {
      reasoningTokens?: number;
      audioTokens?: number;
      acceptedPredictionTokens?: number;
      rejectedPredictionTokens?: number;
    };
  };
  /** 是否为流式响应 */
  isStream?: boolean;
  /** 模型的拒绝消息（如果模型拒绝响应） */
  refusal?: string | null;
  /** 停止原因 */
  finishReason?:
    | "stop"
    | "length"
    | "content_filter"
    | "tool_calls"
    | "function_call"
    | "end_turn"
    | "max_tokens"
    | "stop_sequence"
    | "tool_use"
    | null;
  /** 停止序列（Claude） */
  stopSequence?: string | null;
  /** 工具调用结果（函数调用） */
  toolCalls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  /** Logprobs 信息 */
  logprobs?: {
    content: Array<{
      token: string;
      logprob: number;
      bytes: number[] | null;
      topLogprobs: Array<{
        token: string;
        logprob: number;
        bytes: number[] | null;
      }>;
    }> | null;
    /** 拒绝的logprobs信息 */
    refusal?: Array<{
      token: string;
      logprob: number;
      bytes: number[] | null;
      topLogprobs: Array<{
        token: string;
        logprob: number;
        bytes: number[] | null;
      }>;
    }> | null;
  };
  /** 推理内容（DeepSeek reasoning 模式） */
  reasoningContent?: string;
  /** Provider-owned reasoning state for exact replay in later turns. */
  reasoningArtifacts?: LlmReasoningArtifact[];
  /** 消息注释（如网络搜索的URL引用、文件搜索的文件引用） */
  annotations?: Annotation[];
  /** 音频响应数据 */
  audio?: {
    id: string;
    data: string | ArrayBuffer;
    transcript: string;
    expiresAt: number;
  };
  /** 系统指纹 */
  systemFingerprint?: string;
  /** 使用的服务层级 */
  serviceTier?: string;
  /** 模型重写后的提示词 */
  revisedPrompt?: string;
  /** 实际使用的种子值 */
  seed?: number;
  /** 任务进度 (0-100) */
  progress?: number;
  /** 模型思维链 (Gemini Thought) */
  thought?: string;
  /** 性能指标 (硅基 timings 等) */
  timings?: Record<string, any>;
  /** 生成的图片列表 */
  images?: Array<{
    url?: string;
    b64_json?: string | ArrayBuffer;
    revisedPrompt?: string;
  }>;
  /** 生成的视频列表 */
  videos?: Array<{
    url?: string;
    b64_json?: string | ArrayBuffer;
    id?: string;
    status?: "pending" | "processing" | "completed" | "failed";
    thumbnailUrl?: string;
  }>;
  /** 生成的音频列表 */
  audios?: Array<{
    url?: string;
    b64_json?: string | ArrayBuffer;
    format?: string;
    duration?: number;
  }>;
  /** 降级兼容：生成的音频数据 (Base64 或二进制) */
  audioData?: string | ArrayBuffer;
}

/**
 * 自定义超时错误
 */
export class TimeoutError extends Error {
  constructor(message = "Request timed out") {
    super(message);
    this.name = "TimeoutError";
  }
}
/**
 * 检查是否为 AbortError
 * 兼容多种环境（浏览器 DOMException、Tauri HTTP 插件等）
 */
export function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  // 如果 signal 已经中止，且不是因为超时，那么这就是一个纯粹的中止
  if (signal?.aborted && !isTimeoutError(error, signal)) {
    return true;
  }

  if (error === null || error === undefined) return false;

  // 如果是字符串，直接判断内容
  if (typeof error === "string") {
    const lower = error.toLowerCase();
    return (
      lower.includes("canceled") ||
      lower.includes("cancelled") ||
      lower.includes("aborted")
    );
  }

  // 如果是对象/Error实例
  const err = error as any;

  // 标准 AbortError (浏览器 DOMException)
  if (err.name === "AbortError") return true;

  // 检查 message 属性
  const message = String(err.message || "").toLowerCase();
  if (
    message.includes("canceled") ||
    message.includes("cancelled") ||
    message.includes("aborted")
  ) {
    return true;
  }

  // 兜底检查：如果 constructor 名字包含 AbortError
  if (err.constructor?.name === "AbortError") return true;

  return false;
}

/**
 * 检查是否为超时错误
 * 逻辑：
 * 1. 显式的 TimeoutError 实例
 * 2. 错误消息包含 timeout
 * 3. AbortSignal 的 reason 包含 timeout
 */
export function isTimeoutError(error: unknown, signal?: AbortSignal): boolean {
  if (error instanceof TimeoutError) return true;

  // 检查错误对象
  const errMsg = String((error as any)?.message || error || "").toLowerCase();
  if (errMsg.includes("timeout")) return true;

  // 检查信号原因 (AbortSignal.reason)
  // 现代浏览器中，如果通过 AbortSignal.timeout() 触发，reason 会是一个 TimeoutError 或包含 timeout 的对象
  const signalReason = String(signal?.reason || "").toLowerCase();
  if (signalReason.includes("timeout")) return true;

  return false;
}

/**
 * LLM API 错误
 */
export class LlmApiError extends Error {
  status: number;
  statusText: string;
  body?: string;

  constructor(
    message: string,
    status: number,
    statusText: string,
    body?: string
  ) {
    super(message);
    this.name = "LlmApiError";
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

/**
 * 确保响应成功，否则抛出 LlmApiError
 */
export const ensureResponseOk = async (response: Response): Promise<void> => {
  if (!response.ok) {
    let errorText = "";
    try {
      errorText = await response.text();
    } catch {
      // 忽略读取错误
    }
    throw new LlmApiError(
      `API 请求失败 (${response.status} ${response.statusText}): ${errorText}`,
      response.status,
      response.statusText,
      errorText
    );
  }
};

/**
 * 代理服务器端口缓存
 * 由 ensureProxyServer() 维护：首次调用启动后端并缓存真实端口；后续直接复用。
 * Windows 上常因 Hyper-V/WinNAT 动态保留端口段导致默认端口绑定失败 (os error 10013)，
 * 后端会自动 fallback 到可用端口并通过返回值告知前端实际使用的端口。
 */
interface ProxyServerInfo {
  port: number;
  token: string;
}

let cachedProxyServer: ProxyServerInfo | null = null;
let proxyServerPromise: Promise<ProxyServerInfo> | null = null;

/**
 * 确保 LLM 代理服务已启动，返回实际端口与本次运行的 capability token。
 * 单例模式：并发调用共享同一个启动 Promise，避免重复 invoke
 */
async function ensureProxyServer(): Promise<ProxyServerInfo> {
  if (cachedProxyServer !== null) {
    return cachedProxyServer;
  }
  if (proxyServerPromise) {
    return proxyServerPromise;
  }

  const preferredPort = parseInt(
    import.meta.env.VITE_AIO_PROXY_PORT || "21655"
  );

  proxyServerPromise = (async () => {
    try {
      const info = await invoke<ProxyServerInfo>("start_llm_proxy_server", {
        port: preferredPort,
      });
      cachedProxyServer = info;
      if (info.port !== preferredPort) {
        logger.warn("LLM 代理服务端口已自动 fallback", {
          preferredPort,
          actualPort: info.port,
        });
      } else {
        logger.info("LLM 代理服务已启动", { port: info.port });
      }
      return info;
    } catch (e) {
      // 启动失败：清理 Promise 以允许下次重试
      proxyServerPromise = null;
      logger.error("启动 LLM 代理服务失败", e as Error, { preferredPort });
      throw e;
    }
  })();

  return proxyServerPromise;
}

/**
 * 带超时控制的请求包装器
 */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit & {
    hasLocalFile?: boolean;
    forceProxy?: boolean;
    relaxIdCerts?: boolean;
    http1Only?: boolean;
    networkStrategy?: "auto" | "proxy" | "native";
    isStreaming?: boolean;
    proxyBodyKind?: "raw" | "file-ref" | "multipart-manifest";
    /**
     * LLM Inspector 内部监控上下文。由上游 `useLlmRequest` / adapter 透传。
     * 当 `inspectorHookRegistry.shouldCaptureInternal()` 为 true 时，
     * 会作为 `InspectorRequestEvent.metadata` 一并广播。
     */
    inspectorContext?: InspectorContextMetadata;
  },
  timeout: number = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new TimeoutError(`Request timed out after ${timeout}ms`));
  }, timeout);

  // 如果外部信号已经中止，立即抛出错误
  if (externalSignal?.aborted) {
    clearTimeout(timeoutId);
    throw externalSignal.reason || new DOMException("Aborted", "AbortError");
  }

  // 监听外部中止信号
  const externalAbortHandler = () => {
    // 传递外部信号的原因
    controller.abort(externalSignal?.reason);
  };
  externalSignal?.addEventListener("abort", externalAbortHandler);

  // ============ LLM Inspector 内部监控埋点（B2）============
  // 开关 OFF 时整个 inspector 流程零开销（不生成 requestId、不读取 body、不广播）。
  // 在统一入口生成 requestId，确保流式 chunk 能正确关联。
  const captureInspector = inspectorHookRegistry.shouldCaptureInternal();
  let inspectorRequestId: string | null = null;
  let inspectorStartTimestamp = 0;
  // 优先级：options.inspectorContext > contextStore[X-Request-ID]
  // 后者由 useLlmRequest 通过 X-Request-ID header 关联（B3），避免修改所有 adapter。
  let resolvedInspectorContext = options.inspectorContext;
  if (captureInspector) {
    // 优先复用调用方已生成的 requestId（来自 headers["X-Request-ID"] 等），
    // 否则生成新的 UUID。
    const headerRequestId =
      typeof options.headers === "object" && options.headers !== null
        ? (options.headers as Record<string, string>)["X-Request-ID"] ||
          (options.headers as Record<string, string>)["x-request-id"]
        : undefined;
    inspectorRequestId =
      headerRequestId ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    inspectorStartTimestamp = Date.now();

    // 若 options 未显式传入 inspectorContext，尝试从 contextStore 反查（B3 透传机制）
    if (!resolvedInspectorContext && headerRequestId) {
      resolvedInspectorContext =
        inspectorHookRegistry.getContext(headerRequestId);
    }

    // 收集请求头快照（注册器不做加工，原样广播）
    const headersSnapshot: Record<string, string> = {};
    if (options.headers && typeof options.headers === "object") {
      for (const [k, v] of Object.entries(
        options.headers as Record<string, string>
      )) {
        headersSnapshot[k] = String(v);
      }
    }

    // 收集请求体快照
    // - string：直接采集
    // - Uint8Array：解码为字符串（OpenAI/Gemini adapter 在大 body 时会用此类型，
    //   见 src/llm-apis/adapters/openai/chat.ts 的 asyncJsonStringify 路径）
    // - FormData / 其他：跳过避免性能开销，仅记录占位说明
    let bodySnapshot: string | undefined;
    if (typeof options.body === "string") {
      bodySnapshot = options.body;
    } else if (options.body instanceof Uint8Array) {
      try {
        bodySnapshot = new TextDecoder().decode(options.body);
      } catch {
        bodySnapshot = `[Uint8Array, ${options.body.byteLength} bytes]`;
      }
    } else if (options.body instanceof FormData) {
      bodySnapshot = "[FormData body, 跳过采集]";
    }

    inspectorHookRegistry.triggerRequest({
      requestId: inspectorRequestId,
      timestamp: inspectorStartTimestamp,
      method: options.method || "GET",
      url,
      headers: headersSnapshot,
      body: bodySnapshot,
      metadata: resolvedInspectorContext,
    });
  }

  /**
   * 触发 Inspector 响应事件（开关 ON 且 requestId 存在时）
   *
   * 处理策略：
   * - **流式响应**（SSE / `text/event-stream` / `options.isStreaming === true`）：
   *   clone 响应后启动独立 reader 循环，每读到 chunk 立即通过
   *   `triggerStream({ isComplete: false })` 实时推送给 Inspector，
   *   reader done 后再触发一次 `triggerStream({ isComplete: true })` +
   *   带累积完整 body 的 `triggerResponse`。
   * - **非流式响应**：clone 后异步 `.text()` 一次性 fire `triggerResponse`。
   *
   * 关键点：`clone()` 是 O(1)，独立 reader 与 adapter 主消费链互不干扰，
   * 背压由浏览器/Tauri 自动协调。
   */
  const triggerInspectorResponse = (response: Response): void => {
    if (!captureInspector || !inspectorRequestId) return;
    const headersObj: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headersObj[k] = v;
    });
    const requestId = inspectorRequestId;
    const startTs = inspectorStartTimestamp;
    const metadata = resolvedInspectorContext;

    const fireResponseEvent = (body: string | undefined) => {
      inspectorHookRegistry.triggerResponse({
        requestId,
        timestamp: Date.now(),
        status: response.status,
        headers: headersObj,
        body,
        durationMs: Date.now() - startTs,
        metadata,
      });
    };

    // 判断是否流式响应：优先看 content-type，其次看 options.isStreaming
    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();
    const isStreamResponse =
      contentType.includes("text/event-stream") ||
      contentType.includes("application/stream+json") ||
      options.isStreaming === true;

    let cloned: Response;
    try {
      cloned = response.clone();
    } catch {
      // clone 异常时仅广播头部信息，确保不阻塞主流程
      fireResponseEvent(undefined);
      return;
    }

    if (!isStreamResponse) {
      // 非流式：一次性读取完整 body
      cloned
        .text()
        .then((body) => fireResponseEvent(body))
        .catch(() => fireResponseEvent(undefined));
      return;
    }

    // 流式：启动独立 reader 循环逐 chunk 推送
    const body = cloned.body;
    if (!body) {
      // 没有 body 流：直接结束
      inspectorHookRegistry.triggerStream({
        requestId,
        timestamp: Date.now(),
        chunk: "",
        isComplete: true,
        metadata,
      });
      fireResponseEvent(undefined);
      return;
    }

    void (async () => {
      const reader = body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulated = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          // stream: true 用于跨多块的字符边界拼接（UTF-8 多字节安全）
          const chunkStr = decoder.decode(value, { stream: true });
          if (chunkStr) {
            accumulated += chunkStr;
            inspectorHookRegistry.triggerStream({
              requestId,
              timestamp: Date.now(),
              chunk: chunkStr,
              isComplete: false,
              metadata,
            });
          }
        }
        // 冲刷 decoder 残留字节
        const tail = decoder.decode();
        if (tail) {
          accumulated += tail;
          inspectorHookRegistry.triggerStream({
            requestId,
            timestamp: Date.now(),
            chunk: tail,
            isComplete: false,
            metadata,
          });
        }
        // 终结流式标记
        inspectorHookRegistry.triggerStream({
          requestId,
          timestamp: Date.now(),
          chunk: "",
          isComplete: true,
          metadata,
        });
        // 触发一次完整 response，带累积 body（供非流式 raw 视图使用）
        fireResponseEvent(accumulated);
      } catch (err) {
        // 读流异常：发一个 complete 标记 + 错误事件
        inspectorHookRegistry.triggerStream({
          requestId,
          timestamp: Date.now(),
          chunk: "",
          isComplete: true,
          metadata,
        });
        inspectorHookRegistry.triggerError({
          requestId,
          timestamp: Date.now(),
          errorName: (err as Error)?.name || "StreamReadError",
          errorMessage: (err as Error)?.message || String(err),
          metadata,
        });
        fireResponseEvent(accumulated || undefined);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // 释放锁失败可忽略
        }
      }
    })();
  };

  try {
    // 默认全面转向 Rust 代理。显式 native 可直连，但需要原生文件读取的请求
    // 必须走代理，避免把 LocalFileRef 对象或本地路径直接发给 Provider。
    const isNative = options.networkStrategy === "native";
    const requiresNativeFileAccess =
      options.hasLocalFile ||
      options.proxyBodyKind === "file-ref" ||
      options.proxyBodyKind === "multipart-manifest";
    const useProxy = !isNative || requiresNativeFileAccess;

    // 仅用于日志记录
    const bodyString = typeof options.body === "string" ? options.body : "";
    const hasLocalFileInBody = bodyString.includes("local-file://");

    if (useProxy) {
      logger.debug("触发代理模式", {
        hasLocalFile: options.hasLocalFile,
        hasLocalFileInBody,
        forceProxy: options.forceProxy,
        relaxIdCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
        isStreaming: options.isStreaming,
        networkStrategy: options.networkStrategy,
      });
      const proxyServer = await ensureProxyServer();
      const appSettingsStore = useAppSettingsStore();
      const settings = appSettingsStore.settings;
      const proxyHeaders = new Headers(options.headers);
      if (options.body instanceof FormData) {
        proxyHeaders.delete("content-type");
      }
      proxyHeaders.set("X-Proxy-Token", proxyServer.token);
      proxyHeaders.set("X-AIO-Target-URL", url);
      proxyHeaders.set("X-AIO-Proxy-Mode", settings.proxy?.mode || "system");
      proxyHeaders.set("X-AIO-Proxy-URL", settings.proxy?.customUrl || "");
      proxyHeaders.set(
        "X-AIO-Relax-Certs",
        String(options.relaxIdCerts ?? true)
      );
      proxyHeaders.set("X-AIO-HTTP1-Only", String(options.http1Only ?? true));
      proxyHeaders.set("X-AIO-Streaming", String(options.isStreaming ?? false));
      proxyHeaders.set("X-AIO-Body-Kind", options.proxyBodyKind || "raw");

      const needsJsonExpansion =
        options.proxyBodyKind === undefined &&
        (options.hasLocalFile || hasLocalFileInBody);
      if (needsJsonExpansion) {
        proxyHeaders.set("X-AIO-JSON-Expand", "true");
      }
      const proxyPath = needsJsonExpansion
        ? "/proxy/json-expand"
        : "/proxy/raw";
      const method = (options.method || "POST").toUpperCase();
      const proxyResponse = await window.fetch(
        `http://127.0.0.1:${proxyServer.port}${proxyPath}`,
        {
          method,
          headers: proxyHeaders,
          body: method === "GET" || method === "HEAD" ? undefined : options.body,
          signal: controller.signal,
        }
      );
      triggerInspectorResponse(proxyResponse);
      return proxyResponse;
    }

    const response = await window.fetch(url, {
      ...options,
      signal: controller.signal,
    });
    triggerInspectorResponse(response);
    return response;
  } catch (error) {
    // 关键修复：如果底层 fetch 抛出了通用的 "canceled" 错误，
    // 但我们的 controller 确实是因为超时才 abort 的，
    // 那么我们要把错误包装回 TimeoutError 抛出。
    if (
      controller.signal.aborted &&
      controller.signal.reason instanceof TimeoutError
    ) {
      // Inspector 错误事件
      if (captureInspector && inspectorRequestId) {
        const wrapped = controller.signal.reason as TimeoutError;
        inspectorHookRegistry.triggerError({
          requestId: inspectorRequestId,
          timestamp: Date.now(),
          errorName: wrapped.name,
          errorMessage: wrapped.message,
          metadata: resolvedInspectorContext,
        });
      }
      throw controller.signal.reason;
    }
    // Inspector 错误事件（其他错误）
    if (captureInspector && inspectorRequestId) {
      const err = error as Error;
      inspectorHookRegistry.triggerError({
        requestId: inspectorRequestId,
        timestamp: Date.now(),
        errorName: err?.name || "Error",
        errorMessage: err?.message || String(error),
        metadata: resolvedInspectorContext,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", externalAbortHandler);
  }
};
