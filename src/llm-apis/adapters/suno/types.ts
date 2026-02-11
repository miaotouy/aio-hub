/**
 * Suno 音乐生成适配器 - 类型定义
 *
 * Suno 没有官方 API，这些类型基于第三方代理实现（如 rixapi）的接口规范。
 * 参考文档: https://docs.rixapi.com/llms.txt
 */

// ===== 模型版本 =====

/** Suno 模型版本 */
export type SunoModelVersion =
  | "chirp-v3-5"
  | "chirp-v4"
  | "chirp-auk"
  | "chirp-bluejay"
  | "chirp-crow";

// ===== 提交请求 =====

/** 自定义模式请求 - 用户提供歌词和风格标签 */
export interface SunoCustomMusicRequest {
  /** 歌词 (必填) */
  prompt: string;
  /** 是否生成纯音乐 (必填) */
  make_instrumental: boolean;
  /** 模型版本，默认 chirp-v4 */
  mv?: SunoModelVersion;
  /** 歌曲标题 */
  title?: string;
  /**
   * 风格标签
   * - chirp-v3-5/chirp-v4: 最大 200 字符
   * - chirp-auk/chirp-bluejay/chirp-crow: 最大 1000 字符
   */
  tags?: string;
  /** 排除的风格标签 */
  negative_tags?: string;
  /** 任务 ID，对之前的任务再操作时必填 */
  task_id?: string;
  /** 歌曲延长时间（秒），续写时使用 */
  continue_at?: number;
  /** 需要续写的歌曲 ID */
  continue_clip_id?: string;
  /** 任务类型，续写时必填 "extend" */
  task?: "extend";
  /** 回调地址 */
  notify_hook?: string;
}

/** 灵感模式请求 - 用户只提供描述，由 AI 生成歌词 */
export interface SunoInspirationMusicRequest {
  /** 灵感模式提示词 (必填)，最大 200 字符 */
  gpt_description_prompt: string;
  /** 是否生成纯音乐 */
  make_instrumental?: boolean;
  /** 模型版本，默认 chirp-v4 */
  mv?: SunoModelVersion;
}

/** 音乐生成请求（联合类型） */
export type SunoMusicRequest = SunoCustomMusicRequest | SunoInspirationMusicRequest;

/** 歌词生成请求 */
export interface SunoLyricsRequest {
  /** 歌词主题/提示词 */
  prompt: string;
}

/** 拼接请求 - 合并 extend 后的片段 */
export interface SunoConcatRequest {
  /** extend 后的歌曲 ID */
  clip_id: string;
  /** 是否为填充模式 */
  is_infill?: boolean;
}

/** 标签扩写请求 */
export interface SunoTagsRequest {
  /** 原始标签 */
  original_tags: string;
}

/** 人声分离请求 */
export interface SunoVoxRequest {
  /** 人声起始时间（秒） */
  vocal_start_s?: number;
  /** 人声结束时间（秒） */
  vocal_end_s?: number;
}

// ===== 响应类型 =====

/** 通用提交响应 - 所有 submit 接口共用 */
export interface SunoSubmitResponse {
  code: string;
  message: string;
  /** 任务 ID */
  data: string;
}

/** 任务状态枚举 */
export type SunoTaskStatus =
  | "SUBMITTED"
  | "QUEUED"
  | "IN_PROGRESS"
  | "SUCCESS"
  | "FAILURE"
  | "UNKNOWN";

/** 任务查询响应 (GET /suno/fetch/{task_id}) */
export interface SunoFetchResponse {
  code: string;
  message: string;
  data: SunoTaskData;
}

/** 任务数据 */
export interface SunoTaskData {
  task_id: string;
  /** 任务动作类型，如 "MUSIC", "LYRICS" 等 */
  action: string;
  /** 任务状态 */
  status: SunoTaskStatus;
  /** 失败原因 */
  fail_reason: string;
  /** 提交时间 (Unix 时间戳) */
  submit_time: number;
  /** 开始处理时间 (Unix 时间戳) */
  start_time: number;
  /** 完成时间 (Unix 时间戳) */
  finish_time: number;
  /** 进度文本，如 "50%", "100%" */
  progress: string;
  /** 回调地址 */
  notify_hook: string;
  /** 任务结果数据，结构因 action 而异 */
  data: Record<string, any>;
}

