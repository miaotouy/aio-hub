import { createModuleLogger } from '@/utils/logger';
import * as exifr from 'exifr';

const logger = createModuleLogger('composables/media-info-parser');

// ==================== 类型定义 ====================

export interface WebUIInfo {
  positivePrompt: string;
  negativePrompt: string;
  generationInfo: string;
}

export interface ImageMetadataResult {
  webuiInfo: WebUIInfo;
  comfyuiWorkflow: string | object;
  stCharacterInfo: object | null;
  fullExifInfo: object | null;
}

// ==================== Composable ====================

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
    const fullExifInfo: object | null = output ? output : null;

    // --- ST Character Card Parsing ---
    stCharacterInfo = await parseCharacterData(buffer);

    // --- WebUI Info Parsing ---
    let parameters = output?.parameters || output?.userComment;
    if (parameters) {
      if (parameters instanceof Uint8Array) {
        parameters = new TextDecoder().decode(parameters);
      }
      if (typeof parameters === 'string') {
        webuiInfo = parseWebUIInfo(parameters);
      }
    }

    // --- ComfyUI Info Parsing ---
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
   * 解析 WebUI 风格的参数信息
   * @param parameters 参数字符串
   * @returns WebUI 信息对象
   */
  const parseWebUIInfo = (parameters: string): WebUIInfo => {
    const parts = parameters.split('Negative prompt:');
    const positivePrompt = parts[0].trim();
    const rest = parts[1] || '';

    const fields = ["Steps", "Sampler", "CFG scale", "Seed", "Size", "Model", "VAE hash", "VAE", "TI hashes", "Version", "Hashes"];
    const regex = new RegExp(`(${fields.join('|')}):\\s*(.*?)\\s*(?=(${fields.join('|')}):|$)`, 'g');

    const genInfoObject: { [key: string]: string } = {};
    let match;
    while ((match = regex.exec(rest)) !== null) {
      const key = match[1].trim();
      const value = match[2].trim().replace(/,$/, '');
      genInfoObject[key] = value;
    }

    const generationInfo = Object.entries(genInfoObject)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');
    
    // 提取负面提示时，需要考虑到它可能不存在，或者后面直接就是生成参数
    const negativePromptEndIndex = rest.search(new RegExp(`(${fields.join('|')}):`));
    const negativePrompt = (negativePromptEndIndex === -1 ? rest : rest.substring(0, negativePromptEndIndex)).trim();

    return { positivePrompt, negativePrompt, generationInfo };
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