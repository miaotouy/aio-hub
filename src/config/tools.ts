/**
 * 工具默认顺序配置
 * 
 * 当用户没有手动调整工具顺序时，将按照此列表的顺序进行排列。
 * 未出现在此列表中的工具将自动排在末尾。
 */
export const DEFAULT_TOOLS_ORDER = [
  // AI 工具
  '/llm-chat',
  '/media-generator',
  '/vcp-connector',
  '/st-worldbook-editor',
  '/media-info-reader',
  '/smart-ocr',
  '/transcription',
  '/ffmpeg-tools',
  '/color-picker',
  
  // 文本处理
  '/regex-applier',
  '/text-diff',
  '/json-formatter',
  '/data-filter',
  '/code-formatter',
  
  // 文件管理
  '/asset-manager',
  '/knowledge-base',
  '/symlink-mover',
  '/directory-tree',
  '/directory-janitor',
  '/content-deduplicator',
  
  // 开发工具
  '/api-tester',
  '/llm-inspector',
  '/git-analyzer',
  '/rich-text-renderer-tester',
  '/service-monitor',
  '/token-calculator',
  '/embedding-playground',
  '/component-tester',
];