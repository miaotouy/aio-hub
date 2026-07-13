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

import { createModuleLogger } from "./logger";

const logger = createModuleLogger("utils/encoding");

/**
 * 备选编码列表，按优先级排序
 * 涵盖了中文(GBK/Big5)、日韩(Shift-JIS/EUC)、以及西欧常用编码
 */
const FALLBACK_ENCODINGS = [
  "gb18030", // 简体中文，GBK 超集
  "gbk", // 简体中文 Windows
  "big5", // 繁体中文
  "shift-jis", // 日语
  "euc-jp", // 日语
  "euc-kr", // 韩语
  "windows-1252", // 西欧语言 (Latin-1)
];

/**
 * 智能解码二进制数据为文本
 *
 * 按照以下优先级尝试解码：
 * 1. UTF-8 (严格模式，失败则抛出)
 * 2. 备选编码列表 (GBK, Big5, Shift-JIS 等)
 * 3. UTF-8 (宽松模式，使用替换字符)
 *
 * @param buffer 要解码的二进制数据
 * @returns 解码后的字符串
 */
export function smartDecode(buffer: Uint8Array | ArrayBuffer): string {
  const uint8Array =
    buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (uint8Array.length === 0) return "";

  // BOM 优先：外挂字幕里 UTF-16 很常见，不能先按 GBK 误解码。
  if (uint8Array.length >= 2) {
    const first = uint8Array[0];
    const second = uint8Array[1];
    if (first === 0xff && second === 0xfe) {
      return new TextDecoder("utf-16le").decode(uint8Array.subarray(2));
    }
    if (first === 0xfe && second === 0xff) {
      return new TextDecoder("utf-16be").decode(uint8Array.subarray(2));
    }
  }

  // 无 BOM 的 UTF-16 文本通常每隔一个字节出现 NULL。
  const sample = uint8Array.subarray(0, Math.min(uint8Array.length, 4096));
  let evenNulls = 0;
  let oddNulls = 0;
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] !== 0) continue;
    if (i % 2 === 0) {
      evenNulls++;
    } else {
      oddNulls++;
    }
  }
  const nullThreshold = Math.max(4, sample.length / 12);
  if (oddNulls > nullThreshold && oddNulls > evenNulls * 2) {
    return new TextDecoder("utf-16le").decode(uint8Array);
  }
  if (evenNulls > nullThreshold && evenNulls > oddNulls * 2) {
    return new TextDecoder("utf-16be").decode(uint8Array);
  }

  // 1. 优先尝试标准的 UTF-8 解码
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(uint8Array);
  } catch (e) {
    // UTF-8 失败，进入备选方案
  }

  // 2. 遍历尝试常见的 Legacy 编码
  for (const encoding of FALLBACK_ENCODINGS) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true });
      const result = decoder.decode(uint8Array);
      logger.info(`Successfully decoded using ${encoding}`);
      return result;
    } catch (err) {
      // 继续尝试下一个
    }
  }

  // 3. 如果全部失败，回退到宽松模式的 UTF-8（会产生替换字符 ）
  logger.warn("All specific decodings failed, falling back to lenient UTF-8.");
  return new TextDecoder("utf-8").decode(uint8Array);
}
