// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { LlmProfile } from "@/types/llm-profiles";

export const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-12-01-preview";

export type AzureOpenAiOperation = "chat" | "embedding";

const OPERATION_ENDPOINTS = {
  chat: {
    key: "chatCompletions",
    path: "chat/completions",
  },
  embedding: {
    key: "embeddings",
    path: "embeddings",
  },
} as const;

/**
 * 将 Azure deployment 渠道转换为 OpenAI-compatible facade 可执行的配置。
 * 请求体与响应解析继续复用 OpenAI 实现，仅覆盖 Azure 特有的 URL 与鉴权契约。
 */
export function prepareAzureOpenAiProfile(
  profile: LlmProfile,
  operation: AzureOpenAiOperation
): LlmProfile {
  const baseUrl = resolveAzureOpenAiBaseUrl(profile, true);
  const endpoint = OPERATION_ENDPOINTS[operation];
  const configuredEndpoint = profile.customEndpoints?.[endpoint.key];
  const apiVersion = readOption(profile, "apiVersion");
  const resolvedEndpoint = appendAzureApiVersion(
    configuredEndpoint || endpoint.path,
    apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION,
    baseUrl
  );
  const apiKey = profile.apiKeys.find((key) => key.trim().length > 0);

  return {
    ...profile,
    baseUrl,
    // OpenAI core 会把 apiKeys 转为 Bearer。Azure Key 改由 api-key 头发送。
    apiKeys: [],
    customHeaders: {
      ...(apiKey ? { "api-key": apiKey } : {}),
      ...(profile.customHeaders ?? {}),
    },
    customEndpoints: {
      ...(profile.customEndpoints ?? {}),
      [endpoint.key]: resolvedEndpoint,
    },
  };
}

export function resolveAzureOpenAiBaseUrl(
  profile: LlmProfile,
  requirePlaceholderValues = false
): string {
  const replacements = {
    resource: readOption(profile, "resource"),
    deployment: readOption(profile, "deployment"),
  };

  return profile.baseUrl.replace(/\{(resource|deployment)\}/g, (_, rawKey) => {
    const key = rawKey as keyof typeof replacements;
    const value = replacements[key];
    if (!value) {
      if (!requirePlaceholderValues) return `{${key}}`;
      const label = key === "resource" ? "资源名称" : "部署名称";
      throw new Error(`Azure OpenAI 配置缺少${label}`);
    }
    return key === "deployment" ? encodeURIComponent(value) : value;
  });
}

export function appendAzureApiVersion(
  endpoint: string,
  apiVersion: string,
  baseUrl = ""
): string {
  if (/[?&]api-version=/i.test(endpoint)) return endpoint;

  // 新版 /openai/v1 路由默认使用 v1；日期版本属于 deployment 路由。
  const usesV1Route = /\/openai\/v1\/?(?:[?#].*)?$/i.test(baseUrl);
  if (usesV1Route && !/^(?:v1|preview)$/i.test(apiVersion)) {
    return endpoint;
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${separator}api-version=${encodeURIComponent(apiVersion)}`;
}

export const azureOpenAiUrlHandler = {
  buildUrl: (
    baseUrl: string,
    endpoint?: string,
    profile?: LlmProfile
  ): string => {
    const resolvedBaseUrl = profile
      ? resolveAzureOpenAiBaseUrl({ ...profile, baseUrl })
      : baseUrl;
    const host = resolvedBaseUrl.endsWith("/")
      ? resolvedBaseUrl
      : `${resolvedBaseUrl}/`;
    const apiVersion =
      (profile && readOption(profile, "apiVersion")) ||
      DEFAULT_AZURE_OPENAI_API_VERSION;
    const resolvedEndpoint = appendAzureApiVersion(
      endpoint || "chat/completions",
      apiVersion,
      resolvedBaseUrl
    );
    return `${host}${resolvedEndpoint}`;
  },
  getHint: (): string =>
    "Azure OpenAI deployment 格式，自动补全端点与 api-version；也兼容 /openai/v1 地址",
};

function readOption(profile: LlmProfile, key: string): string | undefined {
  const value = profile.options?.[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}
