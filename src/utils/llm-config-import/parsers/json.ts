// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import type {
  LlmConfigImportDocument,
  LlmConfigParserOutcome,
  ParsedLlmProfileDraft,
} from "../types";
import type { LlmModelInfo } from "@/types/llm-profiles";
import {
  createDraftId,
  inferProfileName,
  inferProviderType,
  normalizeLlmBaseUrl,
  sanitizeApiKey,
} from "../normalize";
import { parseEnvDocuments } from "./env";
import { parseLlmProfileBundle } from "@/utils/llm-profile-transfer";

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readModels(value: unknown): LlmModelInfo[] {
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

const NEW_API_CONNECTION_INFO_TYPE = "newapi_channel_conn";

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

    if (data._type === NEW_API_CONNECTION_INFO_TYPE) {
      outcome.score += 110;
      const baseUrl =
        typeof data.url === "string"
          ? normalizeLlmBaseUrl(data.url) || ""
          : "";
      const apiKey = sanitizeApiKey(data.key);
      const warnings = [];

      if (!baseUrl) {
        warnings.push({
          code: "base-url-invalid",
          message: "New API 连接信息中的 URL 不是有效的 HTTP(S) URL，无法导入。",
          severity: "error" as const,
          blocking: true,
          documentId: document.id,
        });
      }
      if (!apiKey) {
        warnings.push({
          code: "api-key-missing",
          message: "New API 连接信息中没有可用 API Key，导入后需要手动补充。",
          severity: "warning" as const,
          documentId: document.id,
        });
      }

      outcome.profiles.push({
        id: createDraftId(document.id, "new-api-connection"),
        suggestedName: inferProfileName(baseUrl, "New API"),
        providerType: "openai-compatible",
        baseUrl,
        apiKeys: apiKey ? [apiKey] : [],
        models: [],
        sourceKind: "New API 连接信息",
        sourceDocumentIds: [document.id],
        confidence: "high",
        warnings,
      });
      return;
    }

    const nativeBundle = parseLlmProfileBundle(data);
    if (nativeBundle.recognized) {
      outcome.score += 120;
      if ("error" in nativeBundle) {
        outcome.diagnostics.push({
          code: "aiohub-profile-bundle-invalid",
          message: nativeBundle.error || "AIO Hub 渠道包格式无效",
          severity: "error",
          blocking: true,
          documentId: document.id,
        });
        return;
      }

      const bundle = nativeBundle.bundle;
      const hasRedactions = bundle.redactedPaths.length > 0;
      outcome.profiles.push(
        ...bundle.profiles.map((profile, index) => ({
          id: createDraftId(document.id, "aiohub-profile", index),
          suggestedName: profile.name,
          providerType: profile.type,
          baseUrl: profile.baseUrl,
          apiKeys: [...profile.apiKeys],
          models: profile.models.map((model) => cloneJson(model)),
          customHeaders: profile.customHeaders
            ? { ...profile.customHeaders }
            : undefined,
          customEndpoints: profile.customEndpoints
            ? { ...profile.customEndpoints }
            : undefined,
          options: profile.options ? cloneJson(profile.options) : undefined,
          sourceKind: "AIO Hub 渠道包",
          sourceDocumentIds: [document.id],
          confidence: "high" as const,
          warnings: hasRedactions
            ? [
                {
                  code: "aiohub-profile-bundle-redacted",
                  message: "该渠道包已脱敏，导入后需要补充密钥等敏感字段。",
                  severity: "warning" as const,
                  documentId: document.id,
                },
              ]
            : [],
          sourceProfile: cloneJson(profile),
        }))
      );
      return;
    }

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

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
