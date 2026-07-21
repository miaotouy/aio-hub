import type { LlmModelInfo, LlmProfile } from "../../../src/types/llm-profiles";
import { parseLlmProfileBundle } from "../../../src/utils/llm-profile-transfer";

export interface PrivateProfileLaneSelection {
  profileId: string;
  chatModelId: string;
  embeddingModelId: string;
}

export interface PrivateProfileLane {
  profile: LlmProfile;
  chatModel: LlmModelInfo;
  embeddingModel: LlmModelInfo;
  metadata: {
    lane: "private-profile";
    profileId: string;
    chatModelId: string;
    embeddingModelId: string;
    endpointOrigin: string;
  };
}

function requireModel(
  profile: LlmProfile,
  modelId: string,
  role: "Chat" | "Embedding"
): LlmModelInfo {
  const model = profile.models.find((candidate) => candidate.id === modelId);
  if (!model) {
    throw new Error(
      `${role} model ${modelId} does not exist in profile ${profile.id}.`
    );
  }
  return model;
}

export function resolvePrivateProfileLane(
  bundleValue: unknown,
  selection: PrivateProfileLaneSelection
): PrivateProfileLane {
  const parsed = parseLlmProfileBundle(bundleValue);
  if (!parsed.recognized) {
    throw new Error("The selected file is not an AIO Hub LLM profile bundle.");
  }
  if (parsed.error || !parsed.bundle) {
    throw new Error(
      parsed.error || "The AIO Hub LLM profile bundle is invalid."
    );
  }

  const profile = parsed.bundle.profiles.find(
    (candidate) => candidate.id === selection.profileId
  );
  if (!profile) {
    throw new Error(
      `Profile ${selection.profileId} does not exist in the selected bundle.`
    );
  }
  if (!profile.enabled) {
    throw new Error(`Profile ${profile.id} is disabled.`);
  }

  const chatModel = requireModel(profile, selection.chatModelId, "Chat");
  const embeddingModel = requireModel(
    profile,
    selection.embeddingModelId,
    "Embedding"
  );
  if (embeddingModel.capabilities?.embedding !== true) {
    throw new Error(
      `Embedding model ${embeddingModel.id} does not declare embedding capability.`
    );
  }

  return {
    profile: structuredClone(profile),
    chatModel: structuredClone(chatModel),
    embeddingModel: structuredClone(embeddingModel),
    metadata: {
      lane: "private-profile",
      profileId: profile.id,
      chatModelId: chatModel.id,
      embeddingModelId: embeddingModel.id,
      endpointOrigin: new URL(profile.baseUrl).origin,
    },
  };
}
