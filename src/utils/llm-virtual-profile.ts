import {
  resolveChannelCandidates,
  ChannelConfigurationError,
} from "@aiohub/llm-core";
import type { LlmProfile } from "@/types/llm-profiles";

export function remapVirtualChannelReferences(
  profile: LlmProfile,
  ids: ReadonlyMap<string, string>
): LlmProfile {
  if (profile.type !== "virtual") return profile;
  return {
    ...profile,
    virtualChannel: profile.virtualChannel
      ? {
          ...profile.virtualChannel,
          members: profile.virtualChannel.members.map(
            (id) => ids.get(id) ?? id
          ),
        }
      : undefined,
    models: profile.models.map((model) => ({
      ...model,
      virtualBindings: Object.fromEntries(
        Object.entries(model.virtualBindings ?? {}).map(([op, targets]) => [
          op,
          targets?.map((target) => ({
            ...target,
            profileId: ids.get(target.profileId) ?? target.profileId,
          })),
        ])
      ),
    })),
  };
}

export function validateVirtualChatTools(
  profile: LlmProfile,
  modelId: string,
  profiles: LlmProfile[],
  resolveTools: (profile: LlmProfile) => {
    callConsumer: string;
    upstreamProtocol: string;
  }
): void {
  const expected = resolveTools(profile);
  for (const candidate of resolveChannelCandidates({
    profile,
    modelId,
    operation: "chat",
    profiles,
    allowDisabledProfile: true,
  })) {
    const actual = resolveTools(candidate.profile);
    if (
      actual.callConsumer !== expected.callConsumer ||
      actual.upstreamProtocol !== expected.upstreamProtocol
    )
      throw new ChannelConfigurationError(
        "主备渠道的工具处理方式不同，请选择一致的渠道成员"
      );
  }
}
