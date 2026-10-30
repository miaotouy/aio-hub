import {
  assembleHistoryInjections,
  isDynamicMessageAnchor,
  materializePresetMessage,
  normalizePresetGroupState,
} from "@aiohub/agent-preset-core";
import type {
  ChatAgent,
  PresetMessage,
} from "@/tools/agent-manager/types/agent";
import { createModuleLogger } from "@/utils/logger";
import { isModelMatchSatisfied } from "@/tools/llm-chat/utils/modelMatch";
import type { LlmModelInfo, LlmProfile } from "@/tools/llm-api/types";
import type { ProcessableMessage } from "../../../types/context";
import {
  processorResult,
  type ContextProcessor,
  type PipelineContext,
} from "../../../types/pipeline";

const logger = createModuleLogger("llm-chat/injection-assembler");

interface InjectionMessage {
  message: PresetMessage;
  strategy: NonNullable<PresetMessage["injectionStrategy"]>;
}

interface ClassifiedMessages {
  skeleton: PresetMessage[];
  depthInjections: InjectionMessage[];
  anchorInjections: InjectionMessage[];
}

const CHAT_HISTORY_ANCHOR = "chat_history";

function isEnabled(
  message: PresetMessage,
  agent: ChatAgent,
  model: LlmModelInfo | undefined,
  profile: LlmProfile | undefined
): boolean {
  if (message.isEnabled === false) return false;
  const groupEnabled =
    !message.groupId ||
    agent.presetGroups?.find((group) => group.id === message.groupId)
      ?.enabled !== false;
  if (!groupEnabled) return false;
  if (!message.modelMatch?.enabled) return true;
  return isModelMatchSatisfied(message.modelMatch, {
    modelId: agent.modelId,
    modelName: model?.name,
    profileName: profile?.name,
  });
}

function classifyPresetMessages(messages: PresetMessage[]): ClassifiedMessages {
  const skeleton: PresetMessage[] = [];
  const depthInjections: InjectionMessage[] = [];
  const anchorInjections: InjectionMessage[] = [];

  for (const message of messages) {
    const strategy = message.injectionStrategy;
    if (!strategy || strategy.type === "default") {
      skeleton.push(message);
      continue;
    }

    if (
      strategy.type === "depth" ||
      strategy.type === "advanced_depth" ||
      (!strategy.type &&
        (strategy.depth !== undefined || strategy.depthConfig !== undefined))
    ) {
      depthInjections.push({
        message,
        strategy: { ...strategy, order: strategy.order ?? 100 },
      });
      continue;
    }

    if (
      strategy.type === "anchor" ||
      (!strategy.type && strategy.anchorTarget)
    ) {
      anchorInjections.push({
        message,
        strategy: { ...strategy, order: strategy.order ?? 100 },
      });
      continue;
    }

    skeleton.push(message);
  }

  return { skeleton, depthInjections, anchorInjections };
}

function sortByOrder(injections: InjectionMessage[]): InjectionMessage[] {
  return [...injections].sort(
    (left, right) =>
      (left.strategy.order ?? 100) - (right.strategy.order ?? 100)
  );
}

function toProcessableMessage(
  message: PresetMessage,
  sourceType: "agent_preset" | "depth_injection" | "anchor_injection",
  sourceIndex: number
): ProcessableMessage {
  return {
    role: message.role,
    content: message.content,
    sourceType,
    sourceId: message.id,
    presetContributingParts: message.presetContributingParts,
    sourceIndex,
    _timestamp: message.timestamp
      ? new Date(message.timestamp).getTime()
      : undefined,
    _name: message.name,
  };
}

function buildAnchorGroups(
  injections: InjectionMessage[]
): Map<string, { before: InjectionMessage[]; after: InjectionMessage[] }> {
  const groups = new Map<
    string,
    { before: InjectionMessage[]; after: InjectionMessage[] }
  >();
  for (const injection of sortByOrder(injections)) {
    const target = injection.strategy.anchorTarget;
    if (!target) continue;
    const group = groups.get(target) ?? { before: [], after: [] };
    group[
      injection.strategy.anchorPosition === "before" ? "before" : "after"
    ].push(injection);
    groups.set(target, group);
  }
  return groups;
}

