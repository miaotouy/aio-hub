import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LlmProfile } from "../../src/types/llm-profiles";
import {
  RECALL_SCENARIO_SCHEMA_VERSION,
  recallChatScenarios,
} from "./fixtures/recall-scenarios";
import { buildRecallWorkflowManifestForCorpus } from "./fixtures/recall-workflow";
import { seedRecallWorkflowFixtures } from "./support/fixture-seeder";
import { preflightOllama } from "./support/ollama-preflight";
import { startOpenAiMock } from "./support/openai-mock";
import {
  type PrivateProfileLane,
  resolvePrivateProfileLane,
} from "./support/private-profile-lane";
import { parseE2eRunnerOptions } from "./support/runner-options";

const projectRoot = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url))
);
const cliArgs = process.argv.slice(2);
const runnerOptions = parseE2eRunnerOptions(cliArgs);
const { nativeUiEnabled, wdioArgs } = runnerOptions;
const explicitDataDir = process.env.AIO_E2E_DATA_DIR?.trim() || undefined;
const runSuffix =
  process.env.AIO_E2E_ID_SUFFIX?.trim() || `tauri-e2e-${process.pid}`;
const dataDir = path.resolve(
  projectRoot,
  explicitDataDir ?? path.join(".dev-data", runSuffix)
);
const artifactDir = path.resolve(
  projectRoot,
  process.env.AIO_E2E_ARTIFACT_DIR?.trim() ||
    path.join(".dev-data", runSuffix, "artifacts")
);
const shouldSeedFixtures =
  process.env.AIO_E2E_SEED_FIXTURES === "1" ||
  (!explicitDataDir && process.env.AIO_E2E_SEED_FIXTURES !== "0");
const frontendUrl = new URL(
  process.env.AIO_E2E_FRONTEND_URL?.trim() || "http://localhost:1420/"
);
if (
  frontendUrl.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(frontendUrl.hostname) ||
  frontendUrl.pathname !== "/"
) {
  throw new Error(
    "AIO_E2E_FRONTEND_URL must be a local HTTP origin with no path."
  );
}
const frontendPort = Number(frontendUrl.port || "80");
if (!Number.isInteger(frontendPort) || frontendPort < 1024) {
  throw new Error("AIO_E2E_FRONTEND_URL must use an explicit non-system port.");
}

fs.mkdirSync(artifactDir, { recursive: true });

const startedAt = new Date().toISOString();
const writeEarlyRunMetadata = (value: Record<string, unknown>) => {
  fs.writeFileSync(
    path.join(artifactDir, "e2e-run.json"),
    JSON.stringify(
      {
        runSuffix,
        lane: runnerOptions.lane.kind,
        corpusMode: runnerOptions.corpusMode,
        startedAt,
        ...value,
      },
      null,
      2
    ),
    "utf8"
  );
};

let ollamaPreflight: Awaited<ReturnType<typeof preflightOllama>> | undefined;
if (runnerOptions.lane.kind === "ollama") {
  ollamaPreflight = await preflightOllama({
    baseUrl: runnerOptions.lane.baseUrl,
    model: runnerOptions.lane.embeddingModelId,
    required: runnerOptions.lane.requireAvailable,
  });
  if (ollamaPreflight.status !== "success") {
    writeEarlyRunMetadata({
      status: ollamaPreflight.status === "skip" ? "skipped" : "failed",
      finishedAt: new Date().toISOString(),
      ollamaPreflight,
    });
    if (ollamaPreflight.status === "skip") {
      console.warn(
        `[tauri-e2e] Ollama lane skipped: ${ollamaPreflight.reason.code}`
      );
      process.exit(0);
    }
    throw new Error(`Ollama preflight failed: ${ollamaPreflight.reason.code}`);
  }
}

