import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { getAppConfigDir } from '@/utils/appPath';
import type { ChatAgent, AgentAsset } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('agentAssetUtils');

/** 智能体资产协议前缀 */
const AGENT_ASSET_PROTOCOL = 'agent-asset://';

// ============================================================================
// 字符串相似度算法 (Fuzzy Matching)
// ============================================================================

/** 模糊匹配的最低分数阈值 */
const FUZZY_MATCH_THRESHOLD = 0.7;

/**
 * 计算两个字符串的 Levenshtein 编辑距离
 * @returns 编辑距离（越小越相似）
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

/**
 * 计算两个字符串的相似度分数 (0.0 - 1.0)
 *
 * 策略：
 * 1. 完全相等: 1.0
 * 2. A 是 B 的子串，或 B 是 A 的子串: 基于子串长度比例计算高分
 * 3. 否则: 使用基于 Levenshtein 距离的标准化分数
 *
 * @param query 用户查询的字符串 (来自 AI 的输出)
 * @param target 目标字符串 (资产的 id 或 filename)
 */
function calculateSimilarity(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (q === t) return 1.0;

  // 子串匹配策略：对于 "盯" vs "盯着你" 这类情况非常有效
  if (t.includes(q)) {
    // 目标包含查询，例如资产名是 "盯"，AI 写的是 "盯着你"
    // 分数基于查询在目标中的占比，确保较短的精确匹配能得分
    // 如果查询很短(如单字)，避免误匹配，稍微降低分数
    return 0.7 + 0.3 * (q.length / t.length);
  }
  if (q.includes(t)) {
    // 查询包含目标，例如资产名是 "盯着你"，AI 写的是 "盯"
    return 0.7 + 0.3 * (t.length / q.length);
  }

  // Levenshtein 距离标准化
  const maxLen = Math.max(q.length, t.length);
  if (maxLen === 0) return 1.0;

  const distance = levenshteinDistance(q, t);
  return 1.0 - distance / maxLen;
}

/** 缓存缺失贴图的 Data URL */
let _missingTextureDataUrl: string | null = null;

/**
 * 生成 32x32 的紫黑格子贴图 (Missing Texture)
 */
function getMissingTextureUrl(): string {
  if (_missingTextureDataUrl) return _missingTextureDataUrl;

  try {
    const size = 32;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      const half = size / 2;
      // 紫色部分
      ctx.fillStyle = '#FF00FF';
      ctx.fillRect(0, 0, half, half);
      ctx.fillRect(half, half, half, half);
      // 黑色部分
      ctx.fillStyle = '#000000';
      ctx.fillRect(half, 0, half, half);
      ctx.fillRect(0, half, half, half);

      _missingTextureDataUrl = canvas.toDataURL('image/png');
      return _missingTextureDataUrl;
    }
  } catch (e) {
    logger.error('生成缺失贴图失败', e as Error);
  }

  // 回退到 2x2 的简单 Base64
  return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAZSURBVBhXY/zPw/AfEDMw/AfSDEAMYwYGBgZZSAn78AAAAABJRU5ErkJggg==';
}

// ============================================================================
// Agent 资产路径缓存引擎
// ============================================================================

/** 缓存的 appDataDir 基础路径 */
let _cachedAppDataDir: string | null = null;

/** 缓存初始化状态 */
let _cacheInitPromise: Promise<void> | null = null;

/**
 * 初始化 agent 资产缓存
 * 应在应用启动时调用，预热缓存以支持同步路径解析
 */
