/**
 * CSS 变量宏集合
 * 提供实时读取 CSS 自定义属性值的能力
 */

import type { MacroRegistry } from "../MacroRegistry";
import { MacroPhase, MacroType } from "../MacroRegistry";
import type { MacroDefinition } from "../MacroRegistry";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/macros/css-variables");

/**
 * 获取 CSS 变量的实际值
 * @param varName CSS 变量名（需包含 -- 前缀）
 * @returns CSS 变量的计算值，如果未定义则返回提示信息
 */
function getCssVariableValue(varName: string): string {
  try {
    // 确保变量名以 -- 开头
    const normalizedVarName = varName.startsWith("--") ? varName : `--${varName}`;

    // 从根元素获取计算样式
    const root = document.documentElement;
    const computedStyle = getComputedStyle(root);
    const value = computedStyle.getPropertyValue(normalizedVarName).trim();

    if (!value) {
      logger.warn("CSS 变量未定义或为空", { varName: normalizedVarName });
      return `(未定义: ${normalizedVarName})`;
    }

    return value;
  } catch (error) {
    logger.error("获取 CSS 变量失败", error, { varName });
    return `(错误: ${varName})`;
  }
}

/**
 * 注册 CSS 变量宏
 */
export function registerCssVariableMacros(registry: MacroRegistry): void {
  const cssVariableMacros: MacroDefinition[] = [
    // CSS 变量值获取
    {
      name: "cssvar",
      type: MacroType.FUNCTION,
      phase: MacroPhase.POST_PROCESS,
      description: "获取 CSS 自定义属性（变量）的当前实际值",
      example: "{{cssvar::--primary-color}} 或 {{cssvar::primary-color}}",
      acceptsArgs: true,
      argCount: 1,
      priority: 120,
      supported: true,
      contextFree: true,
      execute: async (_context, args) => {
        if (!args || args.length === 0) {
          logger.warn("cssvar 宏缺少参数");
          return "(缺少变量名)";
        }

        const varName = args[0];
        return getCssVariableValue(varName);
      },
    },
  ];

  registry.registerMany(cssVariableMacros);
  logger.debug("CSS 变量宏注册完成");
}
