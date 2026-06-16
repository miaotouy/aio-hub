export interface PresetHeader {
  name: string;
  description: string;
  headers: Record<string, string>;
}

export interface PresetContext {
  userAgent: string;
  secChUa: string;
  secChUaPlatform: string;
}

/**
 * 获取自定义请求头预设模板列表
 * @param ctx 包含动态系统信息的上下文对象
 */
export function getCustomHeaderPresets(ctx: PresetContext): PresetHeader[] {
  return [
    {
      name: "丰富的信息",
      description: "模仿市面上常见客户端的请求头",
      headers: {
        "User-Agent": ctx.userAgent,
        "sec-ch-ua": ctx.secChUa,
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": ctx.secChUaPlatform,
        "sec-fetch-site": "cross-site",
        "sec-fetch-mode": "cors",
        "sec-fetch-dest": "empty",
        "accept-language": "zh-CN",
        "x-title": "AIO Hub",
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
      description: "标识请求来源（用户填自己的）",
      headers: {
        "http-referer": "https://your-app.com",
        origin: "https://your-app.com",
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
  ];
}