let privateProfileLane: PrivateProfileLane | undefined;
if (runnerOptions.lane.kind === "private-profile") {
  const configPath = path.resolve(projectRoot, runnerOptions.lane.configPath);
  const bundle = JSON.parse(fs.readFileSync(configPath, "utf8")) as unknown;
  privateProfileLane = resolvePrivateProfileLane(bundle, {
    profileId: runnerOptions.lane.profileId,
    chatModelId: runnerOptions.lane.chatModelId,
    embeddingModelId: runnerOptions.lane.embeddingModelId,
  });
  if (shouldSeedFixtures && !runnerOptions.lane.embeddingDimension) {
    throw new Error(
      "AIO_E2E_EMBEDDING_DIMENSION is required when seeding a private profile lane."
    );
  }
}

let nativeUiHelper: string | undefined;
let nativeFileFixture: string | undefined;
let nativeDirectoryFixture: string | undefined;
if (nativeUiEnabled) {
  if (process.platform !== "win32") {
    throw new Error("Windows native UI automation requires a Windows host.");
  }
  const nativeUiProject = path.join(
    projectRoot,
    "tests",
    "windows-ui-automation",
    "AioHub.NativeUi",
    "AioHub.NativeUi.csproj"
  );
  const nativeBuild = Bun.spawn(
    [
      "dotnet",
      "build",
      nativeUiProject,
      "--configuration",
      "Release",
      "--nologo",
    ],
    {
      cwd: projectRoot,
      env: { ...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: "1" },
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      windowsHide: true,
    }
  );
  if ((await nativeBuild.exited) !== 0) {
    throw new Error("Failed to build the Windows native UI automation helper.");
  }
  nativeUiHelper = path.join(
    projectRoot,
    "tests",
    "windows-ui-automation",
    "AioHub.NativeUi",
    "bin",
    "Release",
    "net8.0-windows",
    "AioHub.NativeUi.exe"
  );
  if (!fs.existsSync(nativeUiHelper)) {
    throw new Error(
      `Windows native UI automation helper not found: ${nativeUiHelper}`
    );
  }

  const nativeFixtureRoot = path.join(dataDir, "e2e-fixtures", "native-ui");
  nativeDirectoryFixture = path.join(nativeFixtureRoot, "directory-source");
  nativeFileFixture = path.join(nativeFixtureRoot, "native-selector-file.txt");
  fs.mkdirSync(nativeDirectoryFixture, { recursive: true });
  fs.writeFileSync(
    nativeFileFixture,
    "AIO Hub native file picker fixture.\n",
    "utf8"
  );
  fs.writeFileSync(
    path.join(nativeDirectoryFixture, "native-directory-file.txt"),
    "AIO Hub native directory picker fixture.\n",
    "utf8"
  );
}

async function waitForUrl(url: string, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // The process may still be binding the port.
    }
    await Bun.sleep(250);
  }
  return false;
}

let vite: ReturnType<typeof Bun.spawn> | undefined;
let mock: ReturnType<typeof startOpenAiMock> | undefined;
let wdio: ReturnType<typeof Bun.spawn> | undefined;
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  if (wdio && !wdio.killed) wdio.kill();
  if (vite && !vite.killed) vite.kill();
  mock?.stop();
};
process.once("exit", stop);
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

if (!(await waitForUrl(frontendUrl.href, 1_000))) {
  const viteEntry = path.join(
    projectRoot,
    "node_modules",
    "vite",
    "bin",
    "vite.js"
  );
  vite = Bun.spawn(
    [
      "node",
      viteEntry,
      "--host",
      "127.0.0.1",
      "--port",
      String(frontendPort),
      "--strictPort",
    ],
    {
      cwd: projectRoot,
      env: process.env,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      windowsHide: true,
    }
  );
  if (!(await waitForUrl(frontendUrl.href, 30_000))) {
    vite.kill();
    throw new Error(`Vite did not become ready at ${frontendUrl.href}`);
  }
}

mock = startOpenAiMock({
  artifactDir,
  port: process.env.AIO_E2E_MOCK_PORT
    ? Number(process.env.AIO_E2E_MOCK_PORT)
    : undefined,
});

