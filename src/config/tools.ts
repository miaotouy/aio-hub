/**
 * 工具默认顺序配置
 *
 * 当用户没有手动调整工具顺序时，将按照此列表的顺序进行排列。
 * 未出现在此列表中的工具将自动排在末尾。
 */
export const DEFAULT_TOOLS_ORDER = [
  // AI 工具
  "/llm-chat",
  "/canvas",
  "/media-generator",
  "/smart-ocr",
  "/transcription",
  "/web-distillery",
  "/knowledge-base",
  "/st-worldbook-editor",

  // 文本处理
  "/code-formatter",
  "/json-formatter",
  "/regex-applier",
  "/data-filter",
  "/text-diff",

  // 媒体工具
  "/ffmpeg-tools",
  "/danmaku-player",
  "/color-picker",
  "/media-info-reader",

  // 文件管理
  "/asset-manager",
  "/symlink-mover",
  "/directory-tree",
  "/directory-janitor",
  "/content-deduplicator",

  // 开发工具
  "/api-tester",
  "/llm-inspector",
  "/git-analyzer",
  "/token-calculator",
  "/embedding-playground",
  "/vcp-connector",
  "/service-monitor",
  "/rich-text-renderer-tester",
  "/component-tester",
  "/tool-calling-tester",
];
