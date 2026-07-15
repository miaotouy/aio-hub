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
import { DEFAULT_METADATA_RULES, testRuleMatch } from "@/config/model-metadata";

export const vertexAiUrlHandler = {
  buildUrl: (baseUrl: string, endpoint?: string): string => {
    const host = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    const versionedHost = /\/v1\/?$/.test(host) ? host : `${host}v1/`;
    return endpoint
      ? `${versionedHost}${endpoint}`
      : `${versionedHost}projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent`;
  },
  getHint: (): string =>
    "将自动添加 /v1/projects/{project}/locations/{location}/publishers/google/models/{model}:generateContent",
};

export function detectPublisher(modelId: string): "google" | "anthropic" {
  return modelId.toLowerCase().includes("claude") ? "anthropic" : "google";
}

export function parseVertexAiModelsResponse(data: any): LlmModelInfo[] {
  if (!Array.isArray(data?.models)) return [];
  return data.models.map((model: any) => {
    const modelId = model.name.split("/").pop() || model.name;
    return {
      id: modelId,
      name: model.displayName || modelId,
      group: extractModelGroup(modelId, "google"),
      provider: "google",
      capabilities: {
        ...extractModelCapabilities(modelId, "google"),
        vision: true,
      },
    };
  });
}

function extractModelCapabilities(modelId: string, provider?: string) {
  const rules = DEFAULT_METADATA_RULES.filter(
    (rule) => rule.enabled !== false && rule.properties?.capabilities
  ).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const rule of rules) {
    if (
      testRuleMatch(rule, modelId, provider) &&
      rule.properties?.capabilities
    ) {
      return rule.properties.capabilities;
    }
  }
  return undefined;
}

function extractModelGroup(modelId: string, provider?: string): string {
  const rules = DEFAULT_METADATA_RULES.filter(
    (rule) => rule.enabled !== false && rule.properties?.group
  ).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  for (const rule of rules) {
    if (testRuleMatch(rule, modelId, provider) && rule.properties?.group) {
      return rule.properties.group;
    }
  }
  return modelId.toLowerCase().includes("gemini") ? "Gemini" : "Models";
}
