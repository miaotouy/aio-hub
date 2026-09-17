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
 * Key 状态存储的规范化与明文索引迁移（纯函数，两端共享）
 *
 * 1.0.0 版本把熔断开关和恢复时间错误地保存为全局值，无法无歧义地映射到
 * 某个渠道；升级时保留 Key 状态与轮询位置，但丢弃这两个全局设置，让每个
 * 渠道按安全默认值重新显式启用。
 *
 * 历史版本以明文 API Key 作为状态索引键。这里把非哈希键重映射为
 * `hashApiKey(key)`，使旧文件在首次加载后即完成清洗。
 */

import { hashApiKey, isApiKeyHash } from "./apiKeyHash";

export interface KeyStatesStorageLike<
  TStatus = Record<string, unknown>,
  TSettings = Record<string, unknown>,
> {
  states?: Record<string, Record<string, TStatus>> | null;
  lastUsedIndices?: Record<string, number> | null;
  profileSettings?: Record<string, TSettings> | null;
}

export interface NormalizedKeyStates<TStatus, TSettings> {
  states: Record<string, Record<string, TStatus>>;
  lastUsedIndices: Record<string, number>;
  profileSettings: Record<string, TSettings>;
  /** 检测到需要清洗的历史数据，调用方应立即回写 */
  changed: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function normalizeKeyStatesStorage<
  TStatus extends object,
  TSettings extends object = Record<string, unknown>,
>(
  config: KeyStatesStorageLike<TStatus, TSettings>
): NormalizedKeyStates<TStatus, TSettings> {
  const states: Record<string, Record<string, TStatus>> = {};
  let changed = false;

  for (const [profileId, statusMap] of Object.entries(config.states ?? {})) {
    const migrated: Record<string, TStatus> = {};
    if (isRecord(statusMap)) {
      for (const [rawIndex, status] of Object.entries(statusMap)) {
        const fromPlaintext = !isApiKeyHash(rawIndex);
        const index = fromPlaintext ? hashApiKey(rawIndex) : rawIndex;
        if (fromPlaintext) changed = true;

        if (!isRecord(status)) {
          migrated[index] = {} as TStatus;
          continue;
        }

        const migratedStatus: Record<string, unknown> = {
          ...status,
          key: index,
        };
        // 旧版明文索引同时意味着历史错误消息里可能回显了同一把 Key
        if (fromPlaintext && rawIndex.length > 0) {
          const message = migratedStatus.lastErrorMessage;
          if (typeof message === "string") {
            migratedStatus.lastErrorMessage = message
              .split(rawIndex)
              .join("[redacted-key]");
          }
        }
        migrated[index] = migratedStatus as unknown as TStatus;
      }
    }
    states[profileId] = migrated;
  }

  return {
    states,
    lastUsedIndices: config.lastUsedIndices ?? {},
    profileSettings: config.profileSettings ?? {},
    changed,
  };
}
