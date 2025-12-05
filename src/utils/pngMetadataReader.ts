import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('utils/pngMetadataReader');

/**
 * 解析 PNG 图片中的角色卡数据（SillyTavern 格式）
 * @param buffer 图片 buffer
 * @returns 角色卡数据对象，如果不存在则返回 null
 */
export const parseCharacterDataFromPng = async (buffer: Uint8Array | ArrayBuffer): Promise<object | null> => {
    try {
      const uint8Buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
      const dataView = new DataView(uint8Buffer.buffer);
      if (dataView.getUint32(0) !== 0x89504E47 || dataView.getUint32(4) !== 0x0D0A1A0A) {
        return null; // Not a PNG
      }

      let offset = 8;
      const textChunks: { keyword: string; text: string }[] = [];

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
            textChunks.push({ keyword, text });
          }
        } else if (type === 'iTXt') {
          // 支持 iTXt 块 (International Text)
          // 结构: Keyword | Null | CompFlag | CompMethod | LangTag | Null | TransKeyword | Null | Text
          const chunkData = uint8Buffer.subarray(offset, offset + length);
          let ptr = 0;

          // 1. Keyword
          const keywordEnd = chunkData.indexOf(0, ptr);
          if (keywordEnd !== -1) {
            const keyword = new TextDecoder('latin1').decode(chunkData.subarray(ptr, keywordEnd));
            ptr = keywordEnd + 1;

            if (ptr + 2 <= chunkData.length) {
              const compressionFlag = chunkData[ptr++];
              ptr++; // Skip compression method

              // 2. Language tag
              const langTagEnd = chunkData.indexOf(0, ptr);
              if (langTagEnd !== -1) {
                ptr = langTagEnd + 1;

                // 3. Translated keyword
                const transKeywordEnd = chunkData.indexOf(0, ptr);
                if (transKeywordEnd !== -1) {
                  ptr = transKeywordEnd + 1;

                  // 4. Text
                  if (compressionFlag === 0) {
                    // 未压缩
                    const text = new TextDecoder('utf-8').decode(chunkData.subarray(ptr));
                    textChunks.push({ keyword, text });
                  } else {
                    // 压缩数据 (zlib)，暂不支持解压，跳过
                    // 如果未来需要支持压缩的 iTXt，需要引入 pako 或类似库
                    logger.debug(`跳过压缩的 iTXt 块: ${keyword}`);
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

      if (textChunks.length === 0) return null;

      const ccv3Chunk = textChunks.find(c => c.keyword === 'ccv3');
      if (ccv3Chunk) {
        const jsonStr = new TextDecoder().decode(
          Uint8Array.from(atob(ccv3Chunk.text), c => c.charCodeAt(0))
        );
        return JSON.parse(jsonStr);
      }

      const charaChunk = textChunks.find(c => c.keyword === 'chara');
      if (charaChunk) {
        const jsonStr = new TextDecoder().decode(
          Uint8Array.from(atob(charaChunk.text), c => c.charCodeAt(0))
        );
        return JSON.parse(jsonStr);
      }

      return null;
    } catch (error) {
      logger.warn('解析 PNG 字符数据失败，这可能是正常的，因为并非所有图片都包含此信息', error);
      return null;
    }
};