export const injectionAssembler: ContextProcessor = {
  id: "primary:injection-assembler",
  name: "注入组装器",
  description: "按默认、深度和锚点策略组装智能体预设与会话历史。",
  priority: 400,
  isCore: true,
  defaultEnabled: true,
  execute: async (context: PipelineContext) => {
    const agent = context.agentConfig;
    if (!agent) {
      return processorResult.skipped("当前会话未绑定智能体，已保留会话历史。");
    }

    const model = context.sharedData.get("model") as LlmModelInfo | undefined;
    const profile = context.sharedData.get("profile") as LlmProfile | undefined;
    const allPresets = normalizePresetGroupState(
      agent.presetMessages ?? [],
      agent.presetGroups
    );
    const presetMessages = allPresets.map((message) =>
      isEnabled(message, agent, model, profile)
        ? materializePresetMessage(message)
        : { ...message, isEnabled: false }
    );
    // Keep full positions and empty anchors; filter only the list used for classification.
    const activePresets = presetMessages.filter(
      (message) =>
        message.isEnabled !== false &&
        (Boolean(message.content.trim()) ||
          (message.type && message.type !== "message"))
    );
    if (!activePresets.length) {
      return processorResult.skipped(
        "智能体无已启用预设消息，已保留会话历史。"
      );
    }

    const { skeleton, depthInjections, anchorInjections } =
      classifyPresetMessages(activePresets);
    const diagnostics: import("@aiohub/agent-preset-core").HistoryInjectionDiagnostic[] =
      [];
    const historyWithDepth = assembleHistoryInjections(
      context.messages,
      [
        ...depthInjections,
        ...anchorInjections.filter((injection) =>
          isDynamicMessageAnchor(injection.strategy.anchorTarget)
        ),
      ].sort(
        (a, b) =>
          presetMessages.indexOf(a.message) - presetMessages.indexOf(b.message)
      ),
      (injection) =>
        toProcessableMessage(
          injection.message,
          depthInjections.includes(injection)
            ? "depth_injection"
            : "anchor_injection",
          presetMessages.indexOf(injection.message)
        ),
      (diagnostic) => {
        diagnostics.push(diagnostic);
        const reason =
          diagnostic.reason === "target_missing"
            ? "有效历史中尚无目标消息，已跳过"
            : diagnostic.reason === "tool_results_pending"
              ? "工具结果尚未加入历史，已跳过"
              : "已调整到完整工具调用区段的边界";
        context.logs.push({
          processorId: "primary:injection-assembler",
          level: "info",
          message: `预设「${diagnostic.sourceId}」：${reason}（${diagnostic.target ?? "depth"}）。`,
        });
      }
    );
    context.sharedData.set("historyInjectionDiagnostics", diagnostics);
    const anchorGroups = buildAnchorGroups(
      anchorInjections.filter(
        (injection) => !isDynamicMessageAnchor(injection.strategy.anchorTarget)
      )
    );
    const buildAnchors = (
      target: string,
      position: "before" | "after"
    ): ProcessableMessage[] =>
      (anchorGroups.get(target)?.[position] ?? []).map((injection) =>
        toProcessableMessage(
          injection.message,
          "anchor_injection",
          presetMessages.indexOf(injection.message)
        )
      );

    const historyAnchorIndex = skeleton.findIndex(
      (message) => message.type === CHAT_HISTORY_ANCHOR
    );
    const beforeHistory =
      historyAnchorIndex === -1
        ? skeleton
        : skeleton.slice(0, historyAnchorIndex);
    const afterHistory =
      historyAnchorIndex === -1 ? [] : skeleton.slice(historyAnchorIndex + 1);
    const finalMessages: ProcessableMessage[] = [];

    for (const message of beforeHistory) {
      if (message.type && message.type !== "message") {
        finalMessages.push(...buildAnchors(message.type, "before"));
        finalMessages.push(...buildAnchors(message.type, "after"));
      } else {
        finalMessages.push(
          toProcessableMessage(
            message,
            "agent_preset",
            presetMessages.indexOf(message)
          )
        );
      }
    }

    finalMessages.push(...buildAnchors(CHAT_HISTORY_ANCHOR, "before"));
    finalMessages.push(...historyWithDepth);
    finalMessages.push(...buildAnchors(CHAT_HISTORY_ANCHOR, "after"));

    for (const message of afterHistory) {
      if (message.type && message.type !== "message") {
        finalMessages.push(...buildAnchors(message.type, "before"));
        finalMessages.push(...buildAnchors(message.type, "after"));
      } else {
        finalMessages.push(
          toProcessableMessage(
            message,
            "agent_preset",
            presetMessages.indexOf(message)
          )
        );
      }
    }

    context.messages = finalMessages;
    const details = {
      presetCount: presetMessages.length,
      depthInjectionCount: depthInjections.length,
      anchorInjectionCount: anchorInjections.length,
      finalMessageCount: finalMessages.length,
    };
    const message = `注入组装完成：预设 ${presetMessages.length} 条，深度注入 ${depthInjections.length} 条，锚点注入 ${anchorInjections.length} 条，最终 ${finalMessages.length} 条。`;
    logger.info(message, { agentId: agent.id, ...details });
    return processorResult.applied(message, details);
  },
};
