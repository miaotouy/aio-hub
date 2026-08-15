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
 * 百川智能 预设模板
 */

import type { LlmPreset } from "../types";

// 百川智能
export const baichuanPreset: LlmPreset = {
  type: "openai",
  name: "百川智能",
  description: "百川智能 API",
  defaultBaseUrl: "https://api.baichuan-ai.com",
  logoUrl: "/model-icons/baichuan-color.svg",
  defaultModels: [
    {
      id: "baichuan4",
      name: "Baichuan 4",
      group: "Baichuan",
      provider: "baichuan",
      capabilities: { toolUse: true },
      description: "旗舰模型，128K上下文",
    },
    {
      id: "baichuan-omni",
      name: "Baichuan-Omni",
      group: "Baichuan",
      provider: "baichuan",
      capabilities: { vision: true },
      description: "7B多模态模型，支持图像/视频/音频/文本（2024-10-18）",
    },
    {
      id: "baichuan3-turbo",
      name: "Baichuan 3 Turbo",
      group: "Baichuan",
      provider: "baichuan",
      description: "高速版本，32K上下文",
    },
  ],
};
