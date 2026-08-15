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
 * DeepInfra 预设模板
 */

import type { LlmPreset } from "../types";

// DeepInfra
export const deepinfraPreset: LlmPreset = {
  type: "openai",
  name: "DeepInfra",
  description: "DeepInfra - 开源模型托管服务",
  defaultBaseUrl: "https://api.deepinfra.com",
  logoUrl: "/model-icons/deepinfra-color.svg",
  links: [
    { label: "官网", url: "https://deepinfra.com" },
    { label: "控制台", url: "https://deepinfra.com/dash" },
    { label: "API 文档", url: "https://deepinfra.com/docs" },
    { label: "价格页", url: "https://deepinfra.com/pricing" },
  ],
  defaultModels: [
    {
      id: "meta-llama/Meta-Llama-3.1-70B-Instruct",
      name: "Llama 3.1 70B Instruct",
      group: "Llama",
      provider: "deepinfra",
      description: "Meta 开源模型",
    },
    {
      id: "Qwen/Qwen2.5-72B-Instruct",
      name: "Qwen 2.5 72B Instruct",
      group: "Qwen",
      provider: "deepinfra",
      description: "阿里千问",
    },
  ],
};
