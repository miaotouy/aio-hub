import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';
import type { ChatAgent, AgentAsset } from '../types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('agentAssetUtils');

/** 智能体资产协议前缀 */
const AGENT_ASSET_PROTOCOL = 'agent-asset://';

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
      _cachedAppDataDir = await appDataDir();
      // 标准化路径分隔符为反斜杠（Windows）
      _cachedAppDataDir = _cachedAppDataDir.replace(/\//g, '\\');
      // 移除末尾的斜杠
      if (_cachedAppDataDir.endsWith('\\')) {
        _cachedAppDataDir = _cachedAppDataDir.slice(0, -1);
      }
      logger.info('Agent 资产缓存已初始化', { appDataDir: _cachedAppDataDir });
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
  _cacheInitPromise = null;logger.info('Agent 资产缓存已重置');
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
  
  // 标准化路径
  const normalizedAssetPath = assetPath.replace(/\//g, '\\');
  
  // 构建完整路径: {appDataDir}\llm-chat\agents\{agentId}\{assetPath}
  return `${_cachedAppDataDir}\\llm-chat\\agents\\${agentId}\\${normalizedAssetPath}`;
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
 * 2. group + filename（不带扩展名）匹配
 * 3. 仅 id 匹配（向后兼容）
 * 4. 仅 filename（不带扩展名）匹配
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
  
  // 最后尝试：只匹配 filename（不带扩展名）
  return assets.find(a => getFilenameWithoutExt(a.filename) === parsed.id);
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
    logger.warn('resolveAgentAssetUrlSync: 资产未找到', {
      parsed,
      agentId: agent.id,
      availableAssets: agent.assets?.map(a => ({
        id: a.id,
        group: a.group,
        filename: a.filename,
        filenameWithoutExt: getFilenameWithoutExt(a.filename)
      }))
    });
    return assetUrl;
  }
  
  // 使用缓存同步解析
  const resolvedUrl = convertAgentAssetToUrl(agent.id, asset.path);
  if (!resolvedUrl) {
    logger.warn('resolveAgentAssetUrlSync: 路径转换失败', { agentId: agent.id, assetPath: asset.path });
    return assetUrl;
  }
  
  logger.debug('resolveAgentAssetUrlSync: 成功解析', { assetUrl, resolvedUrl });
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
  if (!agent || !content.includes('agent-asset://')) return content;
  
  let result = content;

  // 1. 处理 HTML src 属性: src="agent-asset://..." 或 src='agent-asset://...'
  const htmlPattern = /src=["'](agent-asset:\/\/[^"']+)["']/g;
  const htmlMatches = Array.from(content.matchAll(htmlPattern));
  
  for (const match of htmlMatches) {
    const fullMatch = match[0];
    const assetUrl = match[1];
    const resolvedUrl = resolveAgentAssetUrlSync(assetUrl, agent);
    
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
    const resolvedUrl = resolveAgentAssetUrlSync(assetUrl, agent);

    if (resolvedUrl !== assetUrl) {
      result = result.replace(fullMatch, `(${resolvedUrl})`);
    }
  }
  
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