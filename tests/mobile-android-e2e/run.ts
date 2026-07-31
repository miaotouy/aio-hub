import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Subprocess } from "bun";
import type { Browser } from "webdriverio";
import { resolveAndroidSdkTools } from "./support/android-sdk";
import { AdbClient } from "./support/adb";
import { inspectApk, buildE2eApk, tauriTargetForAbi } from "./support/apk";
import { ArtifactManager } from "./support/artifacts";
import {
  createAndroidSession,
  PINNED_APPIUM_VERSION,
  PINNED_UIAUTOMATOR2_VERSION,
  startAppiumServer,
  waitForWebview,
  type AppiumServer,
} from "./support/appium";
import { ensureAvd, stopOwnedAvd, type OwnedAvd } from "./support/avd";
import { prepareFixtures } from "./support/fixtures";
import { ensureChromedriver } from "./support/chromedriver";
import {
  startMobileOpenAiConformanceServer,
  type AttachmentSummary,
} from "./support/openai-conformance";
import {
  isSuccessfulOllamaPath,
  isOllamaModelInstalled,
  runAndroidOllamaCheck,
} from "./support/ollama-preflight";
import { parseRunnerOptions } from "./support/runner-options";
import { formatPresetList, MOBILE_E2E_PRESETS } from "./presets";
import type { MobileE2eRunResult } from "./types";
import { terminateSubprocess, withTimeout } from "./support/process";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const APP_PACKAGE = "com.aiohub.mobile";

function runId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function errorSummary(error: unknown): { name: string; message: string } {
  return error instanceof Error
    ? { name: error.name, message: error.message }
    : { name: "Error", message: String(error) };
}

