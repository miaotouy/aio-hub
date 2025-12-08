/**
 * 系统信息宏集合
 * 提供操作系统、环境等相关信息
 */

import { type, version, arch, platform, hostname, locale } from '@tauri-apps/plugin-os';
import type { MacroRegistry } from '../MacroRegistry';
import { MacroPhase, MacroType } from '../MacroRegistry';
import type { MacroDefinition } from '../MacroRegistry';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/macros/system');

/**
 * 注册系统信息宏
 */
export function registerSystemMacros(registry: MacroRegistry): void {
  const systemMacros: MacroDefinition[] = [
    // 操作系统类型
    {
      name: 'os',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '操作系统名称 (如 Windows_NT, Darwin, Linux)',
      example: '{{os}}',
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: true,
      execute: async () => {
        try {
          return type();
        } catch (error) {
          logger.warn('获取操作系统类型失败', { error });
          return 'Unknown';
        }
      },
    },

    // 操作系统版本
    {
      name: 'osVersion',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '操作系统版本号',
      example: '{{osVersion}}',
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: true,
      execute: async () => {
        try {
          return version();
        } catch (error) {
          logger.warn('获取操作系统版本失败', { error });
          return 'Unknown';
        }
      },
    },

    // 系统架构
    {
      name: 'arch',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: 'CPU 架构 (如 x86_64, aarch64)',
      example: '{{arch}}',
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: true,
      execute: async () => {
        try {
          return arch();
        } catch (error) {
          logger.warn('获取系统架构失败', { error });
          return 'Unknown';
        }
      },
    },

    // 平台名称
    {
      name: 'platform',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '平台名称 (如 win32, linux, darwin)',
      example: '{{platform}}',
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: true,
      execute: async () => {
        try {
          return platform();
        } catch (error) {
          logger.warn('获取平台名称失败', { error });
          return 'Unknown';
        }
      },
    },

    // 主机名
    {
      name: 'hostname',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '计算机主机名',
      example: '{{hostname}}',
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: true,
      execute: async () => {
        try {
          const name = await hostname();
          return name || 'Unknown';
        } catch (error) {
          logger.warn('获取主机名失败', { error });
          return 'Unknown';
        }
      },
    },

    // 系统语言环境
    {
      name: 'locale',
      type: MacroType.VALUE,
      phase: MacroPhase.SUBSTITUTE,
      description: '系统语言环境 (如 zh-CN, en-US)',
      example: '{{locale}}',
      acceptsArgs: false,
      priority: 100,
      supported: true,
      contextFree: true,
      execute: async () => {
        try {
          const loc = await locale();
          return loc || 'Unknown';
        } catch (error) {
          logger.warn('获取系统语言环境失败', { error });
          return 'Unknown';
        }
      },
    },
  ];

  registry.registerMany(systemMacros);
}