import { MIME_TYPE_MAP } from './fileTypeDetector';

// 映射一些特殊情况或别名
const languageAlias: Record<string, string> = {
  'javascript': 'js',
  'typescript': 'ts',
  'markdown': 'md',
};

// 创建一个反向映射
let REVERSE_MIME_MAP: Record<string, string> | null = null;
function getReverseMimeMap() {
  if (REVERSE_MIME_MAP) {
    return REVERSE_MIME_MAP;
  }
  REVERSE_MIME_MAP = {};
  for (const ext in MIME_TYPE_MAP) {
    const mimeType = MIME_TYPE_MAP[ext];
    if (!REVERSE_MIME_MAP[mimeType]) {
      REVERSE_MIME_MAP[mimeType] = ext;
    }
  }
  return REVERSE_MIME_MAP;
}

/**
 * 将 MIME 类型转换为代码编辑器支持的语言标识符。
 * @param mimeType - 输入的 MIME 类型, e.g., "application/javascript"
 * @returns 语言标识符, e.g., "js"
 */
export function mapMimeToLanguage(mimeType: string): string {
  if (!mimeType) return 'plaintext';

  const mainType = mimeType.split(';')[0].trim();

  // 1. 使用反向映射查找扩展名 - 这是最可靠的方法
  const reverseMap = getReverseMimeMap();
  const extension = reverseMap[mainType];
  if (extension) {
    return languageAlias[extension] || extension;
  }

  // 2. 处理 'text/x-...' 形式的MIME类型
  let match = /x-([a-zA-Z0-9]+)/.exec(mainType);
  if (match && match[1]) {
    const lang = match[1].toLowerCase();
    return languageAlias[lang] || lang;
  }

  // 3. 作为后备，从子类型中提取 (例如 'application/vnd.api+json' -> 'json')
  match = /\/([a-zA-Z0-9\-_+.]+)$/.exec(mainType);
  if (match && match[1]) {
    let lang = match[1].toLowerCase();

    // 处理 'svg+xml' -> 'xml'
    if (lang.includes('+')) {
      lang = lang.substring(lang.lastIndexOf('+') + 1);
    }
    
    // 只为已知的文本格式返回提取的语言，避免返回如 'octet-stream' 这样的无效语言
    const commonTextLangs = ['json', 'xml', 'html', 'css', 'javascript', 'typescript', 'yaml', 'toml', 'sql', 'graphql'];
    if (commonTextLangs.includes(lang)) {
        return languageAlias[lang] || lang;
    }
  }

  // 4. 如果都找不到，返回 'plaintext'
  return 'plaintext';
}