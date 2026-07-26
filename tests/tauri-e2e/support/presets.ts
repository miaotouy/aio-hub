export type E2ePresetId =
  | "recall-pipeline"
  | "recall-vector"
  | "recall-curated"
  | "recall-chat"
  | "corpus-sample"
  | "corpus-full"
  | "ollama-vector"
  | "ollama-chat"
  | "private-profile"
  | "migration-minimal"
  | "migration-cleanup"
  | "guided-flow-baseline"
  | "native";

export interface E2ePresetPrerequisite {
  env: string;
  missing: "fail" | "skip";
  description: string;
}

export interface E2ePreset {
  id: E2ePresetId;
  purpose: string;
  args: readonly string[];
  prerequisites: readonly E2ePresetPrerequisite[];
  runtimeRequirements: readonly string[];
  includesRestart: boolean;
}

const VECTOR_SPEC = "tests/tauri-e2e/specs/recall-vector-workflow.spec.ts";
const PIPELINE_SPEC = "tests/tauri-e2e/specs/recall-pipeline.spec.ts";
const CHAT_SPEC = "tests/tauri-e2e/specs/recall-chat-injection.spec.ts";
const RECOVERY_SPEC = "tests/tauri-e2e/specs/recall-session-recovery.spec.ts";
const EXTERNAL_SPEC = "tests/tauri-e2e/specs/recall-external-corpus.spec.ts";
const EXTERNAL_RECOVERY_SPEC =
  "tests/tauri-e2e/specs/recall-external-corpus-recovery.spec.ts";
const MIGRATION_SPEC =
  "tests/tauri-e2e/specs/guided-knowledge-migration.spec.ts";
const MIGRATION_RECOVERY_SPEC =
  "tests/tauri-e2e/specs/guided-knowledge-migration-recovery.spec.ts";
const MIGRATION_CLEANUP_SPEC =
  "tests/tauri-e2e/specs/guided-knowledge-migration-cleanup.spec.ts";
const GUIDED_FLOW_BASELINE_SPEC =
  "tests/tauri-e2e/specs/guided-flow-unknown-baseline.spec.ts";
const GUIDED_FLOW_BASELINE_RECOVERY_SPEC =
  "tests/tauri-e2e/specs/guided-flow-unknown-baseline-recovery.spec.ts";

const OLLAMA_EMBEDDING_PREREQUISITE: E2ePresetPrerequisite = {
  env: "AIO_E2E_OLLAMA_MODEL",
  missing: "fail",
  description: "Ollama embedding model ID",
};

