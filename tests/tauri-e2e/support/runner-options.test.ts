import { describe, expect, it } from "vitest";
import { formatPresetList, parseE2eRunnerOptions } from "./runner-options";
import { E2E_PRESETS, missingPresetPrerequisites } from "./presets";

describe("Tauri E2E runner options", () => {
  it("keeps WDIO arguments and defaults to the deterministic lane", () => {
    expect(
      parseE2eRunnerOptions(["--spec", "specs/smoke.spec.ts"], {})
    ).toEqual({
      presetId: undefined,
      listPresetsRequested: false,
      nativeUiEnabled: false,
      corpusMode: "smoke",
      lane: { kind: "deterministic-mock" },
      wdioArgs: ["--spec", "specs/smoke.spec.ts"],
      restartSpec: undefined,
      requiredScenarioIds: [],
    });
  });

  it("parses the Ollama lane without forwarding custom options", () => {
    expect(
      parseE2eRunnerOptions(
        ["--native", "--vector-mode=ollama", "--corpus-mode", "curated"],
        {
          AIO_E2E_OLLAMA_CHAT_MODEL: "qwen3.5:9b",
          AIO_E2E_OLLAMA_MODEL: "nomic-embed-text",
        }
      )
    ).toEqual({
      presetId: undefined,
      listPresetsRequested: false,
      nativeUiEnabled: true,
      corpusMode: "curated",
      lane: {
        kind: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        chatModelId: "qwen3.5:9b",
        embeddingModelId: "nomic-embed-text",
        requireAvailable: false,
      },
      wdioArgs: [],
      restartSpec: undefined,
      requiredScenarioIds: [],
    });
  });

  it("expands every migrated package script through a named preset", () => {
    const deterministicDefaults = {
      listPresetsRequested: false,
      nativeUiEnabled: false,
      corpusMode: "smoke",
      lane: { kind: "deterministic-mock" },
      restartSpec: undefined,
      requiredScenarioIds: [],
    } as const;

    expect(parseE2eRunnerOptions(["--preset", "recall-pipeline"], {})).toEqual({
      ...deterministicDefaults,
      presetId: "recall-pipeline",
      wdioArgs: [
        "--spec",
        "tests/tauri-e2e/specs/recall-pipeline.spec.ts",
      ],
    });
    expect(parseE2eRunnerOptions(["--preset", "recall-curated"], {})).toEqual({
      ...deterministicDefaults,
      presetId: "recall-curated",
      corpusMode: "curated",
      wdioArgs: [
        "--spec",
        "tests/tauri-e2e/specs/recall-vector-workflow.spec.ts",
      ],
    });
    expect(parseE2eRunnerOptions(["--preset", "recall-chat"], {})).toEqual({
      ...deterministicDefaults,
      presetId: "recall-chat",
      restartSpec: "tests/tauri-e2e/specs/recall-session-recovery.spec.ts",
      requiredScenarioIds: [
        "renderer-positive",
        "no-result",
        "missing-evidence-fail-closed",
        "memory-ownership",
      ],
      wdioArgs: [
        "--spec",
        "tests/tauri-e2e/specs/recall-chat-injection.spec.ts",
      ],
    });
    expect(
      parseE2eRunnerOptions(["--preset", "ollama-vector"], {
        AIO_E2E_OLLAMA_MODEL: "embedding",
      })
    ).toEqual({
      presetId: "ollama-vector",
      listPresetsRequested: false,
      nativeUiEnabled: false,
      corpusMode: "smoke",
      lane: {
        kind: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        chatModelId: undefined,
        embeddingModelId: "embedding",
        requireAvailable: false,
      },
      wdioArgs: [
        "--spec",
        "tests/tauri-e2e/specs/recall-vector-workflow.spec.ts",
      ],
      restartSpec: undefined,
      requiredScenarioIds: [],
    });
    expect(
      parseE2eRunnerOptions(["--preset", "ollama-chat"], {
        AIO_E2E_OLLAMA_MODEL: "embedding",
        AIO_E2E_OLLAMA_CHAT_MODEL: "chat",
      })
    ).toEqual({
      presetId: "ollama-chat",
      listPresetsRequested: false,
      nativeUiEnabled: false,
      corpusMode: "smoke",
      lane: {
        kind: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        embeddingModelId: "embedding",
        chatModelId: "chat",
        requireAvailable: false,
      },
      wdioArgs: [
        "--spec",
        "tests/tauri-e2e/specs/recall-chat-injection.spec.ts",
      ],
      restartSpec: "tests/tauri-e2e/specs/recall-session-recovery.spec.ts",
      requiredScenarioIds: [
        "renderer-positive",
        "no-result",
        "memory-ownership",
      ],
    });
    expect(
      parseE2eRunnerOptions(["--preset", "private-profile"], {
        AIO_E2E_LLM_CONFIG: ".dev-data/profiles.json",
        AIO_E2E_LLM_PROFILE_ID: "private",
        AIO_E2E_CHAT_MODEL_ID: "chat",
        AIO_E2E_EMBEDDING_MODEL_ID: "embedding",
      })
    ).toEqual({
      presetId: "private-profile",
      listPresetsRequested: false,
      nativeUiEnabled: false,
      corpusMode: "smoke",
      lane: {
        kind: "private-profile",
        configPath: ".dev-data/profiles.json",
        profileId: "private",
        chatModelId: "chat",
        embeddingModelId: "embedding",
        embeddingDimension: undefined,
      },
      wdioArgs: [
        "--spec",
        "tests/tauri-e2e/specs/recall-vector-workflow.spec.ts",
      ],
      restartSpec: undefined,
      requiredScenarioIds: [],
    });
  });

  it("keeps preset assembly authoritative over legacy lane environment", () => {
    expect(
      parseE2eRunnerOptions(["--preset", "recall-vector"], {
        AIO_E2E_NATIVE_UI: "1",
        AIO_E2E_VECTOR_MODE: "ollama",
        AIO_E2E_CORPUS_MODE: "external-full",
        AIO_E2E_LLM_PROFILE_ID: "private",
      })
    ).toMatchObject({
      nativeUiEnabled: false,
      corpusMode: "smoke",
      lane: { kind: "deterministic-mock" },
    });

    expect(
      parseE2eRunnerOptions(["--preset", "ollama-vector"], {
        AIO_E2E_OLLAMA_MODEL: "embedding",
        AIO_E2E_OLLAMA_CHAT_MODEL: "chat-must-not-activate",
      }).lane
    ).toEqual({
      kind: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      embeddingModelId: "embedding",
      requireAvailable: false,
    });
  });

  it("rejects unknown presets and preset assembly conflicts", () => {
    expect(() => parseE2eRunnerOptions(["--preset", "unknown"], {})).toThrow(
      "Unknown Tauri E2E preset"
    );
    expect(() =>
      parseE2eRunnerOptions(
        ["--preset", "recall-vector", "--corpus-mode=curated"],
        {}
      )
    ).toThrow("cannot be combined with assembly options");
    expect(() =>
      parseE2eRunnerOptions(["--list-presets", "--preset", "native"], {})
    ).toThrow("cannot be combined");
  });

  it("reports and enforces preset prerequisite policies", () => {
    const corpusPreset = E2E_PRESETS.find(
      (preset) => preset.id === "corpus-sample"
    )!;
    expect(missingPresetPrerequisites(corpusPreset, {})).toMatchObject([
      { env: "AIO_E2E_RECALL_SOURCE", missing: "skip" },
    ]);
    expect(() =>
      parseE2eRunnerOptions(["--preset", "ollama-chat"], {
        AIO_E2E_OLLAMA_MODEL: "embedding",
      })
    ).toThrow("AIO_E2E_OLLAMA_CHAT_MODEL");
    expect(() =>
      parseE2eRunnerOptions(["--preset", "private-profile"], {})
    ).toThrow("AIO_E2E_LLM_CONFIG");
  });

  it("lists purpose, prerequisites, skip/fail policy, and restart behavior", () => {
    const listed = parseE2eRunnerOptions(["--list-presets"], {
      AIO_E2E_VECTOR_MODE: "ollama",
      AIO_E2E_LLM_PROFILE_ID: "private-profile",
    });
    expect(listed.listPresetsRequested).toBe(true);
    expect(listed.lane).toEqual({ kind: "deterministic-mock" });
    expect(listed.wdioArgs).toEqual([]);

    const output = formatPresetList();
    expect(output).toContain("corpus-full");
    expect(output).toContain("AIO_E2E_RECALL_SOURCE (skip)");
    expect(output).toContain("AIO_E2E_OLLAMA_MODEL (fail)");
    expect(output).toContain("restart: yes");
    expect(output).toContain("Windows 10+, .NET 8");
    expect(output).toContain("interactive desktop (fail)");
    expect(output).toContain("AIO_E2E_EMBEDDING_DIMENSION (fail");
  });

  it("gives the CLI profile ID precedence over the environment", () => {
    const options = parseE2eRunnerOptions(["--llm-profile", "cli-profile"], {
      AIO_E2E_LLM_CONFIG: ".dev-data/profiles.json",
      AIO_E2E_LLM_PROFILE_ID: "env-profile",
      AIO_E2E_CHAT_MODEL_ID: "chat-model",
      AIO_E2E_EMBEDDING_MODEL_ID: "embedding-model",
      AIO_E2E_EMBEDDING_DIMENSION: "1024",
    });

    expect(options.lane).toEqual({
      kind: "private-profile",
      configPath: ".dev-data/profiles.json",
      profileId: "cli-profile",
      chatModelId: "chat-model",
      embeddingModelId: "embedding-model",
      embeddingDimension: 1024,
    });
    expect(options.restartSpec).toBeUndefined();
    expect(options.requiredScenarioIds).toEqual([]);
  });

  it("parses an explicit recovery spec and required scenarios", () => {
    expect(
      parseE2eRunnerOptions(
        [
          "--restart-spec",
          "tests/tauri-e2e/specs/recovery.spec.ts",
          "--required-scenarios=renderer-positive,no-result,renderer-positive",
        ],
        {}
      )
    ).toMatchObject({
      restartSpec: "tests/tauri-e2e/specs/recovery.spec.ts",
      requiredScenarioIds: ["renderer-positive", "no-result"],
    });
  });

  it("does not activate a private endpoint from a config path alone", () => {
    expect(
      parseE2eRunnerOptions([], {
        AIO_E2E_LLM_CONFIG: ".dev-data/profiles.json",
      }).lane
    ).toEqual({ kind: "deterministic-mock" });
  });

  it("rejects incomplete or conflicting explicit lanes", () => {
    expect(() =>
      parseE2eRunnerOptions(["--llm-profile"], {
        AIO_E2E_LLM_CONFIG: ".dev-data/profiles.json",
      })
    ).toThrow("profile ID");

    expect(() =>
      parseE2eRunnerOptions(["--llm-profile=private", "--vector-mode=ollama"], {
        AIO_E2E_LLM_CONFIG: ".dev-data/profiles.json",
        AIO_E2E_CHAT_MODEL_ID: "chat-model",
        AIO_E2E_EMBEDDING_MODEL_ID: "embedding-model",
        AIO_E2E_OLLAMA_MODEL: "embedding-model",
      })
    ).toThrow("cannot be combined");

    expect(() =>
      parseE2eRunnerOptions([], {
        AIO_E2E_LLM_CONFIG: ".dev-data/profiles.json",
        AIO_E2E_LLM_PROFILE_ID: "private",
        AIO_E2E_CHAT_MODEL_ID: "chat-model",
        AIO_E2E_EMBEDDING_MODEL_ID: "embedding-model",
        AIO_E2E_EMBEDDING_DIMENSION: "unknown",
      })
    ).toThrow("positive integer");

    expect(
      parseE2eRunnerOptions(["--corpus-mode", "external-full"], {})
    ).toMatchObject({ corpusMode: "external-full", wdioArgs: [] });
    expect(
      parseE2eRunnerOptions(["--corpus-mode", "external-sample"], {})
    ).toMatchObject({ corpusMode: "external-sample", wdioArgs: [] });
  });
});
