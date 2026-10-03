// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 清理错误信息，纯截断策略，保留开头的有用信息（错误类型、文件路径等）
 */
export const sanitizeErrorMessage = (
  message: string,
  maxLength: number = 500
): string => {
  if (!message || message.length <= maxLength) return message;
  return message.substring(0, maxLength) + `...[已截断]`;
};

/**
 * 清理 LLM 输出，移除思考链部分
 */
export const cleanLlmOutput = (text: string): string => {
  let cleaned = text;

  // 1. 移除 **Reasoning:** ... **Response:** 格式
  cleaned = cleaned.replace(
    /\*\*Reasoning:\*\*[\s\S]*?\*\*Response:\*\*\s*/gi,
    ""
  );

  // 2. 移除 <think>...</think> 格式
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/gi, "");

  // 3. 移除 [思考]...[/思考] 格式
  cleaned = cleaned.replace(/\[思考\][\s\S]*?\[\/思考\]\s*/gi, "");

  // 4. 移除开头可能残留的 **Response:** 标记
  cleaned = cleaned.replace(/^\s*\*\*Response:\*\*\s*/i, "");

  return cleaned.trim();
};

/**
 * 聊天记录 / 转发消息的结构性占位行，如「张三：[图片]」「李四: [表情] x2」。
 * 这类行是消息列表的显示格式（固定昵称前缀 + 占位符），不代表模型病态复读，
 * 不参与复读判定；剥掉占位符后整行无有效内容。
 */
const CHAT_PLACEHOLDER_LINE_RE =
  /^[^：:\n]{1,24}[：:]\s*(?:\[[^\[\]]{1,10}\]\s*(?:x\d+\s*)?)+$/;

const isChatRecordPlaceholder = (segment: string): boolean => {
  const lines = segment.split("\n").filter((l) => l.trim() !== "");
  return (
    lines.length > 0 &&
    lines.every((l) => CHAT_PLACEHOLDER_LINE_RE.test(l.trim()))
  );
};

/**
 * 检测文本是否存在严重的病态复读
 */
export const detectRepetition = (
  text: string,
  config?: {
    consecutiveThreshold?: number;
    globalThreshold?: number;
    whitelist?: string[];
  }
): { isRepetitive: boolean; reason?: string } => {
  if (text.length < 50) return { isRepetitive: false };

  const {
    consecutiveThreshold = 6,
    globalThreshold = 10,
    whitelist = [],
  } = config || {};

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
  const segments = text
    .split(/[\n。！？、]/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 4);
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

      // 聊天记录/转发消息占位行（如「昵称：[图片]」）不参与病态复读判定
      if (isChatRecordPlaceholder(current)) {
        continue;
      }

      if (isInWhitelist(current)) {
        consecutiveCount = 1;
        continue;
      }

      consecutiveCount++;
      const threshold =
        current.length > 10 ? consecutiveThreshold : consecutiveThreshold + 1;
      if (consecutiveCount >= threshold) {
        return {
          isRepetitive: true,
          reason: `检测到连续重复内容: "${current.substring(0, 20)}..."`,
        };
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
      // 排除聊天记录占位行（如「昵称：[图片]」）
      if (isChatRecordPlaceholder(pattern)) continue;
      // 排除白名单
      if (isInWhitelist(pattern)) continue;

      return {
        isRepetitive: true,
        reason: `检测到末尾循环模式: "${pattern.substring(0, 20)}..."`,
      };
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
      const alphanumericRatio =
        chunk.replace(/[^\w\u4e00-\u9fa5]/g, "").length / chunk.length;
      const threshold =
        alphanumericRatio < 0.3 ? globalThreshold * 2 : globalThreshold;

      if (count >= threshold) {
        return {
          isRepetitive: true,
          reason: `检测到高频重复片段: "${chunk.substring(0, 20)}..."`,
        };
      }
    }
  }

  return { isRepetitive: false };
};

/**
 * 内置常见模型拒绝与报错模式
 */
