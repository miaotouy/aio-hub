/**
 * 宏处理器
 * 核心处理引擎，协调三阶段执行管道
 */

import type { MacroContext } from './MacroContext';
import { MacroRegistry, MacroPhase } from './MacroRegistry';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('llm-chat/macro-processor');

/**
 * 宏验证结果
 */
export interface MacroValidationResult {
  valid: boolean;
  error?: string;
  suggestions?: Array<{
    label: string;
    value: string;
  }>;
}

/**
 * 宏处理结果
 */
export interface MacroProcessResult {
  /** 处理后的文本 */
  output: string;
  /** 是否包含宏 */
  hasMacros: boolean;
  /** 执行的宏数量 */
  macroCount: number;
  /** 各阶段输出（用于调试） */
  phaseOutputs?: {
    original: string;
    afterPreProcess: string;
    afterSubstitute: string;
    afterPostProcess: string;
  };
}

/**
 * 宏处理器类
 */
export class MacroProcessor {
  private registry: MacroRegistry;

  constructor(registry?: MacroRegistry) {
    this.registry = registry || MacroRegistry.getInstance();
  }

  /**
   * 获取宏匹配正则（每次都创建新的实例以避免 lastIndex 问题）
   */
  private static getMacroPattern(): RegExp {
    return /\{\{([^}]+?)\}\}/g;
  }

  /**
   * 处理文本中的所有宏（完整的三阶段处理）
   */
  async process(
    text: string,
    context: MacroContext,
    options?: {
      /** 是否启用调试模式（保存各阶段输出） */
      debug?: boolean;
    }
  ): Promise<MacroProcessResult> {
    const startTime = Date.now();

    // 检查是否包含宏（使用简单的字符串检查，避免正则状态问题）
    const hasMacros = text.includes('{{');
    if (!hasMacros) {
      logger.debug('文本不包含宏，跳过处理');
      return {
        output: text,
        hasMacros: false,
        macroCount: 0,
      };
    }

    logger.info('开始宏处理', { textLength: text.length });

    // 三阶段处理
    const original = text;
    let current = text;
    let macroCount = 0;

    // 阶段一：预处理（状态变更）
    const afterPreProcess = await this.processPhase(
      current,
      context,
      MacroPhase.PRE_PROCESS
    );
    current = afterPreProcess.output;
    macroCount += afterPreProcess.count;
    logger.debug('预处理完成', { macroCount: afterPreProcess.count });

    // 阶段二：替换（静态值）
    const afterSubstitute = await this.processPhase(
      current,
      context,
      MacroPhase.SUBSTITUTE
    );
    current = afterSubstitute.output;
    macroCount += afterSubstitute.count;
    logger.debug('替换完成', { macroCount: afterSubstitute.count });

    // 阶段三：后处理（动态函数）
    const afterPostProcess = await this.processPhase(
      current,
      context,
      MacroPhase.POST_PROCESS
    );
    current = afterPostProcess.output;
    macroCount += afterPostProcess.count;
    logger.debug('后处理完成', { macroCount: afterPostProcess.count });

    const duration = Date.now() - startTime;
    logger.info('宏处理完成', {
      macroCount,
      duration: `${duration}ms`,
      originalLength: original.length,
      outputLength: current.length,
    });

    const result: MacroProcessResult = {
      output: current,
      hasMacros: true,
      macroCount,
    };

    if (options?.debug) {
      result.phaseOutputs = {
        original,
        afterPreProcess: afterPreProcess.output,
        afterSubstitute: afterSubstitute.output,
        afterPostProcess: afterPostProcess.output,
      };
    }

    return result;
  }

  /**
   * 处理特定阶段的宏
   */
  private async processPhase(
    text: string,
    context: MacroContext,
    phase: MacroPhase
  ): Promise<{ output: string; count: number }> {
    let output = text;
    let count = 0;

    // 获取该阶段的所有宏
    const phaseMacros = this.registry.getMacrosByPhase(phase);
    const macroNames = new Set(phaseMacros.map(m => m.name));

    // 创建替换映射表，用于批量替换
    const replacements = new Map<string, string>();

    // 首先收集所有需要替换的宏及其结果（每次创建新的正则实例）
    const matches = Array.from(text.matchAll(MacroProcessor.getMacroPattern()));

    for (const match of matches) {
      const fullMatch = match[0]; // {{xxx}}
      const macroContent = match[1]; // xxx

      // 解析宏名称和参数
      const { name, args } = this.parseMacro(macroContent);

      // 检查是否属于当前阶段
      if (!macroNames.has(name)) {
        continue;
      }

      const macroDef = this.registry.getMacro(name);
      if (!macroDef) {
        logger.warn('宏未注册', { name });
        continue;
      }

      // 如果这个宏已经处理过（相同的宏文本），跳过
      if (replacements.has(fullMatch)) {
        continue;
      }

      try {
        // 执行宏
        const result = await macroDef.execute(context, args);
        replacements.set(fullMatch, result);
        count++;

        logger.debug('宏执行成功', {
          phase,
          name,
          args,
          resultLength: result.length,
        });
      } catch (error) {
        logger.error('宏执行失败', error as Error, {
          phase,
          name,
          args,
        });
        // 保持原始宏不变
      }
    }
    // 一次性替换所有宏（使用正则全局替换确保替换所有出现）
    for (const [macro, result] of replacements) {
      // 转义特殊字符，因为宏中包含 {{}}
      const escapedMacro = macro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedMacro, 'g');
      output = output.replace(regex, result);
    }


    return { output, count };
  }

  /**
   * 解析宏内容（名称和参数）
   */
  private parseMacro(content: string): { name: string; args?: string[] } {
    // 检查是否包含参数分隔符 ::
    if (!content.includes('::')) {
      return { name: content.trim() };
    }

    const parts = content.split('::').map(p => p.trim());
    return {
      name: parts[0],
      args: parts.slice(1),
    };
  }

  /**
   * 验证宏语法
   */
  static validateMacro(macroContent: string): MacroValidationResult {
    const registry = MacroRegistry.getInstance();

    // 解析宏
    const { name, args } = MacroProcessor.prototype.parseMacro.call(
      new MacroProcessor(),
      macroContent
    );

    // 检查宏是否存在
    const macroDef = registry.getMacro(name);
    if (!macroDef) {
      // 查找相似的宏名（用于建议）
      const allMacros = registry.getAllMacros();
      const similar = allMacros
        .filter(m => m.name.toLowerCase().includes(name.toLowerCase()))
        .slice(0, 3);

      return {
        valid: false,
        error: `未知的宏: ${name}`,
        suggestions: similar.map(m => ({
          label: m.name,
          value: m.acceptsArgs ? `${m.name}::` : m.name,
        })),
      };
    }

    // 检查参数数量
    if (macroDef.acceptsArgs) {
      if (!args || args.length === 0) {
        return {
          valid: false,
          error: `宏 ${name} 需要参数`,
        };
      }

      if (macroDef.argCount !== undefined && args.length !== macroDef.argCount) {
        return {
          valid: false,
          error: `宏 ${name} 需要 ${macroDef.argCount} 个参数，但提供了 ${args.length} 个`,
        };
      }
    } else if (args && args.length > 0) {
      return {
        valid: false,
        error: `宏 ${name} 不接受参数`,
      };
    }

    return { valid: true };
  }

  /**
   * 提取文本中的所有宏
   */
  static extractMacros(text: string): Array<{ name: string; args?: string[]; fullMatch: string }> {
    const matches = Array.from(text.matchAll(MacroProcessor.getMacroPattern()));
    return matches.map(match => {
      const fullMatch = match[0];
      const macroContent = match[1];
      const { name, args } = MacroProcessor.prototype.parseMacro.call(
        new MacroProcessor(),
        macroContent
      );
      return { name, args, fullMatch };
    });
  }
}