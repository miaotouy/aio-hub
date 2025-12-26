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

const LIB_CONFIGS: LibConfig[] = [
  {
    name: "d3",
    patterns: [
      /cdn\.jsdelivr\.net\/npm\/d3@?\d*\.?\d*\.?\d*\/dist\/d3(?:\.min)?\.js/i,
      /cdnjs\.cloudflare\.com\/ajax\/libs\/d3\/?\d*\.?\d*\.?\d*\/d3(?:\.min)?\.js/i,
      /unpkg\.com\/d3@?\d*\.?\d*\.?\d*\/dist\/d3(?:\.min)?\.js/i,
    ],
    localPath: "libs/d3.min.js",
  },
  {
    name: "mermaid",
    patterns: [
      /cdn\.jsdelivr\.net\/npm\/mermaid@?\d*\.?\d*\.?\d*\/dist\/mermaid(?:\.min)?\.js/i,
      /unpkg\.com\/mermaid@?\d*\.?\d*\.?\d*\/dist\/mermaid(?:\.min)?\.js/i,
    ],
    localPath: "libs/mermaid.min.js",
  },
  {
    name: "jquery",
    patterns: [
      /code\.jquery\.com\/jquery-\d*\.?\d*\.?\d*(?:\.min)?\.js/i,
      /cdn\.jsdelivr\.net\/npm\/jquery@?\d*\.?\d*\.?\d*\/dist\/jquery(?:\.min)?\.js/i,
      /ajax\.googleapis\.com\/ajax\/libs\/jquery\/\d*\.?\d*\.?\d*\/jquery(?:\.min)?\.js/i,
    ],
    localPath: "libs/jquery.min.js",
  },
  {
    name: "lodash",
    patterns: [
      /cdn\.jsdelivr\.net\/npm\/lodash@?\d*\.?\d*\.?\d*\/lodash(?:\.min)?\.js/i,
      /cdnjs\.cloudflare\.com\/ajax\/libs\/lodash\.js\/\d*\.?\d*\.?\d*\/lodash(?:\.min)?\.js/i,
    ],
    localPath: "libs/lodash.min.js",
  },
  {
    name: "echarts",
    patterns: [
      /cdn\.jsdelivr\.net\/npm\/echarts@?\d*\.?\d*\.?\d*\/dist\/echarts(?:\.min)?\.js/i,
      /cdnjs\.cloudflare\.com\/ajax\/libs\/echarts\/\d*\.?\d*\.?\d*\/echarts(?:\.min)?\.js/i,
    ],
    localPath: "libs/echarts.min.js",
  },
  {
    name: "three",
    patterns: [
      /cdn\.jsdelivr\.net\/npm\/three@?\d*\.?\d*\.?\d*\/build\/three(?:\.min)?\.js/i,
      /cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/\d*\.?\d*\.?\d*\/three(?:\.min)?\.js/i,
      /unpkg\.com\/three@?\d*\.?\d*\.?\d*\/build\/three(?:\.min)?\.js/i,
    ],
    localPath: "libs/three.min.js",
  },
  {
    name: "chart.js",
    patterns: [
      /cdn\.jsdelivr\.net\/npm\/chart\.js@?\d*\.?\d*\.?\d*\/dist\/chart\.umd(?:\.min)?\.js/i,
      /cdnjs\.cloudflare\.com\/ajax\/libs\/Chart\.js\/\d*\.?\d*\.?\d*\/chart(?:\.min)?\.js/i,
    ],
    localPath: "libs/chart.min.js",
  },
  {
    name: "anime.js",
    patterns: [
      /cdn\.jsdelivr\.net\/npm\/animejs@?\d*\.?\d*\.?\d*\/lib\/anime(?:\.min)?\.js/i,
      /cdnjs\.cloudflare\.com\/ajax\/libs\/animejs\/\d*\.?\d*\.?\d*\/anime(?:\.min)?\.js/i,
    ],
    localPath: "libs/anime.min.js",
  },
  {
    name: "gsap",
    patterns: [
      /cdn\.jsdelivr\.net\/npm\/gsap@?\d*\.?\d*\.?\d*\/dist\/gsap(?:\.min)?\.js/i,
      /cdnjs\.cloudflare\.com\/ajax\/libs\/gsap\/\d*\.?\d*\.?\d*\/gsap(?:\.min)?\.js/i,
    ],
    localPath: "libs/gsap.min.js",
  },
  {
    name: "p5.js",
    patterns: [
      // 匹配 p5.js 和 p5.min.js
      /cdn\.jsdelivr\.net\/npm\/p5@?\d*\.?\d*\.?\d*\/lib\/p5(?:\.min)?\.js/i,
      /cdnjs\.cloudflare\.com\/ajax\/libs\/p5\.js\/\d*\.?\d*\.?\d*\/p5(?:\.min)?\.js/i,
      /unpkg\.com\/p5@?\d*\.?\d*\.?\d*\/lib\/p5(?:\.min)?\.js/i,
    ],
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

  // 遍历配置进行替换
  LIB_CONFIGS.forEach((config) => {
    config.patterns.forEach((pattern) => {
      // 构建全局匹配正则
      const globalPattern = new RegExp(`https?://` + pattern.source, "gi");

      // 查找所有匹配
      const matches = processedHtml.match(globalPattern);
      if (matches) {
        matches.forEach((match) => {
          replacements.push({
            lib: config.name,
            original: match,
            local: `/${config.localPath}`,
          });
        });

        logger.info(`检测到 CDN 资源: ${config.name}, 正在重定向到本地: ${config.localPath}`);
        processedHtml = processedHtml.replace(globalPattern, `/${config.localPath}`);
      }
    });
  });

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

  LIB_CONFIGS.forEach((config) => {
    config.patterns.forEach((pattern) => {
      const globalPattern = new RegExp(`https?://` + pattern.source, "gi");
      if (globalPattern.test(html)) {
        if (!detected.includes(config.name)) {
          detected.push(config.name);
        }
      }
    });
  });

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