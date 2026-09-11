import { $, browser } from "@wdio/globals";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { selectNativeFiles } from "../support/native-ui";

type NativePidResult =
  | { status: "pending" }
  | { status: "resolved"; processId: number }
  | { status: "failed"; error: string };

interface NativePidWindow extends Window {
  __AIO_E2E_PID_RESULT__?: NativePidResult;
  __TAURI_INTERNALS__?: {
    invoke<T>(command: string, args: Record<string, never>): Promise<T>;
  };
}

async function navigateTo(targetPath: string): Promise<void> {
  await browser.execute((path) => {
    window.history.pushState({}, "", path);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, targetPath);
}

async function prepareApplication(): Promise<void> {
  await $("body").waitForExist();
  await browser.pause(2_000);
  await browser.execute(() => {
    const button =
      document.querySelector<HTMLElement>('[data-testid="guided-flow-close"]') ??
      document.querySelector<HTMLElement>('[data-testid="guided-flow-skip"]');
    button?.click();
  });
}

async function getAppProcessId(): Promise<number> {
  await browser.execute(() => {
    const e2eWindow = window as NativePidWindow;
    const tauriInternals = e2eWindow.__TAURI_INTERNALS__;
    e2eWindow.__AIO_E2E_PID_RESULT__ = { status: "pending" };
    if (!tauriInternals) {
      e2eWindow.__AIO_E2E_PID_RESULT__ = {
        status: "failed",
        error: "Tauri IPC internals are unavailable",
      };
      return;
    }
    void tauriInternals
      .invoke<number>("wa_get_self_pid", {})
      .then((processId) => {
        e2eWindow.__AIO_E2E_PID_RESULT__ = { status: "resolved", processId };
      })
      .catch((error: unknown) => {
        e2eWindow.__AIO_E2E_PID_RESULT__ = {
          status: "failed",
          error: String(error),
        };
      });
  });

  await browser.waitUntil(
    async () => {
      const result = await browser.execute(
        () => (window as NativePidWindow).__AIO_E2E_PID_RESULT__
      );
      return result?.status !== "pending";
    },
    { timeout: 5_000, timeoutMsg: "Timed out while resolving the Tauri PID" }
  );
  const result = await browser.execute(
    () => (window as NativePidWindow).__AIO_E2E_PID_RESULT__
  );
  if (
    result?.status !== "resolved" ||
    !Number.isInteger(result.processId) ||
    result.processId <= 0
  ) {
    throw new Error(
      result?.status === "failed"
        ? result.error
        : "Failed to resolve the Tauri process ID"
    );
  }
  return result.processId;
}

function readCommandOutputPath(command: string): string {
  const tokens = command.trim().split(/\s+/);
  let output = tokens[tokens.length - 1] ?? "";
  if (output.startsWith('"') && output.endsWith('"')) {
    output = output.slice(1, -1);
  }
  return output;
}

function probeDuration(filePath: string): {
  duration: number;
  streamTypes: string[];
} {
  const raw = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type",
      "-of",
      "json",
      filePath,
    ],
    { encoding: "utf8" }
  );
  const parsed = JSON.parse(raw) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  return {
    duration: Number(parsed.format?.duration ?? 0),
    streamTypes: (parsed.streams ?? []).map((s) => s.codec_type ?? ""),
  };
}

const mediaPath = process.env.AIO_E2E_FFMPEG_MEDIA?.trim();
const nativeDescribe =
  process.env.AIO_E2E_NATIVE_UI === "1" && mediaPath ? describe : describe.skip;

