import type { ContextProcessor, PipelineContext } from "../../types/pipeline";
import { createModuleLogger } from "@/utils/logger";
import { buildMacroContext, processMacros } from "../context-utils/macro";
import { MacroProcessor } from "@/tools/llm-chat/macro-engine";
import type { ProcessableMessage } from "@/tools/llm-chat/types/context";
import { SYSTEM_ANCHORS } from "@/tools/llm-chat/types/context";
import type { ChatMessageNode } from "../../types/message";
import type { InjectionMessage } from "../../types/context";

const logger = createModuleLogger("primary:injection-assembler");

/**
 * 消息分类结果
 */
interface ClassifiedMessages {
  /** 骨架消息：无注入策略，按数组顺序排列 */
  skeleton: ChatMessageNode[];
  /** 深度注入消息：有 depth 字段 */
  depthInjections: InjectionMessage[];
  /** 锚点注入消息：有 anchorTarget 字段 */
  anchorInjections: InjectionMessage[];
}

/**
 * 对预设消息进行分类
 * 优先级：depth > anchorTarget > 无策略
 */
const classifyPresetMessages = (
  presetMessages: ChatMessageNode[],
): ClassifiedMessages => {
  const skeleton: ChatMessageNode[] = [];
  const depthInjections: InjectionMessage[] = [];
  const anchorInjections: InjectionMessage[] = [];

  for (const msg of presetMessages) {
    const strategy = msg.injectionStrategy;

    if (!strategy) {
      skeleton.push(msg);
    } else if (strategy.depth !== undefined) {
      depthInjections.push({
        message: msg,
        strategy: { ...strategy, order: strategy.order ?? 100 },
      });
    } else if (strategy.anchorTarget) {
      anchorInjections.push({
        message: msg,
        strategy: { ...strategy, order: strategy.order ?? 100 },
      });
    } else {
      skeleton.push(msg);
    }
  }

  logger.debug("📋 预设消息分类完成", {
    skeletonCount: skeleton.length,
    depthInjectionsCount: depthInjections.length,
    anchorInjectionsCount: anchorInjections.length,
  });

  return { skeleton, depthInjections, anchorInjections };
};

/**
 * 按 order 排序注入消息
 * order 值越大越靠近新消息（对话末尾）
 */
const sortByOrder = (injections: InjectionMessage[]): InjectionMessage[] => {
  return [...injections].sort(
    (a, b) => (a.strategy.order ?? 100) - (b.strategy.order ?? 100),
  );
};

/**
 * 将深度注入消息插入到会话历史中
 */
const applyDepthInjections = <T extends { role: string; content: any }>(
  history: T[],
  depthInjections: InjectionMessage[],
  processedContents: Map<string, string>,
  presetMessages: ChatMessageNode[],
): (
  | T
  | {
      role: string;
      content: string;
      sourceType: string;
      sourceId: string;
      sourceIndex: number;
    }
)[] => {
  if (depthInjections.length === 0) {
    return history;
  }

  const depthGroups = new Map<number, InjectionMessage[]>();
  for (const injection of depthInjections) {
    const depth = injection.strategy.depth ?? 0;
    if (!depthGroups.has(depth)) {
      depthGroups.set(depth, []);
    }
    depthGroups.get(depth)!.push(injection);
  }

  for (const [depth, group] of depthGroups) {
    depthGroups.set(depth, sortByOrder(group));
  }

  const result: (
    | T
    | {
        role: string;
        content: string;
        sourceType: string;
        sourceId: string;
        sourceIndex: number;
      }
  )[] = [...history];

  const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => b - a);

  for (const depth of sortedDepths) {
    const group = depthGroups.get(depth)!;
    const insertIndex = Math.max(0, result.length - depth);

    const injectedMessages = group.map((inj) => ({
      role: inj.message.role,
      content: processedContents.get(inj.message.id) ?? inj.message.content,
      sourceType: "depth_injection",
      sourceId: inj.message.id,
      sourceIndex: presetMessages.indexOf(inj.message),
    }));

    result.splice(insertIndex, 0, ...injectedMessages);
  }

  logger.debug("📍 深度注入完成", {
    originalHistoryLength: history.length,
    injectedCount: depthInjections.length,
    resultLength: result.length,
    depths: Array.from(depthGroups.keys()),
  });

  return result;
};

