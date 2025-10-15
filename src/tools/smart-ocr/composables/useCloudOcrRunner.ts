/**
 * 云端 OCR 识别引擎
 */

import type { OcrProfile } from '../../../types/ocr-profiles';
import type { ImageBlock, OcrResult } from '../types';
import { buildUrl, buildHeaders, buildBody, getValueByPath } from '@utils/apiRequest';
import { logger } from '@utils/logger';

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
    logger.debug('CloudOcrRunner', '百度云 Access Token 缓存命中', { expiresAt: new Date(cached.expiresAt) });
    return cached.token;
  }

  logger.debug('CloudOcrRunner', '百度云 Access Token 缓存未命中，请求新 token');

  // 请求新的 token
  const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${apiSecret}`;
  
  try {
    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();
    
    if (data.error) {
      logger.error('CloudOcrRunner', '百度云认证失败', new Error(data.error_description || data.error), {
        error: data.error,
        errorDescription: data.error_description
      });
      throw new Error(`百度云认证失败: ${data.error_description || data.error}`);
    }
    
    if (!data.access_token) {
      logger.error('CloudOcrRunner', '百度云 access_token 响应缺失');
      throw new Error('获取百度云 access_token 失败');
    }
    
    // 缓存 token（提前5分钟过期以避免边界情况）
    const expiresIn = (data.expires_in || 2592000) * 1000; // 默认30天
    baiduTokenCache.set(cacheKey, {
      token: data.access_token,
      expiresAt: Date.now() + expiresIn - 5 * 60 * 1000,
    });
    
    logger.info('CloudOcrRunner', '百度云 Access Token 获取成功', {
      expiresIn: `${Math.floor(expiresIn / 1000 / 60)} 分钟`
    });
    
    return data.access_token;
  } catch (error) {
    logger.error('CloudOcrRunner', '获取百度云 access_token 失败', error);
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
  
  logger.debug('CloudOcrRunner', '调用百度云 OCR API', {
    endpoint,
    imageSize: `${Math.floor(imageBase64.length / 1024)} KB`
  });
  
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
      logger.error('CloudOcrRunner', '百度云 OCR API 返回错误', new Error(data.error_msg || String(data.error_code)), {
        errorCode: data.error_code,
        errorMsg: data.error_msg
      });
      throw new Error(`百度云 OCR 错误: ${data.error_msg || data.error_code}`);
    }
    
    if (!data.words_result || !Array.isArray(data.words_result)) {
      logger.error('CloudOcrRunner', '百度云 OCR 返回格式异常', new Error('返回格式异常'), { responseData: data });
      throw new Error('百度云 OCR 返回格式异常');
    }
    
    // 提取所有识别的文字并用换行连接
    const text = data.words_result
      .map((item: any) => item.words)
      .filter(Boolean)
      .join('\n');
    
    logger.debug('CloudOcrRunner', '百度云 OCR 识别成功', {
      wordsCount: data.words_result.length,
      textLength: text.length
    });
    
    return text;
  } catch (error) {
    logger.error('CloudOcrRunner', '百度云 OCR 请求失败', error, { endpoint });
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
 * 调用自定义 OCR API
 */
async function callCustomOcr(
  imageBase64: string,
  profile: OcrProfile
): Promise<string> {
  // 检查自定义配置是否存在
  if (!profile.apiRequest) {
    logger.error('CloudOcrRunner', '自定义 OCR 服务未配置', new Error('服务未配置'), { profileName: profile.name });
    throw new Error('自定义 OCR 服务未配置。请在设置中配置 API 请求结构。');
  }

  const { urlTemplate, method, headers, bodyTemplate, variables, resultPath } = profile.apiRequest;

  // 构建变量映射表
  const variableValues: Record<string, any> = {};
  
  // 从 variables 数组中提取所有变量的值
  variables.forEach(variable => {
    variableValues[variable.key] = variable.value;
  });
  
  // 添加特殊变量：图片 Base64 数据
  variableValues['imageBase64'] = imageBase64;

  try {
    // 使用工具函数构建请求
    const url = buildUrl(urlTemplate, variableValues);
    const requestHeaders = buildHeaders(headers, variableValues);
    const requestBody = buildBody(bodyTemplate, variableValues);

    logger.debug('CloudOcrRunner', '自定义 OCR 请求', {
      profileName: profile.name,
      url,
      method,
      headers: requestHeaders,
      bodyPreview: requestBody.substring(0, 200) + '...',
      imageSize: `${Math.floor(imageBase64.length / 1024)} KB`
    });

    // 发送请求
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: method !== 'GET' ? requestBody : undefined,
    });

    // 检查响应状态
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('CloudOcrRunner', '自定义 OCR HTTP 请求失败', new Error(`HTTP ${response.status}: ${response.statusText}`), {
        profileName: profile.name,
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      throw new Error(`HTTP ${response.status}: ${response.statusText}. ${errorText}`);
    }

    // 解析响应 JSON
    const responseData = await response.json();

    // 根据 resultPath 提取结果
    const text = getValueByPath(responseData, resultPath);

    if (typeof text !== 'string') {
      logger.error('CloudOcrRunner', '自定义 OCR 结果提取失败', new Error(`路径 "${resultPath}" 指向的值类型为 ${typeof text}`), {
        profileName: profile.name,
        resultPath,
        actualType: typeof text,
        responseData
      });
      throw new Error(
        `无法从响应中提取文本。路径 "${resultPath}" 指向的值类型为 ${typeof text}，期望为 string。` +
        `\n响应数据: ${JSON.stringify(responseData, null, 2)}`
      );
    }

    logger.debug('CloudOcrRunner', '自定义 OCR 识别成功', {
      profileName: profile.name,
      textLength: text.length
    });

    return text;
  } catch (error) {
    logger.error('CloudOcrRunner', '自定义 OCR 请求失败', error, {
      profileName: profile.name
    });
    if (error instanceof Error) {
      throw new Error(`自定义 OCR 请求失败: ${error.message}`);
    }
    throw error;
  }
}
/**
 * 使用云端 OCR 识别图片块
 */
async function recognizeWithCloudOcr(
  imageBase64: string,
  profile: OcrProfile
): Promise<string> {
  logger.debug('CloudOcrRunner', '开始云端 OCR 识别', {
    provider: profile.provider,
    profileName: profile.name
  });

  switch (profile.provider) {
    case 'baidu': {
      if (!profile.credentials.apiKey || !profile.credentials.apiSecret) {
        logger.error('CloudOcrRunner', '百度云 OCR 凭证缺失', new Error('凭证缺失'), { profileName: profile.name });
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
      logger.error('CloudOcrRunner', '不支持的 OCR 服务商', new Error(`不支持的服务商类型: ${profile.provider}`), {
        provider: profile.provider,
        profileName: profile.name
      });
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

    logger.info('CloudOcrRunner', '开始批量云端 OCR 识别', {
      profileName: profile.name,
      provider: profile.provider,
      totalBlocks: blocks.length,
      concurrency,
      delay: `${delay}ms`
    });

    // 并发处理函数
    const processBlock = async (index: number) => {
      const block = blocks[index];

      // 更新状态为处理中
      results[index].status = 'processing';
      onProgress?.([...results]);

      try {
        logger.debug('CloudOcrRunner', '识别图片块', {
          current: index + 1,
          total: blocks.length,
          blockId: block.id,
          imageId: block.imageId
        });

        // 将 canvas 转换为 base64 (不带前缀)
        const imageBase64 = block.canvas.toDataURL('image/png').split(',')[1];

        // 调用云端 OCR
        const text = await recognizeWithCloudOcr(imageBase64, profile);

        // 更新结果
        results[index].text = text.trim();
        results[index].status = 'success';

        logger.debug('CloudOcrRunner', '图片块识别完成', {
          current: index + 1,
          total: blocks.length,
          blockId: block.id,
          textLength: text.trim().length
        });
      } catch (error) {
        logger.error('CloudOcrRunner', '图片块识别失败', error, {
          current: index + 1,
          total: blocks.length,
          blockId: block.id,
          imageId: block.imageId
        });
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

    // 使用队列模式的并发控制：任意任务完成后立即启动下一个
    const queue = Array.from({ length: blocks.length }, (_, i) => i);
    const inProgress = new Set<Promise<void>>();

    // 处理单个块的包装函数
    const processWithQueue = async (index: number) => {
      await processBlock(index);
      
      // 任务完成后，如果队列还有任务，立即启动下一个
      if (queue.length > 0) {
        const nextIndex = queue.shift()!;
        const nextPromise = processWithQueue(nextIndex);
        inProgress.add(nextPromise);
        nextPromise.finally(() => inProgress.delete(nextPromise));
      }
    };

    // 启动初始的 concurrency 个任务
    const initialCount = Math.min(concurrency, blocks.length);
    for (let i = 0; i < initialCount; i++) {
      const index = queue.shift()!;
      const promise = processWithQueue(index);
      inProgress.add(promise);
      promise.finally(() => inProgress.delete(promise));
    }

    // 等待所有任务完成
    while (inProgress.size > 0) {
      await Promise.race(inProgress);
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    logger.info('CloudOcrRunner', '批量云端 OCR 识别完成', {
      profileName: profile.name,
      total: blocks.length,
      success: successCount,
      error: errorCount
    });

    return results;
  };

  return {
    runCloudOcr,
  };
}