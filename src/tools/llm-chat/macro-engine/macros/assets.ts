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

        // 辅助函数：获取文件后缀
        const getFileExtension = (filename: string): string => {
          const lastDot = filename.lastIndexOf('.');
          if (lastDot === -1 || lastDot === filename.length - 1) return '';
          return filename.substring(lastDot + 1).toLowerCase();
        };

        // 辅助函数：生成完整的资产引用路径
        const buildAssetRef = (asset: typeof assets[0]): string => {
          const group = asset.group || 'default';
          const ext = getFileExtension(asset.filename);
          return ext ? `asset://${group}/${asset.id}.${ext}` : `asset://${group}/${asset.id}`;
        };

        let output = 'Available Assets:\n';
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