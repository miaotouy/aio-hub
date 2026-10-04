/**
 * 子智能体模型解析与降级决策器
 *
 * 决策链：
 * 1. prefer_self 且自身 profileId/modelId 依然有效 -> 使用自身（source: "self"）；
 * 2. 其余情况（inherit_caller 或自身配置失效）-> 跟随调用方父会话模型（source: "caller"）；
 * 3. 调用方模型不可用 -> 安全回退到系统激活的默认 Profile/首选模型（source: "fallback"）。
 *
 * 该函数为纯决策器：任何一步不可用都静默降级，绝不抛出"配置丢失"错误。
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

  // 1. 尝试 prefer_self
  if (mode === "prefer_self") {
    if (isModelAvailable(targetAgent.profileId, targetAgent.modelId)) {
      return {
        profileId: targetAgent.profileId,
        modelId: targetAgent.modelId,
        source: "self",
      };
    }
  }

  // 2. 尝试 inherit_caller
  if (isModelAvailable(context?.callerProfileId, context?.callerModelId)) {
    return {
      profileId: context!.callerProfileId!,
      modelId: context!.callerModelId!,
      source: "caller",
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
    };
  }

  // 没有任何启用的 Profile 或可用模型，抛出明确指引错误
  throw new Error(
    `子智能体「${targetAgent.displayName || targetAgent.name || targetAgent.id}」无法解析到可用模型：当前无可用上级模型且系统未启用任何 LLM Profile。请前往设置添加或启用模型。`
  );
}
