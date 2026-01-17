import { createModuleLogger } from "./logger";

const logger = createModuleLogger("utils/encoding");

/**
 * 备选编码列表，按优先级排序
 * 涵盖了中文(GBK/Big5)、日韩(Shift-JIS/EUC)、以及西欧常用编码
 */
const FALLBACK_ENCODINGS = [
  "gbk",          // 简体中文 Windows
  "big5",         // 繁体中文
  "shift-jis",    // 日语
  "euc-jp",       // 日语
  "euc-kr",       // 韩语
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
  const uint8Array = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  if (uint8Array.length === 0) return "";

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