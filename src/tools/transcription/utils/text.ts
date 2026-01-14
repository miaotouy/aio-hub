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
export const detectRepetition = (text: string): { isRepetitive: boolean; reason?: string } => {
  if (text.length < 50) return { isRepetitive: false };

  // 1. 检查连续重复的行/句
  const segments = text.split(/[\n。！？、\s]/).map((l) => l.trim()).filter((l) => l.length >= 4);
  let consecutiveCount = 1;
  for (let i = 1; i < segments.length; i++) {
    if (segments[i] === segments[i - 1]) {
      consecutiveCount++;
      const threshold = segments[i].length > 10 ? 3 : 4;
      if (consecutiveCount >= threshold) {
        return { isRepetitive: true, reason: `检测到连续重复内容: "${segments[i].substring(0, 20)}..."` };
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
      if (pattern.replace(/[^\w\u4e00-\u9fa5]/g, "").length < 2) continue;
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
      if (count >= 5) {
        return { isRepetitive: true, reason: `检测到高频重复片段: "${chunk.substring(0, 20)}..."` };
      }
    }
  }

  return { isRepetitive: false };
};