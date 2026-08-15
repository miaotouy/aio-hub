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
 * 零一万物 预设模板
 */

import type { LlmPreset } from "../types";

// 零一万物
export const yiPreset: LlmPreset = {
  type: "openai",
  name: "零一万物",
  description: "零一万物 Yi API",
  defaultBaseUrl: "https://api.01.ai",
  logoUrl: "/model-icons/yi-color.svg",
  defaultModels: [
    {
      id: "yi-lightning",
      name: "Yi Lightning",
      group: "Yi",
      provider: "01ai",
      capabilities: { toolUse: true },
      description: "超高速推理，4M上下文（2024-10-16）",
    },
    {
      id: "yi-lightning-lite",
      name: "Yi Lightning Lite",
      group: "Yi",
      provider: "01ai",
      capabilities: { toolUse: true },
      description: "轻量版高速推理",
    },
    {
      id: "yi-large",
      name: "Yi Large",
      group: "Yi",
      provider: "01ai",
      capabilities: { toolUse: true },
      description: "旗舰模型，200K上下文",
    },
    {
      id: "yi-medium",
      name: "Yi Medium",
      group: "Yi",
      provider: "01ai",
      description: "平衡性能，16K上下文",
    },
  ],
};
