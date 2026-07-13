// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * Web Distillery 核心类型定义
 */

export type FetchFormat = "markdown" | "text" | "html" | "json";

/**
 * 蒸馏模式
 * - fast: 快速模式 (纯 HTTP 请求)
 * - smart: 智能模式 (Iframe 渲染)
 * - interactive: 交互模式 (可视化配方编辑)
 */
export type DistillMode = "fast" | "smart" | "interactive";

export interface QuickFetchOptions {
  url: string;
  format?: FetchFormat;
  headers?: Record<string, string>;
  cookieProfile?: string;
  timeout?: number;
  extractSelectors?: string[];
  cleanMode?: boolean; // 纯净模式：过滤掉所有链接，只保留纯文本
}

export interface SmartExtractOptions extends QuickFetchOptions {
  waitFor?: string;
  waitTimeout?: number;
  excludeSelectors?: string[];
  includeImages?: boolean;
  enableApiSniffer?: boolean;
}

export interface FetchResult {
  url: string;
  title: string;
  content: string;
  contentLength: number;
  format: FetchFormat;
  quality: number;
  mode: DistillMode;
  fetchedAt: string;
  domSnapshot?: string; // 原始 HTML 快照
  metadata?: {
    description?: string;
    author?: string;
    publishDate?: string;
    language?: string;
    ogImage?: string;
  };
  recipeId?: string; // 匹配到的配方 ID
  recipeName?: string; // 匹配到的配方名称
  warnings?: string[];
}

export interface ExtractResult extends FetchResult {
  images?: AssetRef[];
  discoveredApis?: ApiInfo[];
}

export interface AssetRef {
  id: string;
  originalUrl: string;
  localPath: string;
  mimeType: string;
}

export interface ApiInfo {
  url: string;
  method: string;
  contentType: string;
  bodyPreview: string;
  isJson: boolean;
  timestamp: string;
}

export type FetchErrorCode =
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "ANTI_CRAWL"
  | "EMPTY_CONTENT"
  | "LOW_QUALITY"
  | "COOKIE_EXPIRED"
  | "SELECTOR_NOT_FOUND"
  | "WEBVIEW_CRASH";

/**
 * Rust 端返回的原始 HTML 数据结构
 */
export interface RawFetchPayload {
  url: string;
  html: string;
  statusCode: number;
  responseHeaders: Record<string, string>;
  contentLength: number;
  isChallengePage: boolean;
}

/**
 * P3: 站点配方 (Site Recipe)
 */
export interface SiteRecipe {
  id: string;
  name: string;
  domain: string;
  pathPattern?: string; // glob 通配符
  contentPatterns?: string[]; // 正则表达式，用于内容嗅探匹配 (特别是本地文件)
  actions?: ActionStep[];
  extractSelectors?: string[];
  excludeSelectors?: string[];
  waitFor?: string;
  waitTimeout?: number;
  cookieProfile?: string;
  createdAt: string;
  updatedAt: string;
  useCount: number;
  disabled?: boolean; // 是否禁用此配方
  metadataScrapers?: MetadataScraperRule[]; // 从脚本提取元数据的规则
  protectedSelectors?: string[]; // 去噪阶段必须保留的元素（即使隐藏）
  scrollConfig?: ScrollConfig; // 自动滚动配置（用于触发懒加载）
  evaluatorFn?: (doc: Document, url: URL) => string | null; // 程序化提取器（仅内置配方使用）
}

/** 自动滚动配置 */
export interface ScrollConfig {
  maxScrolls?: number; // 最大滚动次数，默认 3
  delay?: number; // 每次滚动后等待时间(ms)，默认 800
  disabled?: boolean; // 是否禁用自动滚动
}

export interface MetadataScraperRule {
  type: "json-variable" | "json-ld" | "regex" | "meta";
  target: string; // 变量名 (如 "__INITIAL_STATE__")、正则表达式或 meta 标签名
  mapping: Record<string, string | string[]>; // 字段 → JSON 路径或属性名(支持多值回退)
}

export interface ScrapedMetadata {
  title?: string;
  description?: string;
  author?: string;
  publishDate?: string;
  content?: string;
  extras?: Record<string, any>;
}

export interface PreprocessedData {
  doc: Document;
  originalUrl: string;
  rawHtml: string; // 原始 HTML 内容，用于正则提取元数据
  scriptContents: string[]; // 保留的脚本文本内容
}

/**
 * 动作步骤
 */
export type ActionStep =
  | { type: "click"; selector: string; description?: string }
  | { type: "scroll"; selector?: string; distance?: number; toBottom?: boolean }
  | { type: "wait"; value?: number; selector?: string; timeout?: number }
  | { type: "wait-idle"; timeout?: number }
  | { type: "remove"; selector: string }
  | { type: "input"; selector: string; value: string }
  | { type: "hover"; selector: string };

/** 单条 Cookie */
export interface CookieEntry {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires?: string; // ISO 日期字符串
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

/** Cookie 身份卡片 (Profile) */
export interface CookieProfile {
  id: string; // nanoid
  name: string; // 用户自定义名称，如 "知乎-主号"
  domain: string; // 主域名，如 "zhihu.com"
  domainAliases?: string[]; // 可选：关联子域名
  cookies: CookieEntry[];
  localStorage?: Record<string, string>; // 页面 localStorage 快照（用于 SPA token 恢复）
  isActive: boolean; // 是否为该域名当前激活的身份
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
  notes?: string; // 备注
}
