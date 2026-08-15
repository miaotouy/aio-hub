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
 * 智谱 AI 预设模板
 */

import type { LlmPreset } from "../types";

// 智谱 AI
export const zhipuPreset: LlmPreset = {
  type: "openai",
  name: "智谱 AI",
  description: "智谱 GLM API",
  defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
  logoUrl: "/model-icons/zhipu-color.svg",
  links: [
    { label: "官网", url: "https://open.bigmodel.cn/" },
    { label: "控制台", url: "https://open.bigmodel.cn/usercenter/apikeys" },
    { label: "API 文档", url: "https://open.bigmodel.cn/dev/api" },
    { label: "计费说明", url: "https://open.bigmodel.cn/pricing" },
  ],
  defaultModels: [
    {
      id: "glm-4.6",
      name: "GLM-4.6",
      group: "GLM-4.6",
      provider: "zhipu",
      description: "200K上下文，SAA升级，编码/代理对标Claude（2025-10-04）",
    },
    {
      id: "glm-4.6-air",
      name: "GLM-4.6 Air",
      group: "GLM-4.6",
      provider: "zhipu",
      description: "高速Agent/高并发优化",
    },
    {
      id: "glm-4.6v",
      name: "GLM-4.6V",
      group: "GLM-4.6",
      provider: "zhipu",
      capabilities: { vision: true },
      description: "多模态视觉语言模型",
    },
    {
      id: "glm-4.5",
      name: "GLM-4.5",
      group: "GLM-4.5",
      provider: "zhipu",
      capabilities: { toolUse: true },
      description: "开源代理专用，推理/编码增强（2025-07-28）",
    },
    {
      id: "glm-4-plus",
      name: "GLM-4 Plus",
      group: "GLM-4",
      provider: "zhipu",
    },
    {
      id: "glm-4-flash",
      name: "GLM-4 Flash",
      group: "GLM-4",
      provider: "zhipu",
    },
  ],
};
