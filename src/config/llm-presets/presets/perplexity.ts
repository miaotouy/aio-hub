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
      id: "sonar-reasoning-pro",
      name: "Sonar Reasoning Pro",
      group: "Sonar",
      provider: "perplexity",
      capabilities: { webSearch: true, toolUse: true, thinking: true, thinkingConfigType: "switch" },
      description: "高级多步 CoT 推理与增强检索，复杂问题求解",
    },
    {
      id: "sonar-deep-research",
      name: "Sonar Deep Research",
      group: "Sonar",
      provider: "perplexity",
      capabilities: { webSearch: true, fileSearch: true, thinking: true, thinkingConfigType: "switch" },
      description: "穷尽式多源研究工作流，生成带引用的深度报告",
    },
    {
      id: "sonar-pro",
      name: "Sonar Pro",
      group: "Sonar",
      provider: "perplexity",
      capabilities: { webSearch: true },
      description: "高级搜索增强，实时信息",
    },
    {
      id: "sonar",
      name: "Sonar",
      group: "Sonar",
      provider: "perplexity",
      capabilities: { webSearch: true },
      description: "标准搜索版本",
    },
  ],
};
