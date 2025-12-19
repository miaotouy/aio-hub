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
  const assetMacros: MacroDefinition[] = [
    {
      name: 'assets',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '列出当前智能体可用的所有资产',
      example: '{{assets}}',
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: false,
      execute: (context) => {
        const assets = context.agent?.assets;
        if (!assets || assets.length === 0) {
          return 'No assets available for this agent.';
        }

        let output = 'Available Assets:\n';
        assets.forEach(asset => {
          const typeLabel = asset.type.charAt(0).toUpperCase() + asset.type.slice(1);
          output += `- [${typeLabel}] ${asset.id} (id: ${asset.id})`;
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