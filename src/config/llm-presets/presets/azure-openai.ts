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
 * Azure OpenAI 预设模板
 */

import type { LlmPreset } from "../types";

// Azure OpenAI
export const azureOpenaiPreset: LlmPreset = {
  type: "azure",
  name: "Azure OpenAI",
  description: "微软 Azure OpenAI 服务",
  defaultBaseUrl:
    "https://{resource}.openai.azure.com/openai/deployments/{deployment}",
  logoUrl: "/model-icons/azure-color.svg",
  links: [
    {
      label: "官网",
      url: "https://azure.microsoft.com/products/ai-services/openai-service",
    },
    { label: "控制台", url: "https://portal.azure.com" },
    {
      label: "API 文档",
      url: "https://learn.microsoft.com/azure/ai-services/openai/",
    },
  ],
  defaultModels: [
    {
      id: "gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      group: "GPT-5.6",
      provider: "microsoft",
      capabilities: { vision: true, toolUse: true },
      description: "Azure 托管的 GPT-5.6 Sol",
    },
    {
      id: "gpt-5.6-terra",
      name: "GPT-5.6 Terra",
      group: "GPT-5.6",
      provider: "microsoft",
      capabilities: { vision: true, toolUse: true },
      description: "Azure 托管的 GPT-5.6 Terra",
    },
    {
      id: "gpt-5.6-luna",
      name: "GPT-5.6 Luna",
      group: "GPT-5.6",
      provider: "microsoft",
      capabilities: { vision: true, toolUse: true },
      description: "Azure 托管的 GPT-5.6 Luna",
    },
    {
      id: "gpt-5.5",
      name: "GPT-5.5",
      group: "GPT-5.5",
      provider: "microsoft",
      capabilities: { vision: true, toolUse: true },
      description: "Azure 托管的 GPT-5.5",
    },
    {
      id: "gpt-4o",
      name: "GPT-4o",
      group: "GPT-4o",
      provider: "microsoft",
      capabilities: { vision: true, toolUse: true },
      description: "Azure 托管的 GPT-4o",
    },
    {
      id: "gpt-image-2",
      name: "GPT Image 2",
      group: "GPT Image",
      provider: "microsoft",
      capabilities: { vision: true },
      description: "图像生成模型",
    },
  ],
};
