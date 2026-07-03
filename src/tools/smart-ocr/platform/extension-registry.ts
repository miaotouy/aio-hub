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

import { computed } from "vue";
import { pluginManager } from "@/services/plugin-manager";
import type {
  PluginContribution,
  PluginOcrEngineContribution,
  PluginProxy,
} from "@/services/plugin-types";
import type { OcrExtension } from "./types";

export type PluginOcrExtension = OcrExtension;

function isOcrEngineContribution(
  contribution: PluginContribution
): contribution is PluginOcrEngineContribution {
  return (
    contribution.type === "ocr-engine" &&
    typeof (contribution as PluginOcrEngineContribution).method === "string" &&
    (contribution as PluginOcrEngineContribution).method.length > 0
  );
}

function resolveContributionId(
  contribution: PluginOcrEngineContribution,
  index: number
) {
  return contribution.id || contribution.method || `ocr-engine-${index + 1}`;
}

function mapPluginContribution(
  plugin: PluginProxy,
  contribution: PluginOcrEngineContribution,
  index: number
): OcrExtension {
  const state = pluginManager.pluginStates[plugin.id];
  const contributionId = resolveContributionId(contribution, index);

  return {
    id: `${plugin.id}:${contributionId}`,
    contributionId,
    pluginId: plugin.id,
    pluginName: plugin.name ?? plugin.manifest.name,
    name: `${contribution.name || plugin.name || plugin.manifest.name} (插件)${plugin.devMode ? " [Dev]" : ""}`,
    description: contribution.description,
    method: contribution.method,
    modelProfiles: contribution.modelProfiles ?? [],
    defaultModelProfile: contribution.defaultModelProfile,
    languages: contribution.languages ?? [],
    defaultLanguage: contribution.defaultLanguage,
    capabilities: contribution.capabilities,
    enabled: state?.enabled ?? plugin.enabled,
    broken: state?.isBroken ?? false,
    devMode: plugin.devMode,
  };
}

export function useOcrExtensions() {
  const ocrExtensions = computed<OcrExtension[]>(() => {
    const runtimePluginIds = Object.keys(pluginManager.pluginStates);

    return pluginManager
      .getInstalledPlugins()
      .filter(
        (plugin) =>
          runtimePluginIds.includes(plugin.id) ||
          plugin.manifest.contributions?.some(isOcrEngineContribution)
      )
      .flatMap((plugin) =>
        (plugin.manifest.contributions ?? [])
          .filter(isOcrEngineContribution)
          .map((contribution, index) =>
            mapPluginContribution(plugin, contribution, index)
          )
      );
  });

  const getOcrExtensionByConfig = (pluginId?: string, method?: string) =>
    ocrExtensions.value.find(
      (extension) =>
        extension.pluginId === pluginId && extension.method === method
    );

  const getOcrExtensionById = (id: string) =>
    ocrExtensions.value.find((extension) => extension.id === id);

  return {
    ocrExtensions,
    getOcrExtensionByConfig,
    getOcrExtensionById,
  };
}
