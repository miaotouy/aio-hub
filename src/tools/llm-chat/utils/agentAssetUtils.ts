import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { ChatAgent, AgentAsset } from '../types';

/** 智能体资产协议前缀 */
const AGENT_ASSET_PROTOCOL = 'agent-asset://';

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
 * 根据解析结果查找匹配的资产
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
  }
  
  // 回退：只匹配 id（向后兼容旧格式）
  return assets.find(a => a.id === parsed.id);
}

/**
 * 将 agent-asset:// 协议的 URL 转换为真实的浏览器可访问 URL
 *
 * 支持的格式：
 * - agent-asset://{group}/{id}.{ext}  (新格式，推荐)
 * - agent-asset://{id}                (旧格式，向后兼容)
 *
 * @param assetUrl 格式如 agent-asset://biaoqingbao/喝茶.png 或 agent-asset://sticker_ok
 * @param agent 当前智能体对象
 * @returns 真实的 URL，如果找不到则返回原始 URL
 */
export async function resolveAgentAssetUrl(assetUrl: string, agent: ChatAgent): Promise<string> {
  if (!assetUrl.startsWith(AGENT_ASSET_PROTOCOL)) return assetUrl;
  
  const parsed = parseAssetUrl(assetUrl);
  if (!parsed) return assetUrl;
  
  const asset = agent.assets ? findAsset(parsed, agent.assets) : undefined;
  if (!asset) {
    console.warn('[resolveAgentAssetUrl] Asset not found:', { parsed, availableAssets: agent.assets?.map(a => ({ id: a.id, group: a.group })) });
    return assetUrl;
  }
  
  try {
    const fullPath = await invoke<string>('get_agent_asset_path', {
      agentId: agent.id,
      assetPath: asset.path
    });
    return convertFileSrc(fullPath);
  } catch (error) {
    console.error('[resolveAgentAssetUrl] Failed to resolve asset path:', error);
    return assetUrl;
  }
}

/**
 * 处理消息内容中的所有资产引用
 * 支持 HTML src 属性和 Markdown 语法
 *
 * @param content 消息内容
 * @param agent 当前智能体对象
 * @returns 替换后的内容
 */
export async function processMessageAssets(content: string, agent?: ChatAgent): Promise<string> {
  if (!agent || !content.includes('agent-asset://')) return content;
  
  let result = content;

  // 1. 处理 HTML src 属性: src="agent-asset://..." 或 src='agent-asset://...'
  // 支持新格式 agent-asset://{group}/{id}.{ext}，路径中可能包含中文、斜杠、点号等
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
  // 支持新格式 agent-asset://{group}/{id}.{ext}，路径中可能包含中文、斜杠、点号等
  const mdPattern = /\((agent-asset:\/\/[^)]+)\)/g;
  const mdMatches = Array.from(result.matchAll(mdPattern));

  for (const match of mdMatches) {
    const fullMatch = match[0]; // (agent-asset://...)
    const assetUrl = match[1]; // agent-asset://...
    const resolvedUrl = await resolveAgentAssetUrl(assetUrl, agent);

    if (resolvedUrl !== assetUrl) {
      result = result.replace(fullMatch, `(${resolvedUrl})`);
    }
  }
  
  return result;
}