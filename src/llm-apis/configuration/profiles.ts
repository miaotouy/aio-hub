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

import { normalizeDeepSeekProfile } from "@aiohub/llm-core";
import { DEFAULT_LLM_PROFILE, type LlmProfile } from "../../types/llm-profiles";
import { migrateAggregateProfile } from "../../utils/llm-aggregate-profile";

export interface LlmProfilesSnapshot {
  profiles: LlmProfile[];
  revision: string;
}

export function normalizeLlmProfile(
  profile: any,
  normalizeIconPath: (path: string) => string = (path) => path
): LlmProfile {
  // 1. 处理 API Key 迁移，并无条件移除旧版单数 apiKey 字段
  const { apiKey, ...rest } = profile;
  const inlineKeys = Array.isArray(profile.apiKeys)
    ? profile.apiKeys.filter(
        (key: unknown): key is string => typeof key === "string"
      )
    : [];
  const apiKeys =
    inlineKeys.length > 0
      ? inlineKeys
      : typeof apiKey === "string" && apiKey.length > 0
        ? [apiKey]
        : [];

  // 2. 深度合并与规范化
  const normalized: LlmProfile = {
    ...DEFAULT_LLM_PROFILE,
    ...rest,
    apiKeys: apiKeys,
    logoUrl: rest.logoUrl || undefined,
    icon: rest.icon ? normalizeIconPath(rest.icon) : undefined,
    models: Array.isArray(rest.models)
      ? rest.models.map((m: any) => {
          const normalizedModel = {
            ...m,
            icon: m.icon ? normalizeIconPath(m.icon) : undefined,
          };
          delete normalizedModel.modelIdentitySuggestion;
          return normalizedModel;
        })
      : [],
    customHeaders: rest.customHeaders || DEFAULT_LLM_PROFILE.customHeaders,
    networkStrategy:
      rest.networkStrategy || DEFAULT_LLM_PROFILE.networkStrategy,
  };
  return normalizeDeepSeekProfile(migrateAggregateProfile(normalized));
}
