import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('utils/pngMetadataWriter');

/**
 * 将数据嵌入到 PNG 文件的 tEXt chunk 中。
 * 注意：目前只支持写入非压缩的 tEXt chunk。
 * 数据会自动进行 Base64 编码后存储。
 *
 * @param pngBuffer 原始 PNG 文件的 ArrayBuffer
 * @param keyword chunk 的关键字 (例如 'aiob', 'chara')
 * @param textData 要嵌入的文本数据
 * @returns 包含嵌入数据的新 PNG 文件的 ArrayBuffer
 */
export async function embedDataIntoPng(
  pngBuffer: ArrayBuffer,
  keyword: string,
  textData: string
): Promise<ArrayBuffer> {
  try {
    const uint8Buffer = new Uint8Array(pngBuffer);
    const dataView = new DataView(uint8Buffer.buffer);

    // 检查是否是有效的 PNG 文件签名
    if (dataView.getUint32(0) !== 0x89504E47 || dataView.getUint32(4) !== 0x0D0A1A0A) {
      throw new Error('Invalid PNG file signature.');
    }

    // 关键字不能包含 null 字节，且长度限制 (1-79 bytes)
    if (keyword.includes('\0') || keyword.length === 0 || keyword.length > 79) {
      throw new Error('Invalid keyword for PNG tEXt chunk.');
    }

    // 将文本数据进行 Base64 编码（与 reader 端期望的格式一致）
    const base64Data = btoa(unescape(encodeURIComponent(textData)));
    
    const keywordBytes = new TextEncoder().encode(keyword);
    const textBytes = new TextEncoder().encode(base64Data);

    // tEXt chunk 格式: Keyword (Latin-1) + Null 分隔符 + Text (Latin-1)
    const chunkDataLength = keywordBytes.length + 1 + textBytes.length;
    const chunkData = new Uint8Array(chunkDataLength);
    chunkData.set(keywordBytes, 0);
    chunkData[keywordBytes.length] = 0; // Null separator
    chunkData.set(textBytes, keywordBytes.length + 1);

    // CRC32 计算函数
    const crc32 = (buf: Uint8Array): number => {
      let crc = -1;
      for (let i = 0; i < buf.length; i++) {
        crc = (crc ^ buf[i]) >>> 0;
        for (let j = 0; j < 8; j++) {
          crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : (crc >>> 1);
        }
      }
      return (crc ^ -1) >>> 0; // 确保返回无符号整数
    };

    const typeBytes = new TextEncoder().encode('tEXt');
    
    // 构建完整的 chunk: Length(4) + Type(4) + Data(N) + CRC(4)
    const fullChunkLength = 4 + 4 + chunkDataLength + 4;
    const fullChunk = new Uint8Array(fullChunkLength);
    const chunkDataView = new DataView(fullChunk.buffer);
    
    let offset = 0;

    // 1. Chunk Data Length (Big-endian)
    chunkDataView.setUint32(offset, chunkDataLength, false);
    offset += 4;

    // 2. Chunk Type ('tEXt')
    fullChunk.set(typeBytes, offset);
    offset += 4;

    // 3. Chunk Data (Keyword + Null + Text)
    fullChunk.set(chunkData, offset);
    offset += chunkDataLength;

    // 4. CRC (计算 Type + Data 的 CRC)
    const crcInput = new Uint8Array(4 + chunkDataLength);
    crcInput.set(typeBytes, 0);
    crcInput.set(chunkData, 4);
    const crcVal = crc32(crcInput);
    chunkDataView.setUint32(offset, crcVal, false);

    // 找到 IEND chunk 的位置
    let currentOffset = 8; // 跳过 PNG 签名
    let iendOffset = -1;

    while (currentOffset < uint8Buffer.length) {
      const len = dataView.getUint32(currentOffset, false);
      const type = new TextDecoder().decode(uint8Buffer.subarray(currentOffset + 4, currentOffset + 8));
      if (type === 'IEND') {
        iendOffset = currentOffset;
        break;
      }
      currentOffset += 4 + 4 + len + 4; // Length + Type + Data + CRC
    }

    if (iendOffset === -1) {
      throw new Error('IEND chunk not found in PNG file.');
    }

    // 构建新的 PNG 文件
    const newPngLength = uint8Buffer.length + fullChunkLength;
    const newPngBuffer = new Uint8Array(newPngLength);

    // 复制 PNG 签名和 IEND 之前的所有 chunks
    newPngBuffer.set(uint8Buffer.subarray(0, iendOffset));
    // 插入新的 tEXt chunk
    newPngBuffer.set(fullChunk, iendOffset);
    // 复制 IEND chunk
    newPngBuffer.set(uint8Buffer.subarray(iendOffset), iendOffset + fullChunkLength);

    logger.info(`成功将数据嵌入到 PNG 文件，关键字: ${keyword}, 数据大小: ${base64Data.length} bytes`);
    return newPngBuffer.buffer;

  } catch (error) {
    logger.error('嵌入数据到 PNG 失败', error as Error);
    throw error;
  }
}