nativeDescribe("FFmpeg workbench with a real media file", () => {
  let appProcessId = 0;
  const runId = `e2e-${Date.now().toString(36)}`;

  before(async () => {
    if (!mediaPath || !fs.existsSync(mediaPath)) {
      throw new Error(`AIO_E2E_FFMPEG_MEDIA does not exist: ${mediaPath}`);
    }
    await prepareApplication();
    await navigateTo("/ffmpeg-tools");
    await $('[data-testid="ffmpeg-import"]').waitForDisplayed({
      timeout: 30_000,
    });
    appProcessId = await getAppProcessId();
  });

  it("imports the file and previews the exact execution plan", async () => {
    await $('[data-testid="ffmpeg-import"]').click();
    const selection = selectNativeFiles([mediaPath!], appProcessId);
    if (!selection.success) {
      throw new Error(selection.error || "Native file selection failed");
    }

    const fileName = await $('[data-testid="ffmpeg-file-name"]');
    await fileName.waitForDisplayed({ timeout: 30_000 });
    if (!(await fileName.getText()).includes(path.basename(mediaPath!))) {
      throw new Error(`Unexpected imported file name: ${await fileName.getText()}`);
    }

    await $('[data-testid="ffmpeg-metadata"]').waitForDisplayed({
      timeout: 20_000,
    });

    // The pending-file card also mounts a transparent overlay DropZone for
    // drag-and-drop replacement. Guard that it stays transparent and does not
    // cover the file name/metadata.
    const fileCardOccluded = await browser.execute(() => {
      const name = document.querySelector<HTMLElement>(
        '[data-testid="ffmpeg-file-name"]'
      );
      if (!name) return true;
      const rect = name.getBoundingClientRect();
      const topmost = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2
      );
      return !(
        topmost &&
        (topmost === name ||
          name.contains(topmost) ||
          topmost.contains(name))
      );
    });
    if (fileCardOccluded) {
      throw new Error("Pending-file content is occluded by the overlay drop zone");
    }

    const command = await $(
      '[data-testid="ffmpeg-command-preview"]'
    ).getText();
    if (!command.startsWith("ffmpeg")) {
      throw new Error(`Preview does not start with the ffmpeg executable: ${command}`);
    }
    if (!command.includes(mediaPath!)) {
      throw new Error(`Preview is missing the full input path: ${command}`);
    }
    const outputPath = readCommandOutputPath(command);
    if (!path.isAbsolute(outputPath) || !outputPath.toLowerCase().endsWith(".mp4")) {
      throw new Error(`Preview output path is not an absolute mp4 path: ${outputPath}`);
    }
  });

  it("trims with stream copy and produces a playable file", async () => {
    const outputName = `${runId}-trim.mp4`;
    await $('[data-testid="ffmpeg-output-name"]').setValue(outputName);

    const trimToggle = await $('[data-testid="ffmpeg-trim-toggle"]');
    await trimToggle.$(".el-switch__core").click();
    await $('[data-testid="ffmpeg-trim-start"]').waitForDisplayed({
      timeout: 10_000,
    });

    const startInput = await $('[data-testid="ffmpeg-trim-start"]');
    await startInput.setValue("00:00:02");
    await browser.keys("Tab");
    const endInput = await $('[data-testid="ffmpeg-trim-end"]');
    await endInput.setValue("00:00:06");
    await browser.keys("Tab");
    await browser.pause(500);

    const command = await $(
      '[data-testid="ffmpeg-command-preview"]'
    ).getText();
    for (const expected of ["-ss 00:00:02.000", "-c copy", "-t 00:00:04.000"]) {
      if (!command.includes(expected)) {
        throw new Error(`Trimmed preview is missing "${expected}": ${command}`);
      }
    }

    const outputPath = readCommandOutputPath(command);
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });

    await $('[data-testid="ffmpeg-start"]').click();
    await browser.waitUntil(
      async () => {
        const status = await $('[data-testid="ffmpeg-task-status"]');
        if (!(await status.isExisting())) return false;
        return /已完成|失败|已取消/.test(await status.getText());
      },
      { timeout: 120_000, timeoutMsg: "FFmpeg trim task did not finish" }
    );
    const status = await $('[data-testid="ffmpeg-task-status"]').getText();
    if (!status.includes("已完成")) {
      throw new Error(`Trim task did not complete: ${status}`);
    }

    await browser.waitUntil(() => fs.existsSync(outputPath), {
      timeout: 20_000,
      timeoutMsg: `Trim output was not written: ${outputPath}`,
    });
    const probe = probeDuration(outputPath);
    if (probe.duration < 3 || probe.duration > 6.5) {
      throw new Error(`Unexpected trim duration: ${probe.duration}`);
    }
    if (!probe.streamTypes.includes("video") || !probe.streamTypes.includes("audio")) {
      throw new Error(
        `Trim output is missing streams: ${probe.streamTypes.join(",")}`
      );
    }

    fs.rmSync(outputPath, { force: true });
  });

  it("cancels a running re-encode and returns to idle", async () => {
    const trimToggle = await $('[data-testid="ffmpeg-trim-toggle"]');
    const toggleClass = (await trimToggle.getAttribute("class")) ?? "";
    if (toggleClass.includes("is-checked")) {
      await trimToggle.$(".el-switch__core").click();
    }

    const outputName = `${runId}-cancel.mp4`;
    await $('[data-testid="ffmpeg-output-name"]').setValue(outputName);
    await browser.pause(500);

    const command = await $(
      '[data-testid="ffmpeg-command-preview"]'
    ).getText();
    const outputPath = readCommandOutputPath(command);
    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });

    await $('[data-testid="ffmpeg-start"]').click();
    const stopButton = await $('[data-testid="ffmpeg-stop"]');
    await stopButton.waitForDisplayed({ timeout: 30_000 });
    await browser.pause(2_500);
    await stopButton.click();

    await browser.waitUntil(
      async () => {
        const status = await $('[data-testid="ffmpeg-task-status"]');
        if (!(await status.isExisting())) return false;
        return (await status.getText()).includes("已取消");
      },
      { timeout: 60_000, timeoutMsg: "Cancelled task did not report 已取消" }
    );
    await $('[data-testid="ffmpeg-start"]').waitForDisplayed({
      timeout: 20_000,
    });

    if (fs.existsSync(outputPath)) fs.rmSync(outputPath, { force: true });
  });
});
