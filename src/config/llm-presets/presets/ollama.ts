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
 * Ollama 预设模板
 */

import type { LlmPreset } from "../types";

// Ollama (本地)
export const ollamaPreset: LlmPreset = {
  type: "ollama",
  name: "Ollama",
  description: "本地 Ollama 服务",
  defaultBaseUrl: "http://localhost:11434",
  logoUrl: "/model-icons/ollama.svg",
  links: [
    { label: "官网", url: "https://ollama.com" },
    { label: "GitHub", url: "https://github.com/ollama/ollama" },
    { label: "模型库", url: "https://ollama.com/library" },
  ],
};
