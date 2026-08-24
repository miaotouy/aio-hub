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

import type { LlmModelInfo } from "@/types/llm-profiles";

/**
 * Claude 适配器的 URL 处理逻辑
 */
export const claudeUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const versionedHost = host.includes("/v1") ? host : `${host}v1/`;
    return endpoint
      ? `${versionedHost}${endpoint}`
      : `${versionedHost}messages`;
  },
  getHint: (): string => {
    return "将自动添加 /v1/messages";
  },
};

/**
 * 解析 Anthropic 模型列表响应
 */
export function parseAnthropicModelsResponse(data: any): LlmModelInfo[] {
  const models: LlmModelInfo[] = [];

  if (data.data && Array.isArray(data.data)) {
    for (const model of data.data) {
      if (model.type === "model") {
        models.push({
          id: model.id,
          name: model.display_name || model.id,
          provider: "anthropic",
          description: model.description,
          capabilities: {
            vision:
              model.id.includes("opus") ||
              model.id.includes("sonnet") ||
              model.id.includes("haiku"),
          },
        });
      }
    }
  }

  return models;
}
