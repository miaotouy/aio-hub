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

  // 3.5. 最后的尝试: 检查子类型本身是否是已知的扩展名
  const subtype = mainType.split('/')[1];
  if (subtype) {
      const potentialLang = subtype.split('+')[0]; // 处理 'svg+xml' -> 'svg'
      // 检查这个潜在的语言是否是 MIME_TYPE_MAP 中的一个键 (即一个已知的扩展名)
      if (MIME_TYPE_MAP[potentialLang]) {
          return languageAlias[potentialLang] || potentialLang;
      }
  }

  // 4. 如果都找不到，返回 'plaintext'
  return 'plaintext';
}

/**
 * 根据 MIME 类型获取常见的文件扩展名
 * @param mimeType - MIME 类型字符串，例如 'image/png', 'application/pdf'
 * @returns 文件扩展名（不含点号），如果无法识别则返回 null
 */
export function getExtensionFromMimeType(mimeType: string): string | null {
  if (!mimeType) return null;

  const mainType = mimeType.split(';')[0].trim();

  // 1. 使用反向映射直接查找（最可靠）
  const reverseMap = getReverseMimeMap();
  const extension = reverseMap[mainType];
  if (extension) {
    return extension;
  }

  // 2. 尝试从 MIME 类型的子类型中提取扩展名（例如 'image/png' -> 'png'）
  const subtype = mainType.split('/')[1];
  if (subtype) {
    // 移除可能的 '+' 后缀（如 'svg+xml' -> 'svg'）
    const potentialExt = subtype.split('+')[0];
    // 只返回看起来像有效扩展名的结果（2-5个字符的小写字母/数字）
    if (/^[a-z0-9]{2,5}$/.test(potentialExt)) {
      return potentialExt;
    }
  }

  return null;
}