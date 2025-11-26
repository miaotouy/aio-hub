import { createModuleLogger } from '@/utils/logger';
import * as exifr from 'exifr';

const logger = createModuleLogger('composables/media-info-parser');

// ==================== 类型定义 ====================

export interface WebUIInfo {
  positivePrompt: string;
  negativePrompt: string;
  generationInfo: string;
  civitaiResources?: any[];
}

export interface ImageMetadataResult {
  webuiInfo: WebUIInfo;
  comfyuiWorkflow: string | object;
  stCharacterInfo: object | null;
  fullExifInfo: object | null;
}

// ==================== 可组合函数 ====================

/**
 * 图片元数据解析器 Composable
 * 提供解析 AI 生成图片元数据的核心业务逻辑
 */
export function useMediaInfoParser() {
  /**
   * 解析图片 buffer 中的元数据
   * @param buffer 图片文件的 Uint8Array buffer
   * @returns 解析后的元数据
   */
  const parseImageBuffer = async (buffer: Uint8Array): Promise<ImageMetadataResult> => {
    const output = await exifr.parse(buffer, true).catch(err => {
      logger.warn('exifr 解析失败，将继续尝试其他方法', err);
      return null;
    });

    let webuiInfo: WebUIInfo = { positivePrompt: '', negativePrompt: '', generationInfo: '' };
    let comfyuiWorkflow: string | object = '';
    let stCharacterInfo: object | null = null;
    // --- 预处理：清洗数据 ---
    // 在进行任何解析之前，先确保 output 中的 UserComment/parameters 是正确解码的字符串
    // 这样不仅 parseWebUIInfo 能用，fullExifInfo 也能显示可读文本
    if (output) {
      let rawParams = output.parameters || output.userComment;

      // 1. 处理类数组对象或 Uint8Array
      if (rawParams && typeof rawParams === 'object') {
        const buffer = convertToUint8Array(rawParams);
        if (buffer) {
          rawParams = decodeUserComment(buffer);
        }
      }

      // 2. 处理被错误解码的字符串 (回滚并重解码)
      if (typeof rawParams === 'string' && rawParams.startsWith('UNICODE')) {
        const recoveredBuffer = stringToBuffer(rawParams);
        rawParams = decodeUserComment(recoveredBuffer);
      }

      // 3. 清理字符串
      if (typeof rawParams === 'string') {
        rawParams = rawParams.replace(/\0/g, '').trim();

        // 4. 回写清洗后的数据到 output
        // 优先更新来源字段，确保 fullExifInfo 显示正确
        if (output.userComment) output.userComment = rawParams;
        if (output.parameters) output.parameters = rawParams;
      }
    }

    const fullExifInfo: object | null = output ? output : null;

    // --- ST 角色卡解析 ---
    stCharacterInfo = await parseCharacterData(buffer);

    // --- WebUI 信息解析 ---
    // 现在可以直接从 output 中安全获取已清洗的字符串
    const parameters = output?.parameters || output?.userComment;
    if (parameters && typeof parameters === 'string') {
      webuiInfo = parseWebUIInfo(parameters);
    }

    // --- ComfyUI 信息解析 ---
    if (output?.workflow) {
      try {
        comfyuiWorkflow = JSON.parse(output.workflow);
      } catch (e) {
        comfyuiWorkflow = output.workflow; // a string if not a valid json
      }
    }

    return {
      webuiInfo,
      comfyuiWorkflow,
      stCharacterInfo,
      fullExifInfo,
    };
  };

  /**
   * 尝试将各种奇怪的输入转换为 Uint8Array
   */
  const convertToUint8Array = (data: any): Uint8Array | null => {
    if (data instanceof Uint8Array) return data;
    // 处理类数组对象 { "0": 85, "1": 78 ... }
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const keys = Object.keys(data);
      // 简单检查：key 都是数字
      if (keys.length > 0 && keys.every(k => !isNaN(Number(k)))) {
        const len = Math.max(...keys.map(Number)) + 1;
        const arr = new Uint8Array(len);
        for (const key of keys) {
          arr[Number(key)] = data[key];
        }
        return arr;
      }
    }
    // 处理普通数组
    if (Array.isArray(data)) {
      return new Uint8Array(data);
    }
    return null;
  };

  /**
   * 将被错误解码为 Latin1/Binary 的字符串还原为 Buffer
   */
  const stringToBuffer = (str: string): Uint8Array => {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i);
    }
    return arr;
  };

  /**
   * 智能解码 UserComment Buffer
   * 处理 EXIF 规范中的编码前缀 (UNICODE, ASCII 等)
   */
  const decodeUserComment = (buffer: Uint8Array): string => {
    // 检查前 8 个字节的编码标识
    if (buffer.length < 8) {
      return new TextDecoder().decode(buffer);
    }

    const prefixData = buffer.slice(0, 8);
    const prefix = new TextDecoder('ascii').decode(prefixData);

    // 检查 UNICODE 前缀 (55 4E 49 43 4F 44 45 00)
    if (prefix.startsWith('UNICODE')) {
      const payload = buffer.slice(8);
      // 检测字节序: 统计奇数位和偶数位的 0x00 数量
      // 英文文本在 UTF-16 中会有大量的 0x00
      // LE (Little Endian): 'A' -> 41 00 (0 在奇数位)
      // BE (Big Endian):    'A' -> 00 41 (0 在偶数位)
      let evenNulls = 0;
      let oddNulls = 0;
      for (let i = 0; i < Math.min(payload.length, 100); i++) {
        if (payload[i] === 0) {
          if (i % 2 === 0) evenNulls++;
          else oddNulls++;
        }
      }

      const encoding = evenNulls > oddNulls ? 'utf-16be' : 'utf-16le';
      logger.debug(`检测到 UNICODE 编码，判定为 ${encoding}`, { evenNulls, oddNulls });

      try {
        return new TextDecoder(encoding).decode(payload);
      } catch (e) {
        logger.warn(`尝试使用 ${encoding} 解码失败`, e);
        // Fallback
        return new TextDecoder('utf-16le').decode(payload);
      }
    }

    // 检查 ASCII 前缀 (41 53 43 49 49 00 00 00)
    if (prefix.startsWith('ASCII')) {
      const payload = buffer.slice(8);
      return new TextDecoder('utf-8').decode(payload);
    }

    // 默认回退到 UTF-8
    return new TextDecoder().decode(buffer);
  };

  /**
   * 解析 WebUI 风格的参数信息
   * @param parameters 参数字符串
   * @returns WebUI 信息对象
   */
  const parseWebUIInfo = (parameters: string): WebUIInfo => {
    const parts = parameters.split('Negative prompt:');
    const positivePrompt = parts[0].trim();
    const rest = parts[1] || '';
    const fields = [
      "Steps",
      "Sampler",
      "CFG scale",
      "Seed",
      "Size",
      "Model",
      "VAE hash",
      "VAE",
      "TI hashes",
      "Version",
      "Hashes",
      "Civitai resources",
      "Civitai metadata",
      "Clip skip",
      "Created Date",
    ];
    const regex = new RegExp(`(${fields.join('|')}):\\s*(.*?)\\s*(?=(${fields.join('|')}):|$)`, 'g');

    const genInfoObject: { [key: string]: string } = {};
    let match;
    while ((match = regex.exec(rest)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/,$/, '');
      genInfoObject[key] = value;
    }

    let civitaiResources: any[] | undefined;
    const rawResources = genInfoObject['Civitai resources'];
    if (rawResources) {
      try {
        civitaiResources = JSON.parse(rawResources);
      } catch (e) {
        // 尝试提取 [...] 部分，以防解析失败（例如后面跟了其他未被识别的字段）
        const jsonMatch = rawResources.match(/\[.*\]/s);
        if (jsonMatch) {
          try {
            civitaiResources = JSON.parse(jsonMatch[0]);
          } catch (e2) {
            logger.warn('尝试提取并解析 Civitai resources 失败', e2);
          }
        } else {
          logger.warn('解析 Civitai resources 失败', e);
        }
      }

      if (civitaiResources) {
        // 从 generationInfo 中移除 Civitai resources，因为它太长了，单独展示更好
        delete genInfoObject['Civitai resources'];
      }
    }

    // 移除空的 Civitai metadata
    const civitaiMetadata = genInfoObject['Civitai metadata'];
    if (civitaiMetadata && (civitaiMetadata.trim() === '{}' || civitaiMetadata.trim() === '')) {
      delete genInfoObject['Civitai metadata'];
    }

    const generationInfo = Object.entries(genInfoObject)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    // 提取负面提示时，需要考虑到它可能不存在，或者后面直接就是生成参数
    const negativePromptEndIndex = rest.search(new RegExp(`(${fields.join('|')}):`));
    const negativePrompt = (negativePromptEndIndex === -1 ? rest : rest.substring(0, negativePromptEndIndex)).trim();

    return { positivePrompt, negativePrompt, generationInfo, civitaiResources };
  };

  /**
   * 解析 PNG 图片中的角色卡数据（SillyTavern 格式）
   * @param buffer 图片 buffer
   * @returns 角色卡数据对象，如果不存在则返回 null
   */
  const parseCharacterData = async (buffer: Uint8Array | ArrayBuffer): Promise<object | null> => {
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

  return {
    parseImageBuffer,
    parseWebUIInfo,
    parseCharacterData,
  };
}