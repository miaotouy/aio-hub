import type { ContextProcessor, PipelineContext } from "../../pipeline/types";
import { createModuleLogger } from "@/utils/logger";
import {
  classifyPresetMessages,
  applyDepthInjections,
  getSortedAnchorInjections,
  getAnchorInjectionGroups,
} from "../../context-utils/injection";
import { buildMacroContext, processMacros } from "../../context-utils/macro";
import { MacroProcessor } from "@/tools/llm-chat/macro-engine";
import type { ProcessableMessage } from "@/tools/llm-chat/types/context";
import { SYSTEM_ANCHORS } from "@/tools/llm-chat/types/context";

const logger = createModuleLogger("primary:injection-assembler");

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
