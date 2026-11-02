import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";

export interface SubAgentResolveContext {
  callerProfileId?: string;
  callerModelId?: string;
}
export interface ResolvedModelTarget {
  profileId: string;
  modelId: string;
  source: "self" | "caller";
}

/** Resolve the explicit logical binding. Channel management owns failover. */
export function resolveSubAgentModel(
  targetAgent: ChatAgent,
  context?: SubAgentResolveContext
): ResolvedModelTarget {
  const own = targetAgent.subAgentConfig?.modelBindingMode === "prefer_self";
  const profileId = own ? targetAgent.profileId : context?.callerProfileId;
  const modelId = own ? targetAgent.modelId : context?.callerModelId;
  const { enabledProfiles } = useLlmProfiles();
  const profile = enabledProfiles.value.find((p) => p.id === profileId);
  if (!profile || !modelId || !profile.models.some((m) => m.id === modelId)) {
    const name = targetAgent.displayName || targetAgent.name || targetAgent.id;
    throw new Error(
      own
        ? `子智能体「${name}」自身绑定的渠道或模型不可用，请重新选择自身模型。`
        : `子智能体「${name}」缺少可用的调用方模型，请检查父请求的渠道与模型绑定。`
    );
  }
  return { profileId: profile.id, modelId, source: own ? "self" : "caller" };
}
