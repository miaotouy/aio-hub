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

/**
 * 渠道配置与敏感凭据的分离逻辑（纯函数，无 IO 依赖）
 *
 * 内存中始终使用完整 LlmProfile，业务层无感知；落盘时把 API Key 与自定义
 * 请求头抽到独立混淆存储，普通渠道配置只保留非敏感结构信息。
 */

export interface LlmProfileSecrets {
  apiKeys: string[];
  customHeaders: Record<string, string>;
}

export type LlmSecretMap = Record<string, LlmProfileSecrets>;

interface SecretBearingProfile {
  id: string;
  apiKeys?: unknown;
  /** 旧版单 Key 字段，仅用于迁移，永远不应再次落盘 */
  apiKey?: unknown;
  customHeaders?: unknown;
}

function toKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function toHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(
    value as Record<string, unknown>
  )) {
    if (typeof headerValue === "string") result[key] = headerValue;
  }
  return result;
}

function hasSecrets(secret: LlmProfileSecrets): boolean {
  return (
    secret.apiKeys.length > 0 || Object.keys(secret.customHeaders).length > 0
  );
}

function normalizeSecretEntry(value: unknown): LlmProfileSecrets {
  // v1 仓库格式：profileId -> string[]
  if (Array.isArray(value)) {
    return { apiKeys: toKeyList(value), customHeaders: {} };
  }
  if (!value || typeof value !== "object") {
    return { apiKeys: [], customHeaders: {} };
  }
  const record = value as Record<string, unknown>;
  return {
    apiKeys: toKeyList(record.apiKeys),
    customHeaders: toHeaders(record.customHeaders),
  };
}

/** 把任意来源的数据规范化为 `profileId -> 敏感字段`，并丢弃空条目 */
export function normalizeLlmSecretMap(value: unknown): LlmSecretMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: LlmSecretMap = Object.create(null) as LlmSecretMap;
  for (const [profileId, rawSecret] of Object.entries(
    value as Record<string, unknown>
  )) {
    const secret = normalizeSecretEntry(rawSecret);
    if (hasSecrets(secret)) result[profileId] = secret;
  }
  return result;
}

/** 从内存中的渠道列表抽取敏感字段，用于写入混淆存储 */
export function extractLlmSecrets<T extends SecretBearingProfile>(
  profiles: T[]
): LlmSecretMap {
  const secrets: LlmSecretMap = Object.create(null) as LlmSecretMap;
  for (const profile of profiles) {
    const secret: LlmProfileSecrets = {
      apiKeys: toKeyList(profile.apiKeys),
      customHeaders: toHeaders(profile.customHeaders),
    };
    if (hasSecrets(secret)) secrets[profile.id] = secret;
  }
  return secrets;
}

/** 剥离敏感字段，产出可安全写入普通渠道配置文件的副本 */
export function stripLlmSecrets<T extends SecretBearingProfile>(
  profiles: T[]
): T[] {
  return profiles.map((profile) => {
    const { apiKey: _legacyApiKey, ...rest } = profile;
    return {
      ...rest,
      apiKeys: [],
      customHeaders: {},
    } as T;
  });
}

export interface MergedLlmProfiles<T> {
  profiles: T[];
  secrets: LlmSecretMap;
  /** 磁盘状态需要回写（检测到旧版明文或仓库孤项） */
  changed: boolean;
}

/**
 * 把渠道结构与敏感字段合并成运行时渠道列表。
 *
 * - 普通配置中仍带明文敏感字段（旧版本或导入结果）：以内联值为准并标记迁移；
 * - 普通配置中字段为空：从混淆存储按 `profile.id` 注入；
 * - 旧版单数 `apiKey` 会无条件移除，并在 `apiKeys` 为空时迁移；
 * - 混淆存储中不存在对应渠道的条目会从下一份已提交快照中清理。
 */
export function mergeLlmSecrets<T extends SecretBearingProfile>(
  profiles: T[],
  storedSecrets: LlmSecretMap
): MergedLlmProfiles<T> {
  const secrets: LlmSecretMap = Object.create(null) as LlmSecretMap;
  let changed = false;

  const merged = profiles.map((profile) => {
    const inlineKeys = toKeyList(profile.apiKeys);
    const legacyKey =
      typeof profile.apiKey === "string" && profile.apiKey.length > 0
        ? profile.apiKey
        : undefined;
    const migratedKeys =
      inlineKeys.length > 0 ? inlineKeys : legacyKey ? [legacyKey] : [];
    const inlineHeaders = toHeaders(profile.customHeaders);
    const stored = storedSecrets[profile.id] ?? {
      apiKeys: [],
      customHeaders: {},
    };

    const hasInlineKeys = migratedKeys.length > 0;
    const hasInlineHeaders = Object.keys(inlineHeaders).length > 0;
    if (hasInlineKeys || hasInlineHeaders || "apiKey" in profile)
      changed = true;

    const secret: LlmProfileSecrets = {
      apiKeys: hasInlineKeys ? [...migratedKeys] : [...stored.apiKeys],
      customHeaders: hasInlineHeaders
        ? { ...inlineHeaders }
        : { ...stored.customHeaders },
    };
    if (hasSecrets(secret)) secrets[profile.id] = secret;

    const { apiKey: _legacyApiKey, ...rest } = profile;
    return {
      ...rest,
      apiKeys: [...secret.apiKeys],
      customHeaders: { ...secret.customHeaders },
    } as T;
  });

  const profileIds = new Set(profiles.map((profile) => profile.id));
  if (
    Object.keys(storedSecrets).some((profileId) => !profileIds.has(profileId))
  ) {
    changed = true;
  }

  return { profiles: merged, secrets, changed };
}
