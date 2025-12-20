/**
 * 资产相关宏
 * 提供 {{assets}} 宏，用于向 LLM 注入可用的资产列表
 */

import type { MacroRegistry } from '../MacroRegistry';
import { MacroPhase, MacroType } from '../MacroRegistry';
import type { MacroDefinition } from '../MacroRegistry';

/**
 * 注册资产宏
 */
export function registerAssetMacros(registry: MacroRegistry): void {
  // 辅助函数：获取文件后缀
  const getFileExtension = (filename: string): string => {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1 || lastDot === filename.length - 1) return '';
    return filename.substring(lastDot + 1).toLowerCase();
  };

  // 辅助函数：生成完整的资产引用路径
  const buildAssetRef = (asset: { group?: string; id: string; filename: string }): string => {
    const group = asset.group || 'default';
    const ext = getFileExtension(asset.filename);
    return ext ? `asset://${group}/${asset.id}.${ext}` : `asset://${group}/${asset.id}`;
  };

  const assetMacros: MacroDefinition[] = [
    {
      name: 'assets',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '列出当前智能体可用的资产。可选参数：分组ID，只列出该分组下的资产',
      example: '{{assets}}',
      acceptsArgs: true,
      priority: 100,
      supported: true,
      contextFree: false,
      execute: (context, args) => {
        const allAssets = context.agent?.assets;
        if (!allAssets || allAssets.length === 0) {
          return 'No assets available for this agent.';
        }

        // 如果指定了分组参数，则过滤
        const groupFilter = args?.[0];
        let assets = allAssets;
        
        if (groupFilter) {
          if (groupFilter === 'default') {
            // 未分组：group 为空、为 'default'、或引用了不存在的分组
            const definedGroupIds = new Set(context.agent?.assetGroups?.map(g => g.id) || []);
            assets = allAssets.filter(a =>
              !a.group || a.group === 'default' || !definedGroupIds.has(a.group)
            );
          } else {
            assets = allAssets.filter(a => a.group === groupFilter);
          }
        }

        if (assets.length === 0) {
          return groupFilter
            ? `No assets in group "${groupFilter}".`
            : 'No assets available for this agent.';
        }

        let output = groupFilter
          ? `Assets in group "${groupFilter}":\n`
          : 'Available Assets:\n';
        output += 'Reference format: asset://{group}/{id}.{ext}\n\n';
        
        assets.forEach(asset => {
          const typeLabel = asset.type.charAt(0).toUpperCase() + asset.type.slice(1);
          const ref = buildAssetRef(asset);
          output += `- [${typeLabel}] ${ref}`;
          if (asset.description) {
            output += `: ${asset.description}`;
          }
          output += '\n';
        });

        return output.trim();
      },
    },
  ];

  registry.registerMany(assetMacros);
}