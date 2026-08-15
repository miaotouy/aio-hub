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
 * Moonshot 预设模板
 */

import type { LlmPreset } from "../types";

// Moonshot (月之暗面 Kimi)
export const moonshotPreset: LlmPreset = {
  type: "openai",
  name: "Moonshot",
  description: "月之暗面 Kimi API",
  defaultBaseUrl: "https://api.moonshot.cn",
  logoUrl: "/model-icons/moonshot.svg",
  links: [
    { label: "官网", url: "https://www.moonshot.cn" },
    { label: "控制台", url: "https://platform.moonshot.cn/console" },
    { label: "API 文档", url: "https://platform.moonshot.cn/docs" },
    { label: "计费说明", url: "https://platform.moonshot.cn/pricing" },
  ],
  defaultModels: [
    {
      id: "kimi-k2-instruct",
      name: "Kimi K2 Instruct",
      group: "Kimi K2",
      provider: "moonshot",
      description: "1T参数MoE，256K上下文，编码/代理顶级",
    },
    {
      id: "kimi-k2-turbo-preview",
      name: "Kimi K2 Turbo Preview",
      group: "Kimi K2",
      provider: "moonshot",
      description: "Turbo优化，50%折扣期内高效版",
    },
    {
      id: "kimi-k2-0905",
      name: "Kimi K2 0905",
      group: "Kimi K2",
      provider: "moonshot",
      description: "开源权重，高级编码/工具集成（2025-09-05）",
    },
    {
      id: "moonshot-v1-128k",
      name: "Moonshot V1 128K",
      group: "Moonshot V1",
      provider: "moonshot",
    },
    {
      id: "moonshot-v1-32k",
      name: "Moonshot V1 32K",
      group: "Moonshot V1",
      provider: "moonshot",
    },
  ],
};
