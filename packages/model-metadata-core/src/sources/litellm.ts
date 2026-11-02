import { stableFingerprint } from "../fingerprint";
import type { MetadataProperties, ModelMetadataRule } from "../types";
import {
  asBoolean,
  asNumber,
  asRecord,
  asString,
  compactObject,
  lastSegment,
  slug,
  type MetadataSourceAdapter,
  type ParsedMetadataCatalog,
} from "./types";

const SOURCE_ID = "litellm";
const PRIORITY = -10;
const PER_TOKEN_TO_PER_MILLION = 1_000_000;
const ALLOWED_MODES = new Set([
  "chat",
  "completion",
  "embedding",
  "rerank",
  "search",
  "responses",
]);

function perMillion(value: unknown): number | undefined {
  const raw = asNumber(value);
  if (raw === undefined || raw < 0) return undefined;
  return Math.round(raw * PER_TOKEN_TO_PER_MILLION * 1_000_000) / 1_000_000;
}

function buildProperties(item: Record<string, unknown>): MetadataProperties {
  const mode = asString(item.mode)?.toLowerCase();
  const capabilities: Record<string, boolean> = {};
  if (asBoolean(item.supports_vision)) capabilities.vision = true;
  if (asBoolean(item.supports_audio_input)) capabilities.audio = true;
  if (asBoolean(item.supports_function_calling)) capabilities.toolUse = true;
  if (asBoolean(item.supports_reasoning)) capabilities.thinking = true;
  if (asBoolean(item.supports_web_search)) capabilities.webSearch = true;
  if (asBoolean(item.supports_computer_use)) capabilities.computerUse = true;
  if (mode === "embedding") capabilities.embedding = true;
  if (mode === "rerank") capabilities.rerank = true;

  const pricing = compactObject({
    input: perMillion(item.input_cost_per_token),
    output: perMillion(item.output_cost_per_token),
    cacheHitInput: perMillion(item.cache_read_input_token_cost),
    unit:
      asNumber(item.input_cost_per_token) !== undefined ||
      asNumber(item.output_cost_per_token) !== undefined
        ? "USD"
        : undefined,
  });

  const contextLength =
    asNumber(item.max_input_tokens) ?? asNumber(item.max_tokens);

  return compactObject({
    contextLength,
    pricing,
    capabilities: compactObject(capabilities),
  }) ?? {};
}

function mergeProperties(
  base: MetadataProperties,
  incoming: MetadataProperties
): MetadataProperties {
  const basePricing = asRecord(base.pricing);
  const incomingPricing = asRecord(incoming.pricing);
  const baseCapabilities = asRecord(base.capabilities);
  const incomingCapabilities = asRecord(incoming.capabilities);
  return compactObject({
    ...incoming,
    ...base,
    pricing: compactObject({ ...incomingPricing, ...basePricing }),
    capabilities: compactObject({
      ...incomingCapabilities,
      ...baseCapabilities,
    }),
  }) ?? {};
}

export const litellmAdapter: MetadataSourceAdapter = {
  definition: {
    id: SOURCE_ID,
    name: "LiteLLM 价格表",
    description: "LiteLLM 维护的模型价格、上下文与能力清单",
    url: "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json",
    homepage: "https://github.com/BerriAI/litellm",
    license: "MIT",
  },
  parse(payload: unknown, now = new Date().toISOString()): ParsedMetadataCatalog {
    const entries = asRecord(payload);
    const byMatchValue = new Map<string, ModelMetadataRule>();
    let skipped = 0;

    for (const [key, raw] of Object.entries(entries ?? {})) {
      if (key === "sample_spec" || key.startsWith("sample_spec")) {
        skipped += 1;
        continue;
      }
      const item = asRecord(raw);
      if (!item) {
        skipped += 1;
        continue;
      }
      const mode = asString(item.mode)?.toLowerCase();
      if (mode && !ALLOWED_MODES.has(mode)) {
        skipped += 1;
        continue;
      }
      if (/^\d+x\d+/.test(key)) {
        skipped += 1;
        continue;
      }

      const matchValue = lastSegment(key);
      if (!matchValue) {
        skipped += 1;
        continue;
      }
      const properties = buildProperties(item);
      if (Object.keys(properties).length === 0) {
        skipped += 1;
        continue;
      }

      const lookupKey = matchValue.toLowerCase();
      const existing = byMatchValue.get(lookupKey);
      if (existing) {
        existing.properties = mergeProperties(
          existing.properties,
          properties
        );
        continue;
      }
      byMatchValue.set(lookupKey, {
        id: `ext-${SOURCE_ID}-${slug(matchValue)}-${stableFingerprint(
          matchValue
        ).replace("fnv1a-", "")}`,
        matchType: "modelExact",
        matchValue,
        properties,
        priority: PRIORITY,
        enabled: true,
        sourceId: SOURCE_ID,
        description: "LiteLLM 价格表",
      });
    }

    const rules = [...byMatchValue.values()];
    return {
      sourceId: SOURCE_ID,
      revision: stableFingerprint(rules),
      generatedAt: now,
      rules,
      warnings: skipped
        ? [`跳过 ${skipped} 个非对话模型或缺少元数据的条目`]
        : [],
    };
  },
};
