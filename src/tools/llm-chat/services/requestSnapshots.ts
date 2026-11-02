import { reactive, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { exists, readTextFile } from "@tauri-apps/plugin-fs";
import { getAppConfigDir } from "@/utils/appPath";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  RequestSnapshotRepository,
  snapshotBytes,
  SNAPSHOT_LIMITS,
} from "./requestSnapshotRepository";
import type { SessionRequestSnapshotFile } from "../types/requestSnapshot";

const logger = createModuleLogger("llm-chat/request-snapshots");
const errorHandler = createModuleErrorHandler("llm-chat/request-snapshots");
export const snapshotStorageError = ref("");
export const snapshotRevision = ref(0);
const manager = createConfigManager({
  moduleName: "llm-chat",
  fileName: "request-snapshot-settings.json",
  version: "1.0.0",
  createDefault: () => ({ enabled: true, saveTextPreview: false }),
});
export const snapshotSettings = reactive({
  enabled: true,
  saveTextPreview: false,
});
let loading: Promise<void> | undefined;
export function loadSnapshotSettings() {
  return (loading ??= manager
    .load()
    .then((settings) => {
      Object.assign(snapshotSettings, settings);
    })
    .catch((error) => {
      snapshotStorageError.value = "读取记录设置失败，请重新打开分析器后重试";
      logger.warn("读取请求记录设置失败", error);
    }));
}
export async function saveSnapshotSettings() {
  await manager.save({
    enabled: snapshotSettings.enabled,
    saveTextPreview: snapshotSettings.saveTextPreview,
  });
}
export async function snapshotDirectory() {
  return join(await getAppConfigDir(), "llm-chat", "request-snapshots");
}
function safeId(id: string) {
  if (!id || id.length > 180 || id.includes("..") || /[\\/:]/.test(id))
    throw new Error("会话标识无效");
  return id;
}
const inTauri = () =>
  typeof window !== "undefined" && !!(window as any).__TAURI_INTERNALS__;
const memory = new Map<string, string>();
export const requestSnapshots = new RequestSnapshotRepository({
  async read(id) {
    safeId(id);
    const path = inTauri()
      ? await join(await snapshotDirectory(), `${id}.json`)
      : id;
    const content = inTauri()
      ? (await exists(path))
        ? await readTextFile(path)
        : null
      : memory.get(id);
    if (!content) return null;
    const file = JSON.parse(content) as SessionRequestSnapshotFile;
    if (
      file.schemaVersion !== 1 ||
      file.sessionId !== id ||
      !Array.isArray(file.attempts) ||
      snapshotBytes(file) > SNAPSHOT_LIMITS.sessionBytes
    )
      throw new Error("请求记录损坏，请清空当前会话记录");
    return file;
  },
  async write(file) {
    safeId(file.sessionId);
    if (inTauri()) {
      const result = await invoke<{ outcome: string }>(
        "llm_chat_atomic_write",
        {
          request: {
            kind: "requestSnapshots",
            sessionId: file.sessionId,
            content: JSON.stringify(file),
            revision: file._persistence!.revision,
            keepLastValidBackup: false,
          },
        }
      );
      if (result.outcome !== "committed")
        throw new Error("请求记录写入冲突，请刷新后重试");
    } else memory.set(file.sessionId, JSON.stringify(file));
    snapshotStorageError.value = "";
    snapshotRevision.value++;
  },
});
export function reportSnapshotError(error: unknown) {
  snapshotStorageError.value =
    "请求记录保存失败，可在分析器中刷新或清空记录后重试";
  errorHandler.handle(error as Error, {
    userMessage: snapshotStorageError.value,
    showToUser: false,
  });
}
