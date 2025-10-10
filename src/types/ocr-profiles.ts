/**
 * 云端 OCR 服务配置相关的类型定义
 */

/**
 * 云端 OCR 服务提供商类型
 */
export type OcrProviderType = 'baidu' | 'tencent' | 'aliyun' | 'custom';

/**
 * 服务提供商类型的显示信息
 */
export interface OcrProviderTypeInfo {
  type: OcrProviderType;
  name: string;
  description: string;
  defaultEndpoint: string;
  requiresAuth: boolean; // 是否需要认证
  authType: 'access_token' | 'api_key' | 'custom'; // 认证方式
}

/**
 * API 凭证信息
 */
export interface OcrCredentials {
  /**
   * API Key
   */
  apiKey: string;
  /**
   * API Secret (某些服务需要)
   */
  apiSecret?: string;
  /**
   * 其他自定义凭证字段
   */
  [key: string]: string | undefined;
}

/**
 * 用户创建的单个云端 OCR 服务配置
 */
export interface OcrProfile {
  /**
   * 配置实例的唯一ID
   */
  id: string;
  /**
   * 用户自定义的服务名称，例如 "我的百度云 OCR"
   */
  name: string;
  /**
   * 服务提供商类型
   */
  provider: OcrProviderType;
  /**
   * API 端点地址
   */
  endpoint: string;
  /**
   * API 凭证
   */
  credentials: OcrCredentials;
  /**
   * 是否启用该配置
   */
  enabled: boolean;
  /**
   * 可选的并发数设置
   */
  concurrency?: number;
  /**
   * 可选的请求延迟设置 (ms)
   */
  delay?: number;
}