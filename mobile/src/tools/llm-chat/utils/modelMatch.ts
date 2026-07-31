import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/modelMatch");

export interface ModelMatchContext {
  modelId?: string;
  modelName?: string;
  profileName?: string;
}

export interface ModelMatchConfig {
  enabled: boolean;
  mode?: "any" | "all";
  exclude?: boolean;
  patterns: string[];
  profilePatterns?: string[];
  matchProfileName?: boolean;
}

function matchesAny(patterns: string[], value: string | undefined): boolean {
  if (!value) return false;
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern, "i").test(value);
    } catch (error) {
      logger.warn("模型匹配正则表达式无效，已忽略", { pattern, error });
      return false;
    }
  });
}

export function isModelMatchSatisfied(
  config: ModelMatchConfig,
  context: ModelMatchContext
): boolean {
  const patterns = config.patterns ?? [];
  const profilePatterns = config.profilePatterns ?? [];
  // Mobile Agent stores profileId and modelId in separate fields. modelId is
  // already the provider-native ID and may legitimately contain colons
  // (for example, Ollama's `llama3.2:latest`), so it must not be split again.
  const modelId = context.modelId;
  const hasModelCriteria = patterns.length > 0;
  const modelIsMatched =
    matchesAny(patterns, context.modelName) ||
    matchesAny(patterns, modelId) ||
    matchesAny(
      patterns,
      modelId?.includes("/")
        ? modelId.slice(modelId.lastIndexOf("/") + 1)
        : undefined
    );
  const effectiveProfilePatterns = [
    ...profilePatterns,
    ...(config.matchProfileName ? patterns : []),
  ];
  const hasProfileCriteria = effectiveProfilePatterns.length > 0;
  const profileIsMatched = matchesAny(
    effectiveProfilePatterns,
    context.profileName
  );

  let rawMatch: boolean;
  if (!hasModelCriteria && !hasProfileCriteria) {
    rawMatch = true;
  } else if (!hasModelCriteria) {
    rawMatch = profileIsMatched;
  } else if (!hasProfileCriteria) {
    rawMatch = modelIsMatched;
  } else {
    rawMatch =
      config.mode === "all"
        ? modelIsMatched && profileIsMatched
        : modelIsMatched || profileIsMatched;
  }

  return config.exclude ? !rawMatch : rawMatch;
}