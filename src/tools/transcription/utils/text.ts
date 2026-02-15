/**
 * 清理错误信息，纯截断策略，保留开头的有用信息（错误类型、文件路径等）
 */
export const sanitizeErrorMessage = (message: string, maxLength: number = 500): string => {
  if (!message || message.length <= maxLength) return message;
  return message.substring(0, maxLength) + `...[已截断]`;
};

/**
 * 清理 LLM 输出，移除思考链部分
 */
export const cleanLlmOutput = (text: string): string => {
  let cleaned = text;

  // 1. 移除 **Reasoning:** ... **Response:** 格式
  cleaned = cleaned.replace(/\*\*Reasoning:\*\*[\s\S]*?\*\*Response:\*\*\s*/gi, "");

  // 2. 移除 <think>...</think> 格式
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/gi, "");

  // 3. 移除 [思考]...[/思考] 格式
  cleaned = cleaned.replace(/\[思考\][\s\S]*?\[\/思考\]\s*/gi, "");

  // 4. 移除开头可能残留的 **Response:** 标记
  cleaned = cleaned.replace(/^\s*\*\*Response:\*\*\s*/i, "");

  return cleaned.trim();
};

/**
 * 检测文本是否存在严重的病态复读
 */
export const detectRepetition = (
  text: string,
  config?: { consecutiveThreshold?: number; globalThreshold?: number; whitelist?: string[] }
): { isRepetitive: boolean; reason?: string } => {
  if (text.length < 50) return { isRepetitive: false };

  const { consecutiveThreshold = 3, globalThreshold = 5, whitelist = [] } = config || {};

  // 0. 白名单检查
  if (whitelist.length > 0) {
    for (const item of whitelist) {
      if (text.includes(item)) {
        // 如果包含白名单片段，且该片段占据了文本的主要部分，或者该片段本身就是导致检测失败的原因，这里需要更精细的逻辑
        // 但简单起见，如果文本中包含白名单片段，我们先对该片段进行占位替换，避免干扰检测
        // 或者更直接点：如果整个文本就是由白名单片段重复组成的，我们允许它
      }
    }
  }

  const isInWhitelist = (segment: string) => {
    return whitelist.some((item) => segment.includes(item));
  };

  // 1. 检查连续重复的行/句
  // 优化：不按空格切割，避免表格内容被拆散；同时排除掉纯符号组成的片段（如表格分隔符）
  const segments = text.split(/[\n。！？、]/).map((l) => l.trim()).filter((l) => l.length >= 4);
  let consecutiveCount = 1;
  for (let i = 1; i < segments.length; i++) {
    const current = segments[i];
    const previous = segments[i - 1];

    if (current === previous) {
      // 排除 Markdown 表格分隔符或纯符号行 (如 |:---|:---| 或 ----------------)
      const isSymbolic = /^[\s|:.\-=_*#]+$/.test(current);
      if (isSymbolic) {
        consecutiveCount = 1;
        continue;
      }

      if (isInWhitelist(current)) {
        consecutiveCount = 1;
        continue;
      }

      consecutiveCount++;
      const threshold = current.length > 10 ? consecutiveThreshold : consecutiveThreshold + 1;
      if (consecutiveCount >= threshold) {
        return { isRepetitive: true, reason: `检测到连续重复内容: "${current.substring(0, 20)}..."` };
      }
    } else {
      consecutiveCount = 1;
    }
  }

  // 2. 检查末尾循环模式
  const tail = text.slice(-300);
  for (let len = 4; len <= 100; len++) {
    if (tail.length < len * 3) continue;
    const pattern = tail.slice(-len);
    const prevPattern = tail.slice(-len * 2, -len);
    const prevPrevPattern = tail.slice(-len * 3, -len * 2);

    if (pattern === prevPattern && pattern === prevPrevPattern) {
      // 排除纯符号循环 (如 ... ... ... 或 --- --- ---)
      if (pattern.replace(/[^\w\u4e00-\u9fa5]/g, "").length < 2) continue;
      // 排除常见的 Markdown 列表或引用符号
      if (/^[\s>*\-+]+$/.test(pattern)) continue;
      // 排除白名单
      if (isInWhitelist(pattern)) continue;

      return { isRepetitive: true, reason: `检测到末尾循环模式: "${pattern.substring(0, 20)}..."` };
    }
  }

  // 3. 检查全局片段频率
  if (text.length > 500) {
    const sampleSize = 20;
    const step = 50;
    const counts = new Map<string, number>();
    for (let i = 0; i < text.length - sampleSize; i += step) {
      const chunk = text.substring(i, i + sampleSize);
      counts.set(chunk, (counts.get(chunk) || 0) + 1);
    }
    for (const [chunk, count] of counts) {
      // 排除高频出现的 Markdown 语法片段
      const isMarkdownSyntax = /^[|:\-\s.=_*#\\/]+$/.test(chunk);
      if (isMarkdownSyntax) continue;

      // 排除白名单
      if (isInWhitelist(chunk)) continue;

      // 如果片段包含大量非字母数字字符，提高阈值
      const alphanumericRatio = chunk.replace(/[^\w\u4e00-\u9fa5]/g, "").length / chunk.length;
      const threshold = alphanumericRatio < 0.3 ? globalThreshold * 2 : globalThreshold;

      if (count >= threshold) {
        return { isRepetitive: true, reason: `检测到高频重复片段: "${chunk.substring(0, 20)}..."` };
      }
    }
  }

  return { isRepetitive: false };
};