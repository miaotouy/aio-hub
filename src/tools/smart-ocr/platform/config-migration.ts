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

import { pluginManager } from "@/services/plugin-manager";
import type {
  PluginContribution,
  PluginOcrEngineContribution,
} from "@/services/plugin-types";
import type { OcrEngineConfig, PluginOcrEngineConfig } from "../types";

const LEGACY_CONTRIBUTION_IDS: Record<string, Record<string, string>> = {
  "paddle-ocr": { recognizeBatch: "ppocr-v5-mobile" },
  "paddle-ocr-dev": { recognizeBatch: "ppocr-v5-mobile" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isOcrContribution(
  contribution: PluginContribution
): contribution is PluginOcrEngineContribution {
  // 迁移场景故意宽松：旧配置里的贡献点可能缺少 method 字段，
  // 此处只需能识别类型即可，具体 ID 由下方 contributionId() 兜底。
  // 运行时过滤（plugin-engine.ts / extension-registry.ts）要求 method 非空字符串。
  return contribution.type === "ocr-engine";
}

function contributionId(
  contribution: PluginOcrEngineContribution,
  index: number
): string {
  return contribution.id || contribution.method || `ocr-engine-${index + 1}`;
}

export function resolveLegacyOcrContributionId(
  pluginId: string,
  method: string
): string {
  const knownId = LEGACY_CONTRIBUTION_IDS[pluginId]?.[method];
  if (knownId) return knownId;

  const plugin =
    pluginManager.getActivePlugin(pluginId) ??
    pluginManager.getPlugin(pluginId);
  const contributions = (plugin?.manifest.contributions ?? []).filter(
    isOcrContribution
  );
  const methodMatches = contributions
    .map((item, index) => ({ id: contributionId(item, index), item }))
    .filter(({ item }) => item.method === method);

  if (methodMatches.length === 1) return methodMatches[0].id;
  if (contributions.length === 1) return contributionId(contributions[0], 0);
  return "";
}

export function migratePluginOcrEngineConfig(
  value: unknown
): PluginOcrEngineConfig {
  const config = isRecord(value) ? value : {};
  const pluginId = typeof config.pluginId === "string" ? config.pluginId : "";
  const currentContributionId =
    typeof config.contributionId === "string"
      ? config.contributionId.trim()
      : "";
  const legacyMethod =
    typeof config.method === "string" ? config.method.trim() : "";

  return {
    pluginId,
    contributionId:
      currentContributionId ||
      (pluginId && legacyMethod
        ? resolveLegacyOcrContributionId(pluginId, legacyMethod)
        : ""),
    modelProfile:
      typeof config.modelProfile === "string" ? config.modelProfile : undefined,
    language: typeof config.language === "string" ? config.language : undefined,
  };
}

export function migrateOcrEngineConfig(value: unknown): OcrEngineConfig {
  if (!isRecord(value) || value.type !== "plugin") {
    return value as OcrEngineConfig;
  }

  return {
    type: "plugin",
    ...migratePluginOcrEngineConfig(value),
  };
}
