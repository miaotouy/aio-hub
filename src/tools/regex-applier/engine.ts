/**
 * 正则处理引擎
 * 纯逻辑层,不依赖任何 UI 框架
 */

import type { RegexRule, ApplyResult, LogEntry } from './types';

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
      flags: match[2] || 'g'
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

  let processed = text;
  let appliedRulesCount = 0;
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
      processed = processed.replace(regex, rule.replacement);
      
      if (originalProcessed !== processed) {
        addLog(`应用规则 ${index + 1}: /${pattern}/${flags} -> "${rule.replacement}"`);
        appliedRulesCount++;
      }
    } catch (e: any) {
      addLog(
        `规则 ${index + 1} 错误: 无效的正则表达式 "${rule.regex}" - ${e.message}`,
        'error'
      );
    }
  });

  if (text && appliedRulesCount > 0) {
    addLog(`文本处理完成。共应用了 ${appliedRulesCount} 条规则。`);
  }

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