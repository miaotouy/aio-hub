/**
 * Web Distillery 核心类型定义
 */

export type FetchFormat = "markdown" | "text" | "html" | "json";

export interface QuickFetchOptions {
  url: string;
  format?: FetchFormat;
  headers?: Record<string, string>;
  cookieProfile?: string;
  timeout?: number;
  extractSelectors?: string[];
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
  level: 0 | 1;
  fetchedAt: string;
  metadata?: {
    description?: string;
    author?: string;
    publishDate?: string;
    language?: string;
    ogImage?: string;
  };
  warnings?: string[];
}

export interface ExtractResult extends FetchResult {
  images?: AssetRef[];
  discoveredApis?: ApiInfo[];
  domSnapshot?: string;
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
