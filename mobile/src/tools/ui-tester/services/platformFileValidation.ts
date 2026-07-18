import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { open as openFile } from "@tauri-apps/plugin-fs";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type { ValidationCommandResult } from "../types/validation";
import { redactValidationText } from "./validationRedaction";

const logger = createModuleLogger("ui-tester/platform-files");
const errorHandler = createModuleErrorHandler("ui-tester/platform-files");

export interface SelectedFileSummary {
  selectionCount: number;
  scheme: string;
  fileName: string;
  referenceHash: string;
  mime: string;
  size: number;
  bytesRead: number;
  firstByteMs: number;
  readProbeMs: number;
  probeStatus: "passed" | "failed";
  probeError: string;
}

const FILE_PROBE_TIMEOUT_MS = 10_000;
const PICKER_RETURN_GRACE_MS = 5_000;
const PICKER_MAX_WAIT_MS = 10 * 60_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, phase: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(
      () => reject(new Error(`${phase}超时（${timeoutMs} ms）`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function isPickerCancellation(error: unknown): boolean {
  return /cancel(?:led|ed)?/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

function openSystemPicker(options: Parameters<typeof open>[0]): Promise<string | string[] | null> {
  return new Promise((resolve, reject) => {
    let leftForPicker = false;
    let returnTimeoutId: number | undefined;

    const cleanup = () => {
      window.clearTimeout(maxWaitTimeoutId);
      if (returnTimeoutId !== undefined) window.clearTimeout(returnTimeoutId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
    const finish = (value: string | string[] | null) => {
      cleanup();
      resolve(value);
    };
    const fail = (error: unknown) => {
      cleanup();
      if (isPickerCancellation(error)) finish(null);
      else reject(error);
    };
    const scheduleReturnFallback = () => {
      if (!leftForPicker || returnTimeoutId !== undefined) return;
      returnTimeoutId = window.setTimeout(() => {
        logger.warn("系统选择器恢复后未返回结果，按取消收敛", {
          graceMs: PICKER_RETURN_GRACE_MS,
        });
        finish(null);
      }, PICKER_RETURN_GRACE_MS);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") leftForPicker = true;
      else scheduleReturnFallback();
    };
    const handleBlur = () => {
      leftForPicker = true;
    };
    const handleFocus = () => scheduleReturnFallback();
    const maxWaitTimeoutId = window.setTimeout(() => {
      fail(new Error(`等待系统选择器返回超时（${PICKER_MAX_WAIT_MS} ms）`));
    }, PICKER_MAX_WAIT_MS);

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);
    open(options).then(finish, fail);
  });
}

function fileNameFromReference(reference: string): string {
  let decoded = reference;
  try {
    decoded = decodeURIComponent(reference);
  } catch {
    // Keep the original reference if the provider returned malformed escaping.
  }
  const normalized = decoded.replace(/\\/g, "/");
  return normalized.split("/").pop() || "unknown";
}

function referenceScheme(reference: string): string {
  const match = reference.match(/^([a-z][a-z0-9+.-]*):/i);
  return match?.[1]?.toLowerCase() ?? "path";
}

function mimeFromName(fileName: string): string {
  const extension = fileName.split(".").pop()?.toLowerCase();
  return ({
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    gif: "image/gif",
    json: "application/json",
    txt: "text/plain",
    pdf: "application/pdf",
  } as Record<string, string>)[extension ?? ""] ?? "application/octet-stream";
}

async function hashReference(reference: string): Promise<string> {
  const bytes = new TextEncoder().encode(reference);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function selectValidationFiles(
  multiple: boolean,
  kind: "file" | "photo" = "file",
): Promise<SelectedFileSummary | null> {
  try {
    const selection = await openSystemPicker({
      multiple,
      directory: false,
      filters:
        kind === "photo"
          ? [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "heic"] }]
          : undefined,
    });
    if (!selection) return null;

    const references = Array.isArray(selection) ? selection : [selection];
    const first = String(references[0]);
    const fileName = fileNameFromReference(first);
    const summary: SelectedFileSummary = {
      selectionCount: references.length,
      scheme: referenceScheme(first),
      fileName,
      referenceHash: await hashReference(first),
      mime: mimeFromName(fileName),
      size: -1,
      bytesRead: 0,
      firstByteMs: 0,
      readProbeMs: 0,
      probeStatus: "failed",
      probeError: "",
    };
    const startedAt = performance.now();
    let handle: Awaited<ReturnType<typeof openFile>> | undefined;
    try {
      handle = await withTimeout(
        openFile(first, { read: true }),
        FILE_PROBE_TIMEOUT_MS,
        "打开选择结果",
      );
      const probe = new Uint8Array(64 * 1024);
      const bytesRead = await withTimeout(
        handle.read(probe),
        FILE_PROBE_TIMEOUT_MS,
        "读取首个数据块",
      );
      summary.firstByteMs = Math.round(performance.now() - startedAt);
      summary.bytesRead = bytesRead ?? 0;
      const info = await withTimeout(
        handle.stat(),
        FILE_PROBE_TIMEOUT_MS,
        "读取文件元数据",
      );
      summary.size = info.size;
      summary.readProbeMs = Math.round(performance.now() - startedAt);
      summary.probeStatus = "passed";
    } catch (error) {
      summary.readProbeMs = Math.round(performance.now() - startedAt);
      summary.probeError = redactValidationText(
        error instanceof Error ? error.message : String(error),
      );
      logger.warn("选择结果读取探测失败", {
        scheme: summary.scheme,
        phaseMessage: summary.probeError,
      });
    } finally {
      if (handle) {
        await withTimeout(handle.close(), 2_000, "关闭文件句柄").catch((error) => {
          logger.warn("关闭选择结果句柄失败", {
            message: redactValidationText(String(error)),
          });
        });
      }
    }
    logger.info("系统选择器返回文件", summary);
    return summary;
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "系统文件选择器调用失败",
      showToUser: false,
    });
    throw error;
  }
}

export function runPlatformFileScenario(
  scenario: "sandbox-round-trip" | "write-failure-cleanup" | "resume-check",
): Promise<ValidationCommandResult> {
  return invoke("run_platform_file_validation", { scenario });
}

export function cleanupPlatformFileSandbox(): Promise<ValidationCommandResult> {
  return invoke("cleanup_platform_file_validation");
}

export function terminateForResumeValidation(): Promise<void> {
  return invoke("terminate_for_validation");
}
