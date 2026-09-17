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
 * LLM 渠道敏感字段分离存储
 *
 * 普通渠道配置只保存结构信息；API Key 与自定义请求头保存在混淆文件中。
 * 仓库以 revision 标记每次提交，并保留最近若干份已提交快照。渠道配置通过 revision
 * 指向对应快照，因此两份文件之间即使发生部分写入（甚至连续多次），也能在下次启动
 * 时回到与配置匹配的完整提交，而不会把孤立快照误删成空凭据。
 */

import { createObfuscatedStore, type ObfuscatedStore } from "./storage";
import { normalizeLlmSecretMap, type LlmSecretMap } from "./profiles";

export * from "./apiKeyHash";
export * from "./codec";
export * from "./keyStates";
export * from "./profiles";
export * from "./storage";

export const DEFAULT_LLM_SECRET_FILE_NAME = "secrets.dat";
const LLM_SECRET_VAULT_FORMAT_VERSION = 2;
const LOG_PREFIX = "[LlmSecretVault]";
/** 已提交快照的保留层数：连续多次部分提交时仍能按 revision 命中 */
const MAX_HISTORY_SNAPSHOTS = 4;

export interface LlmSecretSnapshot {
  revision: string | null;
  secrets: LlmSecretMap;
}

interface LlmSecretVaultEnvelope {
  formatVersion: typeof LLM_SECRET_VAULT_FORMAT_VERSION;
  current: LlmSecretSnapshot;
  previous?: LlmSecretSnapshot;
  /** 更早的已提交快照（由新到旧），旧版本应用会忽略该字段 */
  history?: LlmSecretSnapshot[];
}

export interface LoadedLlmSecrets extends LlmSecretSnapshot {
  /** 旧格式或从 previous 恢复，需要在本次成功加载后重新提交 */
  needsRewrite: boolean;
}

export interface StageLlmSecretsOptions {
  revision: string;
  secrets: LlmSecretMap;
  previousRevision: string | null;
  previousSecrets: LlmSecretMap;
}

export interface LlmSecretVaultOptions {
  /** 惰性解析密钥文件所在目录 */
  resolveDir: () => Promise<string>;
  /** 密钥文件名，默认 `secrets.dat` */
  fileName?: string;
  debounceDelay?: number;
}

export interface LlmSecretVault {
  /** 按普通配置中记录的 revision 读取最后一次完整提交 */
  load(expectedRevision: string | null): Promise<LoadedLlmSecrets>;
  /** 写入待提交快照，同时保留上一份已提交快照 */
  stage(options: StageLlmSecretsOptions): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeRevision(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeSnapshot(value: unknown): LlmSecretSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    revision: normalizeRevision(value.revision),
    secrets: normalizeLlmSecretMap(value.secrets),
  };
}

function normalizeSnapshotList(value: unknown): LlmSecretSnapshot[] {
  if (!Array.isArray(value)) return [];
  const snapshots: LlmSecretSnapshot[] = [];
  for (const item of value) {
    const snapshot = normalizeSnapshot(item);
    if (snapshot) snapshots.push(snapshot);
  }
  return snapshots;
}

function normalizeEnvelope(value: unknown): {
  envelope: LlmSecretVaultEnvelope;
  legacy: boolean;
} {
  if (
    isRecord(value) &&
    value.formatVersion === LLM_SECRET_VAULT_FORMAT_VERSION
  ) {
    const current = normalizeSnapshot(value.current);
    const previous = normalizeSnapshot(value.previous);
    const history = normalizeSnapshotList(value.history);
    if (current) {
      return {
        envelope: {
          formatVersion: LLM_SECRET_VAULT_FORMAT_VERSION,
          current,
          ...(previous ? { previous } : {}),
          ...(history.length > 0 ? { history } : {}),
        },
        legacy: false,
      };
    }
  }

  // v1：文件内容直接是 profileId -> string[]（或新结构的 SecretMap）
  return {
    envelope: {
      formatVersion: LLM_SECRET_VAULT_FORMAT_VERSION,
      current: {
        revision: null,
        secrets: normalizeLlmSecretMap(value),
      },
    },
    legacy: true,
  };
}

export function createLlmSecretRevision(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === "function") {
    return cryptoObject.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function createLlmSecretVault(
  options: LlmSecretVaultOptions
): LlmSecretVault {
  const store: ObfuscatedStore<unknown> = createObfuscatedStore<unknown>({
    resolveDir: options.resolveDir,
    fileName: options.fileName ?? DEFAULT_LLM_SECRET_FILE_NAME,
    createDefault: () => ({
      formatVersion: LLM_SECRET_VAULT_FORMAT_VERSION,
      current: { revision: null, secrets: {} },
    }),
    debounceDelay: options.debounceDelay,
    label: "llm-secrets",
  });

  return {
    load: async (expectedRevision) => {
      const { envelope, legacy } = normalizeEnvelope(await store.load());
      const expected = normalizeRevision(expectedRevision);
      const chain = [
        envelope.current,
        ...(envelope.previous ? [envelope.previous] : []),
        ...(envelope.history ?? []),
      ];

      // 配置里还没有 revision（首次运行、v1 迁移，或字段被外部移除）时不能做
      // revision 匹配，否则会命中 previous 里 revision 为 null 的空快照，把已
      // 提交的凭据误判成“用户没有密钥”。
      if (expected === null) {
        return {
          ...envelope.current,
          needsRewrite: legacy || envelope.current.revision !== null,
        };
      }

      const matched = chain.find((snapshot) => snapshot.revision === expected);
      if (matched) {
        return {
          ...matched,
          needsRewrite: legacy || matched !== envelope.current,
        };
      }

      // 快照链断裂（连续部分提交超出保留层数，或密钥文件被外部替换）：保留最新的
      // current 快照并触发重写。抛错会让上层把结构仍完整的渠道判定为“凭据全无”，
      // 静默清空反而更危险。
      console.warn(
        `${LOG_PREFIX} revision 不匹配，回退到最新快照（配置=${expected}，最新=${envelope.current.revision ?? "legacy"}）`
      );
      return {
        ...envelope.current,
        needsRewrite: true,
      };
    },
    stage: async ({ revision, secrets, previousRevision, previousSecrets }) => {
      const existing = normalizeEnvelope(await store.load()).envelope;
      const nextPrevious: LlmSecretSnapshot = {
        revision: normalizeRevision(previousRevision),
        secrets: normalizeLlmSecretMap(previousSecrets),
      };

      // 把磁盘上已有的快照按“新到旧”并入历史链，使连续多次部分提交仍能回退
      const seen = new Set<string>([revision]);
      if (nextPrevious.revision) seen.add(nextPrevious.revision);
      const history: LlmSecretSnapshot[] = [];
      const candidates = [
        existing.current,
        ...(existing.previous ? [existing.previous] : []),
        ...(existing.history ?? []),
      ];
      for (const snapshot of candidates) {
        if (snapshot.revision === null || seen.has(snapshot.revision)) continue;
        seen.add(snapshot.revision);
        history.push(snapshot);
        if (history.length >= MAX_HISTORY_SNAPSHOTS) break;
      }

      const envelope: LlmSecretVaultEnvelope = {
        formatVersion: LLM_SECRET_VAULT_FORMAT_VERSION,
        current: {
          revision,
          secrets: normalizeLlmSecretMap(secrets),
        },
        previous: nextPrevious,
        ...(history.length > 0 ? { history } : {}),
      };
      await store.save(envelope);
    },
  };
}
