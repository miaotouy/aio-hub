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

/**
 * 语音转写 (ASR/STT) 请求类型
 * 走 OpenAI 兼容的 /v1/audio/transcriptions (Whisper 风格) 专用端点
 */

/**
 * 转写音频数据源
 */
export type TranscriptionAudioSource =
  | {
      /** 内联 Base64 (支持 data:audio/...;base64, 前缀) */
      kind: "base64";
      data: string;
      mediaType?: string;
      filename?: string;
    }
  | {
      /** 二进制字节 */
      kind: "bytes";
      data: Uint8Array;
      mediaType?: string;
      filename?: string;
    }
  | {
      /** 服务端本地文件路径 (走 Rust 代理 multipart 读取) */
      kind: "local-file";
      path: string;
      mediaType?: string;
      filename?: string;
    };

/**
 * 转写请求选项
 */
export interface TranscriptionRequestOptions {
  /** 模型 ID */
  modelId: string;
  /** 待转写的音频 */
  audio: TranscriptionAudioSource;
  /** 输入语言提示 (可选) */
  language?: string;
  /** 引导提示词 (可选) */
  prompt?: string;
  /** 采样温度 (可选) */
  temperature?: number;
  /** 是否包含本地文件引用，为 true 时强制走 Rust 代理 */
  hasLocalFile?: boolean;
  /** 请求超时时间 (毫秒) */
  timeout?: number;
  /** AbortSignal */
  signal?: AbortSignal;
  /** 请求 ID */
  requestId?: string;
  /** 是否允许绕过 profile 启用状态检查 */
  allowDisabledProfile?: boolean;
  /** 网络策略 */
  networkStrategy?: "auto" | "proxy" | "native";
  /** 是否强制走后端代理 */
  forceProxy?: boolean;
  /** 放宽证书校验 */
  relaxIdCerts?: boolean;
  /** 强制 HTTP/1.1 */
  http1Only?: boolean;
  /** 共享 Transport 观察器 */
  transportObserver?: import("@aiohub/llm-core").TransportObserver;
}

/**
 * 转写响应
 */
export interface TranscriptionResponse {
  /** 转写文本 */
  text: string;
  /** 检测到的语言 (可选) */
  language?: string;
  /** 音频时长 (秒，可选) */
  duration?: number;
  /** 分段结果 (verbose_json 时可选) */
  segments?: Array<{
    id?: number;
    start?: number;
    end?: number;
    text: string;
  }>;
}
