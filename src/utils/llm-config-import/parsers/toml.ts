// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import * as toml from "smol-toml";
import type {
  LlmConfigImportDiagnostic,
  LlmConfigImportDocument,
  LlmConfigParserOutcome,
  ParsedLlmProfileDraft,
} from "../types";
import {
  createDraftId,
  inferProfileName,
  inferProviderType,
  normalizeLlmBaseUrl,
  sanitizeApiKey,
  uniqueStrings,
} from "../normalize";

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function warningForBaseUrl(
  baseUrl: string,
  documentId: string
): LlmConfigImportDiagnostic[] {
  return baseUrl
    ? []
    : [
        {
          code: "base-url-invalid",
          message: "Base URL 缺失或不是有效的 HTTP(S) URL，无法导入。",
          severity: "error" as const,
          blocking: true,
          documentId,
        },
      ];
}

export function parseTomlDocuments(
  documents: LlmConfigImportDocument[]
): LlmConfigParserOutcome {
  const outcome: LlmConfigParserOutcome = {
    format: "toml",
    score: 0,
    profiles: [],
    diagnostics: [],
  };

  documents.forEach((document) => {
    const content = document.content.trim();
    if (!content || (!content.includes("=") && !content.includes("["))) return;

    let data: Record<string, any>;
    try {
      data = toml.parse(content) as Record<string, any>;
    } catch {
      if (!/^\s*(?:export|set|\$env:)/im.test(content)) {
        outcome.score += 10;
        outcome.diagnostics.push({
          code: "toml-invalid",
          message: "TOML 语法无效，请检查表名、引号和赋值。",
          severity: "error",
          documentId: document.id,
        });
      }
      return;
    }

    if (isRecord(data.model_providers)) {
      outcome.score += 95;
      const selectedProvider =
        typeof data.model_provider === "string"
          ? data.model_provider
          : undefined;
      let entries = Object.entries(data.model_providers).filter((entry) =>
        isRecord(entry[1])
      ) as Array<[string, Record<string, any>]>;
      if (selectedProvider && data.model_providers[selectedProvider]) {
        entries = [[selectedProvider, data.model_providers[selectedProvider]]];
      }
      entries.forEach(([providerId, config], index) => {
        const baseUrl =
          typeof config.base_url === "string"
            ? normalizeLlmBaseUrl(config.base_url) || ""
            : "";
        const wireApi =
          typeof config.wire_api === "string" ? config.wire_api : undefined;
        const inferred = inferProviderType(providerId, baseUrl, wireApi);
        const models = uniqueStrings([
          typeof data.model === "string" ? data.model : undefined,
          typeof data.review_model === "string" ? data.review_model : undefined,
        ]).map((id) => ({ id, name: id }));
        const warnings = warningForBaseUrl(baseUrl, document.id);
        if (config.supports_websockets || config.responses_websockets_v2) {
          warnings.push({
            code: "websocket-unsupported",
            message:
              "检测到 Codex WebSocket 标记，AIO Hub 当前不会导入该开关。",
            severity: "warning",
            documentId: document.id,
          });
        }
        if (entries.length > 1 && !selectedProvider) {
          warnings.push({
            code: "codex-provider-ambiguous",
            message: "配置包含多个 Codex provider，凭据不会自动跨候选配对。",
            severity: "warning",
            documentId: document.id,
          });
        }
        const draft: ParsedLlmProfileDraft = {
          id: createDraftId(document.id, "codex", index),
          suggestedName: inferProfileName(baseUrl, `Codex ${providerId}`),
          providerType: inferred.type,
          baseUrl,
          apiKeys: [],
          models,
          sourceKind: `Codex: ${providerId}`,
          sourceDocumentIds: [document.id],
          confidence: wireApi === "responses" ? "high" : "medium",
          warnings: [
            ...warnings,
            {
              code: "api-key-missing",
              message: "未检测到可用 API Key，可同时导入 auth.json 自动配对。",
              severity: "warning",
              documentId: document.id,
            },
          ],
        };
        outcome.profiles.push(draft);
      });
    }

    if (isRecord(data.model)) {
      const modelEntries = Object.entries(data.model).filter(([, value]) =>
        isRecord(value)
      ) as Array<[string, Record<string, any>]>;
      if (modelEntries.length) outcome.score += 85;
      modelEntries.forEach(([sectionName, config], index) => {
        if (typeof config.base_url !== "string") return;
        const baseUrl = normalizeLlmBaseUrl(config.base_url) || "";
        const backend =
          typeof config.api_backend === "string"
            ? config.api_backend
            : undefined;
        const inferred = inferProviderType(sectionName, baseUrl, backend);
        const apiKey = sanitizeApiKey(config.api_key);
        const warnings = warningForBaseUrl(baseUrl, document.id);
        if (!apiKey) {
          warnings.push({
            code: "api-key-missing",
            message: "未检测到可用 API Key，导入后需要手动补充。",
            severity: "warning",
            documentId: document.id,
          });
        }
        outcome.profiles.push({
          id: createDraftId(document.id, "grok", index),
          suggestedName: inferProfileName(baseUrl, `Grok ${sectionName}`),
          providerType: inferred.type,
          baseUrl,
          apiKeys: apiKey ? [apiKey] : [],
          models:
            typeof config.model === "string"
              ? [{ id: config.model, name: config.model }]
              : [],
          sourceKind: `Grok CLI: ${sectionName}`,
          sourceDocumentIds: [document.id],
          confidence: backend === "responses" ? "high" : "medium",
          warnings,
        });
      });
    }
  });

  return outcome;
}
