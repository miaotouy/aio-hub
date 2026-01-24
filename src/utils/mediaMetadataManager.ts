import { createModuleLogger } from '@/utils/logger';
import { embedDataIntoPng } from './pngMetadataWriter';
import { extractPngTextChunks } from './pngMetadataReader';

const logger = createModuleLogger('utils/mediaMetadataManager');

const MAGIC_WORD = 'AIOP'; // AI OPeration parameters
const MAGIC_WORD_BYTES = new TextEncoder().encode(MAGIC_WORD);

/**
 * 将数据嵌入到媒体文件中 (PNG 使用 chunk，其他使用文件尾部追加)
 */
export async function embedMetadata(
  buffer: ArrayBuffer,
  mimeType: string,
  data: any
): Promise<ArrayBuffer> {
  const jsonString = JSON.stringify(data);

  if (mimeType === 'image/png') {
    try {
      return await embedDataIntoPng(buffer, 'aiop', jsonString);
    } catch (e) {
      logger.warn('PNG 嵌入失败，退回到通用嵌入模式', e);
    }
  }

  // 通用模式：文件尾部追加
  // 结构: [ORIGINAL_DATA] + [JSON_DATA] + [4_BYTE_LEN] + [4_BYTE_MAGIC]
  const jsonBytes = new TextEncoder().encode(jsonString);
  const lenBytes = new Uint8Array(4);
  new DataView(lenBytes.buffer).setUint32(0, jsonBytes.length, false);

  const originalUint8 = new Uint8Array(buffer);
  const newBuffer = new Uint8Array(originalUint8.length + jsonBytes.length + 4 + 4);

  newBuffer.set(originalUint8, 0);
  newBuffer.set(jsonBytes, originalUint8.length);
  newBuffer.set(lenBytes, originalUint8.length + jsonBytes.length);
  newBuffer.set(MAGIC_WORD_BYTES, originalUint8.length + jsonBytes.length + 4);

  logger.info('已使用通用模式在文件末尾嵌入元数据', { size: jsonBytes.length });
  return newBuffer.buffer;
}

/**
 * 从媒体文件中提取数据
 */
export async function extractMetadata(
  buffer: ArrayBuffer,
  mimeType: string
): Promise<any | null> {
  if (mimeType === 'image/png') {
    const chunks = await extractPngTextChunks(buffer);
    if (chunks['aiop']) {
      try {
        // pngMetadataWriter 写入的是 Base64，但 Reader 读取的是原始文本（根据实现）
        // pngMetadataWriter 的实现是: const base64Data = btoa(unescape(encodeURIComponent(textData)));
        // pngMetadataReader 的实现是: const text = new TextDecoder().decode(chunkData.subarray(nullSeparatorIndex + 1));
        // 所以我们需要判断是否是 Base64
        const text = chunks['aiop'];
        if (text.startsWith('{')) return JSON.parse(text);
        
        try {
          const decoded = decodeURIComponent(escape(atob(text)));
          return JSON.parse(decoded);
        } catch {
          return JSON.parse(text);
        }
      } catch (e) {
        logger.warn('解析 PNG aiop 块失败', e);
      }
    }
  }

  // 检查通用模式 (从末尾往前读)
  const uint8 = new Uint8Array(buffer);
  if (uint8.length < 8) return null;

  const magic = new TextDecoder().decode(uint8.subarray(uint8.length - 4));
  if (magic === MAGIC_WORD) {
    const len = new DataView(uint8.buffer).getUint32(uint8.length - 8, false);
    if (uint8.length >= len + 8) {
      const jsonBytes = uint8.subarray(uint8.length - 8 - len, uint8.length - 8);
      try {
        const jsonString = new TextDecoder().decode(jsonBytes);
        return JSON.parse(jsonString);
      } catch (e) {
        logger.warn('解析文件尾部元数据失败', e);
      }
    }
  }

  return null;
}