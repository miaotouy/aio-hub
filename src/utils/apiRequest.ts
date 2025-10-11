/**
 * API 请求构建相关的工具函数
 * 从 api-tester 中提取，以实现逻辑复用
 */

/**
 * 替换字符串中的 {{variable}} 占位符
 * @param template 模板字符串
 * @param variables 变量键值对
 * @returns 替换后的字符串
 */
function replacePlaceholders(template: string, variables: Record<string, any>): string {
  if (!template) return '';
  
  let result = template;
  
  Object.entries(variables).forEach(([key, value]) => {
    // 全局替换 {{key}}
    const placeholder = `{{${key}}}`;
    // 转义正则表达式中的特殊字符
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escapedPlaceholder, 'g'), String(value));
  });
  
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

  // 使用正则表达式来分割路径，同时处理点和方括号（用于数组索引）
  // 例如 "a.b[0].c" -> ["a", "b", "0", "c"]
  const keys = path.match(/([^[.\]]+)/g);

  if (!keys) return undefined;

  return keys.reduce((acc, key) => {
    if (acc === null || typeof acc === 'undefined') {
      return undefined;
    }
    // 尝试将 key 转换为数字，以处理数组索引
    const index = parseInt(key, 10);
    if (!isNaN(index) && Array.isArray(acc)) {
      return acc[index];
    }
    return acc[key];
  }, obj);
}