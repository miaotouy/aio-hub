/**
 * 云端 OCR 服务配置相关的类型定义
 */

// 引入 api-tester 的类型以复用
import type { HttpMethod, Variable } from '../tools/api-tester/types';

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
  icon?: string; // 图标路径
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
 * 自定义 OCR 服务的 API 请求定义
 * (借鉴自 api-tester 的 ApiPreset)
 */
export interface OcrApiRequest {
  /**
   * URL 模板字符串，支持 {{variable}} 占位符
   * 例如: "https://api.example.com/ocr/v1/recognize"
   */
  urlTemplate: string;
  
  /**
   * HTTP 请求方法
   */
  method: HttpMethod;
  
  /**
   * 请求头
   */
  headers: Record<string, string>;
  
  /**
   * 请求体模板，支持 {{variable}} 占位符
   * 必须是有效的 JSON 字符串
   * 使用 {{imageBase64}} 作为图片数据的占位符
   */
  bodyTemplate: string;
  
  /**
   * 变量定义列表
   */
  variables: Variable[];
  
  /**
   * 从 API 响应中提取结果的路径
   * 使用点分路径，例如 "data.text" 或 "result.0.text"
   * 支持数组索引，例如 "items.0" 表示第一个元素
   */
  resultPath: string;
  
  /**
   * 图标路径（可选）
   * 支持相对路径或绝对路径
   */
  iconPath?: string;
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
   * 注意：对于 custom 类型，此字段将被 apiRequest.urlTemplate 替代
   */
  endpoint: string;
  /**
   * API 凭证
   * 注意：对于 custom 类型，凭证将通过 apiRequest.variables 和 headers 管理
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
  
  /**
   * 当 provider 为 'custom' 时，存储 API 请求定义
   */
  apiRequest?: OcrApiRequest;
}