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
  ];
}