function createMockProfile(includeEmbedding: boolean): LlmProfile {
  return {
    id: "e2e-openai-mock",
    name: "E2E Local Mock",
    type: "openai-compatible",
    baseUrl: `${mock.baseUrl}/v1`,
    apiKeys: ["e2e-local-key"],
    enabled: true,
    networkStrategy: "native",
    models: [
      {
        id: "e2e-chat",
        name: "E2E Chat",
        group: "E2E",
        provider: "openai",
        capabilities: { toolUse: true },
      },
      ...(includeEmbedding
        ? [
            {
              id: "e2e-embedding",
              name: "E2E Embedding",
              group: "E2E",
              provider: "openai",
              capabilities: { embedding: true },
            },
          ]
        : []),
    ],
    customHeaders: {},
    customEndpoints: {},
  };
}

const scenarioMetadata = {
  scenarioSchemaVersion: RECALL_SCENARIO_SCHEMA_VERSION,
  scenarioIds: recallChatScenarios.map((scenario) => scenario.id),
};

let profiles: LlmProfile[];
let chatRole: { profileId: string; modelId: string };
let embeddingRole: {
  profileId: string;
  modelId: string;
  dimension: number | undefined;
};
let laneMetadata: Record<string, unknown>;

if (runnerOptions.lane.kind === "private-profile") {
  if (!privateProfileLane) {
    throw new Error("Private profile lane was not resolved.");
  }
  profiles = [privateProfileLane.profile];
  chatRole = {
    profileId: privateProfileLane.profile.id,
    modelId: privateProfileLane.chatModel.id,
  };
  embeddingRole = {
    profileId: privateProfileLane.profile.id,
    modelId: privateProfileLane.embeddingModel.id,
    dimension: runnerOptions.lane.embeddingDimension,
  };
  laneMetadata = privateProfileLane.metadata;
} else if (runnerOptions.lane.kind === "ollama") {
  if (!ollamaPreflight || ollamaPreflight.status !== "success") {
    throw new Error("Successful Ollama preflight result is required.");
  }
  const ollamaProfile: LlmProfile = {
    id: "e2e-ollama-embedding",
    name: "E2E Ollama Embedding",
    type: "ollama",
    baseUrl: ollamaPreflight.baseUrl,
    apiKeys: [],
    enabled: true,
    networkStrategy: "native",
    models: [
      {
        id: ollamaPreflight.model,
        name: ollamaPreflight.model,
        group: "E2E",
        provider: "ollama",
        capabilities: { embedding: true },
      },
    ],
    customHeaders: {},
    customEndpoints: {},
  };
  profiles = [createMockProfile(false), ollamaProfile];
  chatRole = { profileId: "e2e-openai-mock", modelId: "e2e-chat" };
  embeddingRole = {
    profileId: ollamaProfile.id,
    modelId: ollamaPreflight.model,
    dimension: ollamaPreflight.dimension,
  };
  laneMetadata = {
    lane: "ollama-embedding+mock-chat",
    chatProfileId: chatRole.profileId,
    chatModelId: chatRole.modelId,
    embeddingProfileId: embeddingRole.profileId,
    embeddingModelId: embeddingRole.modelId,
    embeddingDimension: embeddingRole.dimension,
    endpointOrigin: ollamaPreflight.baseUrl,
    ollamaPreflight,
  };
} else {
  profiles = [createMockProfile(true)];
  chatRole = { profileId: "e2e-openai-mock", modelId: "e2e-chat" };
  embeddingRole = {
    profileId: "e2e-openai-mock",
    modelId: "e2e-embedding",
    dimension: 8,
  };
  laneMetadata = {
    lane: "deterministic-mock",
    chatProfileId: chatRole.profileId,
    chatModelId: chatRole.modelId,
    embeddingProfileId: embeddingRole.profileId,
    embeddingModelId: embeddingRole.modelId,
    embeddingDimension: embeddingRole.dimension,
  };
}

let fixtureSeedResult:
  ReturnType<typeof seedRecallWorkflowFixtures> | undefined;

