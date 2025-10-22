import type { CombinedRecord, FilterOptions } from './types';

/**
 * 格式化 URL，只显示路径和查询参数
 */
export function formatUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/**
 * 格式化时间戳为本地时间字符串
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

/**
 * 格式化文件大小
 */
export function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * 获取状态码对应的 CSS 类名
 */
export function getStatusClass(status?: number): string {
  if (!status) return '';
  if (status >= 200 && status < 300) return 'success';
  if (status >= 400 && status < 500) return 'client-error';
  if (status >= 500) return 'server-error';
  return '';
}

/**
 * 检查字符串是否为有效的 JSON
 */
export function isJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * 格式化 JSON 字符串
 */
export function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2);
  } catch {
    return str;
  }
}

/**
 * 过滤记录列表
 */
export function filterRecords(records: CombinedRecord[], options: FilterOptions): CombinedRecord[] {
  let filtered = records;
  
  // 按搜索词过滤
  if (options.searchQuery) {
    const query = options.searchQuery.toLowerCase();
    filtered = filtered.filter(record => {
      return record.request.url.toLowerCase().includes(query) ||
             record.request.body?.toLowerCase().includes(query) ||
             record.response?.body?.toLowerCase().includes(query);
    });
  }
  
  // 按状态码过滤
  if (options.filterStatus) {
    filtered = filtered.filter(record => {
      if (!record.response) return false;
      const status = record.response.status.toString();
      return status.startsWith(options.filterStatus[0]);
    });
  }
  
  // 按时间倒序排列
  return filtered.sort((a, b) => b.request.timestamp - a.request.timestamp);
}

/**
 * API Key 打码功能
 */
export function maskSensitiveData(text: string): string {
  // 常见的 API Key 模式
  const patterns = [
    // Authorization header: Bearer token, API Key, etc.
    /(?<=Authorization:\s*)(Bearer\s+)?[\w-]{20,}/gi,
    /(?<=X-API-Key:\s*)[\w-]{20,}/gi,
    /(?<=API-Key:\s*)[\w-]{20,}/gi,
    /(?<=x-api-key:\s*)[\w-]{20,}/gi,

    // OpenAI API Key
    /(?<=api[_-]?key["']?\s*[:=]\s*["']?)sk-[\w-]{40,}/gi,
    /\bsk-[\w-]{40,}\b/g,

    // Anthropic API Key
    /(?<=x-api-key:\s*)sk-ant-[\w-]{40,}/gi,
    /\bsk-ant-[\w-]{40,}\b/g,

    // Google/Gemini API Key
    /(?<=key[\"']?\s*[:=]\s*[\"']?)AIza[\w-]{35}/gi,
    /\bAIza[\w-]{35}\b/g,

    // Generic API keys in JSON
    /(?<="api[_-]?key"\s*:\s*")[^"]{20,}(?=")/gi,
    /(?<='api[_-]?key'\s*:\s*')[^']{20,}(?=')/gi,
  ];

  let maskedText = text;
  patterns.forEach(pattern => {
    maskedText = maskedText.replace(pattern, (match) => {
      // 保留前6个字符，其余用星号替换
      if (match.length <= 10) return match;
      const prefix = match.substring(0, 6);
      const suffix = match.length > 15 ? match.substring(match.length - 4) : '';
      const stars = '*'.repeat(Math.min(20, match.length - prefix.length - suffix.length));
      return `${prefix}${stars}${suffix}`;
    });
  });

  return maskedText;
}

/**
 * 复制文本到剪贴板
 */
export async function copyToClipboard(text: string, message: string = '已复制到剪贴板'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    console.error('复制到剪贴板失败:', err);
    throw new Error(`复制失败: ${message}`);
  }
}

/**
 * 格式化流式响应（SSE格式）
 */
export function formatStreamingResponse(str: string): string {
  if (!str) return '';

  // 分割SSE事件
  const events = str.split(/\n\n/);
  let formatted = '';

  events.forEach((event, index) => {
    if (!event.trim()) return;

    const lines = event.split('\n');
    let eventData = '';

    lines.forEach(line => {
      if (line.startsWith('data: ')) {
        const data = line.substring(6);

        // 尝试格式化JSON数据
        if (data.trim() && data.trim() !== '[DONE]') {
          try {
            const parsed = JSON.parse(data);
            eventData += `data: ${JSON.stringify(parsed, null, 2)}\n`;
          } catch {
            eventData += `${line}\n`;
          }
        } else {
          eventData += `${line}\n`;
        }
      } else {
        eventData += `${line}\n`;
      }
    });

    if (eventData) {
      formatted += eventData;
      if (index < events.length - 1) {
        formatted += '\n';
      }
    }
  });

  return formatted || str;
}

/**
 * 从流式响应中提取正文内容
 */
export function extractStreamContent(body: string): string {
  const contents: string[] = [];
  const lines = body.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.substring(6).trim();
      if (data && data !== '[DONE]') {
        try {
          const parsed = JSON.parse(data);

          // OpenAI格式
          if (parsed.choices?.[0]?.delta?.content) {
            contents.push(parsed.choices[0].delta.content);
          }
          // Claude格式
          else if (parsed.delta?.text) {
            contents.push(parsed.delta.text);
          }
          // 通用格式
          else if (parsed.content) {
            contents.push(parsed.content);
          }
          // Gemini格式
          else if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
            contents.push(parsed.candidates[0].content.parts[0].text);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }
  }

  return contents.join('');
}

/**
 * 从JSON响应中提取正文内容
 */
export function extractJsonContent(body: string): string {
  try {
    const parsed = JSON.parse(body);

    // OpenAI格式
    if (parsed.choices?.[0]?.message?.content) {
      return parsed.choices[0].message.content;
    }
    // Claude格式
    if (parsed.content?.[0]?.text) {
      return parsed.content[0].text;
    }
    // 通用格式
    if (parsed.message) {
      return parsed.message;
    }
    if (parsed.content && typeof parsed.content === 'string') {
      return parsed.content;
    }
    // Gemini格式
    if (parsed.candidates?.[0]?.content?.parts?.[0]?.text) {
      return parsed.candidates[0].content.parts[0].text;
    }
  } catch {
    // 忽略解析错误
  }

  return body;
}