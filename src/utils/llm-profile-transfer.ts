// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import type { LlmProfile, ProviderType } from "@/types/llm-profiles";

export const LLM_PROFILE_BUNDLE_FORMAT = "aiohub.llm-profiles" as const;
export const LLM_PROFILE_BUNDLE_VERSION = 1 as const;

const SUPPORTED_PROVIDER_TYPES = new Set<ProviderType>([
  "openai",
  "openai-compatible",
  "azure",
  "deepseek",
  "claude",
  "gemini",
  "siliconflow",
  "groq",
  "ollama",
  "openrouter",
  "openai-responses",
  "xai",
  "cohere",
  "vertexai",
  "suno-newapi",
  "minimax-music",
]);

export interface LlmProfileBundle {
  format: typeof LLM_PROFILE_BUNDLE_FORMAT;
  formatVersion: typeof LLM_PROFILE_BUNDLE_VERSION;
  exportedAt: string;
  containsSecrets: boolean;
  redactedPaths: string[];
  profiles: LlmProfile[];
}

export type LlmProfileBundleParseResult =
  | { recognized: false }
  | { recognized: true; bundle: LlmProfileBundle; error?: undefined }
  | { recognized: true; bundle?: undefined; error: string };

interface CreateBundleOptions {
  includeSecrets?: boolean;
  exportedAt?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizedSecretKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function isSensitiveKey(key: string): boolean {
  const normalized = normalizedSecretKey(key);
  return (
    normalized === "apikey" ||
    normalized === "apikeys" ||
    normalized.includes("authorization") ||
    normalized.endsWith("apikey") ||
    normalized.endsWith("accesstoken") ||
    normalized.endsWith("refreshtoken") ||
    normalized.endsWith("authtoken") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("cookie") ||
    normalized.endsWith("credential") ||
    normalized.endsWith("credentials") ||
    normalized.endsWith("privatekey")
  );
}

function collectSensitivePaths(
  value: unknown,
  path: string,
  paths: string[]
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectSensitivePaths(item, `${path}[${index}]`, paths)
    );
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isSensitiveKey(key)) {
      const hasValue = Array.isArray(child)
        ? child.length > 0
        : child !== undefined && child !== null && child !== "";
      if (hasValue) paths.push(childPath);
      continue;
    }
    collectSensitivePaths(child, childPath, paths);
  }
}

function redactSensitiveValues(
  value: unknown,
  path: string,
  redactedPaths: string[]
): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      redactSensitiveValues(item, `${path}[${index}]`, redactedPaths)
    );
  }
  if (!isRecord(value)) return value;

  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (isSensitiveKey(key)) {
      const hasValue = Array.isArray(child)
        ? child.length > 0
        : child !== undefined && child !== null && child !== "";
      if (hasValue) redactedPaths.push(childPath);
      if (normalizedSecretKey(key) === "apikeys") result[key] = [];
      continue;
    }
    result[key] = redactSensitiveValues(child, childPath, redactedPaths);
  }
  return result;
}

function validateProfile(value: unknown, index: number): string | null {
  if (!isRecord(value)) return `第 ${index + 1} 个渠道不是对象`;
  if (typeof value.id !== "string" || !value.id.trim()) {
    return `第 ${index + 1} 个渠道缺少有效 ID`;
  }
  if (typeof value.name !== "string" || !value.name.trim()) {
    return `渠道 ${value.id} 缺少名称`;
  }
  if (
    typeof value.type !== "string" ||
    !SUPPORTED_PROVIDER_TYPES.has(value.type as ProviderType)
  ) {
    return `渠道 ${value.id} 使用了不支持的 API 格式`;
  }
  if (typeof value.baseUrl !== "string" || !isHttpUrl(value.baseUrl)) {
    return `渠道 ${value.id} 的 API 地址不是有效的 HTTP(S) URL`;
  }
  if (
    !Array.isArray(value.apiKeys) ||
    !value.apiKeys.every((key) => typeof key === "string")
  ) {
    return `渠道 ${value.id} 的 API Keys 格式无效`;
  }
  if (typeof value.enabled !== "boolean") {
    return `渠道 ${value.id} 缺少启用状态`;
  }
  if (!Array.isArray(value.models)) {
    return `渠道 ${value.id} 的模型列表格式无效`;
  }
  for (const model of value.models) {
    if (
      !isRecord(model) ||
      typeof model.id !== "string" ||
      !model.id.trim() ||
      typeof model.name !== "string" ||
      !model.name.trim()
    ) {
      return `渠道 ${value.id} 包含无效模型`;
    }
  }
  return null;
}

export function createLlmProfileBundle(
  profiles: LlmProfile[],
  options: CreateBundleOptions = {}
): LlmProfileBundle {
  const includeSecrets = options.includeSecrets === true;
  const source = cloneJson(profiles);
  const sensitivePaths: string[] = [];
  source.forEach((profile, index) =>
    collectSensitivePaths(profile, `profiles[${index}]`, sensitivePaths)
  );

  const redactedPaths: string[] = [];
  const exportedProfiles = includeSecrets
    ? source
    : (source.map((profile, index) =>
        redactSensitiveValues(profile, `profiles[${index}]`, redactedPaths)
      ) as LlmProfile[]);

  return {
    format: LLM_PROFILE_BUNDLE_FORMAT,
    formatVersion: LLM_PROFILE_BUNDLE_VERSION,
    exportedAt: options.exportedAt || new Date().toISOString(),
    containsSecrets: includeSecrets && sensitivePaths.length > 0,
    redactedPaths: includeSecrets ? [] : redactedPaths,
    profiles: exportedProfiles,
  };
}

export function parseLlmProfileBundle(
  value: unknown
): LlmProfileBundleParseResult {
  if (!isRecord(value) || value.format !== LLM_PROFILE_BUNDLE_FORMAT) {
    return { recognized: false };
  }
  if (value.formatVersion !== LLM_PROFILE_BUNDLE_VERSION) {
    return {
      recognized: true,
      error: `不支持的 AIO Hub 渠道包版本: ${String(value.formatVersion)}`,
    };
  }
  if (!Array.isArray(value.profiles) || value.profiles.length === 0) {
    return { recognized: true, error: "渠道包中没有可导入的渠道" };
  }

  for (let index = 0; index < value.profiles.length; index++) {
    const error = validateProfile(value.profiles[index], index);
    if (error) return { recognized: true, error };
  }

  const redactedPaths = Array.isArray(value.redactedPaths)
    ? value.redactedPaths.filter(
        (item): item is string => typeof item === "string"
      )
    : [];

  return {
    recognized: true,
    bundle: {
      format: LLM_PROFILE_BUNDLE_FORMAT,
      formatVersion: LLM_PROFILE_BUNDLE_VERSION,
      exportedAt: typeof value.exportedAt === "string" ? value.exportedAt : "",
      containsSecrets: value.containsSecrets === true,
      redactedPaths,
      profiles: cloneJson(value.profiles) as LlmProfile[],
    },
  };
}
