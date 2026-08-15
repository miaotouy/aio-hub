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
 * SiliconFlow 预设模板
 */

import type { LlmPreset } from "../types";

// SiliconFlow
export const siliconflowPreset: LlmPreset = {
  type: "siliconflow",
  name: "SiliconFlow",
  description: "硅基流动 - 高性价比 AI 推理服务",
  defaultBaseUrl: "https://api.siliconflow.cn/v1",
  logoUrl: "/model-icons/siliconcloud-color.svg",
  links: [
    { label: "控制台", url: "https://cloud.siliconflow.cn" },
    { label: "API 文档", url: "https://docs.siliconflow.cn" },
    { label: "价格页", url: "https://siliconflow.cn/zh-cn/pricing" },
  ],
  customEndpoints: {
    models: "https://aiping.cn/api/v1/models",
  },
  defaultModels: [
    {
      id: "deepseek-ai/DeepSeek-V3.2-Exp",
      name: "DeepSeek V3.2-Exp",
      group: "DeepSeek",
      provider: "siliconflow",
      description: "极致性价比，685B MoE（2025-09-29）",
    },
    {
      id: "Qwen/Qwen2.5-72B-Instruct",
      name: "Qwen 2.5 72B Instruct",
      group: "Qwen",
      provider: "siliconflow",
      description: "阿里千问开源旗舰",
    },
    {
      id: "meta-llama/Llama-3.3-70B-Instruct",
      name: "Llama 3.3 70B Instruct",
      group: "Llama",
      provider: "siliconflow",
      description: "Meta 开源大模型",
    },
    {
      id: "qwen/qwen3-vl-235b-instruct",
      name: "Qwen3-VL-235B-Instruct",
      group: "Qwen3",
      provider: "siliconflow",
      capabilities: { vision: true },
      description: "235B参数视觉模型（2025-10-14）",
    },
  ],
};
