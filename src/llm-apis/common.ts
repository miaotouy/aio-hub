import { invoke } from "@tauri-apps/api/core";
import { loadAppSettings } from "@/utils/appSettings";

/**
 * 默认配置
 */
export const DEFAULT_TIMEOUT = 145000; // 145秒，不同于常规时间，用于排查是否是这里的超时

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
 * LLM 消息结构
 */
export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string | LlmMessageContent[];
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
  /** 请求超时时间（毫秒），默认 60000 */
  timeout?: number;
  /** 用于中止请求的 AbortSignal */
  signal?: AbortSignal;

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
  toolChoice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
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
  /** 网络搜索选项 */
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
export interface MediaGenerationOptions extends Omit<LlmRequestOptions, "responseFormat"> {
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
  /** 输入忠实度 (OpenAI input_fidelity: low | high) */
  inputFidelity?: "low" | "high";
  /** 视频时长 (秒) */
  durationSeconds?: number;
  /** 蒙版图片 (用于局部重绘，Base64 或 URL) */
  mask?: string;
  /** 参考附件 (用于以图生图、参考图引导) */
  inputAttachments?: Array<{
    url?: string;
    b64?: string;
    type: "image" | "video" | "mask";
    role?: "reference" | "first_frame" | "last_frame";
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
    return lower.includes("canceled") || lower.includes("cancelled") || lower.includes("aborted");
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

  constructor(message: string, status: number, statusText: string, body?: string) {
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

  try {
    // 劫持检测：如果显式指定了 hasLocalFile/forceProxy，或者开启了底层代理行为配置，则使用 Rust 代理发送请求
    // hasLocalFile: 绕过浏览器在 JS 侧序列化巨型 Body 导致的 IPC 阻塞
    // forceProxy: 绕过前端 Capabilities/CORS 限制
    // relaxIdCerts/http1Only: 前端 fetch 不支持这些底层配置，必须走 Rust 代理
    // 劫持检测：如果显式指定了 hasLocalFile/forceProxy，或者开启了底层代理行为配置，则使用 Rust 代理发送请求
    // networkStrategy === 'native' 具有最高优先级，除非是前端 fetch 无法实现的底层配置
    const isNative = options.networkStrategy === "native";
    // 劫持检测逻辑：
    // 1. 如果包含本地文件 (hasLocalFile)，则无论何种策略都必须走代理，因为原生 fetch 无法处理 local-file:// 协议
    // 2. 深度检测：如果 body 是字符串且包含 local-file://，也强制走代理（兜底逻辑）
    // 3. 否则，遵循非原生策略下的代理/强制代理/底层配置要求
    const bodyString = typeof options.body === 'string' ? options.body : '';
    const hasLocalFileInBody = bodyString.includes('local-file://');

    const useProxy =
      options.hasLocalFile ||
      hasLocalFileInBody ||
      (!isNative && (options.forceProxy || options.relaxIdCerts || options.http1Only));

    if (useProxy) {
      let bodyObjForProxy: any = {}; // 默认为空对象

      if (options.body) {
        if (typeof options.body === "string") {
          try {
            bodyObjForProxy = JSON.parse(options.body);
          } catch (e) {
            // 如果不是 JSON，则无法通过代理处理
            if (!options.forceProxy) {
              return await window.fetch(url, {
                ...options,
                signal: controller.signal,
              });
            }
          }
        } else if (options.body instanceof Uint8Array) {
          try {
            const decoder = new TextDecoder();
            bodyObjForProxy = JSON.parse(decoder.decode(options.body));
          } catch (e) {
            if (!options.forceProxy) {
              return await window.fetch(url, {
                ...options,
                signal: controller.signal,
              });
            }
          }
        }
      }

      // 确保代理服务已启动
      // 优先使用环境变量配置的端口，支持多实例开发
      const PROXY_PORT = parseInt(import.meta.env.VITE_AIO_PROXY_PORT || "16655");
      try {
        await invoke("start_llm_proxy_server", { port: PROXY_PORT });
      } catch (e) {
        console.error("Failed to start LLM proxy server:", e);
      }

      // 获取当前代理设置
      const settings = loadAppSettings();
      const proxySettings = settings.proxy
        ? {
            mode: settings.proxy.mode,
            custom_url: settings.proxy.customUrl,
          }
        : undefined;

      // 使用原生 fetch 请求本地代理
      return await window.fetch(`http://127.0.0.1:${PROXY_PORT}/proxy`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url,
          method: options.method || "POST",
          headers: options.headers as Record<string, string>,
          body: bodyObjForProxy,
          timeout: timeout,
          relax_invalid_certs: options.relaxIdCerts,
          http1_only: options.http1Only,
          proxy_settings: proxySettings,
        }),
        signal: controller.signal,
      });
    }

    const response = await window.fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    // 关键修复：如果底层 fetch 抛出了通用的 "canceled" 错误，
    // 但我们的 controller 确实是因为超时才 abort 的，
    // 那么我们要把错误包装回 TimeoutError 抛出。
    if (controller.signal.aborted && controller.signal.reason instanceof TimeoutError) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", externalAbortHandler);
  }
};
