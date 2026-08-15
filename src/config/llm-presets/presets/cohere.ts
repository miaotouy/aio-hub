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
 * Cohere 预设模板
 */

import type { LlmPreset } from "../types";

// Cohere
export const coherePreset: LlmPreset = {
  type: "cohere",
  name: "Cohere",
  description: "Cohere API v2 - 企业级大语言模型服务",
  defaultBaseUrl: "https://api.cohere.com",
  logoUrl: "/model-icons/cohere-color.svg",
  links: [
    { label: "官网", url: "https://cohere.com/" },
    { label: "控制台", url: "https://dashboard.cohere.com/" },
    { label: "API 文档", url: "https://docs.cohere.com/" },
    { label: "计费说明", url: "https://cohere.com/pricing" },
  ],
  defaultModels: [
    {
      id: "command-a-reasoning",
      name: "Command A Reasoning",
      group: "Command A",
      provider: "cohere",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "budget", // 支持预算配置
      },
      description: "企业推理旗舰，复杂 logic 分析，256K上下文（2025-08-22）",
    },
    {
      id: "command-a-vision",
      name: "Command A Vision",
      group: "Command A",
      provider: "cohere",
      capabilities: { vision: true, toolUse: true },
      description: "多模态视觉模型，图像理解与分析专家（2025-08-01）",
    },
    {
      id: "command-a-translate",
      name: "Command A Translate",
      group: "Command A",
      provider: "cohere",
      capabilities: { toolUse: true },
      description: "专业翻译模型，100+语言支持，企业级精准度（2025-08-28）",
    },
    {
      id: "command-a-code",
      name: "Command A Code",
      group: "Command A",
      provider: "cohere",
      capabilities: { toolUse: true },
      description: "代码生成专用模型，40+编程语言覆盖",
    },
    {
      id: "command-a-search",
      name: "Command A Search",
      group: "Command A",
      provider: "cohere",
      capabilities: { toolUse: true, webSearch: true },
      description: "搜索增强模型，实时信息检索与整合",
    },
    {
      id: "command-r-plus-08-2024",
      name: "Command R+ 08-2024",
      group: "Command R+",
      provider: "cohere",
      capabilities: { toolUse: true },
      description: "增强版R+，企业级稳定性和性能",
    },
    {
      id: "command-r-plus",
      name: "Command R+",
      group: "Command",
      provider: "cohere",
      capabilities: { toolUse: true },
      description: "企业级主力模型，平衡性能与成本",
    },
    {
      id: "command-light",
      name: "Command Light",
      group: "Command",
      provider: "cohere",
      description: "轻量级模型，快速响应场景",
    },
  ],
};
