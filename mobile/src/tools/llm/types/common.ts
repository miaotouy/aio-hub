/**
 * LLM 请求通用类型定义
 */

export interface LlmMessageContent {
  type: "text" | "image" | "tool_use" | "tool_result" | "document" | "audio" | "video";
  text?: string;
  imageBase64?: string;
  toolUseId?: string;
  toolName?: string;
  toolInput?: any;
  toolResultId?: string;
  toolResultContent?: string | LlmMessageContent[];
  isError?: boolean;
  source?: any;
  videoMetadata?: any;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | LlmMessageContent[];
}

/**
 * 模型能力定义
 */
export interface ModelCapabilities {
  /** 是否支持视觉 (多模态图片) */
  vision?: boolean;
  /** 是否支持工具调用 (Function Calling) */
  toolUse?: boolean;
  /** 是否支持 JSON 模式输出 */
  jsonOutput?: boolean;
  /** 是否支持思考模式 (Reasoning/Thinking) */
  thinking?: boolean;
  /** 是否支持代码执行 (Code Execution) */
  codeExecution?: boolean;
  /** 是否支持联网搜索 (Web Search) */
  webSearch?: boolean;
  /** 是否支持文件搜索 (RAG/Retrieval) */
  fileSearch?: boolean;
  /** 是否支持计算机使用 (Computer Use) */
  computerUse?: boolean;
  /** 是否支持文档处理 (PDF/Doc) */
  document?: boolean;
  /** 是否支持图像生成 (Text-to-Image) */
  imageGeneration?: boolean;
  /** 是否支持视频生成 (Text-to-Video) */
  videoGeneration?: boolean;
  /** 是否支持音乐生成 (Text-to-Audio) */
  musicGeneration?: boolean;
  /** 是否支持 FIM (Fill-in-the-middle) 补全 */
  fim?: boolean;
  /** 是否支持前缀续写 (Prefix Completion) */
  prefixCompletion?: boolean;
  /** 任意其他能力标签 */
  [key: string]: boolean | undefined;
}

export interface LlmRequestOptions {
  modelId: string;
  messages: LlmMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  topK?: number;
  stop?: string | string[];
  
  // 回调
  onStream?: (chunk: string) => void;
  onReasoningStream?: (chunk: string) => void;
  
  // 控制
  signal?: AbortSignal;
  timeout?: number;
  
  // 扩展参数
  [key: string]: any;
}