import { stableFingerprint } from "../fingerprint";
import type { MetadataProperties, ModelMetadataRule } from "../types";
import {
  asNumber,
  asRecord,
  asString,
  asStringArray,
  compactObject,
  lastSegment,
  slug,
  type MetadataSourceAdapter,
  type ParsedMetadataCatalog,
} from "./types";

const SOURCE_ID = "models-dev";
const PRIORITY = -10;

interface ModelsDevCost {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
}

interface ModelsDevModel {
  id?: string;
  description?: string;
  reasoning?: boolean;
  tool_call?: boolean;
  structured_output?: boolean;
  release_date?: string;
  modalities?: { input?: string[]; output?: string[] };
  limit?: { context?: number; output?: number };
  cost?: ModelsDevCost;
  canonical_model_id?: string;
}

function buildProperties(model: ModelsDevModel): MetadataProperties {
  const inputModalities = asStringArray(model.modalities?.input);
  const outputModalities = asStringArray(model.modalities?.output);
  const capabilities: Record<string, boolean> = {};

  if (inputModalities.includes("image")) capabilities.vision = true;
  if (inputModalities.includes("audio")) capabilities.audio = true;
  if (inputModalities.includes("video")) capabilities.video = true;
  if (outputModalities.includes("image")) capabilities.imageGeneration = true;
  if (outputModalities.includes("audio")) capabilities.audioGeneration = true;
  if (model.tool_call === true) capabilities.toolUse = true;
  if (model.reasoning === true) capabilities.thinking = true;

  const cost = asRecord(model.cost);
  const pricing = compactObject({
    input: asNumber(cost?.input),
    output: asNumber(cost?.output),
    cacheHitInput: asNumber(cost?.cache_read),
    unit: cost ? "USD" : undefined,
  });

  return compactObject({
    contextLength: asNumber(model.limit?.context),
    pricing,
    capabilities: compactObject(capabilities),
    description: asString(model.description),
    releaseDate: asString(model.release_date),
  }) ?? {};
}

export const modelsDevAdapter: MetadataSourceAdapter = {
  definition: {
    id: SOURCE_ID,
    name: "models.dev",
    description: "社区维护的模型能力、上下文与价格目录",
    url: "https://models.dev/api.json",
    homepage: "https://models.dev",
    license: "MIT",
  },
  parse(payload: unknown, now = new Date().toISOString()): ParsedMetadataCatalog {
    const providers = asRecord(payload);
    const rules: ModelMetadataRule[] = [];
    const seen = new Set<string>();
    let skipped = 0;

    for (const [providerKey, providerValue] of Object.entries(providers ?? {})) {
      const provider = asRecord(providerValue);
      const models = asRecord(provider?.models);
      if (!models) {
        skipped += 1;
        continue;
      }
      const providerLabel = asString(provider?.name) ?? providerKey;

      for (const [modelKey, modelValue] of Object.entries(models)) {
        const model = asRecord(modelValue) as ModelsDevModel | undefined;
        if (!model) {
          skipped += 1;
          continue;
        }
        const properties = buildProperties(model);
        if (Object.keys(properties).length === 0) {
          skipped += 1;
          continue;
        }

        const fullId = asString(model.id) ?? `${providerKey}/${modelKey}`;
        const canonical = asString(model.canonical_model_id);
        const candidates = [
          lastSegment(fullId),
          canonical ? lastSegment(canonical) : undefined,
        ].filter((item): item is string => Boolean(item));

        for (const candidate of candidates) {
          const key = candidate.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          rules.push({
            id: `ext-${SOURCE_ID}-${slug(candidate)}-${stableFingerprint(
              candidate
            ).replace("fnv1a-", "")}`,
            matchType: "modelExact",
            matchValue: candidate,
            properties,
            priority: PRIORITY,
            enabled: true,
            sourceId: SOURCE_ID,
            description: `models.dev · ${providerLabel}`,
          });
        }
      }
    }

    return {
      sourceId: SOURCE_ID,
      revision: stableFingerprint(rules),
      generatedAt: now,
      rules,
      warnings: skipped
        ? [`跳过 ${skipped} 个缺少可用元数据的条目`]
        : [],
    };
  },
};
