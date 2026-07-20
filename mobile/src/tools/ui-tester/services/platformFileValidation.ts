import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { open as openFile, SeekMode } from "@tauri-apps/plugin-fs";
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

export interface FullFileReadProgress {
  bytesRead: number;
  totalBytes: number;
  phase?:
    | "reading"
    | "reading-before-interruption"
    | "interrupted"
    | "resumed"
    | "reading-after-resume"
    | "completed";
}

export interface FullFileReadSummary {
  scheme: string;
  fileName: string;
  referenceHash: string;
  size: number;
  bytesRead: number;
  firstByteMs: number;
  totalReadMs: number;
  throughputMiBps: number;
  readChunkBytes: number;
  status: "passed" | "failed" | "cancelled";
  failurePhase: string;
  error: string;
}

export interface InterruptedFileReadSummary extends FullFileReadSummary {
  interruptAtBytes: number;
  resumedOffset: number;
  resumeLatencyMs: number;
}

const FILE_PROBE_TIMEOUT_MS = 10_000;
const FULL_FILE_READ_TIMEOUT_MS = 30_000;
const COMPATIBILITY_READ_CHUNK_BYTES = 64 * 1024;
const THROUGHPUT_READ_CHUNK_BYTES = 1024 * 1024;
const INTERRUPT_AFTER_BYTES = 4 * 1024 * 1024;
const FULL_FILE_PROGRESS_INTERVAL_BYTES = 1024 * 1024;
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

