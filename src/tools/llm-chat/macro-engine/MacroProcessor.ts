/**
 * 宏处理器
 * 核心处理引擎，协调三阶段执行管道
 */

import type { MacroContext } from './MacroContext';
import { MacroRegistry, MacroPhase, type MacroDefinition } from './MacroRegistry';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('llm-chat/macro-processor');
const errorHandler = createModuleErrorHandler('llm-chat/macro-processor');

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
   * 使用负向后瞻 (?<!\\) 确保前面不是反斜杠
   */
  private static getMacroPattern(): RegExp {
    return /(?<!\\)\{\{([^}]+?)\}\}/g;
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
      /** 值转换器（用于对宏替换结果进行后处理，例如正则转义） */
      valueTransformer?: (value: string) => string;
      /** 是否静默模式（不输出日志，用于批量处理） */
      silent?: boolean;
    }
  ): Promise<MacroProcessResult> {
    const startTime = Date.now();
    const silent = options?.silent ?? false;

    // 检查是否包含宏（使用简单的字符串检查，避免正则状态问题）
    const hasMacros = text.includes('{{');
    if (!hasMacros) {
      if (!silent) {
        logger.debug('文本不包含宏，跳过处理');
      }
      return {
        output: text,
        hasMacros: false,
        macroCount: 0,
      };
    }

    if (!silent) {
      logger.debug('开始宏处理', { textLength: text.length });
    }

    // 三阶段处理
    const original = text;
    let current = text;
    let macroCount = 0;

    // 阶段一：预处理（状态变更）
    const afterPreProcess = await this.processPhase(
      current,
      context,
      MacroPhase.PRE_PROCESS,
      options?.valueTransformer,
      silent
    );
    current = afterPreProcess.output;
    macroCount += afterPreProcess.count;
    if (!silent) {
      logger.debug('预处理完成', { macroCount: afterPreProcess.count });
    }

    // 阶段二：替换（静态值）
    const afterSubstitute = await this.processPhase(
      current,
      context,
      MacroPhase.SUBSTITUTE,
      options?.valueTransformer,
      silent
    );
    current = afterSubstitute.output;
    macroCount += afterSubstitute.count;
    if (!silent) {
      logger.debug('替换完成', { macroCount: afterSubstitute.count });
    }

    // 阶段三：后处理（动态函数）
    const afterPostProcess = await this.processPhase(
      current,
      context,
      MacroPhase.POST_PROCESS,
      options?.valueTransformer,
      silent
    );
    current = afterPostProcess.output;
    macroCount += afterPostProcess.count;
    if (!silent) {
      logger.debug('后处理完成', { macroCount: afterPostProcess.count });
    }

    // 最后一步：处理转义字符
    // 将 \{{ 替换回 {{
    if (current.includes('\\{{')) {
      current = current.replace(/\\\{\{/g, '{{');
    }

    const duration = Date.now() - startTime;
    if (!silent) {
      logger.debug('宏处理完成', {
        macroCount,
        duration: `${duration}ms`,
        originalLength: original.length,
        outputLength: current.length,
      });
    }

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
   * 批量处理多个文本中的宏
   * @param texts 待处理的文本数组
   * @param context 宏上下文
   * @param options 处理选项
   * @returns 批量处理结果
   */
  async processBatch(
    texts: string[],
    context: MacroContext,
    options?: {
      /** 值转换器（用于对宏替换结果进行后处理，例如正则转义） */
      valueTransformer?: (value: string) => string;
    }
  ): Promise<{
    outputs: string[];
    totalMacroCount: number;
    processedCount: number;
    skippedCount: number;
  }> {
    const startTime = Date.now();

    // 快速过滤：找出包含宏的文本
    const textsWithMacros = texts.filter(t => t.includes('{{'));
    const skippedCount = texts.length - textsWithMacros.length;

    if (textsWithMacros.length === 0) {
      logger.debug('批量处理：所有文本均不包含宏，跳过处理', {
        totalCount: texts.length,
      });
      return {
        outputs: texts,
        totalMacroCount: 0,
        processedCount: 0,
        skippedCount: texts.length,
      };
    }

    logger.debug('批量宏处理开始', {
      totalCount: texts.length,
      withMacrosCount: textsWithMacros.length,
      skippedCount,
    });

    // 并行处理所有文本（静默模式）
    const results = await Promise.all(
      texts.map(text => this.process(text, context, {
        valueTransformer: options?.valueTransformer,
        silent: true,
      }))
    );

    const outputs = results.map(r => r.output);
    const totalMacroCount = results.reduce((sum, r) => sum + r.macroCount, 0);
    const processedCount = results.filter(r => r.hasMacros).length;

    const duration = Date.now() - startTime;
    logger.debug('批量宏处理完成', {
      totalCount: texts.length,
      processedCount,
      skippedCount,
      totalMacroCount,
      duration: `${duration}ms`,
    });

    return {
      outputs,
      totalMacroCount,
      processedCount,
      skippedCount,
    };
  }

  /**
   * 处理特定阶段的宏
   */
  private async processPhase(
    text: string,
    context: MacroContext,
    phase: MacroPhase,
    valueTransformer?: (value: string) => string,
    silent?: boolean
  ): Promise<{ output: string; count: number }> {
    let output = text;
    let count = 0;

    // 获取该阶段的所有宏
    const phaseMacros = this.registry.getMacrosByPhase(phase);
    const macroNames = new Set(phaseMacros.map(m => m.name));

    // 创建替换映射表，用于批量替换
    const replacements = new Map<string, string>();
    const executedMacros: Array<{ name: string; args?: string[]; resultLength: number }> = [];
    const unknownMacros: string[] = [];

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
        unknownMacros.push(name);
        continue;
      }

      // 如果这个宏已经处理过（相同的宏文本），跳过
      if (replacements.has(fullMatch)) {
        continue;
      }

      try {
        // 执行宏
        let result = await macroDef.execute(context, args);

        // 应用值转换器
        if (valueTransformer) {
          result = valueTransformer(result);
        }

        replacements.set(fullMatch, result);
        count++;

        executedMacros.push({
          name,
          args,
          resultLength: result.length,
        });
      } catch (error) {
        errorHandler.error(error as Error, '宏执行失败', {
          showToUser: false,
          context: { phase, name, args },
        });
        // 保持原始宏不变
      }
    }

    if (!silent) {
      if (executedMacros.length > 0) {
        logger.debug(`阶段 ${phase} 宏批量执行成功`, {
          phase,
          count: executedMacros.length,
          macros: executedMacros,
        });
      }

      if (unknownMacros.length > 0) {
        logger.warn(`阶段 ${phase} 发现未注册宏`, {
          phase,
          count: unknownMacros.length,
          macros: unknownMacros,
        });
      }
    }

    // 一次性替换所有宏（使用正则全局替换确保替换所有出现）
    for (const [macro, result] of replacements) {
      // 转义特殊字符，因为宏中包含 {{}}
      const escapedMacro = macro.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 使用负向后瞻确保只替换未转义的宏
      // 注意：这会防止 \{{char}} 被替换，但也会导致 \\{{char}} 不被替换（已知限制，暂不处理复杂转义链）
      const regex = new RegExp(`(?<!\\\\)${escapedMacro}`, 'g');
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

  /**
   * 直接执行不依赖上下文的宏
   * 用于在没有完整 MacroContext 的情况下执行 contextFree 宏
   * @param macroName 宏名称
   * @param args 可选参数
   * @param extraContext 可选的额外上下文数据，将合并到最小上下文中
   * @returns 执行结果，如果宏不存在或不是 contextFree 则返回 null
   */
  static async executeDirectly(
    macroName: string,
    args?: string[],
    extraContext?: Partial<MacroContext>
  ): Promise<string | null> {
    const registry = MacroRegistry.getInstance();
    const macroDef = registry.getMacro(macroName);

    if (!macroDef) {
      logger.warn('尝试直接执行不存在的宏', { macroName });
      return null;
    }

    if (!macroDef.contextFree) {
      logger.warn('尝试直接执行依赖上下文的宏', { macroName });
      return null;
    }

    try {
      // 创建一个最小化的空上下文，并合并额外上下文
      const minimalContext: MacroContext = {
        userName: '',
        charName: '',
        variables: new Map(),
        globalVariables: new Map(),
        ...extraContext,
      };

      const result = await macroDef.execute(minimalContext, args);
      logger.debug('直接执行宏成功', { macroName, args, resultLength: result.length });
      return result;
    } catch (error) {
      errorHandler.error(error as Error, '直接执行宏失败', {
        showToUser: false,
        context: { macroName, args },
      });
      return null;
    }
  }

  /**
   * 获取所有可直接调用的宏（contextFree 宏）
   */
  static getContextFreeMacros(): MacroDefinition[] {
    const registry = MacroRegistry.getInstance();
    return registry.getAllMacros().filter(m => m.contextFree === true);
  }

  /**
   * 检查宏是否可以直接调用
   */
  static isContextFree(macroName: string): boolean {
    const registry = MacroRegistry.getInstance();
    const macroDef = registry.getMacro(macroName);
    return macroDef?.contextFree === true;
  }
}