export async function initAgentAssetCache(): Promise<void> {
  if (_cachedAppDataDir) return;

  if (_cacheInitPromise) {
    await _cacheInitPromise;
    return;
  }

  _cacheInitPromise = (async () => {
    try {
      _cachedAppDataDir = await getAppConfigDir();

      // 在 Windows 上，保持反斜杠以确保 convertFileSrc 能正确处理盘符
      const isWindows = _cachedAppDataDir.includes('\\') || _cachedAppDataDir.includes(':');
      if (isWindows) {
        _cachedAppDataDir = _cachedAppDataDir.replace(/\//g, '\\');
        if (_cachedAppDataDir.endsWith('\\')) {
          _cachedAppDataDir = _cachedAppDataDir.slice(0, -1);
        }
      } else {
        if (_cachedAppDataDir.endsWith('/')) {
          _cachedAppDataDir = _cachedAppDataDir.slice(0, -1);
        }
      }

      logger.info('Agent 资产缓存已初始化', { appDataDir: _cachedAppDataDir, isWindows });
    } catch (error) {
      logger.error('初始化 agent 资产缓存失败', error as Error);
      throw error;
    }
  })();

  await _cacheInitPromise;
}

/**
 * 获取缓存的 appDataDir（同步）
 * 如果缓存未初始化，返回 null
 */
export function getCachedAppDataDir(): string | null {
  return _cachedAppDataDir;
}

/**
 * 重置 agent 资产缓存
 * 当用户更改数据目录时调用
 */
export function resetAgentAssetCache(): void {
  _cachedAppDataDir = null;
  _cacheInitPromise = null; logger.info('Agent 资产缓存已重置');
}

/**
 * 同步构建 agent 资产的完整文件路径
 *
 * @param agentId Agent ID
 * @param assetPath 资产相对路径（如 assets/xxx.png）
 * @returns 完整的文件系统路径，如果缓存未初始化则返回 null
 */
export function buildAgentAssetPath(agentId: string, assetPath: string): string | null {
  if (!_cachedAppDataDir) {
    return null;
  }

  // 统一使用正斜杠构建路径，Tauri 的 convertFileSrc 在所有平台上都能很好地处理正斜杠
  // 且正斜杠能避免在 Markdown 环境下被误认为转义符
  const normalizedAssetPath = assetPath.replace(/\\/g, '/');
  const normalizedBase = _cachedAppDataDir.replace(/\\/g, '/');

  const separator = normalizedBase.endsWith('/') ? '' : '/';
  return `${normalizedBase}${separator}llm-chat/agents/${agentId}/${normalizedAssetPath}`;
}

/**
 * 同步将 agent 资产路径转换为可用的 URL
 *
 * @param agentId Agent ID
 * @param assetPath 资产相对路径
 * @returns asset:// 协议的 URL，如果缓存未初始化则返回 null
 */
export function convertAgentAssetToUrl(agentId: string, assetPath: string): string | null {
  const fullPath = buildAgentAssetPath(agentId, assetPath);
  if (!fullPath) {
    return null;
  }

  return convertFileSrc(fullPath);
}

/**
 * 解析 agent-asset:// URL 的各个部分
 *
 * 支持的格式：
 * - agent-asset://{group}/{id}.{ext}  (新格式，推荐)
 * - agent-asset://{id}                (旧格式，向后兼容)
 *
 * @param assetUrl agent-asset:// 格式的 URL
 * @returns 解析后的 group、id、ext，如果解析失败返回 null
 */
function parseAssetUrl(assetUrl: string): { group: string; id: string; ext: string } | null {
  if (!assetUrl.startsWith(AGENT_ASSET_PROTOCOL)) return null;

  const path = assetUrl.replace(AGENT_ASSET_PROTOCOL, '');

  // 尝试解析新格式: {group}/{id}.{ext}
  const slashIndex = path.indexOf('/');
  if (slashIndex > 0) {
    const group = decodeURIComponent(path.substring(0, slashIndex));
    const rest = path.substring(slashIndex + 1);
    const lastDotIndex = rest.lastIndexOf('.');

    if (lastDotIndex > 0) {
      const id = decodeURIComponent(rest.substring(0, lastDotIndex));
      const ext = rest.substring(lastDotIndex + 1).toLowerCase();
      return { group, id, ext };
    } else {
      // 没有后缀的情况
      const id = decodeURIComponent(rest);
      return { group, id, ext: '' };
    }
  }

  // 旧格式兼容: 只有 id
  return { group: '', id: decodeURIComponent(path), ext: '' };
}

/**
 * 从文件名中提取不带扩展名的部分
 */
function getFilenameWithoutExt(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return filename;
  return filename.substring(0, lastDot);
}

/**
 * 根据解析结果查找匹配的资产
 *
 * 匹配优先级：
 * 1. group + id 精确匹配
 * 2. group + filename（不带扩展名）精确匹配
 * 3. 仅 id 精确匹配（向后兼容）
 * 4. 仅 filename（不带扩展名）精确匹配
 * 5. (Fuzzy) group + filename 模糊匹配
 * 6. (Fuzzy) 仅 filename 模糊匹配
 *
 * @param parsed 解析后的 URL 部分
 * @param assets 资产列表
 * @returns 匹配的资产，如果找不到返回 undefined
 */
function findAsset(
  parsed: { group: string; id: string; ext: string },
  assets: AgentAsset[]
): AgentAsset | undefined {
  // 优先精确匹配：group + id
  if (parsed.group) {
    const exactMatch = assets.find(a => {
      const assetGroup = a.group || 'default';
      return assetGroup === parsed.group && a.id === parsed.id;
    });
    if (exactMatch) return exactMatch;
    // 尝试 group + filename（不带扩展名）匹配
    // 这支持用户使用原始文件名来引用资产，如 agent-asset://biaoqingbao/盯.png
    const filenameMatch = assets.find(a => {
      const assetGroup = a.group || 'default';
      const filenameWithoutExt = getFilenameWithoutExt(a.filename);
      return assetGroup === parsed.group && filenameWithoutExt === parsed.id;
    });
    if (filenameMatch) return filenameMatch;
  }

  // 回退：只匹配 id（向后兼容旧格式）
  const idMatch = assets.find(a => a.id === parsed.id);
  if (idMatch) return idMatch;

  // 尝试：只匹配 filename（不带扩展名）
  const filenameOnlyMatch = assets.find(a => getFilenameWithoutExt(a.filename) === parsed.id);
  if (filenameOnlyMatch) return filenameOnlyMatch;

  // ============================================================================
  // 模糊匹配阶段 (Fuzzy Matching)
  // ============================================================================

  let bestFuzzyMatch: AgentAsset | undefined;
  let bestScore = FUZZY_MATCH_THRESHOLD;

  // 模糊匹配时，优先限制在同一 group 内
  const targetGroup = parsed.group || null;

  for (const asset of assets) {
    const assetGroup = asset.group || 'default';

    // 如果指定了 group，则只在该 group 内进行模糊匹配
    if (targetGroup && assetGroup !== targetGroup) {
      continue;
    }

    // 分别计算与 id 和 filename 的相似度，取较高者
    const filenameWithoutExt = getFilenameWithoutExt(asset.filename);
    const scoreById = calculateSimilarity(parsed.id, asset.id);
    const scoreByFilename = calculateSimilarity(parsed.id, filenameWithoutExt);
    const score = Math.max(scoreById, scoreByFilename);

    if (score > bestScore) {
      bestScore = score;
      bestFuzzyMatch = asset;
    }
  }

  if (bestFuzzyMatch) {
    logger.info('通过模糊匹配找到资产', {
      query: parsed.id,
      matchedAsset: { id: bestFuzzyMatch.id, filename: bestFuzzyMatch.filename, group: bestFuzzyMatch.group },
      score: bestScore.toFixed(2)
    });
  }

  return bestFuzzyMatch;
}

/**
 * 同步版本：将 agent-asset:// 协议的 URL 转换为真实的浏览器可访问 URL
 *
 * 这是推荐使用的版本，利用缓存实现同步解析，避免异步渲染问题。
 * 注意：必须先调用 initAgentAssetCache() 初始化缓存。
 *
 * @param assetUrl 格式如 agent-asset://biaoqingbao/喝茶.png 或 agent-asset://sticker_ok
 * @param agent 当前智能体对象
 * @returns 真实的 URL，如果找不到或缓存未初始化则返回原始 URL
 */
export function resolveAgentAssetUrlSync(assetUrl: string, agent: ChatAgent): string {
  if (!assetUrl.startsWith(AGENT_ASSET_PROTOCOL)) return assetUrl;

  // 检查缓存状态
  if (!_cachedAppDataDir) {
    logger.warn('resolveAgentAssetUrlSync: 缓存未初始化', { assetUrl });
    return assetUrl;
  }

  const parsed = parseAssetUrl(assetUrl);
  if (!parsed) {
    logger.warn('resolveAgentAssetUrlSync: URL 解析失败', { assetUrl });
    return assetUrl;
  }

  const asset = agent.assets ? findAsset(parsed, agent.assets) : undefined;
  if (!asset) {
    return assetUrl;
  }

  // 使用缓存同步解析
  const resolvedUrl = convertAgentAssetToUrl(agent.id, asset.path);
  if (!resolvedUrl) {
    return assetUrl;
  }

  return resolvedUrl;
}

/**
 * 异步版本：将 agent-asset:// 协议的 URL 转换为真实的浏览器可访问 URL
 *
 * 支持的格式：
 * - agent-asset://{group}/{id}.{ext}  (新格式，推荐)
 * - agent-asset://{id}                (旧格式，向后兼容)
 *
 * @param assetUrl 格式如 agent-asset://biaoqingbao/喝茶.png 或 agent-asset://sticker_ok
 * @param agent 当前智能体对象
 * @returns 真实的 URL，如果找不到则返回原始 URL
 * @deprecated 推荐使用 resolveAgentAssetUrlSync，它利用缓存实现同步解析
 */
export async function resolveAgentAssetUrl(assetUrl: string, agent: ChatAgent): Promise<string> {
  if (!assetUrl.startsWith(AGENT_ASSET_PROTOCOL)) return assetUrl;

  // 优先尝试同步解析
  const syncResult = resolveAgentAssetUrlSync(assetUrl, agent);
  if (syncResult !== assetUrl) {
    return syncResult;
  }

  // 回退到异步解析（缓存未初始化时）
  const parsed = parseAssetUrl(assetUrl);
  if (!parsed) return assetUrl;

  const asset = agent.assets ? findAsset(parsed, agent.assets) : undefined;
  if (!asset) {
    logger.warn('Asset not found', {
      parsed,
      availableAssets: agent.assets?.map(a => ({ id: a.id, group: a.group }))
    });
    return assetUrl;
  }

  try {
    const fullPath = await invoke<string>('get_agent_asset_path', {
      agentId: agent.id,
      assetPath: asset.path
    });
    return convertFileSrc(fullPath);
  } catch (error) {
    logger.error('Failed to resolve asset path', error as Error);
    return assetUrl;
  }
}

/**
 * 同步版本：处理消息内容中的所有资产引用
 * 支持 HTML src 属性和 Markdown 语法
 *
 * 这是推荐使用的版本，利用缓存实现同步解析。
 *
 * @param content 消息内容
 * @param agent 当前智能体对象
 * @returns 替换后的内容
 */
export function processMessageAssetsSync(content: string, agent?: ChatAgent): string {
  if (!content.includes('agent-asset://')) return content;

  if (!agent) {
    logger.warn('processMessageAssetsSync: 发现资产链接但缺失 agent 对象', {
      contentSnippet: content.slice(0, 100)
    });
    return content;
  }

  let result = content;

  // 使用统一的正则表达式匹配所有 agent-asset:// 链接
  // 改进正则：排除末尾可能存在的标点符号（如 Markdown 链接的闭括号）
  // 匹配规则：以 agent-asset:// 开头，直到遇到引号、空格、尖括号、或者作为结尾的括号
  const assetPattern = /agent-asset:\/\/[^"'\s<>\)]+?(?=[)\]"'\s<>]|$)/g;

  // 1. 优先处理 Markdown 图片语法: ![alt](agent-asset://...)
  // 这样如果资产缺失，我们可以将其替换为文本占位符，而不是让它进入 <img> 标签触发 CSP 错误
  const mdImagePattern = /!\[(.*?)\]\((agent-asset:\/\/[^)]+)\)/g;
  result = result.replace(mdImagePattern, (_match, alt, url) => {
    const resolved = resolveAgentAssetUrlSync(url, agent);
    if (resolved.startsWith(AGENT_ASSET_PROTOCOL)) {
      // 资产缺失，替换为文本占位符
      const parsed = parseAssetUrl(url);
      const filename = parsed ? (parsed.group ? `${parsed.group}/${parsed.id}` : parsed.id) : url;
      return `[资产缺失: ${filename}]`;
    }
    return `![${alt}](${resolved})`;
  });

  // 2. 处理剩下的孤立链接或 HTML src 属性中的链接
  result = result.replace(assetPattern, (url) => {
    const resolved = resolveAgentAssetUrlSync(url, agent);
    // 如果仍然是协议开头，说明没找到，为了防止浏览器报错，返回贴图缺失效果
    if (resolved.startsWith(AGENT_ASSET_PROTOCOL)) {
      return getMissingTextureUrl();
    }
    return resolved;
  });

  return result;
}

/**
 * 异步版本：处理消息内容中的所有资产引用
 * 支持 HTML src 属性和 Markdown 语法
 *
 * @param content 消息内容
 * @param agent 当前智能体对象
 * @returns 替换后的内容
 * @deprecated 推荐使用 processMessageAssetsSync
 */
export async function processMessageAssets(content: string, agent?: ChatAgent): Promise<string> {
  if (!agent || !content.includes('agent-asset://')) return content;

  // 优先尝试同步处理
  if (_cachedAppDataDir) {
    return processMessageAssetsSync(content, agent);
  }

  // 回退到异步处理
  let result = content;

  // 1. 处理 HTML src 属性: src="agent-asset://..." 或 src='agent-asset://...'
  const htmlPattern = /src=["'](agent-asset:\/\/[^"']+)["']/g;
  const htmlMatches = Array.from(content.matchAll(htmlPattern));

  for (const match of htmlMatches) {
    const fullMatch = match[0];
    const assetUrl = match[1];
    const resolvedUrl = await resolveAgentAssetUrl(assetUrl, agent);

    if (resolvedUrl !== assetUrl) {
      const quote = fullMatch.includes('"') ? '"' : "'";
      result = result.replace(fullMatch, `src=${quote}${resolvedUrl}${quote}`);
    }
  }

  // 2. 处理 Markdown 语法: ![alt](agent-asset://...) 或 [link](agent-asset://...)
  const mdPattern = /\((agent-asset:\/\/[^)]+)\)/g;
  const mdMatches = Array.from(result.matchAll(mdPattern));

  for (const match of mdMatches) {
    const fullMatch = match[0];
    const assetUrl = match[1];
    const resolvedUrl = await resolveAgentAssetUrl(assetUrl, agent);

    if (resolvedUrl !== assetUrl) {
      result = result.replace(fullMatch, `(${resolvedUrl})`);
    }
  }

  return result;
}