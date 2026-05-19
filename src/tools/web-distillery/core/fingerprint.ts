/**
 * 从当前 WebView 提取真实的浏览器指纹参数
 * 用于同步给 Rust 后端的 wreq 客户端，确保 TLS 指纹和应用层 Header 一致
 */

export interface BrowserFingerprint {
  userAgent: string;
  acceptLanguage: string;
  platform: string;
  secChUa?: string;
  secChUaPlatform?: string;
  secChUaMobile?: string;
}

let cachedFingerprint: BrowserFingerprint | null = null;

/**
 * 获取当前 WebView 的真实浏览器指纹
 * 结果会被缓存，因为同一个 WebView 实例的指纹不会变化
 */
export function getWebViewFingerprint(): BrowserFingerprint {
  if (cachedFingerprint) return cachedFingerprint;

  const uaData = (navigator as any).userAgentData;
  let secChUa: string | undefined;
  let secChUaPlatform: string | undefined;
  let secChUaMobile: string | undefined;

  if (uaData) {
    // 从 User-Agent Client Hints API 获取真实数据
    const brands = uaData.brands as Array<{ brand: string; version: string }>;
    if (brands?.length) {
      secChUa = brands.map((b) => `"${b.brand}";v="${b.version}"`).join(", ");
    }
    secChUaPlatform = `"${uaData.platform}"`;
    secChUaMobile = uaData.mobile ? "?1" : "?0";
  }

  cachedFingerprint = {
    userAgent: navigator.userAgent,
    acceptLanguage: navigator.languages?.join(",") || navigator.language || "zh-CN,zh;q=0.9,en;q=0.8",
    platform: navigator.platform || "Win32",
    secChUa,
    secChUaPlatform,
    secChUaMobile,
  };

  return cachedFingerprint;
}