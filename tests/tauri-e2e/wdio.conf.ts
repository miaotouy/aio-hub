import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { browser } from "@wdio/globals";

const projectRoot = path.resolve(
  fileURLToPath(new URL("../..", import.meta.url))
);
const defaultBinary = path.join(
  projectRoot,
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32" ? "aiohub.exe" : "aiohub"
);
const appBinaryPath = process.env.AIO_E2E_BINARY?.trim() || defaultBinary;
if (!fs.existsSync(appBinaryPath)) {
  throw new Error(
    `Tauri E2E binary not found: ${appBinaryPath}. Build a debug binary or set AIO_E2E_BINARY.`
  );
}

const runSuffix =
  process.env.AIO_ID_SUFFIX?.trim() || `tauri-e2e-${process.pid}`;
const dataDir = path.resolve(
  projectRoot,
  process.env.AIO_DATA_DIR?.trim() || path.join(".dev-data", runSuffix)
);
const artifactDir = path.resolve(
  projectRoot,
  process.env.AIO_E2E_ARTIFACT_DIR?.trim() || path.join(".dev-data", runSuffix)
);
const embeddedPort = Number(
  process.env.AIO_E2E_WEBDRIVER_PORT ??
    process.env.TAURI_WEBDRIVER_PORT ??
    4400 + (process.pid % 1000)
);
const appEnv = {
  AIO_ID_SUFFIX: runSuffix,
  AIO_DATA_DIR: dataDir,
  ...(process.env.AIO_E2E_MOCK_BASE_URL
    ? { AIO_E2E_MOCK_BASE_URL: process.env.AIO_E2E_MOCK_BASE_URL }
    : {}),
};
process.env.AIO_E2E_PROCESS_NAME ??= path.basename(
  appBinaryPath,
  path.extname(appBinaryPath)
);

if (
  !Number.isInteger(embeddedPort) ||
  embeddedPort < 1024 ||
  embeddedPort > 65535
) {
  throw new Error(`Invalid Tauri E2E WebDriver port: ${embeddedPort}`);
}

fs.mkdirSync(artifactDir, { recursive: true });
process.env.AIO_ID_SUFFIX ??= runSuffix;
process.env.AIO_DATA_DIR ??= dataDir;

export const config: WebdriverIO.Config = {
  runner: "local",
  specs: [
    path.join(projectRoot, "tests", "tauri-e2e", "specs", "**", "*.spec.ts"),
  ],
  maxInstances: 1,
  logLevel: "warn",
  outputDir: artifactDir,
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath,
        driverProvider: "embedded",
        embeddedPort,
        env: appEnv,
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
  afterTest: async (test, _context, result) => {
    if (!result.passed) {
      const safeTitle = test.title
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .slice(0, 80);
      const screenshotPath = path.join(
        artifactDir,
        `failure-${Date.now()}-${safeTitle}.png`
      );
      await browser.saveScreenshot(screenshotPath);
    }

    await browser.execute(() => {
      const isVisible = (element: HTMLElement) => {
        const style = window.getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      };

      const editorCancel = document.querySelector<HTMLElement>(
        '[data-testid="agent-editor-cancel"]'
      );
      if (editorCancel && isVisible(editorCancel)) editorCancel.click();

      for (const closeButton of document.querySelectorAll<HTMLElement>(
        ".base-dialog-backdrop .dialog-close-btn"
      )) {
        if (isVisible(closeButton)) closeButton.click();
      }

      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
      );
    });

    await browser.waitUntil(
      async () =>
        !(await browser.execute(() => {
          const isVisible = (element: Element) => {
            const style = window.getComputedStyle(element);
            return style.display !== "none" && style.visibility !== "hidden";
          };
          return Array.from(
            document.querySelectorAll(".base-dialog-backdrop")
          ).some(isVisible);
        })),
      { timeout: 5_000, timeoutMsg: "Transient dialog remained open after test" }
    );
  },
};
