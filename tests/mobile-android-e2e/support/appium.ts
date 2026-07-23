import fs from "node:fs";
import path from "node:path";
import type { Subprocess } from "bun";
import { remote, type Browser } from "webdriverio";
import { createCapabilities } from "../capabilities";
import { waitUntil } from "./process";

export const PINNED_APPIUM_VERSION = "2.19.0";
export const PINNED_UIAUTOMATOR2_VERSION = "4.2.3";

export interface AppiumServer {
  process: Subprocess;
  baseUrl: string;
  stop: () => Promise<void>;
}

export async function startAppiumServer(options: {
  repoRoot: string;
  port: number;
  logPath: string;
}): Promise<AppiumServer> {
  const appiumEntry = path.join(options.repoRoot, "node_modules", "appium", "index.js");
  if (!fs.existsSync(appiumEntry)) {
    throw new Error("Pinned Appium dependency is not installed. Run bun install.");
  }
  const logFile = Bun.file(options.logPath);
  const subprocess = Bun.spawn(
    [
      process.execPath,
      appiumEntry,
      "server",
      "--address",
      "127.0.0.1",
      "--port",
      String(options.port),
      "--base-path",
      "/",
      "--log-no-colors",
      "--log-level",
      "warn",
    ],
    {
      cwd: options.repoRoot,
      stdin: "ignore",
      stdout: logFile,
      stderr: logFile,
      windowsHide: true,
    }
  );
  const baseUrl = `http://127.0.0.1:${options.port}`;
  await waitUntil(
    async () => {
      if (subprocess.exitCode !== null) {
        throw new Error(`Appium exited with code ${subprocess.exitCode}.`);
      }
      const response = await fetch(`${baseUrl}/status`).catch(() => null);
      return response?.ok ? true : null;
    },
    { timeoutMs: 30_000, intervalMs: 300, description: "Appium server" }
  );
  return {
    process: subprocess,
    baseUrl,
    stop: async () => {
      subprocess.kill();
      await Promise.race([
        subprocess.exited,
        Bun.sleep(5_000).then(() => {
          subprocess.kill(9);
        }),
      ]).catch(() => undefined);
    },
  };
}

export async function createAndroidSession(options: {
  port: number;
  serial: string;
  chromedriverPath: string;
}): Promise<Browser> {
  return remote({
    hostname: "127.0.0.1",
    port: options.port,
    path: "/",
    logLevel: "warn",
    capabilities: createCapabilities(options),
  });
}

export async function waitForWebview(
  driver: Browser,
  timeoutMs = 30_000
): Promise<string> {
  return waitUntil(
    async () => {
      const contexts = await driver.getContexts();
      const context = contexts.find((value) => String(value).startsWith("WEBVIEW"));
      return context ? String(context) : null;
    },
    { timeoutMs, intervalMs: 500, description: "AIO Hub WebView context" }
  );
}

export async function switchToWebview(driver: Browser): Promise<string> {
  const context = await waitForWebview(driver);
  await driver.switchContext(context);
  return context;
}

export async function switchToNative(driver: Browser): Promise<void> {
  await driver.switchContext("NATIVE_APP");
}
