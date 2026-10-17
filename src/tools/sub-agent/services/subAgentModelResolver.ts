/**
 * 子智能体模型解析与降级决策器
 *
 * 决策链：
 * 1. prefer_self 且自身 profileId/modelId 依然有效 -> 使用自身（source: "self"）；
 * 2. 其余情况（inherit_caller 或自身配置失效）-> 跟随调用方父会话模型（source: "caller"）；
 * 3. 调用方模型不可用 -> 安全回退到系统激活的默认 Profile/首选模型（source: "fallback"）。
 *
 * 子智能体自身的绑定失效时会生成一条内部 system 提示，随后继续使用调用方模型；
 * 只有调用方和系统兜底都没有可用模型时才抛出配置错误。
 */

import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";

export interface SubAgentResolveContext {
  callerProfileId?: string;
  callerModelId?: string;
}

export interface ResolvedModelTarget {
  profileId: string;
  modelId: string;
  source: "self" | "caller" | "fallback";
  /** 需要写入子会话上下文的模型回退说明。 */
  notice?: string;
}

export function resolveSubAgentModel(
  targetAgent: ChatAgent,
  context?: SubAgentResolveContext
): ResolvedModelTarget {
  const { enabledProfiles } = useLlmProfiles();
  const profiles = enabledProfiles.value;

  const isModelAvailable = (pid?: string | null, mid?: string | null) => {
    if (!pid || !mid) return false;
    const profile = profiles.find((p) => p.id === pid);
    return profile ? profile.models.some((m) => m.id === mid) : false;
  };

  const mode = targetAgent.subAgentConfig?.modelBindingMode ?? "inherit_caller";
  const targetName =
    targetAgent.displayName || targetAgent.name || targetAgent.id;
  const hasOwnModelBinding = Boolean(
    targetAgent.profileId && targetAgent.modelId
  );
  let callerFallbackNotice: string | undefined;

  // 1. 尝试 prefer_self
  if (mode === "prefer_self") {
    if (isModelAvailable(targetAgent.profileId, targetAgent.modelId)) {
      return {
        profileId: targetAgent.profileId,
        modelId: targetAgent.modelId,
        source: "self",
      };
    }

    callerFallbackNotice = hasOwnModelBinding
      ? `系统提示：子智能体「${targetName}」自身绑定的 Profile/模型已不可用，当前已继承主会话正在使用的模型继续执行。请按原任务工作，无需向用户解释模型切换。`
      : `系统提示：子智能体「${targetName}」未配置可用的 Profile/模型，当前已继承主会话正在使用的模型继续执行。请按原任务工作，无需向用户解释模型切换。`;
  } else if (!hasOwnModelBinding) {
    callerFallbackNotice = `系统提示：子智能体「${targetName}」未配置独立的 Profile/模型，当前已继承主会话正在使用的模型继续执行。请按原任务工作，无需向用户解释模型切换。`;
  }

  // 2. 尝试 inherit_caller
  if (isModelAvailable(context?.callerProfileId, context?.callerModelId)) {
    return {
      profileId: context!.callerProfileId!,
      modelId: context!.callerModelId!,
      source: "caller",
      notice: callerFallbackNotice,
    };
  }

  // 3. 兜底系统激活的默认 Profile（取第一个启用的 Profile 及其首选模型）
  const defaultProfile = profiles[0];
  const defaultModel = defaultProfile?.models[0]?.id;

  if (defaultProfile?.id && defaultModel) {
    return {
      profileId: defaultProfile.id,
      modelId: defaultModel,
      source: "fallback",
      notice: `系统提示：主会话当前模型不可用${callerFallbackNotice ? "，子智能体自身模型也不可用" : ""}，已切换到系统中第一个可用的 Profile/模型继续执行。请按原任务工作，无需向用户解释模型切换。`,
    };
  }

  // 没有任何启用的 Profile 或可用模型，抛出明确指引错误
  throw new Error(
    `子智能体「${targetName}」无法解析到可用模型：主会话模型和系统兜底 Profile/模型均不可用。请前往设置添加或启用模型。`
  );
}
