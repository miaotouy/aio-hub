// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { parseCurlCommand } from "@/utils/parseCurlCommand";
import type { LlmConfigImportDocument, LlmConfigParserOutcome } from "../types";
import {
  createDraftId,
  normalizeLlmBaseUrl,
  sanitizeApiKey,
} from "../normalize";

export function parseCurlDocuments(
  documents: LlmConfigImportDocument[]
): LlmConfigParserOutcome {
  const outcome: LlmConfigParserOutcome = {
    format: "curl",
    score: 0,
    profiles: [],
    diagnostics: [],
  };

  documents.forEach((document, index) => {
    if (!/^\s*curl(?:\.exe)?\b/i.test(document.content)) return;
    outcome.score += 80;
    const parsed = parseCurlCommand(
      document.content.replace(/^\s*curl\.exe\b/i, "curl")
    );
    if (!parsed) {
      outcome.diagnostics.push({
        code: "curl-invalid",
        message: "无法解析 cURL 命令，请检查 URL、引号和续行符。",
        severity: "error",
        documentId: document.id,
      });
      return;
    }

    const baseUrl = normalizeLlmBaseUrl(parsed.raw.url) || "";
    const isGeminiModelEndpoint =
      /\/models\/[^/?#]+:(?:generateContent|streamGenerateContent)(?:[?#]|$)/i.test(
        parsed.raw.url
      );
    const apiKey = sanitizeApiKey(parsed.apiKey);
    const warnings = [];
    if (!baseUrl) {
      warnings.push({
        code: "base-url-invalid",
        message: "API 地址不是有效的 HTTP(S) URL，无法导入。",
        severity: "error" as const,
        blocking: true,
        documentId: document.id,
      });
    }
    if (!apiKey) {
      warnings.push({
        code: "api-key-missing",
        message: "未检测到可用 API Key，导入后需要手动补充。",
        severity: "warning" as const,
        documentId: document.id,
      });
    }

    outcome.profiles.push({
      id: createDraftId(document.id, "curl", index),
      suggestedName: parsed.suggestedName,
      providerType: parsed.providerType,
      baseUrl,
      apiKeys: apiKey ? [apiKey] : [],
      models: parsed.model ? [{ id: parsed.model, name: parsed.model }] : [],
      customHeaders: parsed.customHeaders,
      customEndpoints:
        parsed.chatEndpoint && !isGeminiModelEndpoint
          ? { chatCompletions: parsed.chatEndpoint }
          : undefined,
      sourceKind: "cURL",
      sourceDocumentIds: [document.id],
      confidence: "high",
      warnings,
    });
  });

  return outcome;
}
