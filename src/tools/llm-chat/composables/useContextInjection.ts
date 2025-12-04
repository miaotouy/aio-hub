import { createModuleLogger } from "@/utils/logger";
import type { ChatMessageNode } from "../types/message";
import type { InjectionMessage } from "../types/context";

const logger = createModuleLogger("llm-chat/context-injection");

/**
 * 消息分类结果
 */
export interface ClassifiedMessages {
  /** 骨架消息：无注入策略，按数组顺序排列 */
  skeleton: ChatMessageNode[];
  /** 深度注入消息：有 depth 字段 */
  depthInjections: InjectionMessage[];
  /** 锚点注入消息：有 anchorTarget 字段 */
  anchorInjections: InjectionMessage[];
}

export function useContextInjection() {
  /**
   * 对预设消息进行分类
   * 优先级：depth > anchorTarget > 无策略
   */
  const classifyPresetMessages = (presetMessages: ChatMessageNode[]): ClassifiedMessages => {
    const skeleton: ChatMessageNode[] = [];
    const depthInjections: InjectionMessage[] = [];
    const anchorInjections: InjectionMessage[] = [];

    for (const msg of presetMessages) {
      const strategy = msg.injectionStrategy;

      if (!strategy) {
        // 无策略，作为骨架消息
        skeleton.push(msg);
      } else if (strategy.depth !== undefined) {
        // 深度注入优先
        depthInjections.push({
          message: msg,
          strategy: { ...strategy, order: strategy.order ?? 100 },
        });
      } else if (strategy.anchorTarget) {
        // 锚点注入
        anchorInjections.push({
          message: msg,
          strategy: { ...strategy, order: strategy.order ?? 100 },
        });
      } else {
        // 策略对象存在但没有有效字段，视为骨架消息
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
    return [...injections].sort((a, b) => (a.strategy.order ?? 100) - (b.strategy.order ?? 100));
  };

  /**
   * 将深度注入消息插入到会话历史中
   * @param history 会话历史消息列表（按时间顺序，最旧在前）
   * @param depthInjections 深度注入消息列表
   * @returns 插入后的消息列表
   */
  const applyDepthInjections = <T extends { role: string; content: any }>(
    history: T[],
    depthInjections: InjectionMessage[],
    processedContents: Map<string, string>,
    presetMessages: ChatMessageNode[]
  ): (T | { role: string; content: string; sourceType: string; sourceId: string; sourceIndex: number })[] => {
    if (depthInjections.length === 0) {
      return history;
    }

    // 按 depth 分组，同一深度的按 order 排序
    const depthGroups = new Map<number, InjectionMessage[]>();
    for (const injection of depthInjections) {
      const depth = injection.strategy.depth ?? 0;
      if (!depthGroups.has(depth)) {
        depthGroups.set(depth, []);
      }
      depthGroups.get(depth)!.push(injection);
    }

    // 对每组按 order 排序
    for (const [depth, group] of depthGroups) {
      depthGroups.set(depth, sortByOrder(group));
    }

    // 构建结果数组
    const result: (T | { role: string; content: string; sourceType: string; sourceId: string; sourceIndex: number })[] = [...history];

    // 按深度从大到小处理（先处理更深的位置，避免索引偏移问题）
    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => b - a);

    for (const depth of sortedDepths) {
      const group = depthGroups.get(depth)!;
      // 计算插入位置：从末尾往前数 depth 条
      // depth=0 表示在最后, depth=1 表示倒数第1条之后
      const insertIndex = Math.max(0, result.length - depth);

      // 将这组消息插入到该位置（按 order 顺序）
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
    anchorInjections: InjectionMessage[]
  ): Map<string, { before: InjectionMessage[]; after: InjectionMessage[] }> => {
    const groups = new Map<string, { before: InjectionMessage[]; after: InjectionMessage[] }>();

    for (const injection of anchorInjections) {
      const target = injection.strategy.anchorTarget!;
      const position = injection.strategy.anchorPosition ?? 'after';

      if (!groups.has(target)) {
        groups.set(target, { before: [], after: [] });
      }

      // 存储完整的 InjectionMessage 对象
      const group = groups.get(target)!;
      if (position === 'before') {
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
  const getSortedAnchorInjections = (anchorInjections: InjectionMessage[]): InjectionMessage[] => {
    return sortByOrder(anchorInjections);
  };

  return {
    classifyPresetMessages,
    applyDepthInjections,
    getAnchorInjectionGroups,
    getSortedAnchorInjections,
  };
}