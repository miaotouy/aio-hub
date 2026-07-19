import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startOpenAiMock } from "./support/openai-mock";

const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const explicitDataDir = process.env.AIO_E2E_DATA_DIR?.trim() || undefined;
const runSuffix =
  process.env.AIO_E2E_ID_SUFFIX?.trim() || `tauri-e2e-${process.pid}`;
const dataDir = path.resolve(
  projectRoot,
  explicitDataDir ?? path.join(".dev-data", runSuffix),
);
const artifactDir = path.resolve(
  projectRoot,
  process.env.AIO_E2E_ARTIFACT_DIR?.trim() ||
    path.join(".dev-data", runSuffix, "artifacts"),
);
const shouldSeedFixtures =
  process.env.AIO_E2E_SEED_FIXTURES === "1" ||
  (!explicitDataDir && process.env.AIO_E2E_SEED_FIXTURES !== "0");

fs.mkdirSync(artifactDir, { recursive: true });

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
if (!(await waitForUrl("http://localhost:1420/", 1_000))) {
  const viteEntry = path.join(projectRoot, "node_modules", "vite", "bin", "vite.js");
  vite = Bun.spawn(
    ["node", viteEntry, "--host", "127.0.0.1", "--port", "1420", "--strictPort"],
    {
      cwd: projectRoot,
      env: process.env,
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
      windowsHide: true,
    },
  );
  if (!(await waitForUrl("http://localhost:1420/", 30_000))) {
    vite.kill();
    throw new Error("Vite did not become ready at http://localhost:1420/");
  }
}

const mock = startOpenAiMock({
  logPath: path.join(artifactDir, "openai-mock-requests.jsonl"),
  port: process.env.AIO_E2E_MOCK_PORT
    ? Number(process.env.AIO_E2E_MOCK_PORT)
    : undefined,
});

if (shouldSeedFixtures) {
  const profileDir = path.join(dataDir, "llm-service");
  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(
    path.join(profileDir, "profiles.json"),
    JSON.stringify(
      {
        profiles: [
          {
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
              {
                id: "e2e-embedding",
                name: "E2E Embedding",
                group: "E2E",
                provider: "openai",
                capabilities: { embedding: true },
              },
            ],
            customHeaders: {},
            customEndpoints: {},
          },
        ],
        version: "1.0.0",
      },
      null,
      2,
    ),
    "utf8",
  );

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
      2,
    ),
    "utf8",
  );
}

const env = {
  ...process.env,
  AIO_ID_SUFFIX: runSuffix,
  AIO_DATA_DIR: dataDir,
  AIO_E2E_ARTIFACT_DIR: artifactDir,
  AIO_E2E_MOCK_BASE_URL: mock.baseUrl,
};
const runMetadataPath = path.join(artifactDir, "e2e-run.json");
const startedAt = new Date().toISOString();
fs.writeFileSync(
  runMetadataPath,
  JSON.stringify(
    {
      runSuffix,
      dataDir,
      artifactDir,
      mockBaseUrl: mock.baseUrl,
      startedAt,
      fixtureSeeding: shouldSeedFixtures,
    },
    null,
    2,
  ),
  "utf8",
);

const wdio = Bun.spawn(
  ["bun", "x", "wdio", "run", "tests/tauri-e2e/wdio.conf.ts", ...process.argv.slice(2)],
  {
    cwd: projectRoot,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
    windowsHide: true,
  },
);

const stop = () => {
  if (!wdio.killed) wdio.kill();
  if (vite && !vite.killed) vite.kill();
  mock.stop();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);

const exitCode = await wdio.exited;
mock.stop();
if (vite && !vite.killed) vite.kill();
fs.writeFileSync(
  runMetadataPath,
  JSON.stringify(
    {
      runSuffix,
      dataDir,
      artifactDir,
      mockBaseUrl: mock.baseUrl,
      startedAt,
      finishedAt: new Date().toISOString(),
      fixtureSeeding: shouldSeedFixtures,
      exitCode,
    },
    null,
    2,
  ),
  "utf8",
);
process.exit(exitCode);