if (shouldSeedFixtures) {
  if (!embeddingRole.dimension) {
    throw new Error(
      "The selected E2E lane has no resolved embedding dimension."
    );
  }
  const profileDir = path.join(dataDir, "llm-service");
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(profileDir, "profiles.json"),
    JSON.stringify(
      {
        profiles,
        version: "1.0.0",
      },
      null,
      2
    ),
    "utf8"
  );

  const recallManifest = buildRecallWorkflowManifestForCorpus(
    {
      chat: chatRole,
      embedding: {
        profileId: embeddingRole.profileId,
        modelId: embeddingRole.modelId,
        dimension: embeddingRole.dimension,
      },
    },
    runnerOptions.corpusMode
  );
  fixtureSeedResult = seedRecallWorkflowFixtures({
    dataDir,
    artifactDir,
    manifest: recallManifest,
    enabled: true,
    mode: process.env.AIO_E2E_FIXTURE_MODE === "verify" ? "verify" : "write",
  });

  const pluginStateDir = path.join(dataDir, "plugin-manager");
  fs.mkdirSync(pluginStateDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginStateDir, "plugin-states.json"),
    JSON.stringify(
      {
        version: "1.0.0",
        enabledStates: {
          "native-example": false,
          "native-example-dev": false,
        },
      },
      null,
      2
    ),
    "utf8"
  );
}

const env = {
  ...process.env,
  AIO_ID_SUFFIX: runSuffix,
  AIO_DATA_DIR: dataDir,
  AIO_E2E_ARTIFACT_DIR: artifactDir,
  AIO_E2E_MOCK_BASE_URL: mock.baseUrl,
  AIO_E2E_FRONTEND_URL: frontendUrl.href,
  AIO_E2E_LANE: runnerOptions.lane.kind,
  AIO_E2E_CORPUS_MODE: runnerOptions.corpusMode,
  AIO_E2E_CHAT_PROFILE_ID: chatRole.profileId,
  AIO_E2E_CHAT_MODEL_ID: chatRole.modelId,
  AIO_E2E_EMBEDDING_PROFILE_ID: embeddingRole.profileId,
  AIO_E2E_EMBEDDING_MODEL_ID: embeddingRole.modelId,
  ...(embeddingRole.dimension
    ? { AIO_E2E_EMBEDDING_DIMENSION: String(embeddingRole.dimension) }
    : {}),
  ...(nativeUiEnabled
    ? {
        AIO_E2E_NATIVE_UI: "1",
        AIO_E2E_NATIVE_UI_HELPER: nativeUiHelper!,
        AIO_E2E_NATIVE_FILE: nativeFileFixture!,
        AIO_E2E_NATIVE_DIRECTORY: nativeDirectoryFixture!,
      }
    : {}),
};
const runMetadataPath = path.join(artifactDir, "e2e-run.json");
fs.writeFileSync(
  runMetadataPath,
  JSON.stringify(
    {
      runSuffix,
      dataDir,
      artifactDir,
      mockBaseUrl: mock.baseUrl,
      corpusMode: runnerOptions.corpusMode,
      ...scenarioMetadata,
      ...laneMetadata,
      startedAt,
      status: "running",
      fixtureSeeding: shouldSeedFixtures,
      fixtureSeedResult,
      nativeUiEnabled,
      nativeUiHelper,
      nativeFileFixture,
      nativeDirectoryFixture,
    },
    null,
    2
  ),
  "utf8"
);

wdio = Bun.spawn(
  ["bun", "x", "wdio", "run", "tests/tauri-e2e/wdio.conf.ts", ...wdioArgs],
  {
    cwd: projectRoot,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    windowsHide: true,
  }
);

const exitCode = await wdio.exited;
stop();
fs.writeFileSync(
  runMetadataPath,
  JSON.stringify(
    {
      runSuffix,
      dataDir,
      artifactDir,
      mockBaseUrl: mock.baseUrl,
      corpusMode: runnerOptions.corpusMode,
      ...scenarioMetadata,
      ...laneMetadata,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: exitCode === 0 ? "passed" : "failed",
      fixtureSeeding: shouldSeedFixtures,
      fixtureSeedResult,
      nativeUiEnabled,
      nativeUiHelper,
      nativeFileFixture,
      nativeDirectoryFixture,
      exitCode,
    },
    null,
    2
  ),
  "utf8"
);
process.exitCode = exitCode;
