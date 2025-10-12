/**
 * API 请求构建相关的工具函数
 * 从 api-tester 中提取，以实现逻辑复用
 */

import { createModuleLogger } from './logger';

const logger = createModuleLogger('apiRequest');

/**
 * 替换字符串中的 {{variable}} 占位符
 * @param template 模板字符串
 * @param variables 变量键值对
 * @returns 替换后的字符串
 */
function replacePlaceholders(template: string, variables: Record<string, any>): string {
  if (!template) return '';
  
  logger.debug('开始替换占位符', {
    模板: template,
    变量: variables
  });
  
  let result = template;
  let replacedCount = 0;
  
  Object.entries(variables).forEach(([key, value]) => {
    // 全局替换 {{key}}
    const placeholder = `{{${key}}}`;
    // 转义正则表达式中的特殊字符
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedPlaceholder, 'g');
    const matches = template.match(regex);
    
    if (matches) {
      replacedCount += matches.length;
      result = result.replace(regex, String(value));
    }
  });
  
  if (replacedCount === 0) {
    logger.warn('未找到任何可替换的占位符', {
      模板: template,
      变量: variables
    });
  } else {
    logger.debug('占位符替换完成', {
      替换前: template,
      替换后: result,
      替换次数: replacedCount
    });
  }
  
  return result;
}

/**
 * 构建完整的 URL
 * @param urlTemplate URL 模板
 * @param variables 变量
 * @returns 构建好的 URL
 */
export function buildUrl(urlTemplate: string, variables: Record<string, any>): string {
  return replacePlaceholders(urlTemplate, variables);
}

/**
 * 构建请求体
 * @param bodyTemplate 请求体模板
 * @param variables 变量
 * @returns 构建好的请求体字符串
 */
export function buildBody(bodyTemplate: string, variables: Record<string, any>): string {
  return replacePlaceholders(bodyTemplate, variables);
}

/**
 * 构建请求头
 * @param headersTemplate 请求头模板
 * @param variables 变量
 * @returns 构建好的请求头对象
 */
export function buildHeaders(
  headersTemplate: Record<string, string>,
  variables: Record<string, any>
): Record<string, string> {
  const result: Record<string, string> = {};
  
  Object.entries(headersTemplate).forEach(([key, value]) => {
    result[key] = replacePlaceholders(value, variables);
  });
  
  return result;
}

/**
 * 从对象中根据点分路径获取值
 * @param obj 要查找的对象
 * @param path 点分路径 (e.g., "data.results.0.text")
 * @returns 找到的值，未找到则返回 undefined
 */
export function getValueByPath(obj: any, path: string): any {
  if (!path) return undefined;

  logger.debug('开始按路径查找值', {
    路径: path,
    源对象类型: typeof obj
  });

  // 使用正则表达式来分割路径，同时处理点和方括号（用于数组索引）
  // 例如 "a.b[0].c" -> ["a", "b", "0", "c"]
  const keys = path.match(/([^[.\]]+)/g);

  if (!keys) {
    logger.warn('路径解析失败', { 路径: path });
    return undefined;
  }

  logger.debug('路径已解析', {
    原始路径: path,
    解析后的键: keys
  });

  let currentValue = obj;
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    
    if (currentValue === null || typeof currentValue === 'undefined') {
      logger.warn('路径查找中断：当前值为空', {
        路径: path,
        当前键: key,
        已遍历的键: keys.slice(0, i),
        中断位置: i
      });
      return undefined;
    }
    
    // 尝试将 key 转换为数字，以处理数组索引
    const index = parseInt(key, 10);
    
    if (!isNaN(index) && Array.isArray(currentValue)) {
      currentValue = currentValue[index];
      logger.debug(`步骤 ${i + 1}: 访问数组索引`, {
        键: key,
        索引: index,
        数组长度: (currentValue as any)?.length,
        结果类型: typeof currentValue
      });
    } else {
      currentValue = currentValue[key];
      logger.debug(`步骤 ${i + 1}: 访问对象属性`, {
        键: key,
        结果类型: typeof currentValue
      });
    }
  }

  if (currentValue === undefined) {
    logger.warn('路径查找完成但未找到值', {
      路径: path,
      所有键: keys
    });
  } else {
    logger.debug('路径查找成功', {
      路径: path,
      结果类型: typeof currentValue,
      结果值: currentValue
    });
  }

  return currentValue;
}