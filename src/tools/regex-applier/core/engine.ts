/**
 * 正则处理引擎
 * 纯逻辑层,不依赖任何 UI 框架
 */

import type {
  RegexRule,
  ApplyResult,
  LogEntry,
  TextProcessOptions,
  TextProcessResult,
  FileProcessOptions,
  FileProcessResult,
} from '../types';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';
import { invoke } from '@tauri-apps/api/core';

const logger = createModuleLogger('services/regex-applier/engine');
const errorHandler = createModuleErrorHandler('services/regex-applier/engine');

/**
 * 解析正则表达式字符串，支持 /pattern/flags 格式
 * @param pattern 正则表达式字符串，可以是纯模式或 /pattern/flags 格式
 * @returns { pattern: string, flags: string } 解析后的模式和标志
 */
export function parseRegexPattern(pattern: string): { pattern: string; flags: string } {
  // 检查是否是 /pattern/flags 格式
  const match = pattern.match(/^\/(.+?)\/([gimsuvy]*)$/);

  if (match) {
    return {
      pattern: match[1],
      // 修正: 确保 g 标志总是存在,同时保留用户指定的其他标志
      flags: match[2] ? (match[2].includes('g') ? match[2] : `${match[2]}g`) : 'g'
    };
  }

  // 默认使用 gm 标志以支持多行匹配
  return {
    pattern: pattern,
    flags: 'gm'
  };
}

/**
 * 应用多条正则规则到文本
 * @param text 源文本
 * @param rules 规则列表
 * @returns 处理结果，包含处理后的文本、应用的规则数和日志
 */
export function applyRules(text: string, rules: RegexRule[]): ApplyResult {
  if (!text) {
    return {
      text: '',
      appliedRulesCount: 0,
      logs: []
    };
  }

  const startTime = performance.now();
  const enabledRules = rules.filter(r => r.enabled);

  // 记录处理开始
  logger.info('开始处理文本', {
    textLength: text.length,
    totalRules: rules.length,
    enabledRules: enabledRules.length
  });

  let processed = text;
  let appliedRulesCount = 0;
  let totalMatches = 0;
  const logs: LogEntry[] = [];

  const addLog = (message: string, type: LogEntry['type'] = 'info') => {
    logs.push({
      time: new Date().toLocaleTimeString(),
      message,
      type
    });
  };

  rules.forEach((rule, index) => {
    if (!rule.enabled) {
      return;
    }

    try {
      const { pattern, flags } = parseRegexPattern(rule.regex);
      const regex = new RegExp(pattern, flags);
      const originalProcessed = processed;

      // 统计匹配次数
      const matches = originalProcessed.match(regex);
      const matchCount = matches ? matches.length : 0;

      processed = processed.replace(regex, rule.replacement);

      if (originalProcessed !== processed) {
        addLog(`应用规则 ${index + 1}: /${pattern}/${flags} -> "${rule.replacement}"`);
        appliedRulesCount++;
        totalMatches += matchCount;

        // 记录单个规则应用详情
        logger.debug(`规则 ${index + 1} 应用成功`, {
          pattern,
          flags,
          matchCount,
          replacement: rule.replacement
        });
      }
    } catch (e: any) {
      addLog(
        `规则 ${index + 1} 错误: 无效的正则表达式 "${rule.regex}" - ${e.message}`,
        'error'
      );
      errorHandler.handle(e, {
        userMessage: `规则 ${index + 1} 应用失败`,
        context: {
          regex: rule.regex,
          replacement: rule.replacement,
        },
        showToUser: false,
      });
    }
  });

  if (text && appliedRulesCount > 0) {
    addLog(`文本处理完成。共应用了 ${appliedRulesCount} 条规则。`);
  }

  const endTime = performance.now();
  const duration = endTime - startTime;
  const textChanged = text !== processed;

  // 记录处理完成统计
  logger.info('文本处理完成', {
    appliedRulesCount,
    totalMatches,
    duration: `${duration.toFixed(2)}ms`,
    originalLength: text.length,
    processedLength: processed.length,
    lengthDiff: processed.length - text.length,
    textChanged
  });

  return {
    text: processed,
    appliedRulesCount,
    logs
  };
}

