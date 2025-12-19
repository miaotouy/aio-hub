import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { ChatAgent } from '../types';

/**
 * 将 asset:// 协议的 URL 转换为真实的浏览器可访问 URL
 * 
 * @param assetUrl 格式如 asset://sticker_ok
 * @param agent 当前智能体对象
 * @returns 真实的 URL，如果找不到则返回原始 URL
 */
export async function resolveAgentAssetUrl(assetUrl: string, agent: ChatAgent): Promise<string> {
  if (!assetUrl.startsWith('asset://')) return assetUrl;
  
  const handle = assetUrl.replace('asset://', '');
  const asset = agent.assets?.find(a => a.id === handle);
  
  if (!asset) return assetUrl;
  
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
  if (!agent || !content.includes('asset://')) return content;
  
  let result = content;

  // 1. 处理 HTML src 属性: src="asset://..." 或 src='asset://...'
  const htmlPattern = /src=["'](asset:\/\/[\w-]+)["']/g;
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

  // 2. 处理 Markdown 语法: ![alt](asset://...) 或 [link](asset://...)
  const mdPattern = /\((asset:\/\/[\w-]+)\)/g;
  const mdMatches = Array.from(result.matchAll(mdPattern));

  for (const match of mdMatches) {
    const fullMatch = match[0]; // (asset://...)
    const assetUrl = match[1]; // asset://...
    const resolvedUrl = await resolveAgentAssetUrl(assetUrl, agent);

    if (resolvedUrl !== assetUrl) {
      result = result.replace(fullMatch, `(${resolvedUrl})`);
    }
  }
  
  return result;
}