/**
 * 获取锚点注入消息（按锚点和位置分组）
 */
const getAnchorInjectionGroups = (
  anchorInjections: InjectionMessage[],
): Map<string, { before: InjectionMessage[]; after: InjectionMessage[] }> => {
  const groups = new Map<
    string,
    { before: InjectionMessage[]; after: InjectionMessage[] }
  >();

  for (const injection of anchorInjections) {
    const target = injection.strategy.anchorTarget!;
    const position = injection.strategy.anchorPosition ?? "after";

    if (!groups.has(target)) {
      groups.set(target, { before: [], after: [] });
    }

    const group = groups.get(target)!;
    if (position === "before") {
      group.before.push(injection);
    } else {
      group.after.push(injection);
    }
  }

  return groups;
};

/**
 * 对锚点注入消息进行排序（在添加到 groups 之前调用）
 */
const getSortedAnchorInjections = (
  anchorInjections: InjectionMessage[],
): InjectionMessage[] => {
  return sortByOrder(anchorInjections);
};

export const injectionAssembler: ContextProcessor = {
  id: "primary:injection-assembler",
  name: "注入组装器",
  description: "处理预设、注入、宏，并与历史消息组装。",
  priority: 400,
  execute: async (context: PipelineContext) => {
    const {
      messages: history,
      agentConfig,
      session,
      userProfile,
      timestamp,
    } = context;
    const allPresetMessages = agentConfig.presetMessages || [];
    const modelId = agentConfig.modelId;

    // 根据模型匹配规则等动态调整预设消息的启用状态
    const presetMessages = allPresetMessages.map((msg) => {
      // 如果消息本身已被禁用，则直接返回
      if (msg.isEnabled === false) {
        return msg;
      }

      // 检查模型匹配规则
      if (msg.modelMatch?.enabled && msg.modelMatch.patterns.length > 0) {
        const isMatch = msg.modelMatch.patterns.some((pattern) => {
          try {
            const regex = new RegExp(pattern, "i");
            let modelIdPart = modelId;
            const colonIndex = modelId.indexOf(":");
            if (colonIndex !== -1) {
              modelIdPart = modelId.substring(colonIndex + 1);
            }
            if (!modelIdPart) return false;

            if (regex.test(modelIdPart)) return true;

            const slashIndex = modelIdPart.lastIndexOf("/");
            if (slashIndex !== -1) {
              const pureModelName = modelIdPart.substring(slashIndex + 1);
              if (pureModelName && regex.test(pureModelName)) return true;
            }

            return false;
          } catch (e) {
            logger.warn(
              `预设消息 [${msg.name || msg.id}] 中的模型匹配正则表达式无效: ${pattern}`,
              e,
            );
            return false;
          }
        });

        // 如果不匹配，则返回一个被禁用的副本，而不是过滤掉它
        if (!isMatch) {
          return { ...msg, isEnabled: false };
        }
      }

      // 默认返回原始消息
      return msg;
    });

    // 过滤出有效的消息用于后续处理，但保留完整列表用于查找 sourceIndex
    const activePresetMessages = presetMessages.filter(
      (msg) => msg.isEnabled !== false,
    );

    if (activePresetMessages.length === 0) {
      context.logs.push({
        processorId: "primary:injection-assembler",
        level: "info",
        message: "智能体无预设消息，已跳过。",
      });
      return;
    }

    // 1. 宏处理 (只处理活动的消息)
    const macroProcessor = new MacroProcessor();
    const macroContext = buildMacroContext({
      session,
      agent: agentConfig,
      userProfile,
      timestamp,
    });
    const processedContents = new Map<string, string>();
    for (const msg of activePresetMessages) {
      if (msg.content.includes("{{")) {
        const processed = await processMacros(
          macroProcessor,
          msg.content,
          macroContext,
          { silent: true },
        );
        processedContents.set(msg.id, processed);
      }
    }

    // 2. 分类预设消息 (使用完整的列表以保留锚点)
    const { skeleton, depthInjections, anchorInjections } =
      classifyPresetMessages(presetMessages);

    // 3. 应用深度注入 (只使用有效的注入)
    const activeDepthInjections = depthInjections.filter(
      (inj) => inj.message.isEnabled !== false,
    );
    const historyWithDepthInjections = applyDepthInjections(
      history,
      activeDepthInjections,
      processedContents,
      presetMessages, // 传入完整列表以正确查找 sourceIndex
    ) as ProcessableMessage[];

    // 4. 组装最终消息列表
    const finalMessages: ProcessableMessage[] = [];
    const historyAnchorIndex = skeleton.findIndex(
      (msg) => msg.type === SYSTEM_ANCHORS.CHAT_HISTORY,
    );

    // 过滤出有效的锚点注入
    const activeAnchorInjections = anchorInjections.filter(
      (inj) => inj.message.isEnabled !== false,
    );
    const sortedAnchorInjections =
      getSortedAnchorInjections(activeAnchorInjections);
    const anchorGroups = getAnchorInjectionGroups(sortedAnchorInjections);

    const buildAnchorMessages = (target: string): ProcessableMessage[] => {
      const group = anchorGroups.get(target);
      if (!group) return [];
      const all = [...group.before, ...group.after];
      return all.map((inj) => ({
        role: inj.message.role,
        content: processedContents.get(inj.message.id) ?? inj.message.content,
        sourceType: "anchor_injection",
        sourceId: inj.message.id,
        sourceIndex: presetMessages.indexOf(inj.message),
      }));
    };

    const skeletonBefore =
      historyAnchorIndex === -1
        ? skeleton
        : skeleton.slice(0, historyAnchorIndex);
    const skeletonAfter =
      historyAnchorIndex === -1 ? [] : skeleton.slice(historyAnchorIndex + 1);

    // 添加 chat_history 锚点之前的骨架消息
    for (const msg of skeletonBefore) {
      // 过滤掉禁用的消息
      if (msg.isEnabled === false) continue;

      // 如果是 user_profile 锚点，则注入 user_profile 的内容
      if (msg.type === SYSTEM_ANCHORS.USER_PROFILE) {
        finalMessages.push(...buildAnchorMessages(SYSTEM_ANCHORS.USER_PROFILE));
        continue;
      }
      finalMessages.push({
        role: msg.role,
        content: processedContents.get(msg.id) ?? msg.content,
        sourceType: "agent_preset",
        sourceId: msg.id,
        sourceIndex: presetMessages.indexOf(msg),
      });
    }

    // 添加历史消息（已包含深度注入）
    finalMessages.push(...historyWithDepthInjections);

    // 添加 chat_history 锚点之后的骨架消息
    for (const msg of skeletonAfter) {
      // 过滤掉禁用的消息
      if (msg.isEnabled === false) continue;

      if (msg.type === SYSTEM_ANCHORS.USER_PROFILE) {
        finalMessages.push(...buildAnchorMessages(SYSTEM_ANCHORS.USER_PROFILE));
        continue;
      }
      finalMessages.push({
        role: msg.role,
        content: processedContents.get(msg.id) ?? msg.content,
        sourceType: "agent_preset",
        sourceId: msg.id,
        sourceIndex: presetMessages.indexOf(msg),
      });
    }

    context.messages = finalMessages;
    const message = `注入组装完成，最终消息数: ${finalMessages.length}。`;
    logger.info(message, {
      skeleton: skeleton.length,
      depthInjections: depthInjections.length,
      anchorInjections: anchorInjections.length,
      history: history.length,
      final: finalMessages.length,
    });
    context.logs.push({
      processorId: "primary:injection-assembler",
      level: "info",
      message,
    });
  },
};
