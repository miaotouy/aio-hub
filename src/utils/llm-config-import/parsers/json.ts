// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import type {
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
} from "../normalize";
import { parseEnvDocuments } from "./env";

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readModels(value: unknown): Array<{ id: string; name?: string }> {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((id) => ({ id, name: id }));
  }
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([id, config]) => ({
    id,
    name:
      isRecord(config) && typeof config.name === "string" ? config.name : id,
  }));
}

export function parseJsonDocuments(
  documents: LlmConfigImportDocument[]
): LlmConfigParserOutcome {
  const outcome: LlmConfigParserOutcome = {
    format: "json",
    score: 0,
    profiles: [],
    diagnostics: [],
    credentials: [],
  };

  documents.forEach((document) => {
    const trimmed = document.content.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return;

    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      outcome.score += 15;
      outcome.diagnostics.push({
        code: "json-invalid",
        message: "JSON 语法无效，请检查括号、引号和尾随逗号。",
        severity: "error",
        documentId: document.id,
      });
      return;
    }
    if (!isRecord(data)) return;

    if (isRecord(data.provider)) {
      outcome.score += 90;
      Object.entries(data.provider).forEach(
        ([providerId, providerConfig], index) => {
          if (!isRecord(providerConfig) || !isRecord(providerConfig.options))
            return;
          const rawBaseUrl = providerConfig.options.baseURL;
          if (typeof rawBaseUrl !== "string") return;
          const baseUrl = normalizeLlmBaseUrl(rawBaseUrl) || "";
          const packageHint =
            typeof providerConfig.npm === "string" ? providerConfig.npm : "";
          const inferred = inferProviderType(
            `${providerId} ${packageHint}`,
            baseUrl,
            typeof providerConfig.options.apiBackend === "string"
              ? providerConfig.options.apiBackend
              : undefined
          );
          const apiKey = sanitizeApiKey(providerConfig.options.apiKey);
          const warnings = [];
          if (!baseUrl) {
            warnings.push({
              code: "base-url-invalid",
              message: "Base URL 不是有效的 HTTP(S) URL，无法导入。",
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
          if (inferred.ambiguous) {
            warnings.push({
              code: "provider-ambiguous",
              message: "无法完全确认 API 协议，请核对并按需修正渠道类型。",
              severity: "warning" as const,
              documentId: document.id,
            });
          }
          const draft: ParsedLlmProfileDraft = {
            id: createDraftId(document.id, "opencode", index),
            suggestedName:
              typeof providerConfig.name === "string"
                ? providerConfig.name
                : inferProfileName(baseUrl, providerId),
            providerType: inferred.type,
            baseUrl,
            apiKeys: apiKey ? [apiKey] : [],
            models: readModels(providerConfig.models),
            sourceKind: `OpenCode: ${providerId}`,
            sourceDocumentIds: [document.id],
            confidence: inferred.ambiguous ? "low" : "high",
            warnings,
          };
          outcome.profiles.push(draft);
        }
      );
    }

    if (isRecord(data.env)) {
      const envText = Object.entries(data.env)
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join("\n");
      const envOutcome = parseEnvDocuments([{ ...document, content: envText }]);
      if (envOutcome.profiles.length) {
        outcome.score += 75;
        outcome.profiles.push(
          ...envOutcome.profiles.map((profile) => ({
            ...profile,
            id: profile.id.replace("env-", "settings-"),
            sourceKind: profile.sourceKind.replace("环境变量", "settings.json"),
          }))
        );
      }
    }

    const authKey = sanitizeApiKey(data.OPENAI_API_KEY);
    if (authKey) {
      outcome.score += 55;
      outcome.credentials!.push({
        documentId: document.id,
        key: authKey,
        kind: "codex-auth",
      });
    }
  });

  return outcome;
}
