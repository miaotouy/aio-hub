/**
 * 时间日期宏集合
 * 提供时间和日期相关的宏
 */

import type { MacroRegistry } from '../MacroRegistry';
import { MacroPhase, MacroType } from '../MacroRegistry';
import type { MacroDefinition } from '../MacroRegistry';

/**
 * 格式化时间
 */
function formatTime(date: Date): string {
  const hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${minutes} ${ampm}`;
}

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const month = months[date.getMonth()];
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

/**
 * 注册时间日期宏
 */
export function registerDateTimeMacros(registry: MacroRegistry): void {
  const dateTimeMacros: MacroDefinition[] = [
    // 当前时间
    {
      name: 'time',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前时间（12小时制，如：10:30 PM）',
      example: '{{time}}',
      acceptsArgs: false,
      priority: 90,
      supported: true,
      execute: () => {
        const now = new Date();
        return formatTime(now);
      },
    },

    // 当前日期
    {
      name: 'date',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '当前日期（如：November 7, 2025）',
      example: '{{date}}',
      acceptsArgs: false,
      priority: 90,
      supported: true,
      execute: () => {
        const now = new Date();
        return formatDate(now);
      },
    },

    // ISO 时间戳
    {
      name: 'isotime',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: 'ISO 8601 格式的时间戳',
      example: '{{isotime}}',
      acceptsArgs: false,
      priority: 70,
      supported: true,
      execute: () => {
        return new Date().toISOString();
      },
    },

    // Unix 时间戳
    {
      name: 'timestamp',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: 'Unix 时间戳（毫秒）',
      example: '{{timestamp}}',
      acceptsArgs: false,
      priority: 60,
      supported: true,
      execute: () => {
        return Date.now().toString();
      },
    },

    // 24小时制时间
    {
      name: 'time24',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '24小时制时间（如：22:30）',
      example: '{{time24}}',
      acceptsArgs: false,
      priority: 85,
      supported: true,
      execute: () => {
        const now = new Date();
        const hours = now.getHours().toString().padStart(2, '0');
        const minutes = now.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
      },
    },

    // 星期几
    {
      name: 'weekday',
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: '星期几（如：Monday）',
      example: '{{weekday}}',
      acceptsArgs: false,
      priority: 80,
      supported: true,
      execute: () => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const now = new Date();
        return days[now.getDay()];
      },
    },
  ];

  registry.registerMany(dateTimeMacros);
}
