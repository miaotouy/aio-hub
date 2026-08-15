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
 * Ollama Cloud 预设模板
 */

import type { LlmPreset } from "../types";

// Ollama Cloud
export const ollamaCloudPreset: LlmPreset = {
  type: "ollama",
  name: "Ollama Cloud",
  description: "Ollama 官方云端服务 (无需本地 GPU)",
  defaultBaseUrl: "https://ollama.com",
  logoUrl: "/model-icons/ollama.svg",
  links: [
    { label: "官网", url: "https://ollama.com" },
    { label: "API Keys", url: "https://ollama.com/settings/keys" },
    { label: "云端模型库", url: "https://ollama.com/search?c=cloud" },
  ],
  defaultModels: [
    {
      id: "gpt-oss:120b",
      name: "GPT-OSS 120B (Cloud)",
      group: "Ollama Cloud",
      provider: "ollama",
      description: "Ollama 云端旗舰模型",
    },
    {
      id: "gpt-oss:120b-cloud",
      name: "GPT-OSS 120B-Cloud",
      group: "Ollama Cloud",
      provider: "ollama",
      description: "自动卸载至云端的超大模型",
    },
  ],
};
