import type { ProbeCapability, ProbeModelDescriptor, ProbePlan } from "./types";

export function resolveProbeCapability(
  model: ProbeModelDescriptor,
  requested?: ProbeCapability
): ProbeCapability {
  if (requested) return requested;

  const capabilities = model.capabilities;
  if (capabilities?.embedding) return "embedding";
  if (capabilities?.rerank) return "rerank";
  if (capabilities?.imageGeneration) return "image";
  if (capabilities?.audioGeneration) return "audio";
  if (capabilities?.videoGeneration) return "video";
  if (capabilities?.musicGeneration) return "music";
  return "chat";
}

export function resolveProbePlan(
  model: ProbeModelDescriptor,
  options: { capability?: ProbeCapability; stream?: boolean } = {}
): ProbePlan {
  const capability = resolveProbeCapability(model, options.capability);

  switch (capability) {
    case "chat":
      return {
        capability,
        stream: options.stream === true,
        requiresExplicitConsent: false,
        supported: true,
        chat: { prompt: "hi", maxTokens: 16 },
      };
    case "embedding":
      return {
        capability,
        stream: false,
        requiresExplicitConsent: false,
        supported: true,
        embedding: { input: "hi" },
      };
    case "rerank":
      return {
        capability,
        stream: false,
        requiresExplicitConsent: false,
        supported: true,
        rerank: { query: "hi", documents: ["hello", "world"] },
      };
    case "image":
      return {
        capability,
        stream: false,
        requiresExplicitConsent: true,
        supported: true,
        media: { prompt: "A small red circle on a white background" },
      };
    case "audio":
      return {
        capability,
        stream: false,
        requiresExplicitConsent: true,
        supported: true,
        media: { prompt: "Hello." },
      };
    case "video":
    case "music":
      return {
        capability,
        stream: false,
        requiresExplicitConsent: true,
        supported: false,
      };
  }
}