export const E2E_PRESETS: readonly E2ePreset[] = [
  {
    id: "recall-pipeline",
    purpose: "Deterministic Recall retrieval pipeline compile, run, and trace",
    args: ["--spec", PIPELINE_SPEC],
    prerequisites: [],
    runtimeRequirements: [],
    includesRestart: false,
  },
  {
    id: "recall-vector",
    purpose: "Deterministic Recall vectorization and semantic search",
    args: ["--spec", VECTOR_SPEC],
    prerequisites: [],
    runtimeRequirements: [],
    includesRestart: false,
  },
  {
    id: "recall-curated",
    purpose: "Deterministic Recall workflow with the reviewed curated corpus",
    args: ["--corpus-mode", "curated", "--spec", VECTOR_SPEC],
    prerequisites: [],
    runtimeRequirements: [],
    includesRestart: false,
  },
  {
    id: "recall-chat",
    purpose: "Deterministic Recall Chat injection and process recovery",
    args: [
      "--spec",
      CHAT_SPEC,
      "--restart-spec",
      RECOVERY_SPEC,
      "--required-scenarios",
      "renderer-positive,no-result,missing-evidence-fail-closed,memory-ownership",
    ],
    prerequisites: [],
    runtimeRequirements: [],
    includesRestart: true,
  },
  {
    id: "corpus-sample",
    purpose: "Import an external Recall backup and vectorize a small UI batch",
    args: ["--corpus-mode", "external-sample", "--spec", EXTERNAL_SPEC],
    prerequisites: [
      {
        env: "AIO_E2E_RECALL_SOURCE",
        missing: "skip",
        description: "External .aio-kb source",
      },
    ],
    runtimeRequirements: [],
    includesRestart: false,
  },
  {
    id: "corpus-full",
    purpose: "Full external Recall corpus vectorization and process recovery",
    args: [
      "--corpus-mode",
      "external-full",
      "--spec",
      EXTERNAL_SPEC,
      "--restart-spec",
      EXTERNAL_RECOVERY_SPEC,
    ],
    prerequisites: [
      {
        env: "AIO_E2E_RECALL_SOURCE",
        missing: "skip",
        description: "External .aio-kb source",
      },
    ],
    runtimeRequirements: [],
    includesRestart: true,
  },
  {
    id: "migration-minimal",
    purpose:
      "Synthetic legacy-file migration through Guided Flow with same-root restart verification",
    args: ["--spec", MIGRATION_SPEC, "--restart-spec", MIGRATION_RECOVERY_SPEC],
    prerequisites: [],
    runtimeRequirements: [
      "Uses the repository-managed legacy-file-system-v1/minimal fixture and an isolated app-data directory",
    ],
    includesRestart: true,
  },
  {
    id: "migration-cleanup",
    purpose:
      "Synthetic legacy-file migration cleanup on a dedicated staged app-data copy",
    args: ["--spec", MIGRATION_CLEANUP_SPEC],
    prerequisites: [],
    runtimeRequirements: [
      "Uses a fresh repository-managed legacy-file-system-v1/minimal fixture copy and verifies only legacy directories are removed",
    ],
    includesRestart: false,
  },
  {
    id: "guided-flow-baseline",
    purpose:
      "Unknown-baseline first launch, lifecycle persistence, and same-root restart verification",
    args: [
      "--spec",
      GUIDED_FLOW_BASELINE_SPEC,
      "--restart-spec",
      GUIDED_FLOW_BASELINE_RECOVERY_SPEC,
    ],
    prerequisites: [],
    runtimeRequirements: [
      "Uses a fresh isolated app-data directory without lifecycle or legacy Knowledge data",
    ],
    includesRestart: true,
  },
  {
    id: "ollama-vector",
    purpose: "Recall vector workflow with a real Ollama embedding model",
    args: ["--vector-mode", "ollama", "--spec", VECTOR_SPEC],
    prerequisites: [OLLAMA_EMBEDDING_PREREQUISITE],
    runtimeRequirements: [
      "Ollama /api/tags and /v1/embeddings; unavailable service skips unless AIO_E2E_REQUIRE_OLLAMA=1",
    ],
    includesRestart: false,
  },
  {
    id: "ollama-chat",
    purpose: "Real Ollama Chat and embedding workflow with process recovery",
    args: [
      "--vector-mode",
      "ollama",
      "--spec",
      CHAT_SPEC,
      "--restart-spec",
      RECOVERY_SPEC,
      "--required-scenarios",
      "renderer-positive,no-result,memory-ownership",
    ],
    prerequisites: [
      OLLAMA_EMBEDDING_PREREQUISITE,
      {
        env: "AIO_E2E_OLLAMA_CHAT_MODEL",
        missing: "fail",
        description: "Ollama Chat model ID",
      },
    ],
    runtimeRequirements: [
      "Ollama Chat and embedding endpoints; unavailable service skips unless AIO_E2E_REQUIRE_OLLAMA=1",
    ],
    includesRestart: true,
  },
  {
    id: "private-profile",
    purpose:
      "Recall vector workflow with an explicitly selected private profile",
    args: ["--llm-profile", "--spec", VECTOR_SPEC],
    prerequisites: [
      {
        env: "AIO_E2E_LLM_CONFIG",
        missing: "fail",
        description: "Private profile export",
      },
      {
        env: "AIO_E2E_LLM_PROFILE_ID",
        missing: "fail",
        description: "Private profile ID",
      },
      {
        env: "AIO_E2E_CHAT_MODEL_ID",
        missing: "fail",
        description: "Chat model ID",
      },
      {
        env: "AIO_E2E_EMBEDDING_MODEL_ID",
        missing: "fail",
        description: "Embedding model ID",
      },
    ],
    runtimeRequirements: [
      "AIO_E2E_EMBEDDING_DIMENSION (fail when fixture seeding is enabled)",
    ],
    includesRestart: false,
  },
  {
    id: "native",
    purpose: "Windows native file and directory dialog integration",
    args: ["--native"],
    prerequisites: [],
    runtimeRequirements: [
      "Windows 10+, .NET 8, and an unlocked interactive desktop (fail)",
    ],
    includesRestart: false,
  },
];

