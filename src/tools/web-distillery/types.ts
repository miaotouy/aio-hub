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
