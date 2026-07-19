import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const defaultBinary = path.join(
  projectRoot,
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32" ? "aiohub.exe" : "aiohub",
);
const appBinaryPath = process.env.AIO_E2E_BINARY ?? defaultBinary;
const artifactDir =
  process.env.AIO_E2E_ARTIFACT_DIR ?? path.join(projectRoot, ".dev-data", "tauri-e2e");

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: [path.join(projectRoot, "tests", "tauri-e2e", "specs", "**", "*.spec.ts")],
  maxInstances: 1,
  logLevel: "warn",
  outputDir: artifactDir,
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "embedded",
        captureBackendLogs: true,
        captureFrontendLogs: true,
        backendLogLevel: "debug",
        frontendLogLevel: "info",
        commandTimeout: 30_000,
        startTimeout: 60_000,
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": {
        application: appBinaryPath,
      },
    },
  ],
  framework: "mocha",
  mochaOpts: {
    ui: "bdd",
    timeout: 120_000,
  },
  reporters: ["spec"],
  waitforTimeout: 10_000,
  connectionRetryTimeout: 90_000,
  connectionRetryCount: 2,
};
