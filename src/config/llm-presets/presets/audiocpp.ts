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
 * audio.cpp 预设模板
 * 本地 audio.cpp 音频推理服务 (OpenAI 兼容 TTS/ASR 端点)
 */

import type { LlmPreset } from "../types";

export const audiocppPreset: LlmPreset = {
  type: "audiocpp",
  name: "audio.cpp",
  description: "本地 audio.cpp 音频推理服务 (TTS/ASR/音乐生成)",
  defaultBaseUrl: "http://127.0.0.1:8080",
  logoUrl: "/model-icons/audiocpp.svg",
  links: [
    { label: "GitHub", url: "https://github.com/0xShug0/audio.cpp" },
    {
      label: "Server 文档",
      url: "https://github.com/0xShug0/audio.cpp/tree/main/app/server",
    },
  ],
};
