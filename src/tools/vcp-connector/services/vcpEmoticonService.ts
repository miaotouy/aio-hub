import { invoke } from "@tauri-apps/api/core";
import { createConfigManager } from "@/utils/configManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { VcpConfig } from "../types/protocol";

const logger = createModuleLogger("vcp-connector/emoticonService");
const errorHandler = createModuleErrorHandler("vcp-connector/emoticonService");

export interface EmoticonItem {
  /** 带 pw= 的完整 URL */
  url: string;
  /** 分类目录名（如"张三表情包"） */
  category: string;
  /** 文件名（如"盯.png"） */
  filename: string;
  /** 搜索用 key（小写，去扩展名） */
  searchKey: string;
}

// --- 持久化层 ---
const libraryManager = createConfigManager<{ items: EmoticonItem[] }>({
  moduleName: "vcp-connector",
  fileName: "emoticon_library.json",
  createDefault: () => ({ items: [] }),
});

// --- 内存层（resolveAsset 同步访问的唯一数据源）---
let library: EmoticonItem[] = [];
let httpBaseUrl = "";
let isRefreshing = false;

// --- 公开 API ---

/** 同步返回当前内存中的清单（resolveAsset 调用链使用） */
export function getEmoticonLibrary(): EmoticonItem[] {
  return library;
}

/** 获取当前派生的 httpBaseUrl（emoticonFixer 使用） */
export function getHttpBaseUrl(): string {
  return httpBaseUrl;
}

/**
 * 从磁盘加载持久化清单到内存（启动时调用，快速恢复）
 * 同时从 config 派生 httpBaseUrl
 */
export async function loadFromDisk(config: VcpConfig): Promise<void> {
  try {
    httpBaseUrl = deriveHttpBaseUrl(config.wsUrl);
    const cached = await libraryManager.load();
    if (cached.items && cached.items.length > 0) {
      library = cached.items;
      logger.info("从磁盘加载表情包清单", { count: library.length });
    }
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "加载表情包缓存失败",
      showToUser: false,
    });
  }
}

/**
 * 异步重扫本地文件系统，更新内存 + 磁盘
 * 防重入：如果正在刷新则跳过
 */
export async function refresh(config: VcpConfig): Promise<void> {
  if (!config.vcpPath || !config.vcpImageKey || !config.wsUrl) {
    logger.debug("refresh 跳过：vcpPath/vcpImageKey/wsUrl 为空");
    return;
  }
  if (isRefreshing) {
    logger.debug("refresh 跳过：正在刷新中");
    return;
  }

  isRefreshing = true;
  try {
    httpBaseUrl = deriveHttpBaseUrl(config.wsUrl);
    const scanned = await scanLocalEmoticonLibrary(config.vcpPath, config.vcpImageKey, httpBaseUrl);

    library = scanned;
    logger.info("表情包清单扫描完成", { count: scanned.length });

    // 持久化（不阻塞）
    libraryManager.saveDebounced({ items: scanned });
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "扫描表情包目录失败",
      showToUser: false,
    });
  } finally {
    isRefreshing = false;
  }
}

/** 清空内存清单（配置变化时调用） */
export function clearLibrary(): void {
  library = [];
  httpBaseUrl = "";
}

// --- 内部实现 ---

function deriveHttpBaseUrl(wsUrl: string): string {
  if (!wsUrl) return "";
  return wsUrl
    .replace(/^wss:\/\//, "https://")
    .replace(/^ws:\/\//, "http://")
    .replace(/\/+$/, "");
}

/**
 * 扫描 {vcpPath}/image/ 目录，找出所有表情包分类并建立清单
 */
async function scanLocalEmoticonLibrary(vcpPath: string, imageKey: string, baseUrl: string): Promise<EmoticonItem[]> {
  const imagePath = `${vcpPath}/image`;
  const result: EmoticonItem[] = [];

  // Step 1: 获取 image/ 下所有条目名称
  let allNames: string[];
  try {
    allNames = await invoke<string[]>("list_directory", { path: imagePath });
  } catch {
    logger.warn("无法读取 VCP image 目录", { imagePath });
    return result;
  }

  // Step 2: 过滤出以"表情包"结尾的候选名
  const categoryNames = allNames.filter((name) => name.endsWith("表情包"));
  if (categoryNames.length === 0) {
    logger.info("未找到表情包目录");
    return result;
  }

  // Step 3: 逐个读取图片列表
  for (const categoryName of categoryNames) {
    try {
      const imagePaths = await invoke<string[]>("list_directory_images", {
        directory: `${imagePath}/${categoryName}`,
      });

      for (const fullPath of imagePaths) {
        const filename = fullPath.split(/[\\/]/).pop() ?? "";
        if (!filename) continue;

        const encodedCategory = encodeURIComponent(categoryName);
        const encodedFilename = encodeURIComponent(filename);
        // 使用专用的 vcpImageKey
        const url = `${baseUrl}/pw=${imageKey}/images/${encodedCategory}/${encodedFilename}`;

        // searchKey: 小写、去扩展名，用于模糊匹配
        const searchKey = filename.replace(/\.[^.]+$/, "").toLowerCase();

        result.push({ url, category: categoryName, filename, searchKey });
      }
    } catch {
      // categoryName 是文件而非目录，或读取失败 → 跳过
    }
  }

  return result;
}