const PRESET_BY_ID = new Map(E2E_PRESETS.map((preset) => [preset.id, preset]));

const ASSEMBLY_OPTIONS = [
  "--native",
  "--vector-mode",
  "--corpus-mode",
  "--llm-profile",
  "--restart-spec",
  "--required-scenarios",
  "--spec",
] as const;

export interface ResolvedPresetArgs {
  args: string[];
  listPresetsRequested: boolean;
  preset?: E2ePreset;
}

function optionName(argument: string): string {
  return argument.split("=", 1)[0];
}

export function resolvePresetArgs(args: string[]): ResolvedPresetArgs {
  const listRequested = args.includes("--list-presets");
  if (listRequested) {
    if (args.length !== 1) {
      throw new Error(
        "--list-presets cannot be combined with other arguments."
      );
    }
    return { args: [], listPresetsRequested: true };
  }

  let presetId: string | undefined;
  const remaining: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--preset") {
      if (presetId !== undefined)
        throw new Error("--preset may only be used once.");
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--preset requires a preset ID.");
      }
      presetId = value.trim();
      index += 1;
      continue;
    }
    if (argument.startsWith("--preset=")) {
      if (presetId !== undefined)
        throw new Error("--preset may only be used once.");
      presetId = argument.slice("--preset=".length).trim();
      if (!presetId) throw new Error("--preset requires a preset ID.");
      continue;
    }
    remaining.push(argument);
  }

  if (!presetId) {
    return { args: remaining, listPresetsRequested: false };
  }

  const preset = PRESET_BY_ID.get(presetId as E2ePresetId);
  if (!preset) {
    throw new Error(
      `Unknown Tauri E2E preset: ${presetId}. Use --list-presets to list valid IDs.`
    );
  }

  const conflicts = remaining
    .map(optionName)
    .filter((name) => (ASSEMBLY_OPTIONS as readonly string[]).includes(name));
  if (conflicts.length > 0) {
    throw new Error(
      `--preset ${preset.id} cannot be combined with assembly options: ${[
        ...new Set(conflicts),
      ].join(", ")}.`
    );
  }

  return {
    args: [...preset.args, ...remaining],
    listPresetsRequested: false,
    preset,
  };
}

export function missingPresetPrerequisites(
  preset: E2ePreset,
  env: NodeJS.ProcessEnv
): E2ePresetPrerequisite[] {
  return preset.prerequisites.filter((item) => !env[item.env]?.trim());
}

export function formatPresetList(): string {
  return E2E_PRESETS.map((preset) => {
    const prerequisites = preset.prerequisites.length
      ? preset.prerequisites
          .map((item) => `${item.env} (${item.missing})`)
          .join(", ")
      : "none";
    const runtime = preset.runtimeRequirements.length
      ? preset.runtimeRequirements.join("; ")
      : "none";
    return [
      preset.id,
      `  ${preset.purpose}`,
      `  prerequisites: ${prerequisites}`,
      `  runtime: ${runtime}`,
      `  restart: ${preset.includesRestart ? "yes" : "no"}`,
    ].join("\n");
  }).join("\n\n");
}
