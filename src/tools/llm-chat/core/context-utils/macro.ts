/**
 * 宏处理器核心算法
 * 负责创建宏上下文和处理宏的纯函数
 */

import type { ChatSession, ChatAgent, UserProfile } from "../../types";
import {
  createMacroContext,
  extractContextFromSession,
} from "../../macro-engine/MacroContext";
import type { MacroProcessor } from "../../macro-engine/MacroProcessor";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("llm-chat/core/macro-processor");
const errorHandler = createModuleErrorHandler("llm-chat/core/macro-processor");

/**
 * 宏上下文构建所需的基础数据
 */
export interface MacroContextData {
  session?: ChatSession;
  agent?: ChatAgent;
  userProfile?: UserProfile;
  input?: string;
  userName?: string;
  charName?: string;
  timestamp?: number;
}

/**
 * 构建宏上下文
 * 这是一个纯函数，所有依赖都由外部传入
 */
export const buildMacroContext = (data: MacroContextData) => {
  const userName = data.userName || data.userProfile?.name || "User";
  const charName = data.charName || data.agent?.name || "Assistant";

  const baseContext = createMacroContext({
    userName,
    charName,
    agent: data.agent,
    userProfile: data.userProfile,
    session: data.session,
    timestamp: data.timestamp,
  });

  if (data.session) {
    const extractedContext = extractContextFromSession(
      data.session,
      data.agent,
      data.userProfile,
    );
    Object.assign(baseContext, extractedContext);
  }

  if (data.input !== undefined) {
    baseContext.input = data.input;
  }

  return baseContext;
};

/**
 * 处理文本中的宏（纯函数版本）
 * @param processor MacroProcessor 的实例
 * @param text 待处理的文本
 * @param context 宏上下文
 * @param options 处理选项
 * @returns 处理后的文本
 */
export const processMacros = async (
  processor: MacroProcessor,
  text: string,
  context: ReturnType<typeof buildMacroContext>,
  options?: {
    valueTransformer?: (value: string) => string;
    silent?: boolean;
  },
): Promise<string> => {
  if (!text.includes("{{")) {
    return text;
  }

  if (!options?.silent) {
    logger.debug("处理宏", {
      hasAgent: !!context.agent,
      hasUserProfile: !!context.userProfile,
      hasSession: !!context.session,
      hasInput: !!context.input,
      textLength: text.length,
    });
  }

  try {
    const result = await processor.process(text, context, {
      valueTransformer: options?.valueTransformer,
      silent: options?.silent,
    });

    if (result.hasMacros && !options?.silent) {
      logger.debug("宏处理完成", {
        originalLength: text.length,
        processedLength: result.output.length,
        macroCount: result.macroCount,
      });
    }

    return result.output;
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "宏处理失败",
      showToUser: false,
      context: { textPreview: text.substring(0, 100) },
    });
    return text;
  }
};

/**
 * 批量处理多个文本中的宏（纯函数版本）
 * @param processor MacroProcessor 的实例
 * @param texts 待处理的文本数组
 * @param context 宏上下文
 * @param options 处理选项
 * @returns 处理后的文本数组
 */
export const processMacrosBatch = async (
  processor: MacroProcessor,
  texts: string[],
  context: ReturnType<typeof buildMacroContext>,
  options?: {
    valueTransformer?: (value: string) => string;
    silent?: boolean;
  },
): Promise<string[]> => {
  const hasAnyMacros = texts.some((t) => t.includes("{{"));
  if (!hasAnyMacros) {
    return texts;
  }

  if (!options?.silent) {
    logger.debug("批量处理宏", {
      textCount: texts.length,
    });
  }

  try {
    const result = await processor.processBatch(texts, context, {
      valueTransformer: options?.valueTransformer,
    });

    if (!options?.silent) {
      logger.debug("批量宏处理完成", {
        totalCount: texts.length,
        processedCount: result.processedCount,
        skippedCount: result.skippedCount,
        totalMacroCount: result.totalMacroCount,
      });
    }

    return result.outputs;
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "批量宏处理失败",
      showToUser: false,
      context: { textCount: texts.length },
    });
    return texts;
  }
};
