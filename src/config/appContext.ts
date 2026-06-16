/**
 * 应用上下文缓存
 *
 * 在应用启动时初始化一次，缓存应用名称、版本号、User-Agent 等信息。
 * 用于请求头模板变量解析，确保版本号等动态信息始终最新。
 */

import { getName, getVersion } from "@tauri-apps/api/app";

export interface AppContextData {
  /** 应用名称 (如 "AIO Hub") */
  appName: string;
  /** 应用版本号 (如 "0.4.6") */
  appVersion: string;
  /** 完整的 User-Agent 字符串 (navigator.userAgent + appName/appVersion) */
  userAgent: string;
  /** sec-ch-ua 请求头值 */
  secChUa: string;
  /** sec-ch-ua-platform 请求头值 */
  secChUaPlatform: string;
  /** 应用界面语言 (如 "zh-CN", "en-US")，与全局语言设置同步 */
  acceptLanguage: string;
}

interface NavigatorUAData {
  readonly brands: { brand: string; version: string }[];
  readonly mobile: boolean;
  readonly platform: string;
}

let cached: AppContextData | null = null;

/**
 * 初始化应用上下文（异步，应用启动时调用一次）
 */
export async function initAppContext(): Promise<void> {
  let appName = "AIO Hub";
  let appVersion = "1.0.0";
  try {
    appName = await getName();
    appVersion = await getVersion();
  } catch {
    // 降级使用默认值
  }

  const baseUa = navigator.userAgent;
  const userAgent = `${baseUa} ${appName}/${appVersion}`;

  let secChUa = '"Not:A-Brand";v="24", "Chromium";v="134"';
  let secChUaPlatform = '"Windows"';

  const nav = navigator as Navigator & { userAgentData?: NavigatorUAData };
  if (nav.userAgentData) {
    secChUaPlatform = `"${nav.userAgentData.platform}"`;
    if (nav.userAgentData.brands) {
      secChUa = nav.userAgentData.brands
        .map((b) => `"${b.brand}";v="${b.version}"`)
        .join(", ");
    }
  } else {
    const platformMatch = baseUa.match(/Windows|Mac|Linux/);
    if (platformMatch) {
      secChUaPlatform = `"${platformMatch[0]}"`;
    }
  }

  const acceptLanguage = navigator.language || "zh-CN";

  cached = {
    appName,
    appVersion,
    userAgent,
    secChUa,
    secChUaPlatform,
    acceptLanguage,
  };
}

/**
 * 获取应用上下文（同步，需在 initAppContext 之后调用）
 * 若尚未初始化，返回基于 navigator 的降级默认值
 */
export function getAppContext(): AppContextData {
  if (!cached) {
    return {
      appName: "AIO Hub",
      appVersion: "1.0.0",
      userAgent: navigator.userAgent,
      secChUa: '"Not:A-Brand";v="24", "Chromium";v="134"',
      secChUaPlatform: '"Windows"',
      acceptLanguage: navigator.language || "zh-CN",
    };
  }
  return cached;
}