/** 歌曲元数据 */
export interface SunoClipMetadata {
  /** 时长（秒） */
  duration: number;
  /** 歌词/提示词 */
  prompt: string;
  /** 风格标签 */
  tags: string;
  /** 生成类型 */
  type: string;
  /** 来源歌曲 ID（续写时） */
  stem_from_id: string;
}

/** 歌曲详情 (GET /suno/feed/{clip_id} 响应项) */
export interface SunoClipInfo {
  /** 歌曲 ID */
  id: string;
  /** 歌曲标题 */
  title: string;
  /** 歌曲状态 */
  status: string;
  /** 音频 URL (MP3) */
  audio_url: string;
  /** 视频 URL (MP4) */
  video_url: string;
  /** 封面图 URL */
  image_url: string;
  /** 大尺寸封面图 URL */
  image_large_url: string;
  /** 使用的模型名称 */
  model_name: string;
  /** 歌曲元数据 */
  metadata: SunoClipMetadata;
  /** 创建时间 (ISO 8601) */
  created_at: string;
  /** 播放次数 */
  play_count: number;
  /** 点赞数 */
  upvote_count: number;
  /** 是否公开 */
  is_public: boolean;
  /** 是否已点赞 */
  is_liked: boolean;
  /** 是否已删除 */
  is_trashed: boolean;
  /** 显示名称 */
  display_name: string;
  /** 用户句柄 */
  handle: string;
  /** 头像 URL */
  avatar_image_url: string;
  /** 主要模型版本 */
  major_model_version: string;
  /** 句柄是否已更新 */
  is_handle_updated: boolean;
}

/** 标签扩写响应 */
export interface SunoTagsResponse {
  /** 扩写后的标签描述 */
  upsampled_tags: string;
  /** 请求 ID */
  request_id: string;
}

/** 人声分离响应 */
export interface SunoVoxResponse {
  /** 分离任务 ID */
  id: string;
}

// ===== 客户端配置 =====

/** SunoClient 初始化配置 */
export interface SunoClientConfig {
  /** API 基础地址（渠道的 baseUrl） */
  baseUrl: string;
  /** API Key */
  apiKey: string;
  /** 请求超时（毫秒），默认 300000 (5分钟) */
  timeout?: number;
  /** 轮询间隔（毫秒），默认 5000 */
  pollInterval?: number;
  /** 最大轮询次数，默认 120（即 10 分钟） */
  maxPollAttempts?: number;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 自定义请求头 */
  customHeaders?: Record<string, string>;
  /** 是否强制走后端代理 */
  forceProxy?: boolean;
  /** 放宽证书校验 */
  relaxIdCerts?: boolean;
  /** 强制 HTTP/1.1 */
  http1Only?: boolean;
}

// ===== 高级结果类型 =====

/** 音乐生成完整结果 */
export interface SunoMusicResult {
  /** 任务 ID */
  taskId: string;
  /** 生成的歌曲列表（通常为 2 首） */
  clips: SunoClipInfo[];
  /** 最终任务状态 */
  status: SunoTaskStatus;
  /** 失败原因（仅当 status 为 FAILURE 时） */
  failReason?: string;
}

/** 歌词生成结果 */
export interface SunoLyricsResult {
  /** 任务 ID */
  taskId: string;
  /** 生成的歌词标题 */
  title: string;
  /** 生成的歌词文本 */
  text: string;
  /** 最终任务状态 */
  status: SunoTaskStatus;
}

/** 进度回调参数 */
export interface SunoProgress {
  /** 当前任务状态 */
  status: SunoTaskStatus;
  /** 进度文本（如 "50%"） */
  progressText: string;
  /** 进度百分比 (0-100) */
  percentage: number;
}

/** 进度回调函数类型 */
export type SunoProgressCallback = (progress: SunoProgress) => void;