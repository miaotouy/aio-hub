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
      id: "glm-5.3",
      name: "GLM-5.3",
      group: "GLM-5",
      provider: "zhipu",
      capabilities: {
        toolUse: true,
        thinking: true,
        thinkingConfigType: "switch",
      },
      description:
        "最新旗舰，复杂软件工程与 agent 任务，编码较 5.2 提升 50%，1M 上下文/128K 输出（API 即将推出）",
    },
    {
      id: "glm-5.2",
      name: "GLM-5.2",
      group: "GLM-5",
      provider: "zhipu",
      capabilities: { toolUse: true },
      description: "上一代旗舰模型，编码/代理能力持续升级",
    },
    {
      id: "glm-5.1",
      name: "GLM-5.1",
      group: "GLM-5",
      provider: "zhipu",
      capabilities: { toolUse: true },
      description: "新一代主力模型，Agent 工作流优化",
    },
    {
      id: "glm-5",
      name: "GLM-5",
      group: "GLM-5",
      provider: "zhipu",
      capabilities: { toolUse: true },
      description: "旗舰系列，200K 上下文",
    },
    {
      id: "glm-4.6v",
      name: "GLM-4.6V",
      group: "GLM-4.6",
      provider: "zhipu",
      capabilities: { vision: true, toolUse: true },
      description: "多模态视觉语言模型，128K 上下文",
    },
    {
      id: "glm-4.6-air",
      name: "GLM-4.6 Air",
      group: "GLM-4.6",
      provider: "zhipu",
      description: "高速 Agent/高并发优化",
    },
  ],
};
