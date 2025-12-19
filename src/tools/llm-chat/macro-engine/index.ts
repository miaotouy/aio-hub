/**
 * 宏引擎入口
 * 统一导出所有宏引擎相关的类型和函数
 */

export { MacroProcessor } from './MacroProcessor';
export type { MacroProcessResult, MacroValidationResult } from './MacroProcessor';

export { MacroRegistry, MacroPhase, MacroType } from './MacroRegistry';
export type { MacroDefinition } from './MacroRegistry';

export { createMacroContext, extractContextFromSession } from './MacroContext';
export type { MacroContext } from './MacroContext';

// 导入宏注册中心
import { MacroRegistry } from './MacroRegistry';

// 注册所有内置宏
import { registerCoreMacros } from './macros/core';
import { registerDateTimeMacros } from './macros/datetime';
import { registerVariableMacros } from './macros/variables';
import { registerFunctionMacros } from './macros/functions';
import { registerSystemMacros } from './macros/system';
import { registerAssetMacros } from './macros/assets';

/**
 * 初始化宏引擎（注册所有内置宏）
 */
export function initializeMacroEngine(): void {
  const registry = MacroRegistry.getInstance();
  
  // 清空现有注册（避免重复）
  registry.clear();
  
  // 注册所有内置宏
  registerCoreMacros(registry);
  registerDateTimeMacros(registry);
  registerVariableMacros(registry);
  registerFunctionMacros(registry);
  registerSystemMacros(registry);
  registerAssetMacros(registry);
}