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

import { getAppContext } from "@/config/appContext";

export interface PresetHeader {
  name: string;
  description: string;
  headers: Record<string, string>;
}

/**
 * 支持的模板变量及其说明
 */
export const HEADER_TEMPLATE_VARIABLES: Record<string, string> = {
  "{{appName}}": "应用名称 (如 AIO Hub)",
  "{{appVersion}}": "应用版本号 (如 0.4.6)",
  "{{userAgent}}": "完整 User-Agent 字符串",
  "{{secChUa}}": "sec-ch-ua 请求头值",
  "{{secChUaPlatform}}": "sec-ch-ua-platform 请求头值",
  "{{appOrigin}}": "应用来源 URL (如 https://aiohub-app.com)",
  "{{acceptLanguage}}": "界面语言 (如 zh-CN, en-US)，跟随语言设置变化",
};

/**
 * 解析请求头值中的模板变量
 * 每次请求时调用，确保版本号等动态信息始终最新
 */
export function resolveCustomHeaders(
  headers: Record<string, string> | undefined
): Record<string, string> {
  if (!headers) return {};

  const ctx = getAppContext();
  const resolved: Record<string, string> = {};

  const origin = ctx.appName
    ? `https://${ctx.appName.toLowerCase().replace(/\s+/g, "-")}.app`
    : "https://aiohub-app.com";

  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = value
      .replace(/\{\{appName\}\}/g, ctx.appName)
      .replace(/\{\{appVersion\}\}/g, ctx.appVersion)
      .replace(/\{\{userAgent\}\}/g, ctx.userAgent)
      .replace(/\{\{secChUa\}\}/g, ctx.secChUa)
      .replace(/\{\{secChUaPlatform\}\}/g, ctx.secChUaPlatform)
      .replace(/\{\{appOrigin\}\}/g, origin)
      .replace(/\{\{acceptLanguage\}\}/g, ctx.acceptLanguage);
  }

  return resolved;
}

/**
 * 获取自定义请求头预设模板列表
 * 预设使用模板变量（如 {{appVersion}}），在请求时由 resolveCustomHeaders() 动态解析
 */
export function getCustomHeaderPresets(): PresetHeader[] {
  return [
    {
      name: "AIO Hub 默认",
      description: "AIO Hub 官方推荐请求头，标识客户端身份、来源与环境信息",
      headers: {
        "User-Agent": "{{userAgent}}",
        "X-App-Name": "{{appName}}",
        "X-App-Version": "{{appVersion}}",
        "x-title": "{{appName}}",
        "HTTP-Referer": "{{appOrigin}}",
        Origin: "{{appOrigin}}",
        "X-OpenRouter-Title": "{{appName}}",
        "sec-ch-ua": "{{secChUa}}",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "{{secChUaPlatform}}",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "accept-language": "{{acceptLanguage}}",
      },
    },
    {
      name: "通用浏览器",
      description: "模仿标准浏览器客户端的请求头",
      headers: {
        "User-Agent": "{{userAgent}}",
        "sec-ch-ua": "{{secChUa}}",
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": "{{secChUaPlatform}}",
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "accept-language": "{{acceptLanguage}}",
        "x-title": "{{appName}}",
      },
    },
    {
      name: "超时控制",
      description: "添加自定义超时时间（类似 Stainless SDK）",
      headers: {
        "x-stainless-timeout": "600",
        "x-stainless-retry-count": "0",
      },
    },
    {
      name: "压缩支持",
      description: "启用多种压缩算法",
      headers: {
        "accept-encoding": "gzip, deflate, br, zstd",
      },
    },
    {
      name: "来源标识",
      description: "标识请求来源（填写你的应用网址）",
      headers: {
        "HTTP-Referer": "https://aiohub-app.com",
        origin: "https://aiohub-app.com",
      },
    },
    {
      name: "Claude Code",
      description:
        "模仿 Claude Code CLI 的请求头（Stainless SDK + Anthropic 专属）",
      headers: {
        connection: "keep-alive",
        Accept: "application/json",
        "X-Stainless-Retry-Count": "0",
        "X-Stainless-Timeout": "600",
        "X-Stainless-Lang": "js",
        "X-Stainless-Package-Version": "0.74.0",
        "X-Stainless-OS": "Windows",
        "X-Stainless-Arch": "x64",
        "X-Stainless-Runtime": "node",
        "X-Stainless-Runtime-Version": "v24.11.1",
        "anthropic-dangerous-direct-browser-access": "true",
        "x-app": "cli",
        "User-Agent": "claude-cli/2.1.144 (external, cli)",
        "anthropic-beta":
          "claude-code-20250219,context-1m-2025-08-07,oauth-2025-04-20,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14",
        "accept-language": "*",
        "sec-fetch-mode": "cors",
        "accept-encoding": "br, gzip, deflate",
      },
    },
    {
      name: "OpenRouter 归属",
      description: "标识 OpenRouter 请求来源，用于排行榜和分析统计",
      headers: {
        "HTTP-Referer": "https://aiohub-app.com",
        "X-OpenRouter-Title": "AIO Hub",
        "X-OpenRouter-Categories": "general-chat",
      },
    },
  ];
}

/**
 * 获取 AIO Hub 默认请求头（同步，使用模板变量）
 * 模板变量在请求时由 resolveCustomHeaders() 动态解析
 */
export function getAioDefaultHeaders(): Record<string, string> {
  return {
    "User-Agent": "{{userAgent}}",
    "X-App-Name": "{{appName}}",
    "X-App-Version": "{{appVersion}}",
    "x-title": "{{appName}}",
    "HTTP-Referer": "{{appOrigin}}",
    Origin: "{{appOrigin}}",
    "X-OpenRouter-Title": "{{appName}}",
    "sec-ch-ua": "{{secChUa}}",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "{{secChUaPlatform}}",
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "accept-language": "{{acceptLanguage}}",
  };
}
