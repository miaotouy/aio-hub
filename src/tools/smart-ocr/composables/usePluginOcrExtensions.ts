import { computed } from "vue";
import { pluginManager } from "@/services/plugin-manager";
import type {
  PluginContribution,
  PluginOcrEngineContribution,
  PluginOcrSelectOption,
  PluginProxy,
} from "@/services/plugin-types";

export interface PluginOcrExtension {
  id: string;
  contributionId: string;
  pluginId: string;
  pluginName: string;
  name: string;
  description?: string;
  method: string;
  modelProfiles: PluginOcrSelectOption[];
  defaultModelProfile?: string;
  languages: PluginOcrSelectOption[];
  defaultLanguage?: string;
  enabled: boolean;
  broken: boolean;
}

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
): PluginOcrExtension {
  const state = pluginManager.pluginStates[plugin.id];
  const contributionId = resolveContributionId(contribution, index);

  return {
    id: `${plugin.id}:${contributionId}`,
    contributionId,
    pluginId: plugin.id,
    pluginName: plugin.name ?? plugin.manifest.name,
    name: contribution.name || plugin.name || plugin.manifest.name,
    description: contribution.description,
    method: contribution.method,
    modelProfiles: contribution.modelProfiles ?? [],
    defaultModelProfile: contribution.defaultModelProfile,
    languages: contribution.languages ?? [],
    defaultLanguage: contribution.defaultLanguage,
    enabled: state?.enabled ?? plugin.enabled,
    broken: state?.isBroken ?? false,
  };
}

export function usePluginOcrExtensions() {
  const ocrExtensions = computed<PluginOcrExtension[]>(() => {
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

