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
 * 计算字符串的 SHA-256 哈希值并返回 Hex 字符串
 * @param text 要计算的文本
 * @returns 哈希值的 Hex 字符串
 */
export async function calculateHash(text: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex;
}

/**
 * 计算字符串的短哈希值 (前 8 位)
 * @param text 要计算的文本
 * @returns 8 位哈希字符串
 */
export async function calculateShortHash(text: string): Promise<string> {
  const fullHash = await calculateHash(text);
  return fullHash.substring(0, 8);
}
