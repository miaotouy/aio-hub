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
 * MiniMax Music 预设模板
 */

import type { LlmPreset } from "../types";

export const minimaxMusicPreset: LlmPreset = {
  type: "minimax-music",
  name: "MiniMax Music",
  description: "MiniMax 官方音乐生成 API",
  defaultBaseUrl: "https://api.minimaxi.com",
  logoUrl: "/model-icons/minimax-color.svg",
  links: [
    { label: "官网", url: "https://www.minimaxi.com" },
    { label: "控制台", url: "https://platform.minimaxi.com" },
    {
      label: "音乐 API 文档",
      url: "https://platform.minimaxi.com/docs/api-reference/music-generation",
    },
  ],
  defaultModels: [
    {
      id: "music-2.6",
      name: "Music 2.6",
      group: "MiniMax Music",
      provider: "minimax-music",
      capabilities: { musicGeneration: true, audio: true },
      description: "MiniMax 文生音乐模型，支持歌词、纯音乐和歌词优化。",
    },
    {
      id: "music-cover",
      name: "Music Cover",
      group: "MiniMax Music",
      provider: "minimax-music",
      capabilities: { musicGeneration: true, audio: true },
      description: "MiniMax 翻唱模型，支持参考音频 URL 或音频附件。",
    },
    {
      id: "music-2.6-free",
      name: "Music 2.6 Free",
      group: "MiniMax Music",
      provider: "minimax-music",
      capabilities: { musicGeneration: true, audio: true },
      description: "MiniMax music-2.6 限免版本，RPM 较低。",
    },
    {
      id: "music-cover-free",
      name: "Music Cover Free",
      group: "MiniMax Music",
      provider: "minimax-music",
      capabilities: { musicGeneration: true, audio: true },
      description: "MiniMax music-cover 限免版本，RPM 较低。",
    },
  ],
};
