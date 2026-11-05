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

import type { LlmProfile } from "../../types/llm-profiles";
import type {
  LlmRequestOptions,
  LlmResponse,
  MediaGenerationOptions,
} from "../types";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
} from "../embedding-types";
import type {
  TranscriptionRequestOptions,
  TranscriptionResponse,
} from "../transcription-types";
/**
 * 统一适配器接口
 */
export interface LlmAdapter {
  /**
   * 文本对话/流式处理
   */
  chat(profile: LlmProfile, options: LlmRequestOptions): Promise<LlmResponse>;

  /**
   * 向量嵌入 (可选)
   */
  embedding?(
    profile: LlmProfile,
    options: EmbeddingRequestOptions
  ): Promise<EmbeddingResponse>;

  /**
   * 图片生成
   */
  image?(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse>;

  /**
   * 音频生成 (TTS)
   */
  audio?(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse>;

  /**
   * 语音转写 (ASR/STT) (可选)
   * 走 OpenAI 兼容的 /v1/audio/transcriptions (Whisper 风格) 专用端点
   */
  transcribe?(
    profile: LlmProfile,
    options: TranscriptionRequestOptions
  ): Promise<TranscriptionResponse>;

  /**
   * 视频生成
   */
  video?(
    profile: LlmProfile,
    options: MediaGenerationOptions
  ): Promise<LlmResponse>;
}
