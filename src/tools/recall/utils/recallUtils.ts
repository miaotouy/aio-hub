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
 * 思绪集工具函数
 */

import {
  getPureModelId as globalGetPureModelId,
  getProfileId as globalGetProfileId,
} from "@/utils/modelIdUtils";

/**
 * 从 comboId (profileId:modelId) 中提取纯模型 ID
 * @deprecated 请直接从 @/utils/modelIdUtils 导入 getPureModelId
 */
export function getPureModelId(comboId: string | null | undefined): string {
  return globalGetPureModelId(comboId);
}

/**
 * 提取 Profile ID (冒号前部分)
 * @deprecated 请直接从 @/utils/modelIdUtils 导入 getProfileId
 */
export function getProfileId(comboId: string | null | undefined): string {
  return globalGetProfileId(comboId);
}

/**
 * 计算文本的 SHA-256 哈希值
 */
export async function calculateHash(text: string): Promise<string> {
  if (!text) return "";
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 格式化标签 (去除空格，转小写等)
 */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase();
}

