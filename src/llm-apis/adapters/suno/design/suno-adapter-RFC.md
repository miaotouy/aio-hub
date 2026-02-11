# Suno 音乐生成适配器 RFC

> **状态**: RFC (Request for Comments)
> **作者**: 咕咕 (Kilo)
> **日期**: 2026-02-10

## 1. 背景与目标

Suno 是当前最流行的 AI 音乐生成平台，但没有官方 API。市面上存在多个第三方代理实现（如 rixapi、suno-api 等），它们提供了一套统一的 REST API 端点。

本 RFC 旨在将 Suno 音乐生成能力集成到 AIO Hub 的 `src/llm-apis` 基础设施层中，作为一个**独立的端点类别**——不绑定到特定的 `ProviderType`，而是任何渠道（如 OpenAI 兼容渠道）只要配置了支持 Suno 端点的 baseUrl，就可以使用 Suno 的音乐生成能力。

## 2. API 端点汇总

基于 [rixapi 文档](https://docs.rixapi.com/llms.txt) 整理的完整端点列表：

### 2.1. 提交类 (Submit)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/suno/submit/music` | POST | 提交音乐生成任务（自定义模式/灵感模式） |
| `/suno/submit/lyrics` | POST | 提交歌词生成任务 |
| `/suno/submit/concat` | POST | 提交拼接任务（合并 extend 后的片段） |

### 2.2. 查询类 (Fetch/Feed)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/suno/fetch/{task_id}` | GET | 查询任务状态与进度 |
| `/suno/feed/{clip_id}` | GET | 获取歌曲详细信息（audio_url, video_url 等） |

### 2.3. 操作类 (Act)

| 端点 | 方法 | 说明 |
|------|------|------|
| `/suno/act/tags` | POST | 风格标签扩写/建议 |
| `/suno/act/vox/{clip_id}` | POST | 人声分离 |
| `/suno/act/midi` | GET | 获取 MIDI 文件 |
| `/suno/act/mp4` | GET | 获取 MP4 视频 |
| `/suno/act/timing` | GET | 获取时间轴数据 |
| `/suno/act/wav` | GET | 获取 WAV 音频 |

### 2.4. 其他

| 端点 | 方法 | 说明 |
|------|------|------|
| `/suno/persona/create` | POST | 创建人设/声音角色 |

## 3. 核心 API 详解

### 3.1. POST /suno/submit/music

支持两种模式：

**自定义模式** (Custom Mode):
```json
{
  "prompt": "[Verse]\nWalking down the streets...",
  "make_instrumental": false,
  "mv": "chirp-v4",
  "title": "City Lights",
  "tags": "emotional punk",
  "negative_tags": "",
  "task_id": "",
  "continue_at": 0,
  "continue_clip_id": "",
  "task": "extend",
  "notify_hook": ""
}
```
- `prompt` + `make_instrumental` 为必填
- `mv` 可选值: `chirp-v3-5`, `chirp-v4`, `chirp-auk`, `chirp-bluejay`, `chirp-crow`
- `chirp-v3-5`/`chirp-v4`: prompt 3000字符, tags 200字符
- `chirp-auk`/`chirp-bluejay`/`chirp-crow`: prompt 5000字符, tags 1000字符

**灵感模式** (Inspiration Mode):
```json
{
  "gpt_description_prompt": "A happy pop song about summer",
  "make_instrumental": false,
  "mv": "chirp-v4"
}
```
- `gpt_description_prompt` 为必填，最大 200 字符

**响应**:
```json
{
  "code": "success",
  "message": "",
  "data": "736a6f88-bd29-4b1e-b110-37132a5325ac"
}
```
`data` 字段为任务 ID。

### 3.2. GET /suno/fetch/{task_id}

查询任务状态：

**响应**:
```json
{
  "code": "success",
  "message": "",
  "data": {
    "task_id": "736a6f88-...",
    "action": "MUSIC",
    "status": "SUCCESS",
    "fail_reason": "",
    "submit_time": 1700000000,
    "start_time": 1700000001,
    "finish_time": 1700000060,
    "progress": "100%",
    "notify_hook": "",
    "data": {
      "id": "clip-uuid",
      "text": "[Verse]\nWalking down...",
      "title": "City Lights",
      "status": "complete"
    }
  }
}
```
- `status` 可能的值: `SUBMITTED`, `QUEUED`, `IN_PROGRESS`, `SUCCESS`, `FAILURE`
- `data.data` 包含生成结果的基本信息

### 3.3. GET /suno/feed/{clip_id}

获取歌曲完整详情（包含媒体 URL）：

**响应** (数组):
```json
[
  {
    "id": "clip-uuid",
    "title": "City Lights",
    "status": "complete",
    "audio_url": "https://cdn.suno.ai/xxx.mp3",
    "video_url": "https://cdn.suno.ai/xxx.mp4",
    "image_url": "https://cdn.suno.ai/xxx.jpeg",
    "image_large_url": "https://cdn.suno.ai/xxx_large.jpeg",
    "model_name": "chirp-v4",
    "metadata": {
      "duration": 180.5,
      "prompt": "[Verse]\nWalking down...",
      "tags": "emotional punk",
      "type": "gen",
      "stem_from_id": ""
    },
    "created_at": "2026-02-10T12:00:00Z",
    "play_count": 0,
    "upvote_count": 0,
    "is_public": false,
    "is_liked": false,
    "is_trashed": false,
    "display_name": "",
    "handle": "",
    "avatar_image_url": "",
    "major_model_version": "v4",
    "is_handle_updated": false
  }
]
```

### 3.4. POST /suno/submit/lyrics

提交歌词生成：
```json
{ "prompt": "dance" }
```
响应同 submit/music，返回任务 ID。通过 fetch 查询结果。

### 3.5. POST /suno/act/tags

风格标签扩写：
```json
{ "original_tags": "student" }
```
**响应**:
```json
{
  "upsampled_tags": "Laid-back indie pop driven by a clean guitar riff...",
  "request_id": "xxx"
}
```

### 3.6. POST /suno/act/vox/{clip_id}

人声分离：
```json
{
  "vocal_start_s": 18,
  "vocal_end_s": 30
}
```
**响应**:
```json
{ "id": "507acd16-..." }
```

### 3.7. POST /suno/submit/concat

拼接续写片段：
```json
{
  "clip_id": "extend-clip-id",
  "is_infill": false
}
```

## 4. 架构设计

### 4.1. 设计原则

1. **独立端点类别**: Suno 不是一个 `ProviderType`，而是一组独立的 API 端点。任何渠道都可以通过 `baseUrl + apiKey` 调用 Suno 端点。
2. **不侵入 LlmAdapter**: Suno 的 API 结构与标准 LLM API 差异巨大（异步任务模式、非 OpenAI 兼容），不适合强行塞入 `LlmAdapter.audio()` 接口。
3. **独立客户端**: 提供 `SunoClient` 类，封装所有 Suno API 调用，包括任务提交、轮询、结果获取。
4. **可被上层复用**: `media-generator` 工具和 `llm-chat` 工具都可以通过 `SunoClient` 发起音乐生成。

### 4.2. 文件结构

```
src/llm-apis/adapters/suno/
├── index.ts              # 导出 SunoClient 和类型
├── types.ts              # Suno 专用类型定义
├── client.ts             # SunoClient 核心实现
├── music.ts              # 音乐生成（submit/music + 轮询）
├── lyrics.ts             # 歌词生成（submit/lyrics + 轮询）
├── utils.ts              # URL 构建、请求头构建等工具函数
└── design/
    └── suno-adapter-RFC.md  # 本文档
```

### 4.3. 类型定义 (`types.ts`)

```typescript
// ===== 模型版本 =====
export type SunoModelVersion =
  | "chirp-v3-5"
  | "chirp-v4"
  | "chirp-auk"
  | "chirp-bluejay"
  | "chirp-crow";

// ===== 提交请求 =====

/** 自定义模式请求 */
export interface SunoCustomMusicRequest {
  prompt: string;
  make_instrumental: boolean;
  mv?: SunoModelVersion;
  title?: string;
  tags?: string;
  negative_tags?: string;
  task_id?: string;
  continue_at?: number;
  continue_clip_id?: string;
  task?: "extend";
  notify_hook?: string;
}

/** 灵感模式请求 */
export interface SunoInspirationMusicRequest {
  gpt_description_prompt: string;
  make_instrumental?: boolean;
  mv?: SunoModelVersion;
}

/** 音乐生成请求（联合类型） */
export type SunoMusicRequest = SunoCustomMusicRequest | SunoInspirationMusicRequest;

/** 歌词生成请求 */
export interface SunoLyricsRequest {
  prompt: string;
}

/** 拼接请求 */
export interface SunoConcatRequest {
  clip_id: string;
  is_infill?: boolean;
}

/** 标签扩写请求 */
export interface SunoTagsRequest {
  original_tags: string;
}

/** 人声分离请求 */
export interface SunoVoxRequest {
  vocal_start_s?: number;
  vocal_end_s?: number;
}

// ===== 响应类型 =====

/** 通用提交响应 */
export interface SunoSubmitResponse {
  code: string;
  message: string;
  data: string; // task_id
}

/** 任务状态 */
export type SunoTaskStatus =
  | "SUBMITTED"
  | "QUEUED"
  | "IN_PROGRESS"
  | "SUCCESS"
  | "FAILURE"
  | "UNKNOWN";

/** 任务查询响应 */
export interface SunoFetchResponse {
  code: string;
  message: string;
  data: {
    task_id: string;
    action: string;
    status: SunoTaskStatus;
    fail_reason: string;
    submit_time: number;
    start_time: number;
    finish_time: number;
    progress: string;
    notify_hook: string;
    data: Record<string, any>; // 任务结果数据，结构因 action 而异
  };
}

/** 歌曲元数据 */
export interface SunoClipMetadata {
  duration: number;
  prompt: string;
  tags: string;
  type: string;
  stem_from_id: string;
}

/** 歌曲详情（feed 响应） */
export interface SunoClipInfo {
  id: string;
  title: string;
  status: string;
  audio_url: string;
  video_url: string;
  image_url: string;
  image_large_url: string;
  model_name: string;
  metadata: SunoClipMetadata;
  created_at: string;
  play_count: number;
  upvote_count: number;
  is_public: boolean;
  is_liked: boolean;
  is_trashed: boolean;
  display_name: string;
  handle: string;
  avatar_image_url: string;
  major_model_version: string;
  is_handle_updated: boolean;
}

/** 标签扩写响应 */
export interface SunoTagsResponse {
  upsampled_tags: string;
  request_id: string;
}

/** 人声分离响应 */
export interface SunoVoxResponse {
  id: string;
}

// ===== 客户端配置 =====

/** SunoClient 初始化配置 */
export interface SunoClientConfig {
  /** API 基础地址（渠道的 baseUrl） */
  baseUrl: string;
  /** API Key */
  apiKey: string;
  /** 请求超时（毫秒），默认 300000 (5分钟，音乐生成较慢) */
  timeout?: number;
  /** 轮询间隔（毫秒），默认 5000 */
  pollInterval?: number;
  /** 最大轮询次数，默认 120（即 10 分钟） */
  maxPollAttempts?: number;
  /** 中止信号 */
  signal?: AbortSignal;
  /** 自定义请求头 */
  customHeaders?: Record<string, string>;
  /** 网络策略 */
  forceProxy?: boolean;
  relaxIdCerts?: boolean;
  http1Only?: boolean;
}

/** 音乐生成完整结果 */
export interface SunoMusicResult {
  taskId: string;
  clips: SunoClipInfo[];
  status: SunoTaskStatus;
  failReason?: string;
}

/** 歌词生成结果 */
export interface SunoLyricsResult {
  taskId: string;
  title: string;
  text: string;
  status: SunoTaskStatus;
}

/** 进度回调 */
export type SunoProgressCallback = (progress: {
  status: SunoTaskStatus;
  progressText: string;
  percentage: number;
}) => void;
```

### 4.4. SunoClient 核心实现 (`client.ts`)

```typescript
export class SunoClient {
  private config: Required<SunoClientConfig>;

  constructor(config: SunoClientConfig) { /* ... */ }

  // ===== 核心方法 =====

  /** 提交音乐生成并轮询至完成 */
  async generateMusic(
    request: SunoMusicRequest,
    onProgress?: SunoProgressCallback
  ): Promise<SunoMusicResult>;

  /** 提交歌词生成并轮询至完成 */
  async generateLyrics(
    request: SunoLyricsRequest,
    onProgress?: SunoProgressCallback
  ): Promise<SunoLyricsResult>;

  /** 提交拼接任务并轮询至完成 */
  async concat(
    request: SunoConcatRequest,
    onProgress?: SunoProgressCallback
  ): Promise<SunoMusicResult>;

  // ===== 低级方法 =====

  /** 仅提交音乐生成任务（不轮询） */
  async submitMusic(request: SunoMusicRequest): Promise<string>;

  /** 仅提交歌词生成任务（不轮询） */
  async submitLyrics(request: SunoLyricsRequest): Promise<string>;

  /** 查询任务状态 */
  async fetchTask(taskId: string): Promise<SunoFetchResponse>;

  /** 获取歌曲详情 */
  async getClipInfo(clipId: string): Promise<SunoClipInfo[]>;

  /** 风格标签扩写 */
  async upsampleTags(request: SunoTagsRequest): Promise<SunoTagsResponse>;

  /** 人声分离 */
  async separateVocals(clipId: string, request?: SunoVoxRequest): Promise<SunoVoxResponse>;

  // ===== 内部方法 =====

  /** 轮询任务直到完成 */
  private async pollUntilDone(
    taskId: string,
    onProgress?: SunoProgressCallback
  ): Promise<SunoFetchResponse>;

  /** 构建请求 URL */
  private buildUrl(path: string): string;

  /** 发送请求 */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: any
  ): Promise<T>;
}
```

### 4.5. 与 LlmAdapter 的桥接

虽然 `SunoClient` 是独立的，但为了让 `useLlmRequest` 能够路由到 Suno（当模型标记了 `musicGeneration: true` 时），我们需要提供一个桥接函数：

```typescript
// src/llm-apis/adapters/suno/index.ts

import type { LlmProfile } from "@/types/llm-profiles";
import type { MediaGenerationOptions, LlmResponse } from "@/llm-apis/common";
import { SunoClient } from "./client";

/**
 * 桥接函数：将 LlmAdapter.audio() 的调用转发给 SunoClient
 * 用于 media-generator 等上层工具通过统一接口调用 Suno
 */
export async function callSunoMusicApi(
  profile: LlmProfile,
  options: MediaGenerationOptions
): Promise<LlmResponse> {
  const client = new SunoClient({
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKeys[0], // TODO: 支持 key 轮询
    signal: options.signal,
    timeout: options.timeout,
    customHeaders: profile.customHeaders,
    forceProxy: options.forceProxy,
    relaxIdCerts: profile.relaxIdCerts,
    http1Only: profile.http1Only,
  });

  const result = await client.generateMusic({
    prompt: options.prompt || "",
    make_instrumental: false,
    mv: (options.modelId as SunoModelVersion) || "chirp-v4",
    tags: options.style,
    title: "", // 从 options 中提取或留空
  });

  return {
    content: `Music generated: ${result.clips.map(c => c.title).join(", ")}`,
    audios: result.clips.map(clip => ({
      url: clip.audio_url,
      format: "mp3",
      duration: clip.metadata.duration,
    })),
    videos: result.clips.map(clip => ({
      url: clip.video_url,
      status: "completed" as const,
      thumbnailUrl: clip.image_url,
    })),
  };
}

export { SunoClient } from "./client";
export type * from "./types";
```

### 4.6. LlmProfile 扩展

在 `customEndpoints` 中添加 Suno 相关端点配置（可选，用于自定义路径）：

```typescript
// 在 LlmProfile.customEndpoints 中新增：
customEndpoints?: {
  // ... 现有端点 ...

  /** Suno 音乐生成端点，默认 '/suno/submit/music' */
  sunoMusic?: string;
  /** Suno 歌词生成端点，默认 '/suno/submit/lyrics' */
  sunoLyrics?: string;
  /** Suno 任务查询端点，默认 '/suno/fetch' */
  sunoFetch?: string;
  /** Suno 歌曲详情端点，默认 '/suno/feed' */
  sunoFeed?: string;
};
```

## 5. 使用方式

### 5.1. 直接使用 SunoClient

```typescript
import { SunoClient } from "@/llm-apis/adapters/suno";

const client = new SunoClient({
  baseUrl: "https://proxy.innk.cc",
  apiKey: "sk-xxx",
});

// 自定义模式
const result = await client.generateMusic(
  {
    prompt: "[Verse]\nWalking down the streets...",
    make_instrumental: false,
    mv: "chirp-v4",
    title: "City Lights",
    tags: "emotional punk",
  },
  (progress) => {
    console.log(`${progress.status}: ${progress.progressText}`);
  }
);

console.log(result.clips[0].audio_url);
```

### 5.2. 灵感模式

```typescript
const result = await client.generateMusic(
  {
    gpt_description_prompt: "A happy pop song about summer vacation",
    make_instrumental: false,
    mv: "chirp-v4",
  },
  (progress) => console.log(progress)
);
```

### 5.3. 歌词生成

```typescript
const lyrics = await client.generateLyrics({ prompt: "love story in Tokyo" });
console.log(lyrics.title, lyrics.text);
```

### 5.4. 风格标签扩写

```typescript
const tags = await client.upsampleTags({ original_tags: "rock ballad" });
console.log(tags.upsampled_tags);
// => "Emotional rock ballad with soaring electric guitar..."
```

### 5.5. 通过 LlmAdapter 桥接调用

```typescript
import { useLlmRequest } from "@/composables/useLlmRequest";

const { sendRequest } = useLlmRequest();

const response = await sendRequest({
  profileId: "my-suno-profile",
  modelId: "chirp-v4",
  prompt: "A dreamy lo-fi beat for studying",
  // musicGeneration capability 会自动路由到 Suno 适配器
});

if (response.audios?.length) {
  playAudio(response.audios[0].url);
}
```

## 6. 轮询策略

音乐生成是异步过程，通常需要 30 秒到 5 分钟不等。轮询策略：

1. **初始间隔**: 5 秒
2. **最大轮询次数**: 120 次（10 分钟上限）
3. **终止条件**: `status` 为 `SUCCESS` 或 `FAILURE`
4. **取消支持**: 通过 `AbortSignal` 随时取消轮询
5. **进度回调**: 每次轮询后调用 `onProgress` 回调，上报当前状态和进度百分比

```
提交任务 → 轮询 fetch/{task_id} → SUCCESS → 获取 feed/{clip_id} → 返回完整结果
                    ↓
                  FAILURE → 抛出错误（包含 fail_reason）
```

## 7. 实施计划

### Phase 1: 核心客户端 (本次)

- [x] 设计文档 (本 RFC)
- [ ] `types.ts` - 类型定义
- [ ] `utils.ts` - URL 构建、请求工具
- [ ] `client.ts` - SunoClient 实现
- [ ] `music.ts` - 音乐生成逻辑（提交 + 轮询 + feed 获取）
- [ ] `lyrics.ts` - 歌词生成逻辑
- [ ] `index.ts` - 导出 + LlmAdapter 桥接

### Phase 2: 集成与 UI (后续)

- [ ] 在 `LlmProfile.customEndpoints` 中添加 Suno 端点配置
- [ ] 在 `useLlmRequest` 中添加 `musicGeneration` 路由逻辑
- [ ] 在 `media-generator` 工具中集成 Suno 音乐生成 UI
- [ ] 音乐播放器组件（复用 `AudioPlayer`）

### Phase 3: 高级功能 (远期)

- [ ] 续写 (extend) 支持
- [ ] 拼接 (concat) 支持
- [ ] 人声分离 (vox) 支持
- [ ] 声音角色 (persona) 支持
- [ ] MIDI/WAV 导出

---

_文档版本: 1.0 | 更新日期: 2026-02-10 | 更新者: 咕咕 (Kilo)_