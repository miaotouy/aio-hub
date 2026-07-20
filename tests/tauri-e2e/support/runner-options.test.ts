import { describe, expect, it } from "vitest";
import { parseE2eRunnerOptions } from "./runner-options";

describe("Tauri E2E runner options", () => {
  it("keeps WDIO arguments and defaults to the deterministic lane", () => {
    expect(
      parseE2eRunnerOptions(["--spec", "specs/smoke.spec.ts"], {})
    ).toEqual({
      nativeUiEnabled: false,
      corpusMode: "smoke",
      lane: { kind: "deterministic-mock" },
      wdioArgs: ["--spec", "specs/smoke.spec.ts"],
    });
  });

  it("parses the Ollama lane without forwarding custom options", () => {
    expect(
      parseE2eRunnerOptions(
        ["--native", "--vector-mode=ollama", "--corpus-mode", "curated"],
        { AIO_E2E_OLLAMA_MODEL: "nomic-embed-text" }
      )
    ).toEqual({
      nativeUiEnabled: true,
      corpusMode: "curated",
      lane: {
        kind: "ollama",
        baseUrl: "http://127.0.0.1:11434",
        embeddingModelId: "nomic-embed-text",
        requireAvailable: false,
      },
      wdioArgs: [],
    });
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

    expect(() =>
      parseE2eRunnerOptions(["--corpus-mode", "external-full"], {})
    ).toThrow("Unsupported corpus mode");
  });
});
