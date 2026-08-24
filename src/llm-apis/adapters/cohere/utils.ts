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
 * Cohere 适配器的 URL 处理逻辑
 */
export const cohereUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const versionedHost = host.includes("/v2") ? host : `${host}v2/`;
    return endpoint ? `${versionedHost}${endpoint}` : `${versionedHost}chat`;
  },
  getHint: (): string => {
    return "将自动添加 /v2/chat";
  },
};

/**
 * 解析 Cohere 模型列表响应
 */
export function parseCohereModelsResponse(data: any): LlmModelInfo[] {
  const models: LlmModelInfo[] = [];

  if (data.models && Array.isArray(data.models)) {
    for (const model of data.models) {
      const modelId = model.name;
      models.push({
        id: modelId,
        name: modelId,
        provider: "cohere",
      });
    }
  }

  return models;
}
