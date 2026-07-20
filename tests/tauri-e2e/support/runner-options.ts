export type RecallCorpusMode = "smoke" | "curated" | "external-full";

export type RunnerLaneRequest =
  | { kind: "deterministic-mock" }
  | {
      kind: "ollama";
      baseUrl: string;
      chatModelId?: string;
      embeddingModelId: string;
      requireAvailable: boolean;
    }
  | {
      kind: "private-profile";
      configPath: string;
      profileId: string;
      chatModelId: string;
      embeddingModelId: string;
      embeddingDimension?: number;
    };

export interface E2eRunnerOptions {
  nativeUiEnabled: boolean;
  corpusMode: RecallCorpusMode;
  lane: RunnerLaneRequest;
  wdioArgs: string[];
  restartSpec?: string;
  requiredScenarioIds: string[];
}

function readOption(
  args: string[],
  index: number,
  name: string
): { value: string | undefined; consumed: number } | null {
  const argument = args[index];
  if (argument === name) {
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      return { value: next, consumed: 2 };
    }
    return { value: undefined, consumed: 1 };
  }
  const prefix = `${name}=`;
  if (argument.startsWith(prefix)) {
    return { value: argument.slice(prefix.length), consumed: 1 };
  }
  return null;
}

function requireValue(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required.`);
  return normalized;
}

function optionalPositiveInteger(
  value: string | undefined,
  name: string
): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function parseE2eRunnerOptions(
  args: string[],
  env: NodeJS.ProcessEnv = process.env
): E2eRunnerOptions {
  const wdioArgs: string[] = [];
  let nativeUiEnabled = env.AIO_E2E_NATIVE_UI === "1";
  let vectorMode = env.AIO_E2E_VECTOR_MODE?.trim() || "mock";
  let corpusMode = env.AIO_E2E_CORPUS_MODE?.trim() || "smoke";
  let cliProfileId: string | undefined;
  let privateProfileRequested = false;
  let restartSpec: string | undefined;
  const requiredScenarioIds: string[] = [];

  for (let index = 0; index < args.length;) {
    if (args[index] === "--native") {
      nativeUiEnabled = true;
      index += 1;
      continue;
    }

    const vectorOption = readOption(args, index, "--vector-mode");
    if (vectorOption) {
      vectorMode = requireValue(vectorOption.value, "--vector-mode");
      index += vectorOption.consumed;
      continue;
    }

    const corpusOption = readOption(args, index, "--corpus-mode");
    if (corpusOption) {
      corpusMode = requireValue(corpusOption.value, "--corpus-mode");
      index += corpusOption.consumed;
      continue;
    }

    const profileOption = readOption(args, index, "--llm-profile");
    if (profileOption) {
      privateProfileRequested = true;
      cliProfileId = profileOption.value?.trim() || undefined;
      index += profileOption.consumed;
      continue;
    }

    const restartOption = readOption(args, index, "--restart-spec");
    if (restartOption) {
      restartSpec = requireValue(restartOption.value, "--restart-spec");
      index += restartOption.consumed;
      continue;
    }

    const scenarioOption = readOption(args, index, "--required-scenarios");
    if (scenarioOption) {
      const ids = requireValue(scenarioOption.value, "--required-scenarios")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);
      requiredScenarioIds.push(...ids);
      index += scenarioOption.consumed;
      continue;
    }

    wdioArgs.push(args[index]);
    index += 1;
  }

  if (!(["mock", "ollama"] as string[]).includes(vectorMode)) {
    throw new Error(`Unsupported vector mode: ${vectorMode}.`);
  }
  if (
    !(["smoke", "curated", "external-full"] as string[]).includes(corpusMode)
  ) {
    throw new Error(`Unsupported corpus mode: ${corpusMode}.`);
  }

  const envProfileId = env.AIO_E2E_LLM_PROFILE_ID?.trim();
  privateProfileRequested ||= !!envProfileId;
  if (privateProfileRequested && vectorMode === "ollama") {
    throw new Error(
      "Private profile selection and --vector-mode ollama cannot be combined."
    );
  }

  let lane: RunnerLaneRequest;
  if (privateProfileRequested) {
    lane = {
      kind: "private-profile",
      configPath: requireValue(env.AIO_E2E_LLM_CONFIG, "AIO_E2E_LLM_CONFIG"),
      profileId: requireValue(cliProfileId || envProfileId, "LLM profile ID"),
      chatModelId: requireValue(
        env.AIO_E2E_CHAT_MODEL_ID,
        "AIO_E2E_CHAT_MODEL_ID"
      ),
      embeddingModelId: requireValue(
        env.AIO_E2E_EMBEDDING_MODEL_ID,
        "AIO_E2E_EMBEDDING_MODEL_ID"
      ),
      embeddingDimension: optionalPositiveInteger(
        env.AIO_E2E_EMBEDDING_DIMENSION,
        "AIO_E2E_EMBEDDING_DIMENSION"
      ),
    };
  } else if (vectorMode === "ollama") {
    lane = {
      kind: "ollama",
      baseUrl: env.AIO_E2E_OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434",
      chatModelId: env.AIO_E2E_OLLAMA_CHAT_MODEL?.trim() || undefined,
      embeddingModelId: requireValue(
        env.AIO_E2E_OLLAMA_MODEL,
        "AIO_E2E_OLLAMA_MODEL"
      ),
      requireAvailable: env.AIO_E2E_REQUIRE_OLLAMA === "1",
    };
  } else {
    lane = { kind: "deterministic-mock" };
  }

  return {
    nativeUiEnabled,
    corpusMode: corpusMode as RecallCorpusMode,
    lane,
    wdioArgs,
    restartSpec,
    requiredScenarioIds: [...new Set(requiredScenarioIds)],
  };
}