async function selectAndReadValidationFileFullyWithChunkSize(
  readChunkBytes: number,
  onProgress?: (progress: FullFileReadProgress) => void,
  signal?: AbortSignal,
): Promise<FullFileReadSummary | null> {
  const selection = await openSystemPicker({ multiple: false, directory: false });
  if (!selection) return null;

  const reference = String(Array.isArray(selection) ? selection[0] : selection);
  const fileName = fileNameFromReference(reference);
  const summary: FullFileReadSummary = {
    scheme: referenceScheme(reference),
    fileName,
    referenceHash: await hashReference(reference),
    size: -1,
    bytesRead: 0,
    firstByteMs: 0,
    totalReadMs: 0,
    throughputMiBps: 0,
    readChunkBytes,
    status: "failed",
    failurePhase: "open",
    error: "",
  };
  const startedAt = performance.now();
  let handle: Awaited<ReturnType<typeof openFile>> | undefined;
  try {
    handle = await withTimeout(
      openFile(reference, { read: true }),
      FILE_PROBE_TIMEOUT_MS,
      "打开完整读取样本",
    );
    summary.failurePhase = "stat";
    try {
      const info = await withTimeout(
        handle.stat(),
        FILE_PROBE_TIMEOUT_MS,
        "读取完整读取样本元数据",
      );
      summary.size = info.size;
    } catch (error) {
      logger.warn("完整读取样本无法取得文件大小，将以 EOF 为完成条件", {
        scheme: summary.scheme,
        message: redactValidationText(String(error)),
      });
    }
    const buffer = new Uint8Array(readChunkBytes);
    let nextProgressAt = FULL_FILE_PROGRESS_INTERVAL_BYTES;
    summary.failurePhase = "read";
    while (true) {
      if (signal?.aborted) {
        summary.status = "cancelled";
        break;
      }
      const bytesRead = await withTimeout(
        handle.read(buffer),
        FULL_FILE_READ_TIMEOUT_MS,
        "顺序读取文件块",
      );
      if (!bytesRead) {
        const sizeMatches = summary.size < 0 || summary.bytesRead === summary.size;
        summary.status = sizeMatches ? "passed" : "failed";
        if (summary.status === "failed") {
          summary.error = `读取字节数 ${summary.bytesRead} 与文件大小 ${summary.size} 不一致`;
        }
        break;
      }
      summary.bytesRead += bytesRead;
      if (summary.firstByteMs === 0) {
        summary.firstByteMs = Math.round(performance.now() - startedAt);
      }
      if (
        summary.bytesRead >= nextProgressAt ||
        (summary.size >= 0 && summary.bytesRead >= summary.size)
      ) {
        onProgress?.({
          bytesRead: summary.bytesRead,
          totalBytes: summary.size,
          phase: "reading",
        });
        nextProgressAt = summary.bytesRead + FULL_FILE_PROGRESS_INTERVAL_BYTES;
      }
    }
  } catch (error) {
    summary.error = redactValidationText(
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (summary.status !== "failed") {
      summary.failurePhase = "";
    }
    summary.totalReadMs = Math.round(performance.now() - startedAt);
    if (summary.totalReadMs > 0) {
      summary.throughputMiBps = Number(
        ((summary.bytesRead / (1024 * 1024)) / (summary.totalReadMs / 1000)).toFixed(2),
      );
    }
    if (handle) {
      await withTimeout(handle.close(), 2_000, "关闭完整读取文件句柄").catch(
        (error) => {
          logger.warn("关闭完整读取文件句柄失败", {
            message: redactValidationText(String(error)),
          });
        },
      );
    }
  }
  logger.info("完整顺序读取场景结束", {
    scheme: summary.scheme,
    size: summary.size,
    bytesRead: summary.bytesRead,
    totalReadMs: summary.totalReadMs,
    failurePhase: summary.failurePhase,
    status: summary.status,
  });
  return summary;
}

export function selectAndReadValidationFileFully(
  onProgress?: (progress: FullFileReadProgress) => void,
  signal?: AbortSignal,
): Promise<FullFileReadSummary | null> {
  return selectAndReadValidationFileFullyWithChunkSize(
    COMPATIBILITY_READ_CHUNK_BYTES,
    onProgress,
    signal,
  );
}

export function selectAndReadValidationFileAtThroughputBaseline(
  onProgress?: (progress: FullFileReadProgress) => void,
  signal?: AbortSignal,
): Promise<FullFileReadSummary | null> {
  return selectAndReadValidationFileFullyWithChunkSize(
    THROUGHPUT_READ_CHUNK_BYTES,
    onProgress,
    signal,
  );
}

export async function selectAndResumeValidationFileRead(
  onProgress?: (progress: FullFileReadProgress) => void,
  signal?: AbortSignal,
): Promise<InterruptedFileReadSummary | null> {
  const selection = await openSystemPicker({
    multiple: false,
    directory: false,
  });
  if (!selection) return null;

  const reference = String(Array.isArray(selection) ? selection[0] : selection);
  const fileName = fileNameFromReference(reference);
  const summary: InterruptedFileReadSummary = {
    scheme: referenceScheme(reference),
    fileName,
    referenceHash: await hashReference(reference),
    size: -1,
    bytesRead: 0,
    firstByteMs: 0,
    totalReadMs: 0,
    throughputMiBps: 0,
    readChunkBytes: THROUGHPUT_READ_CHUNK_BYTES,
    interruptAtBytes: 0,
    resumedOffset: 0,
    resumeLatencyMs: 0,
    status: "failed",
    failurePhase: "open",
    error: "",
  };
  const startedAt = performance.now();
  let handle: Awaited<ReturnType<typeof openFile>> | undefined;

  try {
    handle = await withTimeout(
      openFile(reference, { read: true }),
      FILE_PROBE_TIMEOUT_MS,
      "打开中断恢复样本",
    );
    summary.failurePhase = "stat";
    try {
      const info = await withTimeout(
        handle.stat(),
        FILE_PROBE_TIMEOUT_MS,
        "读取中断恢复样本元数据",
      );
      summary.size = info.size;
    } catch (error) {
      logger.warn("中断恢复样本无法取得文件大小，将以 EOF 为完成条件", {
        scheme: summary.scheme,
        message: redactValidationText(String(error)),
      });
    }

    const plannedInterruptAt =
      summary.size >= 0
        ? Math.min(INTERRUPT_AFTER_BYTES, Math.floor(summary.size / 2))
        : INTERRUPT_AFTER_BYTES;
    if (plannedInterruptAt < THROUGHPUT_READ_CHUNK_BYTES) {
      throw new Error("中断恢复样本过小，请选择至少 2 MiB 的文件");
    }

    summary.failurePhase = "read-before-interruption";
    while (summary.bytesRead < plannedInterruptAt) {
      if (signal?.aborted) {
        summary.status = "cancelled";
        break;
      }
      const remaining = plannedInterruptAt - summary.bytesRead;
      const buffer = new Uint8Array(
        Math.min(THROUGHPUT_READ_CHUNK_BYTES, remaining)
      );
      const bytesRead = await withTimeout(
        handle.read(buffer),
        FULL_FILE_READ_TIMEOUT_MS,
        "读取中断前文件块",
      );
      if (!bytesRead) {
        throw new Error("在计划中断点前到达 EOF，请选择更大的文件");
      }
      summary.bytesRead += bytesRead;
      if (summary.firstByteMs === 0) {
        summary.firstByteMs = Math.round(performance.now() - startedAt);
      }
      onProgress?.({
        bytesRead: summary.bytesRead,
        totalBytes: summary.size,
        phase: "reading-before-interruption",
      });
    }

    if (summary.status !== "cancelled") {
      summary.interruptAtBytes = summary.bytesRead;
      summary.failurePhase = "interrupt";
      await withTimeout(handle.close(), 2_000, "关闭中断点文件句柄");
      handle = undefined;
      onProgress?.({
        bytesRead: summary.bytesRead,
        totalBytes: summary.size,
        phase: "interrupted",
      });

      summary.failurePhase = "reopen";
      const resumeStartedAt = performance.now();
      handle = await withTimeout(
        openFile(reference, { read: true }),
        FILE_PROBE_TIMEOUT_MS,
        "重新打开中断恢复样本",
      );
      summary.failurePhase = "seek";
      summary.resumedOffset = await withTimeout(
        handle.seek(summary.interruptAtBytes, SeekMode.Start),
        FILE_PROBE_TIMEOUT_MS,
        "定位续读偏移量",
      );
      summary.resumeLatencyMs = Math.round(performance.now() - resumeStartedAt);
      if (summary.resumedOffset !== summary.interruptAtBytes) {
        throw new Error(
          `恢复偏移量 ${summary.resumedOffset} 与中断点 ${summary.interruptAtBytes} 不一致`,
        );
      }
      onProgress?.({
        bytesRead: summary.bytesRead,
        totalBytes: summary.size,
        phase: "resumed",
      });

      summary.failurePhase = "read-after-resume";
      const buffer = new Uint8Array(THROUGHPUT_READ_CHUNK_BYTES);
      while (true) {
        if (signal?.aborted) {
          summary.status = "cancelled";
          break;
        }
        const bytesRead = await withTimeout(
          handle.read(buffer),
          FULL_FILE_READ_TIMEOUT_MS,
          "读取恢复后文件块",
        );
        if (!bytesRead) {
          const sizeMatches = summary.size < 0 || summary.bytesRead === summary.size;
          summary.status = sizeMatches ? "passed" : "failed";
          if (!sizeMatches) {
            summary.error = `读取字节数 ${summary.bytesRead} 与文件大小 ${summary.size} 不一致`;
          }
          break;
        }
        summary.bytesRead += bytesRead;
        onProgress?.({
          bytesRead: summary.bytesRead,
          totalBytes: summary.size,
          phase: "reading-after-resume",
        });
      }
      if (summary.status === "passed") {
        onProgress?.({
          bytesRead: summary.bytesRead,
          totalBytes: summary.size,
          phase: "completed",
        });
      }
    }
  } catch (error) {
    summary.error = redactValidationText(
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    if (summary.status !== "failed") {
      summary.failurePhase = "";
    }
    summary.totalReadMs = Math.round(performance.now() - startedAt);
    if (summary.totalReadMs > 0) {
      summary.throughputMiBps = Number(
        ((summary.bytesRead / (1024 * 1024)) / (summary.totalReadMs / 1000)).toFixed(2),
      );
    }
    if (handle) {
      await withTimeout(handle.close(), 2_000, "关闭中断恢复文件句柄").catch(
        (error) => {
          logger.warn("关闭中断恢复文件句柄失败", {
            message: redactValidationText(String(error)),
          });
        },
      );
    }
  }

  logger.info("文件读取中断恢复场景结束", {
    scheme: summary.scheme,
    size: summary.size,
    bytesRead: summary.bytesRead,
    interruptAtBytes: summary.interruptAtBytes,
    resumedOffset: summary.resumedOffset,
    resumeLatencyMs: summary.resumeLatencyMs,
    status: summary.status,
  });
  return summary;
}

export function runPlatformFileScenario(
  scenario:
    | "sandbox-round-trip"
    | "write-failure-cleanup"
    | "space-exhaustion-cleanup"
    | "resume-check",
): Promise<ValidationCommandResult> {
  return invoke("run_platform_file_validation", { scenario });
}

export function cleanupPlatformFileSandbox(): Promise<ValidationCommandResult> {
  return invoke("cleanup_platform_file_validation");
}

export function terminateForResumeValidation(): Promise<void> {
  return invoke("terminate_for_validation");
}