async function main(): Promise<void> {
  const options = parseRunnerOptions(process.argv.slice(2), Bun.env, repoRoot);
  if (options.listPresets) {
    console.log(formatPresetList());
    return;
  }
  const preset = MOBILE_E2E_PRESETS[options.preset];
  if (preset.scenarios.length === 0 && !preset.requiresOllama) {
    throw new Error(`Preset ${preset.id} has no executable scenarios.`);
  }

  const result: MobileE2eRunResult = {
    schemaVersion: 1,
    runId: runId(),
    startedAt: new Date().toISOString(),
    preset: preset.id,
    status: "running",
    warnings: [],
    scenarios: [],
  };
  const artifacts = new ArtifactManager(options.artifactDir, result);
  const tools = resolveAndroidSdkTools();
  const adb = new AdbClient(tools.adb);
  let ownedAvd: OwnedAvd | undefined;
  let startingAvdProcess: Subprocess | undefined;
  let appium: AppiumServer | undefined;
  let driver: Browser | undefined;
  let deterministic:
    ReturnType<typeof startMobileOpenAiConformanceServer> | undefined;
  const reverseMappings: Array<{
    devicePort: number;
    hostPort: number;
    purpose: "deterministic-openai" | "ollama";
  }> = [];
  let cleanupPromise: Promise<void> | undefined;
  let signalExitStarted = false;

  const noteCleanupFailure = (description: string, error: unknown) => {
    const message = errorSummary(error).message;
    result.warnings.push(`${description}: ${message}`);
  };
  const cleanup = (): Promise<void> => {
    cleanupPromise ??= (async () => {
      if (driver) {
        await withTimeout(driver.deleteSession(), {
          timeoutMs: 10_000,
          description: "Appium session deletion",
        }).catch((error) =>
          noteCleanupFailure("Appium session cleanup failed", error)
        );
      }
      if (appium) {
        await withTimeout(appium.stop(), {
          timeoutMs: 7_000,
          description: "Appium server shutdown",
        }).catch((error) =>
          noteCleanupFailure("Appium server cleanup failed", error)
        );
      }
      deterministic?.stop();
      if (ownedAvd) {
        for (const mapping of reverseMappings) {
          await adb
            .removeReverse(ownedAvd.device.serial, mapping.devicePort)
            .catch((error) =>
              noteCleanupFailure(
                `ADB reverse cleanup failed for tcp:${mapping.devicePort}`,
                error
              )
            );
        }
      }
      if (ownedAvd && !options.keepAvd) {
        await withTimeout(stopOwnedAvd(adb, ownedAvd), {
          timeoutMs: 40_000,
          description: `AVD ${ownedAvd.device.avdName} shutdown`,
        }).catch((error) => noteCleanupFailure("AVD cleanup failed", error));
      } else if (startingAvdProcess) {
        await withTimeout(
          terminateSubprocess(startingAvdProcess, {
            gracefulTimeoutMs: 7_000,
            forceTimeoutMs: 3_000,
          }),
          { timeoutMs: 12_000, description: "starting AVD process shutdown" }
        ).catch((error) =>
          noteCleanupFailure("Starting AVD cleanup failed", error)
        );
      }
      result.finishedAt ??= new Date().toISOString();
      artifacts.writeRun();
      artifacts.redactExistingLog("appium.log", true);
      artifacts.redactExistingLog("emulator.log");
      console.log(
        `[mobile-e2e] ${result.status}: ${artifacts.path("e2e-run.json")}`
      );
    })();
    return cleanupPromise;
  };
  const handleSignal = (signal: NodeJS.Signals) => {
    if (signalExitStarted) return;
    signalExitStarted = true;
    result.status = "failed";
    result.error = {
      name: signal,
      message: `Mobile Android E2E interrupted by ${signal}.`,
    };
    const exitCode = signal === "SIGINT" ? 130 : 143;
    process.exitCode = exitCode;
    void Promise.race([cleanup(), Bun.sleep(45_000)]).finally(() => {
      process.exit(exitCode);
    });
  };
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);

  try {
    ownedAvd = await ensureAvd({
      tools,
      adb,
      avdName: options.avdName,
      serial: options.serial,
      logPath: artifacts.path("emulator.log"),
      onProcessStarted: (process) => {
        startingAvdProcess = process;
      },
    });
    startingAvdProcess = undefined;
    const device = ownedAvd.device;
    result.device = {
      serial: device.serial,
      avdName: device.avdName,
      model: device.model,
      sdk: device.sdk,
      primaryAbi: device.primaryAbi,
      abiList: device.abiList,
      startedByRunner: ownedAvd.startedByRunner,
    };
    artifacts.writeRun();
    console.log(
      `[mobile-e2e] target ${device.serial} AVD=${device.avdName} SDK=${device.sdk} ABI=${device.primaryAbi}`
    );

    const target = tauriTargetForAbi(device.primaryAbi);
    const apkPath =
      options.apkPath ??
      (options.build
        ? await buildE2eApk({ repoRoot, target })
        : (() => {
            throw new Error(
              "APK build is disabled but no prebuilt APK was provided."
            );
          })());
    const apk = await inspectApk({
      apkPath,
      expectedAbi: device.primaryAbi,
      tools,
    });
    result.apk = { ...apk, path: path.basename(apk.path), tauriTarget: target };
    const maxApkBytes = options.maxApkBytes ?? preset.apkSizeBaselineBytes;
    if (maxApkBytes && apk.bytes > maxApkBytes) {
      throw new Error(
        `APK size ${apk.bytes} exceeds configured maximum ${maxApkBytes}.`
      );
    }

    // The identity above is rechecked immediately before target-only mutations.
    const confirmed = await adb.inspectAvd(
      (await adb.devices()).find(
        (candidate) => candidate.serial === device.serial
      ) ?? device,
      new Set([device.avdName])
    );
    if (!confirmed || confirmed.avdName !== device.avdName) {
      throw new Error("Target AVD identity changed before APK installation.");
    }
    await adb.install(device.serial, apk.path);
    if (options.clearAppData)
      await adb.clearAppData(device.serial, APP_PACKAGE);
    await adb.dismissSystemPickers(device.serial);
    let fixtures = await prepareFixtures({
      artifactDir: artifacts.runDir,
      adb,
      serial: device.serial,
    });

    if (preset.requiresDeterministicServer) {
      const expected: AttachmentSummary = {
        mimeType: "image/png",
        bytes: fixtures.image.bytes,
        sha256: fixtures.image.sha256,
      };
      deterministic = startMobileOpenAiConformanceServer({
        artifacts,
        expectedAttachment: expected,
      });
      const deterministicPort = deterministic.port;
      if (!deterministicPort) {
        throw new Error("Deterministic server did not bind a TCP port.");
      }
      await adb.reverse(device.serial, deterministicPort, deterministicPort);
      reverseMappings.push({
        devicePort: deterministicPort,
        hostPort: deterministicPort,
        purpose: "deterministic-openai",
      });
      result.network = {
        deterministicBaseUrl: deterministic.deviceBaseUrl,
        adbReverse: true,
        reverseMappings: [...reverseMappings],
      };
      artifacts.writeRun();
    }

    if (preset.requiresOllama) {
      if (!options.ollamaModel) {
        const detail = "AIO_MOBILE_E2E_OLLAMA_MODEL is not set.";
        if (options.requireOllama) throw new Error(detail);
        result.status = "skipped";
        result.scenarios.push({
          id: "ollama-preflight",
          status: "skipped",
          durationMs: 0,
          detail,
        });
        return;
      }
      const check = await runAndroidOllamaCheck({
        serial: device.serial,
        tools,
      });
      reverseMappings.push({
        devicePort: 11434,
        hostPort: 11434,
        purpose: "ollama",
      });
      result.network = {
        adbReverse: true,
        reverseMappings: [...reverseMappings],
        ollama: check,
      };
      const modelInstalled = await isOllamaModelInstalled(options.ollamaModel);
      if (!isSuccessfulOllamaPath(check) || !modelInstalled) {
        const detail = !modelInstalled
          ? `Ollama model is not installed: ${options.ollamaModel}`
          : "Host/AVD Ollama HTTP path is unavailable.";
        if (options.requireOllama) throw new Error(detail);
        result.status = "skipped";
        result.scenarios.push({
          id: "ollama-preflight",
          status: "skipped",
          durationMs: 0,
          detail,
        });
        return;
      }
      // The preflight runs device-side HTTP probes. Refresh media metadata and clear any
      // DocumentsUI activity before the scenario opens the formal file picker.
      await adb.dismissSystemPickers(device.serial);
      fixtures = await prepareFixtures({
        artifactDir: artifacts.runDir,
        adb,
        serial: device.serial,
      });
    }

    appium = await startAppiumServer({
      repoRoot,
      port: options.appiumPort,
      logPath: artifacts.path("appium.log"),
    });
    const chromedriverPath = await ensureChromedriver({
      repoRoot,
      overridePath: options.chromedriverPath,
    });
    driver = await createAndroidSession({
      port: options.appiumPort,
      serial: device.serial,
      chromedriverPath,
    });
    await waitForWebview(driver);
    const contexts = (await driver.getContexts()).map(String);
    result.appium = {
      version: PINNED_APPIUM_VERSION,
      uiautomator2Version: PINNED_UIAUTOMATOR2_VERSION,
      contexts,
    };
    artifacts.writeRun();

    for (const scenario of preset.scenarios) {
      const started = performance.now();
      try {
        await scenario.run({
          driver,
          adb,
          serial: device.serial,
          options,
          artifacts,
          fixtures,
          deterministicBaseUrl: deterministic?.deviceBaseUrl,
          deterministicRequests: deterministic?.requests,
        });
        result.scenarios.push({
          id: scenario.id,
          status: "passed",
          durationMs: Math.round(performance.now() - started),
        });
      } catch (error) {
        result.scenarios.push({
          id: scenario.id,
          status: "failed",
          durationMs: Math.round(performance.now() - started),
          detail: errorSummary(error).message,
        });
        throw error;
      } finally {
        artifacts.writeRun();
      }
    }
    result.status = "passed";
  } catch (error) {
    if (!signalExitStarted) {
      result.status = "failed";
      result.error = errorSummary(error);
      await withTimeout(
        artifacts.captureFailure({
          driver,
          adb: ownedAvd ? adb : undefined,
          serial: ownedAvd?.device.serial,
        }),
        { timeoutMs: 30_000, description: "failure artifact capture" }
      ).catch((captureError) =>
        noteCleanupFailure("Failure artifact capture incomplete", captureError)
      );
    }
    throw error;
  } finally {
    process.off("SIGINT", handleSignal);
    process.off("SIGTERM", handleSignal);
    await cleanup();
  }
}

await main().catch((error) => {
  console.error(`[mobile-e2e] ${errorSummary(error).message}`);
  process.exitCode = 1;
});
