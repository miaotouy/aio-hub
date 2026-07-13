// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 宏引擎入口
 * 统一导出所有宏引擎相关的类型和函数
 */

export { MacroProcessor } from "./MacroProcessor";
export type {
  MacroProcessResult,
  MacroValidationResult,
} from "./MacroProcessor";

export { MacroRegistry, MacroPhase, MacroType } from "./MacroRegistry";
export type { MacroDefinition } from "./MacroRegistry";

export { createMacroContext, extractContextFromSession } from "./MacroContext";
export type { MacroContext } from "./MacroContext";

// 导入宏注册中心
import { MacroRegistry } from "./MacroRegistry";

// 注册所有内置宏
import { registerCoreMacros } from "./macros/core";
import { registerDateTimeMacros } from "./macros/datetime";
import { registerVariableMacros } from "./macros/variables";
import { registerFunctionMacros } from "./macros/functions";
import { registerSystemMacros } from "./macros/system";
import { registerAssetMacros } from "./macros/assets";
import { registerToolMacros } from "./macros/tools";
import { registerKnowledgeMacros } from "./macros/knowledge";
import { registerCssVariableMacros } from "./macros/cssVariables";

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
  registerToolMacros(registry);
  registerKnowledgeMacros(registry);
  registerCssVariableMacros(registry);
}
