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
      id: "kimi-k3",
      name: "Kimi K3",
      group: "Kimi K3",
      provider: "moonshot",
      capabilities: { toolUse: true },
      description: "新一代旗舰，编码/代理能力顶级",
    },
    {
      id: "kimi-k2.7-code",
      name: "Kimi K2.7 Code",
      group: "Kimi K2",
      provider: "moonshot",
      capabilities: { toolUse: true },
      description: "代码专用，工具集成增强",
    },
    {
      id: "kimi-k2.6",
      name: "Kimi K2.6",
      group: "Kimi K2",
      provider: "moonshot",
      capabilities: { toolUse: true },
      description: "主力版本，1T 参数 MoE，256K 上下文",
    },
    {
      id: "kimi-k2-0905",
      name: "Kimi K2 0905",
      group: "Kimi K2",
      provider: "moonshot",
      description: "开源权重，高级编码/工具集成（2025-09-05）",
    },
  ],
};
