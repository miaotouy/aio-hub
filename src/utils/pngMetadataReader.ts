import { createModuleLogger } from '@/utils/logger';
import yaml from 'js-yaml';

const logger = createModuleLogger('utils/pngMetadataReader');

/**
 * PNG 元数据解析结果
 */
export interface PngMetadataPayload {
  /** SillyTavern 格式的角色卡数据 (从 ccv3 或 chara 块解析) */
  stCharacter?: any;
  /** AIO Hub 自身的导出包数据 (从 aiob 块解析) */
  aioBundle?: any;
  /** 所有的原始文本块 */
  chunks: Record<string, string>;
}

/**
 * 获取 PNG 图片中所有的文本块 (tEXt/iTXt)
 * @param buffer 图片 buffer
 * @returns 关键字到文本内容的映射对象
 */
export const extractPngTextChunks = async (buffer: Uint8Array | ArrayBuffer): Promise<Record<string, string>> => {
  const chunks: Record<string, string> = {};
  try {
    const uint8Buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dataView = new DataView(uint8Buffer.buffer);
    if (dataView.getUint32(0) !== 0x89504E47 || dataView.getUint32(4) !== 0x0D0A1A0A) {
      return chunks;
    }

    let offset = 8;
    while (offset < uint8Buffer.length) {
      const length = dataView.getUint32(offset);
      offset += 4;
      const type = new TextDecoder().decode(uint8Buffer.subarray(offset, offset + 4));
      offset += 4;

      if (type === 'tEXt') {
        const chunkData = uint8Buffer.subarray(offset, offset + length);
        const nullSeparatorIndex = chunkData.indexOf(0);
        if (nullSeparatorIndex !== -1) {
          const keyword = new TextDecoder().decode(chunkData.subarray(0, nullSeparatorIndex));
          const text = new TextDecoder().decode(chunkData.subarray(nullSeparatorIndex + 1));
          chunks[keyword] = text;
        }
      } else if (type === 'iTXt') {
        const chunkData = uint8Buffer.subarray(offset, offset + length);
        let ptr = 0;
        const keywordEnd = chunkData.indexOf(0, ptr);
        if (keywordEnd !== -1) {
          const keyword = new TextDecoder('latin1').decode(chunkData.subarray(ptr, keywordEnd));
          ptr = keywordEnd + 1;
          if (ptr + 2 <= chunkData.length) {
            const compressionFlag = chunkData[ptr++];
            ptr++; // Skip compression method
            const langTagEnd = chunkData.indexOf(0, ptr);
            if (langTagEnd !== -1) {
              ptr = langTagEnd + 1;
              const transKeywordEnd = chunkData.indexOf(0, ptr);
              if (transKeywordEnd !== -1) {
                ptr = transKeywordEnd + 1;
                if (compressionFlag === 0) {
                  const text = new TextDecoder('utf-8').decode(chunkData.subarray(ptr));
                  chunks[keyword] = text;
                }
              }
            }
          }
        }
      }

      offset += length;
      offset += 4; // Skip CRC
      if (type === 'IEND') break;
    }
  } catch (error) {
    logger.warn('提取 PNG 文本块失败', error);
  }
  return chunks;
};

/**
 * 统一解析 PNG 中的所有相关元数据
 */
export const parsePngMetadata = async (buffer: Uint8Array | ArrayBuffer): Promise<PngMetadataPayload> => {
  const chunks = await extractPngTextChunks(buffer);
  const result: PngMetadataPayload = { chunks };

  // 1. 解析 AIO Bundle (aiob) - 优先级最高
  if (chunks['aiob']) {
    try {
      const decodedStr = new TextDecoder().decode(
        Uint8Array.from(atob(chunks['aiob']), c => c.charCodeAt(0))
      );
      if (decodedStr.trim().startsWith('{')) {
        result.aioBundle = JSON.parse(decodedStr);
      } else {
        result.aioBundle = yaml.load(decodedStr);
      }
    } catch (e) {
      logger.warn('解析 PNG aiob 块失败', e);
    }
  }

  // 2. 解析 ST 角色卡 (ccv3 / chara)
  const stChunk = chunks['ccv3'] || chunks['chara'];
  if (stChunk) {
    try {
      const jsonStr = new TextDecoder().decode(
        Uint8Array.from(atob(stChunk), c => c.charCodeAt(0))
      );
      result.stCharacter = JSON.parse(jsonStr);
    } catch (e) {
      logger.warn('解析 ST 角色卡数据失败', e);
    }
  }

  return result;
};

/**
 * [兼容性函数] 解析 PNG 图片中的角色卡数据（SillyTavern 格式）
 * 建议优先使用 parsePngMetadata
 */
export const parseCharacterDataFromPng = async (buffer: Uint8Array | ArrayBuffer): Promise<object | null> => {
  const { stCharacter } = await parsePngMetadata(buffer);
  return stCharacter || null;
};


/**
 * 从 PNG 文件的 tEXt chunk 中提取数据。
 *
 * @param pngBuffer PNG 文件的 ArrayBuffer
 * @param keyword chunk 的关键字
 * @returns 提取出的文本数据，如果未找到则返回 null
 */
export function extractDataFromPng(
  pngBuffer: ArrayBuffer,
  keyword: string
): string | null {
  try {
    const uint8Buffer = new Uint8Array(pngBuffer);
    const dataView = new DataView(uint8Buffer.buffer);

    // 检查签名
    if (dataView.getUint32(0) !== 0x89504E47 || dataView.getUint32(4) !== 0x0D0A1A0A) {
      return null;
    }

    let currentOffset = 8;
    while (currentOffset < uint8Buffer.length) {
      const len = dataView.getUint32(currentOffset, false);
      const type = new TextDecoder().decode(uint8Buffer.subarray(currentOffset + 4, currentOffset + 8));

      if (type === 'tEXt') {
        const chunkData = uint8Buffer.subarray(currentOffset + 8, currentOffset + 8 + len);
        // 查找 null 分隔符
        let nullPos = -1;
        for (let i = 0; i < chunkData.length; i++) {
          if (chunkData[i] === 0) {
            nullPos = i;
            break;
          }
        }

        if (nullPos !== -1) {
          const foundKeyword = new TextDecoder().decode(chunkData.subarray(0, nullPos));
          if (foundKeyword === keyword) {
            const textBytes = chunkData.subarray(nullPos + 1);
            const base64Data = new TextDecoder().decode(textBytes);
            try {
              return decodeURIComponent(escape(atob(base64Data)));
            } catch (e) {
              // 如果不是 Base64 编码，尝试直接返回
              return base64Data;
            }
          }
        }
      }

      if (type === 'IEND') break;
      currentOffset += 4 + 4 + len + 4;
    }

    return null;
  } catch (error) {
    logger.error('从 PNG 提取数据失败', error as Error);
    return null;
  }
}
