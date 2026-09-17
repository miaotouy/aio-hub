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
 * LLM 敏感数据轻量混淆编解码
 *
 * 目标：让磁盘上的敏感数据文件不再以可读 JSON 形态出现，降低凭据以明文
 * 形式长期驻留在本地文件系统中的暴露面。
 *
 * 定位：这是轻量混淆，不是密码学意义上的加密。种子固定在代码中，任何能执行
 * 本项目代码的进程都可以解码。它不防内存逆向，也不承担网络传输安全职责。
 *
 * 文件形态：`AIOHUBVLT1.<base64 salt>.<base64 cipher>`，
 * 每次编码使用随机 salt，因此同一份明文每次落盘结果都不同。
 */

export const LLM_OBFUSCATION_VERSION = 1;

const MAGIC = "AIOHUBVLT";
const SEED = "aiohub.llm.vault.v1";
const SALT_LENGTH = 8;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const BASE64_LOOKUP: number[] = (() => {
  const table = new Array<number>(128).fill(-1);
  for (let index = 0; index < BASE64_ALPHABET.length; index++) {
    table[BASE64_ALPHABET.charCodeAt(index)] = index;
  }
  return table;
})();

function encodeBase64(bytes: Uint8Array): string {
  let output = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const hasSecond = index + 1 < bytes.length;
    const hasThird = index + 2 < bytes.length;
    const first = bytes[index];
    const second = hasSecond ? bytes[index + 1] : 0;
    const third = hasThird ? bytes[index + 2] : 0;

    output += BASE64_ALPHABET[first >> 2];
    output += BASE64_ALPHABET[((first & 0x03) << 4) | (second >> 4)];
    output += hasSecond
      ? BASE64_ALPHABET[((second & 0x0f) << 2) | (third >> 6)]
      : "=";
    output += hasThird ? BASE64_ALPHABET[third & 0x3f] : "=";
  }
  return output;
}

function decodeBase64(text: string): Uint8Array | null {
  const compact = text.replace(/[\r\n\t ]/g, "");
  if (compact.length === 0 || compact.length % 4 !== 0) return null;

  const padding = compact.endsWith("==") ? 2 : compact.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((compact.length / 4) * 3 - padding);
  let offset = 0;

  for (let index = 0; index < compact.length; index += 4) {
    const codes = [0, 1, 2, 3].map((step) => {
      const charCode = compact.charCodeAt(index + step);
      if (charCode === 61) return 0;
      return charCode < 128 ? BASE64_LOOKUP[charCode] : -1;
    });
    if (codes.some((code) => code < 0)) return null;

    const [first, second, third, fourth] = codes;
    const chunk = (first << 18) | (second << 12) | (third << 6) | fourth;

    if (offset < bytes.length) bytes[offset++] = (chunk >> 16) & 0xff;
    if (offset < bytes.length) bytes[offset++] = (chunk >> 8) & 0xff;
    if (offset < bytes.length) bytes[offset++] = chunk & 0xff;
  }

  return bytes;
}

function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < bytes.length; index++) {
    hash ^= bytes[index];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createKeystream(salt: Uint8Array, length: number): Uint8Array {
  const seedBytes = textEncoder.encode(SEED);
  const material = new Uint8Array(seedBytes.length + salt.length);
  material.set(seedBytes);
  material.set(salt, seedBytes.length);

  let state = fnv1a(material) || 0x9e3779b9;
  const keystream = new Uint8Array(length);

  for (let index = 0; index < length; index += 4) {
    state = (state ^ (state << 13)) >>> 0;
    state = (state ^ (state >>> 17)) >>> 0;
    state = (state ^ (state << 5)) >>> 0;

    keystream[index] = state & 0xff;
    if (index + 1 < length) keystream[index + 1] = (state >>> 8) & 0xff;
    if (index + 2 < length) keystream[index + 2] = (state >>> 16) & 0xff;
    if (index + 3 < length) keystream[index + 3] = (state >>> 24) & 0xff;
  }

  return keystream;
}

function createSalt(length = SALT_LENGTH): Uint8Array {
  const salt = new Uint8Array(length);
  const cryptoObject =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;
  if (cryptoObject && typeof cryptoObject.getRandomValues === "function") {
    cryptoObject.getRandomValues(salt);
    return salt;
  }
  for (let index = 0; index < length; index++) {
    salt[index] = Math.floor(Math.random() * 256);
  }
  return salt;
}

/**
 * 将任意可 JSON 序列化的载荷编码为混淆文本
 */
export function encodeObfuscatedPayload(payload: unknown): string {
  const data = textEncoder.encode(JSON.stringify(payload ?? null));
  const salt = createSalt();
  const keystream = createKeystream(salt, data.length);
  const cipher = new Uint8Array(data.length);
  for (let index = 0; index < data.length; index++) {
    cipher[index] = data[index] ^ keystream[index];
  }
  return `${MAGIC}${LLM_OBFUSCATION_VERSION}.${encodeBase64(salt)}.${encodeBase64(
    cipher
  )}`;
}

/**
 * 解码混淆文本。格式不匹配或内容损坏时返回 null，由调用方决定回退策略。
 */
export function decodeObfuscatedPayload(text: string): unknown | null {
  if (typeof text !== "string") return null;

  const trimmed = text.trim();
  const header = `${MAGIC}${LLM_OBFUSCATION_VERSION}.`;
  if (!trimmed.startsWith(header)) return null;

  const body = trimmed.slice(header.length);
  const separatorIndex = body.indexOf(".");
  if (separatorIndex <= 0) return null;

  const salt = decodeBase64(body.slice(0, separatorIndex));
  const cipher = decodeBase64(body.slice(separatorIndex + 1));
  if (!salt || !cipher) return null;

  const keystream = createKeystream(salt, cipher.length);
  const data = new Uint8Array(cipher.length);
  for (let index = 0; index < cipher.length; index++) {
    data[index] = cipher[index] ^ keystream[index];
  }

  try {
    return JSON.parse(textDecoder.decode(data));
  } catch {
    return null;
  }
}