const REFUSAL_PATTERNS: Array<{ regex: RegExp; desc: string }> = [
  // 1. 纯文本认知偏差（自称纯文本模型，无法查看图片、音频等）
  {
    regex: /(?:作为|我(?:只是|是一个))(?:一个)?(?:纯)?文本(?:大)?模型/i,
    desc: "模型自称纯文本模型",
  },
  {
    regex:
      /(?:无法|不能)(?:直接)?(?:查看|读取|处理|分析|识别|浏览|感知|听|看)(?:此|该|这|任何)?(?:图片|图像|音频|视频|文件|照片)/i,
    desc: "模型拒绝处理多媒体文件",
  },
  {
    regex: /as a text(?:-based)? (?:ai|model|assistant)/i,
    desc: "模型自称纯文本模型 (英文)",
  },
  {
    regex:
      /i (?:can ?not|cannot|can't) (?:see|view|process|listen to|hear|watch|access) (?:any )?(?:images?|audio|videos?|files?|pictures?)/i,
    desc: "模型拒绝查看多媒体文件 (英文)",
  },
  {
    regex:
      /i do(?:n't| not) have the ability to (?:see|view|process|hear|listen|watch)/i,
    desc: "模型声称缺乏感知能力 (英文)",
  },

  // 2. 安全合规围栏拒绝
  {
    regex:
      /(?:抱歉|对不起)[，,]?(?:我)?(?:无法|不能)(?:协助|提供|处理|转录|转写|完成)(?:此类|该|此|这个)?(?:请求|内容)?/i,
    desc: "模型安全合规拒绝",
  },
  {
    regex:
      /违反(?:了)?(?:我们的)?(?:安全规范|使用政策|使用规范|社区准则|服务条款)/i,
    desc: "模型触发安全规范拒绝",
  },
  {
    regex: /涉及(?:敏感|违规|不当|违法)内容/i,
    desc: "模型提示涉及敏感违规内容",
  },
  {
    regex: /i (?:cannot|can not|can't) assist with (?:this|that|your) request/i,
    desc: "模型拒绝提供协助 (英文)",
  },
  {
    regex: /violates? (?:our|the) (?:safety|content|usage) policy/i,
    desc: "模型触发安全策略拒绝 (英文)",
  },
  {
    regex: /sorry, (?:but )?i (?:cannot|can't)/i,
    desc: "模型道歉并拒绝 (英文)",
  },

  // 3. 常见内嵌错误
  {
    regex: /\[Error:\s*[^\]]+\]/i,
    desc: "内嵌错误标记",
  },
  {
    regex:
      /(?:Internal Server Error|Bad Gateway|Gateway Timeout|Service Unavailable|Rate limit exceeded|Model overloaded)/i,
    desc: "内嵌服务错误",
  },
];

export interface RefusalDetectionResult {
  isRefusal: boolean;
  reason?: string;
}

/**
 * 检测转写结果是否为模型拒绝、能力认知偏差或内嵌报错
 */
export const detectModelRefusal = (
  text: string,
  options?: {
    enabled?: boolean;
    refusalKeywords?: string[];
  }
): RefusalDetectionResult => {
  if (!text || text.trim().length === 0) {
    return { isRefusal: false };
  }

  const { enabled = true, refusalKeywords = [] } = options || {};
  if (!enabled) {
    return { isRefusal: false };
  }

  const trimmed = text.trim();

  // 1. 自定义关键词检查（若用户输入了自定义关键词，任何位置命中即触发）
  if (refusalKeywords && refusalKeywords.length > 0) {
    for (const kw of refusalKeywords) {
      const cleanKw = kw.trim();
      if (cleanKw && trimmed.includes(cleanKw)) {
        return {
          isRefusal: true,
          reason: `命中自定义拒绝关键词: "${cleanKw}"`,
        };
      }
    }
  }

  // 2. 检查文本首尾区间与全文
  // 如果文本很短（<= 400 字符），模型往往直接就是拒绝说明，全文检查
  // 如果文本较长，拒绝通常在开头前 300 字符或结尾后 300 字符，避免在正常长文转录（如讨论AI规则的文档）中误杀
  const checkScope =
    trimmed.length <= 400
      ? [trimmed]
      : [trimmed.slice(0, 300), trimmed.slice(-300)];

  for (const segment of checkScope) {
    for (const pattern of REFUSAL_PATTERNS) {
      if (pattern.regex.test(segment)) {
        return {
          isRefusal: true,
          reason: `疑似模型拒绝或内嵌报错 (${pattern.desc})`,
        };
      }
    }
  }

  return { isRefusal: false };
};
