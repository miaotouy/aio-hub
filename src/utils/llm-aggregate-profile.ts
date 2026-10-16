// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

import {
  PROVIDER_EXECUTION_DEFAULTS,
  isAggregateChannelType,
} from "@aiohub/llm-core";
import { llmPresets } from "../config/llm-presets";
import type { LlmProfile } from "../types/llm-profiles";

type AggregateMigrationProfile = Pick<LlmProfile, "type" | "baseUrl"> &
  Partial<Pick<LlmProfile, "icon" | "logoUrl" | "links" | "options">>;

function hostname(value: string): string | undefined {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

// Localhost and placeholder hosts are shared by many services. Only a saved
// preset logo or an exact documentation link identifies those installations.
const aggregatePresets = llmPresets.filter((preset) =>
  isAggregateChannelType(preset.type)
);
const legacyTypes = new Set([
  "openai",
  "openai-compatible",
  "openai-responses",
  "claude",
  "gemini",
]);

/** Upgrade a recognizable legacy preset while preserving its execution choices. */
export function migrateAggregateProfile<T extends AggregateMigrationProfile>(
  profile: T
): T {
  if (!legacyTypes.has(profile.type)) return profile;
  const host = hostname(profile.baseUrl);
  const hostedPreset = aggregatePresets.find((candidate) => {
    const officialHost = hostname(candidate.defaultBaseUrl);
    return (
      host &&
      ((host === officialHost &&
        host !== "localhost" &&
        host !== "127.0.0.1" &&
        !host.endsWith("example.com")) ||
        (candidate.type === "huggingface" && host === "router.huggingface.co"))
    );
  });
  const preset =
    hostedPreset ??
    aggregatePresets.find((candidate) => {
      const logoMatch =
        candidate.logoUrl &&
        (profile.icon === candidate.logoUrl ||
          profile.logoUrl === candidate.logoUrl);
      const linkMatch =
        Array.isArray(profile.links) &&
        profile.links.some(
          (link) =>
            candidate.links?.some((entry) => entry.url === link.url) ||
            (candidate.type === "new-api" &&
              link.url === "https://github.com/Calcium-Ion/new-api")
        );
      return logoMatch || linkMatch;
    });
  if (!preset) return profile;
  const legacy = PROVIDER_EXECUTION_DEFAULTS[profile.type];
  return {
    ...profile,
    type: preset.type,
    options: {
      ...profile.options,
      routingDefaults: {
        ...(legacy?.defaultAdapterId ? { chat: legacy.defaultAdapterId } : {}),
        ...legacy?.operationAdapters,
        ...profile.options?.routingDefaults,
      },
    },
  };
}