/**
 * 验证正则表达式是否有效
 * @param pattern 正则表达式字符串
 * @returns 验证结果，包含是否有效和错误信息
 */
export function validateRegex(pattern: string): { valid: boolean; error?: string } {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e: any) {
    return { valid: false, error: e.message };
  }
}

/**
 * 生成唯一ID
 * @param prefix 前缀
 * @returns 唯一ID字符串
 */
export function generateId(prefix: string = 'item'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * 批量处理文本（应用多个预设的规则）
 * @param options 处理选项
 * @param getPresetById 获取预设的回调函数（解耦 store）
 */
export async function processText(
  options: TextProcessOptions,
  getPresetById: (id: string) => { rules: RegexRule[] } | undefined
): Promise<TextProcessResult | null> {
  logger.info('开始处理文本', {
    textLength: options.sourceText.length,
    presetCount: options.presetIds.length,
  });

  return await errorHandler.wrapAsync(
    async () => {
      if (!options.sourceText) {
        return {
          text: '',
          totalRulesApplied: 0,
          logs: [],
        };
      }

      if (options.presetIds.length === 0) {
        return {
          text: options.sourceText,
          totalRulesApplied: 0,
          logs: [],
        };
      }

      let result = options.sourceText;
      let totalRulesApplied = 0;
      const allLogs: LogEntry[] = [];

      // 按顺序应用每个预设
      for (const presetId of options.presetIds) {
        const preset = getPresetById(presetId);
        if (preset) {
          const enabledRules = preset.rules.filter((r) => r.enabled);
          const applyResult = applyRules(result, enabledRules);
          result = applyResult.text;
          totalRulesApplied += applyResult.appliedRulesCount;

          // 收集日志
          allLogs.push(...applyResult.logs);
        }
      }

      logger.info('文本处理完成', {
        totalRulesApplied,
        logCount: allLogs.length,
        resultLength: result.length,
      });

      return {
        text: result,
        totalRulesApplied,
        logs: allLogs,
      };
    },
    {
      level: ErrorLevel.ERROR,
      userMessage: '文本处理失败',
      context: options,
    }
  );
}

/**
 * 批量处理文件（调用 Rust 后端）
 * @param options 处理选项
 * @param getPresetById 获取预设的回调函数
 */
export async function processFiles(
  options: FileProcessOptions,
  getPresetById: (id: string) => { name: string; rules: RegexRule[] } | undefined
): Promise<FileProcessResult | null> {
  logger.info('开始处理文件', {
    fileCount: options.filePaths.length,
    presetCount: options.presetIds.length,
    outputDir: options.outputDir,
  });

  return await errorHandler.wrapAsync(
    async () => {
      // 收集所有选中预设的启用规则
      const allRules: Array<RegexRule & { preset_name: string }> = [];
      for (const presetId of options.presetIds) {
        const preset = getPresetById(presetId);
        if (preset) {
          const enabledRules = preset.rules.filter((r) => r.enabled);
          const rulesWithPreset = enabledRules.map((r) => ({
            ...r,
            preset_name: preset.name,
          }));
          allRules.push(...rulesWithPreset);
        }
      }

      if (allRules.length === 0) {
        throw new Error('所选预设中没有启用的规则');
      }

      // 准备调用后端的规则数据
      const rulesForBackend = allRules.map((r) => ({
        regex: r.regex,
        replacement: r.replacement,
        name: r.name,
        preset_name: r.preset_name,
      }));

      logger.debug('调用 Rust 后端处理文件', {
        fileCount: options.filePaths.length,
        ruleCount: rulesForBackend.length,
      });

      // 调用 Tauri 后端
      const result = await invoke<FileProcessResult>('process_files_with_regex', {
        filePaths: options.filePaths,
        outputDir: options.outputDir,
        rules: rulesForBackend,
        forceTxt: options.forceTxt ?? false,
        filenameSuffix: options.filenameSuffix ?? '',
      });

      logger.info('文件处理完成', {
        successCount: result.success_count,
        errorCount: result.error_count,
        totalMatches: result.total_matches,
        duration: `${result.duration_ms?.toFixed(2)}ms`,
      });

      return result;
    },
    {
      level: ErrorLevel.ERROR,
      userMessage: '文件处理失败',
      context: options,
    }
  );
}