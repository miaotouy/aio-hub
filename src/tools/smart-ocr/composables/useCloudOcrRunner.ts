/**
 * 云端 OCR 识别引擎
 */

import type { OcrProfile } from '../../../types/ocr-profiles';
import type { ImageBlock, OcrResult } from '../types';

/**
 * 百度云 Access Token 缓存
 */
interface BaiduTokenCache {
  token: string;
  expiresAt: number; // 时间戳
}

const baiduTokenCache = new Map<string, BaiduTokenCache>();

/**
 * 获取百度云 Access Token
 */
async function getBaiduAccessToken(apiKey: string, apiSecret: string): Promise<string> {
  // 检查缓存
  const cacheKey = `${apiKey}:${apiSecret}`;
  const cached = baiduTokenCache.get(cacheKey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  // 请求新的 token
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${apiSecret}`;
  
  try {
    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();
    
    if (data.error) {
      throw new Error(`百度云认证失败: ${data.error_description || data.error}`);
    }
    
    if (!data.access_token) {
      throw new Error('获取百度云 access_token 失败');
    }
    
    // 缓存 token（提前5分钟过期以避免边界情况）
    const expiresIn = (data.expires_in || 2592000) * 1000; // 默认30天
    baiduTokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn - 5 * 60 * 1000,
    });
    
    return data.access_token;
  } catch (error) {
    throw new Error(`获取百度云 access_token 失败: ${(error as Error).message}`);
  }
}

/**
 * 调用百度云 OCR API
 */
async function callBaiduOcr(
  imageBase64: string,
  accessToken: string,
  endpoint: string
): Promise<string> {
  const url = `${endpoint}?access_token=${accessToken}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: `image=${encodeURIComponent(imageBase64)}`,
    });
    
    const data = await response.json();
    
    if (data.error_code) {
      throw new Error(`百度云 OCR 错误: ${data.error_msg || data.error_code}`);
    }
    
    if (!data.words_result || !Array.isArray(data.words_result)) {
      throw new Error('百度云 OCR 返回格式异常');
    }
    
    // 提取所有识别的文字并用换行连接
    const text = data.words_result
      .map((item: any) => item.words)
      .filter(Boolean)
      .join('\n');
    
    return text;
  } catch (error) {
    throw new Error(`百度云 OCR 请求失败: ${(error as Error).message}`);
  }
}

/**
 /**
  * 调用腾讯云 OCR API (占位实现)
  */
 async function callTencentOcr(
   _imageBase64: string,
   _profile: OcrProfile
 ): Promise<string> {
   // TODO: 实现腾讯云 OCR
   throw new Error('腾讯云 OCR 暂未实现，敬请期待');
 }
 
 /**
  * 调用阿里云 OCR API (占位实现)
  */
 async function callAliyunOcr(
   _imageBase64: string,
   _profile: OcrProfile
 ): Promise<string> {
   // TODO: 实现阿里云 OCR
   throw new Error('阿里云 OCR 暂未实现，敬请期待');
 }
 
 /**
  * 调用自定义 OCR API (占位实现)
  */
 async function callCustomOcr(
   _imageBase64: string,
   _profile: OcrProfile
 ): Promise<string> {
   // TODO: 实现自定义 OCR
   throw new Error('自定义 OCR 需要根据您的 API 规范进行配置');
 }
/**
 * 使用云端 OCR 识别图片块
 */
async function recognizeWithCloudOcr(
  imageBase64: string,
  profile: OcrProfile
): Promise<string> {
  switch (profile.provider) {
    case 'baidu': {
      if (!profile.credentials.apiKey || !profile.credentials.apiSecret) {
        throw new Error('百度云 OCR 需要 API Key 和 API Secret');
      }
      
      const accessToken = await getBaiduAccessToken(
        profile.credentials.apiKey,
        profile.credentials.apiSecret
      );
      
      return await callBaiduOcr(imageBase64, accessToken, profile.endpoint);
    }
    
    case 'tencent':
      return await callTencentOcr(imageBase64, profile);
    
    case 'aliyun':
      return await callAliyunOcr(imageBase64, profile);
    
    case 'custom':
      return await callCustomOcr(imageBase64, profile);
    
    default:
      throw new Error(`不支持的服务商类型: ${profile.provider}`);
  }
}

/**
 * 云端 OCR 运行器
 */
export function useCloudOcrRunner() {
  /**
   * 批量识别图片块
   */
  const runCloudOcr = async (
    blocks: ImageBlock[],
    profile: OcrProfile,
    onProgress?: (results: OcrResult[]) => void
  ): Promise<OcrResult[]> => {
    const results: OcrResult[] = blocks.map(block => ({
      blockId: block.id,
      imageId: block.imageId,
      text: '',
      status: 'pending' as const,
    }));

    // 通知初始状态
    onProgress?.(results);

    const concurrency = profile.concurrency || 3;
    const delay = profile.delay || 0;

    console.log(`使用云端 OCR (${profile.name})，并发数: ${concurrency}, 延迟: ${delay}ms`);

    // 并发处理函数
    const processBlock = async (index: number) => {
      const block = blocks[index];

      // 更新状态为处理中
      results[index].status = 'processing';
      onProgress?.([...results]);

      try {
        console.log(`识别第 ${index + 1}/${blocks.length} 个图片块...`);

        // 将 canvas 转换为 base64 (不带前缀)
        const imageBase64 = block.canvas.toDataURL('image/png').split(',')[1];

        // 调用云端 OCR
        const text = await recognizeWithCloudOcr(imageBase64, profile);

        // 更新结果
        results[index].text = text.trim();
        results[index].status = 'success';

        console.log(`第 ${index + 1} 个块识别完成`);
      } catch (error) {
        console.error(`第 ${index + 1} 个块识别失败:`, error);
        results[index].status = 'error';
        results[index].error = (error as Error).message;
      }

      // 通知进度更新
      onProgress?.([...results]);

      // 添加延迟
      if (delay > 0 && index < blocks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    };

    // 使用并发控制处理所有块
    const indices = Array.from({ length: blocks.length }, (_, i) => i);
    
    for (let i = 0; i < indices.length; i += concurrency) {
      const batch = indices.slice(i, i + concurrency);
      await Promise.all(batch.map(index => processBlock(index)));
    }

    return results;
  };

  return {
    runCloudOcr,
  };
}