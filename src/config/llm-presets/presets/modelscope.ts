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
 * 魔搭 ModelScope 预设模板
 */

import type { LlmPreset } from "../types";

// 魔搭 ModelScope
export const modelscopePreset: LlmPreset = {
  type: "openai",
  name: "魔搭 ModelScope",
  description: "魔搭社区 API-Inference 服务（OpenAI兼容）",
  defaultBaseUrl: "https://api-inference.modelscope.cn/v1",
  logoUrl: "/model-icons/modelscope-color.svg",
  links: [
    { label: "官网", url: "https://modelscope.cn" },
    { label: "模型推理", url: "https://modelscope.cn/models" },
    {
      label: "API 文档",
      url: "https://modelscope.cn/docs/model-service/API-Inference/intro",
    },
  ],
  defaultModels: [
    {
      id: "Qwen/Qwen3-235B-A22B-Instruct-2507",
      name: "Qwen3 235B-A22B Instruct",
      group: "Qwen3",
      provider: "modelscope",
      capabilities: { toolUse: true },
      description: "Qwen3旗舰，MoE架构，235B参数（2025-10-14）",
    },
    {
      id: "Qwen/Qwen3-235B-A22B-Thinking-2507",
      name: "Qwen3 235B-A22B Thinking",
      group: "Qwen3",
      provider: "modelscope",
      capabilities: { toolUse: true },
      description: "Qwen3推理版本，深度思考能力",
    },
    {
      id: "Qwen/Qwen3-VL-235B-A22B-Instruct",
      name: "Qwen3-VL-235B-A22B",
      group: "Qwen3",
      provider: "modelscope",
      capabilities: { vision: true, toolUse: true },
      description: "Qwen3视觉语言模型，235B参数多模态旗舰",
    },
    {
      id: "Qwen/Qwen3-Next-80B-A3B-Instruct",
      name: "Qwen3-Next-80B-A3B",
      group: "Qwen3",
      provider: "modelscope",
      capabilities: { toolUse: true },
      description: "Qwen3高效版本，MoE架构",
    },
    {
      id: "Qwen/Qwen3-30B-A3B-Thinking-2507",
      name: "Qwen3 30B-A3B Thinking",
      group: "Qwen3",
      provider: "modelscope",
      capabilities: { toolUse: true },
      description: "Qwen3推理模型，30B参数高效版",
    },
    {
      id: "Qwen/Qwen3-Coder-30B-A3B-Instruct",
      name: "Qwen3-Coder-30B-A3B",
      group: "Qwen3",
      provider: "modelscope",
      description: "Qwen3代码专用模型，30B参数",
    },
    {
      id: "Qwen/QwQ-32B-Preview",
      name: "QwQ-32B-Preview",
      group: "Qwen",
      provider: "modelscope",
      capabilities: { toolUse: true },
      description: "推理专用模型，32B参数",
    },
    {
      id: "Qwen/QVQ-72B-Preview",
      name: "QVQ-72B-Preview",
      group: "Qwen",
      provider: "modelscope",
      capabilities: { vision: true },
      description: "视觉推理模型，72B参数",
    },
    {
      id: "deepseek-ai/DeepSeek-V3.2-Exp",
      name: "DeepSeek-V3.2-Exp",
      group: "DeepSeek",
      provider: "modelscope",
      description: "实验版MoE模型，DSA稀疏注意力（2025-09-29）",
    },
    {
      id: "deepseek-ai/DeepSeek-R1-0528",
      name: "DeepSeek-R1-0528",
      group: "DeepSeek",
      provider: "modelscope",
      capabilities: { toolUse: true },
      description: "Dense推理旗舰，混合V3.1架构（限额200次/天）",
    },
    {
      id: "ZhipuAI/GLM-4.6",
      name: "GLM-4.6",
      group: "GLM",
      provider: "modelscope",
      capabilities: { toolUse: true },
      description: "智谱最新旗舰，200K上下文（2025-10-04）",
    },
    {
      id: "ZhipuAI/GLM-4.5",
      name: "GLM-4.5",
      group: "GLM",
      provider: "modelscope",
      capabilities: { toolUse: true },
      description: "智谱开源代理专用（2025-07-28）",
    },
    {
      id: "MiniMax/MiniMax-M1-80k",
      name: "MiniMax-M1-80k",
      group: "MiniMax",
      provider: "modelscope",
      description: "1M令牌上下文模型（2025-06-16）",
    },
    {
      id: "Shanghai_AI_Laboratory/Intern-S1",
      name: "Intern-S1",
      group: "Intern",
      provider: "modelscope",
      description: "上海AI实验室推理模型",
    },
    {
      id: "OpenGVLab/InternVL3_5-241B-A28B",
      name: "InternVL3.5-241B",
      group: "Intern",
      provider: "modelscope",
      capabilities: { vision: true },
      description: "开源视觉语言模型，241B参数",
    },
    {
      id: "stepfun-ai/step3",
      name: "Step-3",
      group: "Step",
      provider: "modelscope",
      description: "阶跃星辰最新模型",
    },
    {
      id: "iic/Tongyi-DeepResearch-30B-A3B",
      name: "通义DeepResearch-30B",
      group: "通义",
      provider: "modelscope",
      description: "深度研究专用模型，30B参数",
    },
  ],
};
