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
 * Hugging Face 预设模板
 */

import type { LlmPreset } from "../types";

// Hugging Face (使用 OpenAI 兼容的 Chat Completion API)
export const huggingFacePreset: LlmPreset = {
  type: "openai",
  name: "Hugging Face",
  description: "Hugging Face Chat Completion API (OpenAI 兼容)",
  defaultBaseUrl: "https://api-inference.huggingface.co",
  logoUrl: "/model-icons/huggingface-color.svg",
  links: [
    { label: "官网", url: "https://huggingface.co/" },
    {
      label: "API 文档",
      url: "https://huggingface.co/docs/inference-providers/index",
    },
    { label: "价格页", url: "https://huggingface.co/pricing" },
  ],
  defaultModels: [
    {
      id: "meta-llama/Llama-3.3-70B-Instruct",
      name: "Llama 3.3 70B Instruct",
      group: "Llama",
      provider: "huggingface",
    },
    {
      id: "meta-llama/Llama-3.1-8B-Instruct",
      name: "Llama 3.1 8B Instruct",
      group: "Llama",
      provider: "huggingface",
    },
    {
      id: "mistralai/Mixtral-8x7B-Instruct-v0.1",
      name: "Mixtral 8x7B Instruct",
      group: "Mixtral",
      provider: "huggingface",
    },
    {
      id: "microsoft/Phi-3-mini-4k-instruct",
      name: "Phi-3 Mini 4K",
      group: "Phi",
      provider: "huggingface",
    },
    {
      id: "Qwen/Qwen3-235B-A22B-Instruct",
      name: "Qwen3 235B Instruct",
      group: "Qwen3",
      provider: "huggingface",
      description: "MoE旗舰，开源热门",
    },
  ],
};
