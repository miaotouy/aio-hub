/**
 * 云端 OCR 服务提供商配置
 */

import type { OcrProviderTypeInfo, OcrProviderType } from '../types/ocr-profiles';

/**
 * 支持的云端 OCR 服务提供商列表
 */
export const ocrProviderTypes: OcrProviderTypeInfo[] = [
  {
    type: 'baidu',
    name: '百度智能云 OCR',
    description: '百度智能云通用文字识别服务',
    defaultEndpoint: 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic',
    requiresAuth: true,
    authType: 'access_token',
    icon: '/ocr-icons/百度智能云.svg',
  },
  {
    type: 'tencent',
    name: '腾讯云 OCR',
    description: '腾讯云通用印刷体识别服务',
    defaultEndpoint: 'https://ocr.tencentcloudapi.com',
    requiresAuth: true,
    authType: 'api_key',
    icon: '/ocr-icons/腾讯云.svg',
  },
  {
    type: 'aliyun',
    name: '阿里云 OCR',
    description: '阿里云通用文字识别服务',
    defaultEndpoint: 'https://ocr-api.cn-shanghai.aliyuncs.com',
    requiresAuth: true,
    authType: 'api_key',
    icon: '/ocr-icons/阿里云.svg',
  },
  {
    type: 'custom',
    name: '自定义 OCR 服务',
    description: '配置您自己部署的 OCR 服务',
    defaultEndpoint: '',
    requiresAuth: false,
    authType: 'custom',
  },
];

/**
 * OCR 服务预设模板
 */
export interface OcrPreset {
  name: string;
  description: string;
  provider: OcrProviderType;
  endpoint: string;
  icon?: string;
}

/**
 * OCR 服务预设配置列表
 */
export const ocrPresets: OcrPreset[] = [
  {
    name: '百度智能云 OCR',
    description: '百度智能云通用文字识别服务',
    provider: 'baidu',
    endpoint: 'https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic',
    icon: '/ocr-icons/百度智能云.svg',
  },
  {
    name: '腾讯云 OCR',
    description: '腾讯云通用印刷体识别服务',
    provider: 'tencent',
    endpoint: 'https://ocr.tencentcloudapi.com',
    icon: '/ocr-icons/腾讯云.svg',
  },
  {
    name: '阿里云 OCR',
    description: '阿里云通用文字识别服务',
    provider: 'aliyun',
    endpoint: 'https://ocr-api.cn-shanghai.aliyuncs.com',
    icon: '/ocr-icons/阿里云.svg',
  },
];