/**
 * 方案持久化 composable
 *
 * 方案以单个 JSON 文件存放在 `{appConfigDir}/window-automator/flows/` 目录下。
 * 索引文件 `index.json` 维护方案元数据列表（轻量读取）。
 *
 * 自动保存：方案变更后 debounce 2s 触发保存，避免每键击都落盘。
 */

import { ref } from "vue";
import { join } from "@tauri-apps/api/path";
import {
  writeTextFile,
  readTextFile,
  exists,
  mkdir,
  remove,
  readDir,
} from "@tauri-apps/plugin-fs";
import { getAppConfigDir } from "@/utils/appPath";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { ActionFlow } from "../types";

const logger = createModuleLogger("window-automator/useFlowPersistence");
const errorHandler = createModuleErrorHandler(
  "window-automator/useFlowPersistence"
);

const DIR_NAME = "window-automator";
const FLOWS_DIR = "flows";
const INDEX_FILE = "index.json";

interface FlowIndexEntry {
  id: string;
  name: string;
  updatedAt: string;
}

interface FlowIndex {
  version: 1;
  flows: FlowIndexEntry[];
}

function emptyIndex(): FlowIndex {
  return { version: 1, flows: [] };
}

async function ensureDir(path: string) {
  if (!(await exists(path))) {
    await mkdir(path, { recursive: true });
  }
}

async function resolveDir(...parts: string[]): Promise<string> {
  const base = await getAppConfigDir();
  const full = await join(base, DIR_NAME, ...parts);
  await ensureDir(await join(base, DIR_NAME));
  if (parts.length > 0) {
    await ensureDir(full);
  }
  return full;
}

async function readIndex(): Promise<FlowIndex> {
  const flowsDir = await resolveDir(FLOWS_DIR);
  const indexPath = await join(flowsDir, INDEX_FILE);
  if (!(await exists(indexPath))) return emptyIndex();
  const text = await errorHandler.wrapAsync(() => readTextFile(indexPath), {
    userMessage: "读取方案索引失败",
  });
  if (!text) return emptyIndex();
  try {
    const parsed = JSON.parse(text) as FlowIndex;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.flows)) {
      return emptyIndex();
    }
    return parsed;
  } catch (e) {
    logger.warn("方案索引解析失败，重置", { error: String(e) });
    return emptyIndex();
  }
}

async function writeIndex(index: FlowIndex): Promise<boolean> {
  const flowsDir = await resolveDir(FLOWS_DIR);
  const indexPath = await join(flowsDir, INDEX_FILE);
  const result = await errorHandler.wrapAsync(
    () => writeTextFile(indexPath, JSON.stringify(index, null, 2)),
    { userMessage: "写入方案索引失败" }
  );
  return result !== null;
}

async function writeFlowFile(flow: ActionFlow): Promise<boolean> {
  const flowsDir = await resolveDir(FLOWS_DIR);
  const path = await join(flowsDir, `${flow.id}.json`);
  const result = await errorHandler.wrapAsync(
    () => writeTextFile(path, JSON.stringify(flow, null, 2)),
    { userMessage: "保存方案失败" }
  );
  if (result === null) return false;
  // 同步索引
  const index = await readIndex();
  const existing = index.flows.find((f) => f.id === flow.id);
  if (existing) {
    existing.name = flow.name;
    existing.updatedAt = flow.updatedAt;
  } else {
    index.flows.push({
      id: flow.id,
      name: flow.name,
      updatedAt: flow.updatedAt,
    });
  }
  await writeIndex(index);
  return true;
}

async function deleteFlowFile(id: string): Promise<boolean> {
  const flowsDir = await resolveDir(FLOWS_DIR);
  const path = await join(flowsDir, `${id}.json`);
  if (await exists(path)) {
    await errorHandler.wrapAsync(() => remove(path), {
      userMessage: "删除方案失败",
    });
  }
  const index = await readIndex();
  index.flows = index.flows.filter((f) => f.id !== id);
  await writeIndex(index);
  return true;
}

async function readFlowFile(id: string): Promise<ActionFlow | null> {
  const flowsDir = await resolveDir(FLOWS_DIR);
  const path = await join(flowsDir, `${id}.json`);
  if (!(await exists(path))) return null;
  const text = await errorHandler.wrapAsync(() => readTextFile(path), {
    userMessage: "读取方案失败",
  });
  if (!text) return null;
  try {
    return JSON.parse(text) as ActionFlow;
  } catch (e) {
    logger.warn("方案文件解析失败", { id, error: String(e) });
    return null;
  }
}

async function listAllFlowFiles(): Promise<ActionFlow[]> {
  const flowsDir = await resolveDir(FLOWS_DIR);
  const entries = await errorHandler.wrapAsync(() => readDir(flowsDir), {
    userMessage: "枚举方案目录失败",
  });
  if (!entries) return [];
  const flows: ActionFlow[] = [];
  for (const entry of entries) {
    if (entry.name === INDEX_FILE) continue;
    if (!entry.name?.endsWith(".json")) continue;
    const id = entry.name.replace(/\.json$/, "");
    const flow = await readFlowFile(id);
    if (flow) flows.push(flow);
  }
  return flows;
}

export function useFlowPersistence() {
  const isLoading = ref(false);
  const isSaving = ref(false);

  async function loadAll(): Promise<ActionFlow[]> {
    isLoading.value = true;
    const flows = await listAllFlowFiles();
    isLoading.value = false;
    logger.info("加载全部方案", { count: flows.length });
    return flows;
  }

  async function save(flow: ActionFlow): Promise<boolean> {
    isSaving.value = true;
    const ok = await writeFlowFile(flow);
    isSaving.value = false;
    if (ok) logger.debug("方案已保存", { id: flow.id, name: flow.name });
    return ok;
  }

  async function remove(id: string): Promise<boolean> {
    const ok = await deleteFlowFile(id);
    if (ok) logger.info("方案已删除", { id });
    return ok;
  }

  /**
   * 简单防抖：同一 flow 的连续保存请求只保留最后一次。
   * 返回的 cancel 可用于卸载时清理。
   */
  function debouncedSave(flow: ActionFlow, delayMs = 2000) {
    let timer: number | null = null;
    const trigger = () => {
      if (timer !== null) clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void save(flow);
      }, delayMs);
    };
    return {
      trigger,
      cancel: () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
      },
    } as { trigger: () => void; cancel: () => void };
  }

  /**
   * 导出单个方案为可读 JSON 字符串（用于导入导出）。
   */
  function exportFlow(flow: ActionFlow): string {
    return JSON.stringify(flow, null, 2);
  }

  /**
   * 解析外部 JSON 文本为方案对象（用于导入）。
   */
  function parseFlow(text: string): ActionFlow | null {
    try {
      const obj = JSON.parse(text);
      if (!obj || typeof obj !== "object") return null;
      if (typeof obj.id !== "string" || typeof obj.name !== "string")
        return null;
      if (!Array.isArray(obj.steps)) return null;
      return obj as ActionFlow;
    } catch (e) {
      logger.warn("方案导入解析失败", { error: String(e) });
      return null;
    }
  }

  return {
    isLoading,
    isSaving,
    loadAll,
    save,
    remove,
    debouncedSave,
    exportFlow,
    parseFlow,
  };
}
