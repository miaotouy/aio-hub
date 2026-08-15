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
 * Perplexity 预设模板
 */

import type { LlmPreset } from "../types";

// Perplexity
export const perplexityPreset: LlmPreset = {
  type: "openai",
  name: "Perplexity",
  description: "Perplexity AI - 搜索增强模型",
  defaultBaseUrl: "https://api.perplexity.ai",
  logoUrl: "/model-icons/perplexity-color.svg",
  links: [
    { label: "官网", url: "https://www.perplexity.ai" },
    { label: "API 文档", url: "https://docs.perplexity.ai" },
  ],
  defaultModels: [
    {
      id: "sonar-pro",
      name: "Sonar Pro",
      group: "Sonar",
      provider: "perplexity",
      capabilities: { webSearch: true },
      description: "联网搜索增强，实时信息",
    },
    {
      id: "sonar",
      name: "Sonar",
      group: "Sonar",
      provider: "perplexity",
      capabilities: { webSearch: true },
      description: "标准联网版本",
    },
  ],
};
