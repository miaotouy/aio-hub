// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import type {
  LlmConfigImportDiagnostic,
  LlmConfigParserOutcome,
  ParsedLlmProfileDraft,
} from "./types";

export function combineParserOutcomes(outcomes: LlmConfigParserOutcome[]) {
  const ranked = outcomes
    .filter((outcome) => outcome.score > 0)
    .sort((a, b) => b.score - a.score);
  const profiles: ParsedLlmProfileDraft[] = [];
  const seen = new Set<string>();

  for (const outcome of ranked) {
    for (const profile of outcome.profiles) {
      const key = `${profile.sourceDocumentIds.join(",")}|${profile.providerType}|${profile.baseUrl}|${profile.sourceKind}`;
      if (!seen.has(key)) {
        seen.add(key);
        profiles.push(profile);
      }
    }
  }

  const diagnostics: LlmConfigImportDiagnostic[] = ranked.flatMap(
    (outcome) => outcome.diagnostics
  );
  const codexProfiles = profiles.filter((profile) =>
    profile.sourceKind.startsWith("Codex:")
  );
  const credentials = ranked.flatMap((outcome) => outcome.credentials || []);

  if (codexProfiles.length === 1 && credentials.length === 1) {
    const profile = codexProfiles[0];
    profile.apiKeys = [credentials[0].key];
    profile.sourceDocumentIds = Array.from(
      new Set([...profile.sourceDocumentIds, credentials[0].documentId])
    );
    profile.warnings = profile.warnings.filter(
      (warning) => warning.code !== "api-key-missing"
    );
  } else if (credentials.length > 0) {
    diagnostics.push({
      code: "codex-auth-ambiguous",
      message:
        codexProfiles.length === 0
          ? "检测到 Codex auth.json，但缺少可配对的 config.toml。"
          : "存在多个 Codex provider 或凭据文档，API Key 未自动配对。",
      severity: "warning",
    });
  }

  if (ranked.length > 1 && ranked[0].score - ranked[1].score <= 10) {
    diagnostics.push({
      code: "format-ambiguous",
      message: "多个格式检测结果接近，请核对候选或手动选择格式。",
      severity: "warning",
    });
    profiles.forEach((profile) => {
      if (profile.confidence === "high") profile.confidence = "medium";
    });
  }

  return {
    detectedFormat: ranked[0]?.format || null,
    profiles,
    diagnostics,
  };
}
