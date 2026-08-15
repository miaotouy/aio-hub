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
 * 芒果灵创 预设模板
 */

import type { LlmPreset } from "../types";

// 芒果灵创
export const mangotvPreset: LlmPreset = {
  type: "openai",
  name: "芒果灵创",
  description: "芒果灵创 AIGC-LLM 文本模型 API（OpenAI 兼容）",
  defaultBaseUrl: "https://aigc-llm.mgtv.com",
  logoUrl: "/model-icons/mangotv.svg",
  links: [
    { label: "官网", url: "https://aigc.mgtv.com" },
    { label: "开发者文档", url: "https://aigc.mgtv.com/develop/docs" },
  ],
  defaultModels: [
    {
      id: "qwen3.6-plus",
      name: "Qwen3.6 Plus",
      group: "Qwen3.6",
      provider: "mgtv",
      description: "芒果灵创文本模型",
    },
    {
      id: "qwen3.6-max-preview",
      name: "Qwen3.6 Max Preview",
      group: "Qwen3.6",
      provider: "mgtv",
      description: "芒果灵创文本模型",
    },
    {
      id: "qwen3.6-flash",
      name: "Qwen3.6 Flash",
      group: "Qwen3.6",
      provider: "mgtv",
      description: "芒果灵创文本模型",
    },
    {
      id: "qwen3.5-plus",
      name: "Qwen3.5 Plus",
      group: "Qwen3.5",
      provider: "mgtv",
      description: "芒果灵创文本模型",
    },
    {
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      group: "DeepSeek",
      provider: "mgtv",
      description: "芒果灵创文本模型",
    },
    {
      id: "deepseek-v4-flash",
      name: "DeepSeek V4 Flash",
      group: "DeepSeek",
      provider: "mgtv",
      description: "芒果灵创文本模型",
    },
    {
      id: "qwen3-vl-plus",
      name: "Qwen3 VL Plus",
      group: "Qwen3 VL",
      provider: "mgtv",
      description: "芒果灵创视觉语言模型",
    },
    {
      id: "glm-5.1",
      name: "GLM 5.1",
      group: "GLM",
      provider: "mgtv",
      description: "芒果灵创文本模型",
    },
    {
      id: "glm-5",
      name: "GLM 5",
      group: "GLM",
      provider: "mgtv",
      description: "芒果灵创文本模型",
    },
  ],
};
