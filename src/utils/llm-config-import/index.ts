// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { combineParserOutcomes } from "./detector";
import { expandCompoundImportDocuments } from "./documents";
import { parseCurlDocuments } from "./parsers/curl";
import { parseEnvDocuments } from "./parsers/env";
import { parseJsonDocuments } from "./parsers/json";
import { parseTomlDocuments } from "./parsers/toml";
import type {
  LlmConfigImportDocument,
  LlmConfigImportFormat,
  LlmConfigImportResult,
  LlmConfigParserOutcome,
} from "./types";

export * from "./normalize";
export * from "./types";

const parsers = {
  curl: parseCurlDocuments,
  env: parseEnvDocuments,
  json: parseJsonDocuments,
  toml: parseTomlDocuments,
};

export function parseLlmChannelConfig(
  documents: LlmConfigImportDocument[],
  format: LlmConfigImportFormat = "auto"
): LlmConfigImportResult {
  const populatedDocuments = documents.filter((document) =>
    document.content.trim()
  );
  if (!populatedDocuments.length) {
    return { detectedFormat: null, profiles: [], diagnostics: [] };
  }

  const parserDocuments =
    format === "auto"
      ? expandCompoundImportDocuments(populatedDocuments)
      : populatedDocuments;
  const outcomes: LlmConfigParserOutcome[] =
    format === "auto"
      ? Object.values(parsers).map((parser) => parser(parserDocuments))
      : [parsers[format](parserDocuments)];
  const result = combineParserOutcomes(outcomes);

  if (!result.profiles.length && !result.diagnostics.length) {
    result.diagnostics.push({
      code: "format-unrecognized",
      message:
        format === "auto"
          ? "未识别到受支持的 LLM 渠道配置。"
          : `内容中未识别到可导入的${format.toUpperCase()}配置。`,
      severity: "error",
    });
  }
  return result;
}
