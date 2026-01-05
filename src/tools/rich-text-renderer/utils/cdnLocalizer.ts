import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("CdnLocalizer");

/**
 * CDN 映射配置
 * key: 库的标识符（如 'd3', 'mermaid'）
 * patterns: 匹配 CDN URL 的正则
 * localPath: 对应 public/libs/ 下的路径
 */
interface LibConfig {
  name: string;
  patterns: RegExp[]; // 匹配 CDN URL 的正则
  localPath: string;  // 对应 public/libs/ 下的路径
}

/**
 * 常见 CDN 域名
 */
const CDN_DOMAINS = [
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "unpkg.com",
  "code.jquery.com",
  "ajax.googleapis.com",
  "cdn.bootcdn.net",
  "lib.baomitu.com",
];

const LIB_CONFIGS: LibConfig[] = [
  {
    name: "d3",
    patterns: [/d3(?:\.v\d+)?(?:\.min)?\.js/i],
    localPath: "libs/d3.min.js",
  },
  {
    name: "mermaid",
    patterns: [/mermaid(?:\.min)?\.js/i],
    localPath: "libs/mermaid.min.js",
  },
  {
    name: "jquery",
    patterns: [/jquery(?:-\d+\.\d+\.\d+)?(?:\.min)?\.js/i],
    localPath: "libs/jquery.min.js",
  },
  {
    name: "lodash",
    patterns: [/lodash(?:\.min)?\.js/i],
    localPath: "libs/lodash.min.js",
  },
  {
    name: "echarts",
    patterns: [/echarts(?:\.min)?\.js/i],
    localPath: "libs/echarts.min.js",
  },
  {
    name: "three",
    patterns: [/three(?:\.min)?\.js/i],
    localPath: "libs/three.min.js",
  },
  {
    name: "chart.js",
    patterns: [/chart(?:\.umd)?(?:\.min)?\.js/i],
    localPath: "libs/chart.min.js",
  },
  {
    name: "anime.js",
    patterns: [/anime(?:\.min)?\.js/i],
    localPath: "libs/anime.min.js",
  },
  {
    name: "gsap",
    patterns: [/gsap(?:\.min)?\.js/i],
    localPath: "libs/gsap.min.js",
  },
  {
    name: "p5.js",
    patterns: [/p5(?:\.min)?\.js/i],
    localPath: "libs/p5.min.js",
  },
];

/**
 * 将 HTML 内容中的 CDN 链接替换为本地资源链接
 * @param html 原始 HTML 内容
 * @returns 替换后的 HTML 和替换记录
 */
export function localizeCdnLinks(html: string): {
  html: string;
  replacements: Array<{ lib: string; original: string; local: string }>;
} {
  if (!html) return { html, replacements: [] };

  let processedHtml = html;
  const replacements: Array<{ lib: string; original: string; local: string }> = [];

  // 匹配 URL 的通用正则：(http|https)://(域名)/(任何路径)/(文件名)
  const cdnDomainPattern = CDN_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|');
  const urlRegex = new RegExp(`https?://(?:${cdnDomainPattern})/[^"'>\\s]+`, "gi");

  const matches = html.match(urlRegex);
  if (matches) {
    matches.forEach((url) => {
      for (const config of LIB_CONFIGS) {
        let matched = false;
        for (const pattern of config.patterns) {
          const urlParts = url.split('/');
          const fileName = urlParts[urlParts.length - 1];

          if (pattern.test(fileName)) {
            matched = true;
            break;
          }
        }

        if (matched) {
          replacements.push({
            lib: config.name,
            original: url,
            local: `/${config.localPath}`,
          });

          logger.info(`检测到 CDN 资源: ${config.name}, URL: ${url} -> 本地: ${config.localPath}`);
          processedHtml = processedHtml.split(url).join(`/${config.localPath}`);
          break;
        }
      }
    });
  }

  if (replacements.length > 0) {
    logger.info(`CDN 本地化完成`, { count: replacements.length, libs: replacements.map(r => r.lib) });
  }

  return { html: processedHtml, replacements };
}

/**
 * 检查 HTML 中是否包含可本地化的 CDN 链接
 * @param html HTML 内容
 * @returns 检测到的库列表
 */
export function detectCdnLibraries(html: string): string[] {
  if (!html) return [];

  const detected: string[] = [];
  const cdnDomainPattern = CDN_DOMAINS.map(d => d.replace(/\./g, '\\.')).join('|');
  const urlRegex = new RegExp(`https?://(?:${cdnDomainPattern})/[^"'>\\s]+`, "gi");

  const matches = html.match(urlRegex);
  // console.log("CDN matches found:", matches);
  if (matches) {
    matches.forEach((url) => {
      for (const config of LIB_CONFIGS) {
        if (detected.includes(config.name)) continue;

        for (const pattern of config.patterns) {
          const urlParts = url.split('/');
          const fileName = urlParts[urlParts.length - 1];
          if (pattern.test(fileName)) {
            detected.push(config.name);
            break;
          }
        }
      }
    });
  }

  return detected;
}

/**
 * 获取所有支持本地化的库列表
 */
export function getSupportedLibraries(): Array<{ name: string; localPath: string }> {
  return LIB_CONFIGS.map((config) => ({
    name: config.name,
    localPath: config.localPath,
  }));
}