/**
 * 正则处理引擎
 * 纯逻辑层,不依赖任何 UI 框架
 */

import type { RegexRule, ApplyResult, LogEntry } from './types';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('RegexEngine');
const errorHandler = createModuleErrorHandler('RegexEngine');

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
      errorHandler.error(e, `规则 ${index + 1} 应用失败`, {
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