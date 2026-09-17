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
 * API Key 的稳定哈希索引
 *
 * Key 状态存储（`key-states.json`）以哈希而非明文作为状态索引，避免磁盘上
 * 出现可读凭据。哈希不可逆、长度固定，同一 Key 永远映射到同一索引。
 *
 * 定位与 `codec.ts` 一致：仅用于降低磁盘明文暴露面，不承担密码学强度。
 */

const HASH_PREFIX = "k_";
// 两段 32 位 FNV-1a 拼接，共 64 位（16 个十六进制字符）
const HASH_PATTERN = /^k_[0-9a-f]{16}$/;

function fnv1a(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function toHex(value: number): string {
  return value.toString(16).padStart(8, "0");
}

/** 生成 API Key 的稳定哈希索引，例如 `k_1a2b3c4d5e6f7081...` */
export function hashApiKey(apiKey: string): string {
  const first = fnv1a(apiKey, 0x811c9dc5);
  const second = fnv1a(apiKey, (0x01234567 ^ first) >>> 0);
  return `${HASH_PREFIX}${toHex(first)}${toHex(second)}`;
}

/** 判断字符串是否已经是 `hashApiKey` 产出的索引 */
export function isApiKeyHash(value: string): boolean {
  return HASH_PATTERN.test(value);
}
