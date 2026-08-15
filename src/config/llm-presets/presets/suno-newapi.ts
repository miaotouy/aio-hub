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
 * Suno (NewAPI) 预设模板
 */

import type { LlmPreset } from "../types";

// Suno (NewAPI)
export const sunoNewapiPreset: LlmPreset = {
  type: "openai",
  name: "Suno (NewAPI)",
  description: "通过 NewAPI 访问的 Suno 音乐生成服务",
  defaultBaseUrl: "https://api.example.com",
  logoUrl: "/model-icons/suno.svg",
  links: [
    { label: "Suno 官网", url: "https://suno.com" },
    { label: "API 项目", url: "https://github.com/Suno-API/Suno-API" },
    {
      label: "Suno API文档",
      url: "https://github.com/Suno-API/Suno-API/blob/main/README_ZH.md",
    },
    {
      label: "API 文档 (NewAPI)",
      url: "https://github.com/Suno-API/Suno-API/blob/main/Suno.md",
    },
  ],
  defaultModels: [
    {
      id: "suno_music",
      name: "Suno Music",
      group: "Suno",
      provider: "suno",
      description: "音乐生成 (支持自定义/灵感模式)",
    },
    {
      id: "suno_lyrics",
      name: "Suno Lyrics",
      group: "Suno",
      provider: "suno",
      description: "歌词生成",
    },
    {
      id: "suno_uploads",
      name: "Suno Uploads",
      group: "Suno",
      provider: "suno",
      description: "音频上传",
    },
    {
      id: "suno_concat",
      name: "Suno Concat",
      group: "Suno",
      provider: "suno",
      description: "歌曲合并",
    },
    {
      id: "suno_act_mp4",
      name: "Suno MP4",
      group: "Suno Action",
      provider: "suno",
      description: "生成视频",
    },
    {
      id: "suno_act_stems",
      name: "Suno Stems",
      group: "Suno Action",
      provider: "suno",
      description: "分离音轨",
    },
    {
      id: "suno_act_timing",
      name: "Suno Timing",
      group: "Suno Action",
      provider: "suno",
      description: "歌词时间戳",
    },
    {
      id: "suno_act_wav",
      name: "Suno WAV",
      group: "Suno Action",
      provider: "suno",
      description: "无损音频",
    },
    {
      id: "suno_persona_create",
      name: "Suno Persona",
      group: "Suno Persona",
      provider: "suno",
      description: "创建角色",
    },
  ],
};
