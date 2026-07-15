// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import type { ProviderType } from "@/types/llm-profiles";
import type {
  LlmConfigImportDiagnostic,
  LlmConfigImportDocument,
  LlmConfigParserOutcome,
} from "../types";
import {
  createDraftId,
  inferProfileName,
  normalizeLlmBaseUrl,
  sanitizeApiKey,
  uniqueStrings,
} from "../normalize";

function parseAssignments(content: string): Record<string, string[]> {
  const values: Record<string, string[]> = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(
      /^\s*(?:(?:export|set)\s+|\$env:)?([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/i
    );
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    const name = match[1].toUpperCase();
    (values[name] ||= []).push(value);
  }
  return values;
}

function createEnvProfile(
  document: LlmConfigImportDocument,
  index: number,
  sourceKind: string,
  providerType: ProviderType,
  baseValues: string[],
  keyValues: string[],
  model?: string
) {
  const warnings: LlmConfigImportDiagnostic[] = [];
  const distinctBases = uniqueStrings(baseValues.map((value) => value.trim()));
  const validKeys = uniqueStrings(
    keyValues.map((value) => sanitizeApiKey(value) || undefined)
  );
  const distinctRawKeys = uniqueStrings(keyValues.map((value) => value.trim()));
  const baseUrl =
    distinctBases.length === 1
      ? normalizeLlmBaseUrl(distinctBases[0]) || ""
      : "";

  if (distinctBases.length > 1) {
    warnings.push({
      code: "base-url-conflict",
      message: "同一配置中存在多个冲突的 Base URL，请保留一个后重试。",
      severity: "error",
      blocking: true,
      documentId: document.id,
    });
  } else if (!baseUrl) {
    warnings.push({
      code: distinctBases.length ? "base-url-invalid" : "base-url-missing",
      message: distinctBases.length
        ? "Base URL 不是有效的 HTTP(S) URL，无法导入。"
        : "缺少 Base URL，无法导入。",
      severity: "error",
      blocking: true,
      documentId: document.id,
    });
  }

  if (distinctRawKeys.length > 1) {
    warnings.push({
      code: "api-key-conflict",
      message: "同一配置中存在多个冲突的 API Key，请保留一个后重试。",
      severity: "error",
      blocking: true,
      documentId: document.id,
    });
  } else if (!validKeys.length) {
    warnings.push({
      code: "api-key-missing",
      message: "未检测到可用 API Key，导入后需要手动补充。",
      severity: "warning",
      documentId: document.id,
    });
  }

  return {
    id: createDraftId(document.id, "env", index),
    suggestedName: inferProfileName(baseUrl, sourceKind),
    providerType,
    baseUrl,
    apiKeys: distinctRawKeys.length > 1 ? [] : validKeys,
    models: model ? [{ id: model, name: model }] : [],
    sourceKind,
    sourceDocumentIds: [document.id],
    confidence: "high" as const,
    warnings,
  };
}

export function parseEnvDocuments(
  documents: LlmConfigImportDocument[]
): LlmConfigParserOutcome {
  const outcome: LlmConfigParserOutcome = {
    format: "env",
    score: 0,
    profiles: [],
    diagnostics: [],
  };

  documents.forEach((document) => {
    const values = parseAssignments(document.content);
    const knownNames = Object.keys(values).filter((name) =>
      /^(?:ANTHROPIC_|GOOGLE_GEMINI_BASE_URL|GEMINI_|OPENAI_)/.test(name)
    );
    if (!knownNames.length) return;
    outcome.score += 35 + knownNames.length * 6;

    const specs = [
      {
        source: "Claude Code 环境变量",
        type: "claude" as const,
        bases: values.ANTHROPIC_BASE_URL || [],
        keys: [
          ...(values.ANTHROPIC_AUTH_TOKEN || []),
          ...(values.ANTHROPIC_API_KEY || []),
        ],
      },
      {
        source: "Gemini CLI 环境变量",
        type: "gemini" as const,
        bases: values.GOOGLE_GEMINI_BASE_URL || [],
        keys: values.GEMINI_API_KEY || [],
        model: values.GEMINI_MODEL?.[0],
      },
      {
        source: "OpenAI 环境变量",
        type: "openai" as const,
        bases: [
          ...(values.OPENAI_BASE_URL || []),
          ...(values.OPENAI_API_BASE || []),
          ...(values.OPENAI_API_HOST || []),
        ],
        keys: values.OPENAI_API_KEY || [],
      },
    ];

    specs.forEach((spec, index) => {
      if (!spec.bases.length && !spec.keys.length) return;
      outcome.profiles.push(
        createEnvProfile(
          document,
          index,
          spec.source,
          spec.type,
          spec.bases,
          spec.keys,
          "model" in spec ? spec.model : undefined
        )
      );
    });
  });

  return outcome;
}
