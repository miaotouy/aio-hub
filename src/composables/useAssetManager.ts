import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ref, computed, onUnmounted } from "vue";
import type {
  Asset,
  AssetImportOptions,
  AssetType,
  AssetOrigin,
  AssetMetadata,
  ListAssetsPaginatedPayload,
  PaginatedAssetsResponse,
  AssetStats,
} from "@/types/asset-management";

/**
 * 资产管理核心引擎
 *
 * 包含所有与后端交互和无状态的业务逻辑。
 * 这个对象不依赖 Vue 的响应式系统，可以在任何地方安全地使用。
 */
export const assetManagerEngine = {
  /**
   * 获取资产存储根目录
   */
  getAssetBasePath: async (): Promise<string> => {
    return await invoke<string>("get_asset_base_path");
  },

  /**
   * 从文件路径导入资产
   */
  importAssetFromPath: async (
    originalPath: string,
    options?: AssetImportOptions
  ): Promise<Asset> => {
    return await invoke<Asset>("import_asset_from_path", {
      originalPath,
      options,
    });
  },

  /**
   * 从字节数据导入资产
   */
  importAssetFromBytes: async (
    bytes: ArrayBuffer,
    originalName: string,
    options?: AssetImportOptions
  ): Promise<Asset> => {
    const uint8Array = new Uint8Array(bytes);
    return await invoke<Asset>("import_asset_from_bytes", {
      bytes: Array.from(uint8Array),
      originalName,
      options,
    });
  },

  /**
   * 获取资产的二进制数据
   */
  getAssetBinary: async (relativePath: string): Promise<ArrayBuffer> => {
    const bytes = await invoke<number[]>("get_asset_binary", {
      relativePath,
    });
    return new Uint8Array(bytes).buffer;
  },

  /**
   * 将资产路径转换为可用的 URL（同步版本）
   * @param relativePath 相对于资产根目录的路径
   * @param basePath 资产根目录的绝对路径（必需）
   */
  convertToAssetProtocol: (relativePath: string, basePath: string): string => {
    try {
      // 标准化路径分隔符为反斜杠（Windows）
      const normalizedBase = basePath.replace(/\//g, "\\");
      const normalizedRelative = relativePath.replace(/\//g, "\\");

      // 拼接完整路径
      const fullPath = `${normalizedBase}\\${normalizedRelative}`;

      // 使用 Tauri v2 的 convertFileSrc
      return convertFileSrc(fullPath, "asset");
    } catch (error) {
      console.error("转换资产 URL 失败:", error, relativePath);
      return "";
    }
  },
  /**
   * 获取资产的显示 URL (异步获取 Blob URL)
   */
  getAssetUrl: async (asset: Asset, useThumbnail = false): Promise<string> => {
    try {
      const path = useThumbnail && asset.thumbnailPath ? asset.thumbnailPath : asset.path;

      // 获取二进制数据
      const bytes = await invoke<number[]>("get_asset_binary", {
        relativePath: path,
      });

      // 转换为 Uint8Array
      const uint8Array = new Uint8Array(bytes);

      // 创建 Blob
      const blob = new Blob([uint8Array], { type: asset.mimeType });

      // 创建 Blob URL
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error("获取资产 URL 失败:", error, asset);
      return "";
    }
  },

  /**
   * 根据资产类型获取图标
   */
  getAssetIcon: (asset: Asset): string => {
    switch (asset.type) {
      case "image":
        return "🖼️"; // 对于图片，返回 emoji，URL 由调用方单独获取
      case "audio":
        return "🎵";
      case "video":
        return "🎬";
      case "document":
        return "📄";
      default:
        return "📎";
    }
  },

  /**
   * 格式化文件大小
   */
  formatFileSize: (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(2))} ${units[i]}`;
  },

  /**
   * @deprecated Use listAssetsPaginated instead.
   * 列出所有已导入的资产
   */
  listAllAssets: async (): Promise<Asset[]> => {
    return await invoke<Asset[]>("list_all_assets");
  },

  /**
   * 分页、筛选和排序资产
   */
  listAssetsPaginated: async (
    payload: ListAssetsPaginatedPayload
  ): Promise<PaginatedAssetsResponse> => {
    return await invoke<PaginatedAssetsResponse>("list_assets_paginated", { payload });
  },

  /**
   * 获取资产统计信息
   */
  getAssetStats: async (): Promise<AssetStats> => {
    return await invoke<AssetStats>("get_asset_stats");
  },

  /**
   * 重建哈希索引 (用于查重)
   */
  rebuildHashIndex: async (): Promise<string> => {
    return await invoke<string>("rebuild_hash_index");
  },

  /**
   * 重建前端查询用的 Catalog 索引
   */
  rebuildCatalogIndex: async (): Promise<string> => {
    return await invoke<string>("rebuild_catalog_index");
  },
};

/**
 * 资产管理 Composable
 *
 * 为 Vue 组件提供响应式的资产管理状态和方法。
 * 它使用 assetManagerEngine 来执行核心操作，并管理一个本地的、响应式的资产列表。
 */
export function useAssetManager() {
  // 状态管理
  const isLoading = ref(false);
  const isAppending = ref(false); // 用于加载更多
  const error = ref<string | null>(null);
  const assets = ref<Asset[]>([]);
  const rebuildProgress = ref({ current: 0, total: 0, currentType: "" });
  let unlistenRebuildProgress: (() => void) | null = null;
  let unlistenCatalogRebuildProgress: (() => void) | null = null;

  // 分页状态
  const currentPage = ref(1);
  const totalPages = ref(0);
  const hasMore = ref(false);
  const totalItems = ref(0);

  // 统计状态
  const assetStats = ref<AssetStats>({
    totalAssets: 0,
    totalSize: 0,
    typeCounts: { image: 0, video: 0, audio: 0, document: 0, other: 0 },
  });

  // --- 方法 ---

  const handleError = (err: unknown, message: string) => {
    const errorMsg = `${message}: ${err instanceof Error ? err.message : String(err)}`;
    error.value = errorMsg;
    throw new Error(errorMsg);
  };

  const withLoading = async <T>(promise: Promise<T>, append = false): Promise<T> => {
    if (append) {
      isAppending.value = true;
    } else {
      isLoading.value = true;
    }
    error.value = null;
    try {
      return await promise;
    } finally {
      if (append) {
        isAppending.value = false;
      } else {
        isLoading.value = false;
      }
    }
  };

  /**
   * 分页加载资产
   */
  const loadAssetsPaginated = async (payload: ListAssetsPaginatedPayload, append = false) => {
    try {
      // 准备要发送到后端的载荷
      const backendPayload: any = { ...payload };

      if (backendPayload.filterType === "all") {
        delete backendPayload.filterType;
      }
      if (backendPayload.filterOrigin === "all") {
        delete backendPayload.filterOrigin;
      }

      const promise = assetManagerEngine.listAssetsPaginated(backendPayload);
      const response = await withLoading(promise, append);

      if (append) {
        assets.value.push(...response.items);
      } else {
        assets.value = response.items;
      }

      currentPage.value = response.page;
      totalPages.value = response.totalPages;
      hasMore.value = response.hasMore;
      totalItems.value = response.totalItems;
    } catch (err) {
      handleError(err, "加载资产列表失败");
    }
  };

  /**
   * 获取资产统计信息
   */
  const fetchAssetStats = async () => {
    try {
      assetStats.value = await assetManagerEngine.getAssetStats();
    } catch (err) {
      handleError(err, "获取资产统计信息失败");
    }
  };

  /**
   * 导入后刷新
   * @param newAsset
   */
  const handlePostImport = async (newAsset: Asset) => {
    // 导入成功后，重新获取统计信息，并将新资产添加到列表顶部
    await fetchAssetStats();
    assets.value.unshift(newAsset);
    totalItems.value++;
  };

  /**
   * 从文件路径导入资产，并更新响应式列表
   */
  const importAssetFromPath = async (
    originalPath: string,
    options?: AssetImportOptions
  ): Promise<Asset> => {
    try {
      const promise = assetManagerEngine.importAssetFromPath(originalPath, options);
      const asset = await withLoading(promise);
      await handlePostImport(asset);
      return asset;
    } catch (err) {
      handleError(err, "导入资产失败");
      // @ts-ignore
      return Promise.reject(err);
    }
  };

  /**
   * 批量导入资产
   */
  const importMultipleAssets = async (
    paths: string[],
    options?: AssetImportOptions
  ): Promise<Asset[]> => {
    // 批量导入时，只在最后刷新一次列表和统计
    const importedAssets: Asset[] = [];
    isLoading.value = true;
    for (const path of paths) {
      try {
        const asset = await assetManagerEngine.importAssetFromPath(path, options);
        importedAssets.push(asset);
      } catch (err) {
        console.error(`导入文件 ${path} 失败:`, err);
      }
    }
    isLoading.value = false;

    // 如果有任何文件导入成功，则刷新
    if (importedAssets.length > 0) {
      await fetchAssetStats();
      // 这里可以触发一次列表重载，或者将新文件添加到顶部
      // 为简单起见，暂时不重载整个列表，依赖用户手动刷新或下次筛选
    }
    return importedAssets;
  };

  /**
   * 从字节数据导入资产
   */
  const importAssetFromBytes = async (
    bytes: ArrayBuffer,
    originalName: string,
    options?: AssetImportOptions
  ): Promise<Asset> => {
    try {
      const promise = assetManagerEngine.importAssetFromBytes(bytes, originalName, options);
      const asset = await withLoading(promise);
      await handlePostImport(asset);
      return asset;
    } catch (err) {
      handleError(err, "导入字节数据失败");
      // @ts-ignore
      return Promise.reject(err);
    }
  };

  /**
   * 从剪贴板导入图片
   */
  const importAssetFromClipboard = async (options?: AssetImportOptions): Promise<Asset> => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            const arrayBuffer = await blob.arrayBuffer();
            const extension = type.split("/")[1] || "png";
            const fileName = `clipboard-image-${Date.now()}.${extension}`;
            const importOptions: AssetImportOptions = {
              ...options,
              origin: { type: "clipboard", source: "clipboard" },
            };
            return await importAssetFromBytes(arrayBuffer, fileName, importOptions);
          }
        }
      }
      throw new Error("剪贴板中没有找到图片");
    } catch (err) {
      return handleError(err, "从剪贴板导入失败");
    }
  };

  /**
   * 重建前端查询用的 Catalog 索引
   */
  const rebuildCatalogIndex = async (): Promise<string> => {
    // 开始监听进度事件
    if (!unlistenCatalogRebuildProgress) {
      const unlisten = await listen<{ current: number; total: number; currentType: string }>(
        "rebuild-catalog-progress",
        (event) => {
          rebuildProgress.value = event.payload;
        }
      );
      unlistenCatalogRebuildProgress = unlisten;
    }

    rebuildProgress.value = { current: 0, total: 0, currentType: "starting..." };
    try {
      const promise = assetManagerEngine.rebuildCatalogIndex();
      const result = await withLoading(promise);
      await fetchAssetStats(); // 重建后刷新统计信息
      // 可以在这里触发一次列表刷新
      return result;
    } catch (err) {
      return handleError(err, "重建目录索引失败");
    } finally {
      // 停止监听并重置进度
      if (unlistenCatalogRebuildProgress) {
        unlistenCatalogRebuildProgress();
        unlistenCatalogRebuildProgress = null;
      }
      rebuildProgress.value = { current: 0, total: 0, currentType: "" };
    }
  };

  /**
   * 重建用于查重的哈希索引
   */
  const rebuildHashIndex = async (): Promise<string> => {
    // 开始监听进度事件
    if (!unlistenRebuildProgress) {
      const unlisten = await listen<{ current: number; total: number; currentType: string }>(
        "rebuild-index-progress",
        (event) => {
          rebuildProgress.value = event.payload;
        }
      );
      unlistenRebuildProgress = unlisten;
    }

    rebuildProgress.value = { current: 0, total: 0, currentType: "starting..." };
    try {
      const promise = assetManagerEngine.rebuildHashIndex();
      return await withLoading(promise);
    } catch (err) {
      return handleError(err, "重建哈希索引失败");
    } finally {
      // 停止监听并重置进度
      if (unlistenRebuildProgress) {
        unlistenRebuildProgress();
        unlistenRebuildProgress = null;
      }
      rebuildProgress.value = { current: 0, total: 0, currentType: "" };
    }
  };

  // 组件卸载时确保取消监听
  onUnmounted(() => {
    if (unlistenRebuildProgress) {
      unlistenRebuildProgress();
    }
    if (unlistenCatalogRebuildProgress) {
      unlistenCatalogRebuildProgress();
    }
  });

  /**
   * 删除指定资产（移动到回收站）
   */
  const deleteAsset = async (assetId: string): Promise<void> => {
    try {
      const asset = assets.value.find((a) => a.id === assetId);
      if (!asset) {
        throw new Error("资产不存在");
      }

      await invoke("delete_asset", {
        assetId: asset.id,
        relativePath: asset.path,
      });

      const index = assets.value.findIndex((a) => a.id === assetId);
      if (index !== -1) {
        assets.value.splice(index, 1);
      }
      // 删除后更新统计信息
      await fetchAssetStats();
      totalItems.value--;
    } catch (err) {
      handleError(err, "删除资产失败");
    }
  };

  /**
   * 批量删除资产
   */
  const deleteMultipleAssets = async (assetIds: string[]): Promise<void> => {
    await withLoading(Promise.all(assetIds.map((id) => deleteAsset(id))));
  };

  /**
   * 移除指定资产（仅从本地列表移除，不删除文件）
   * @deprecated 请使用 deleteAsset 代替
   */
  const removeAsset = (assetId: string): void => {
    const index = assets.value.findIndex((asset) => asset.id === assetId);
    if (index !== -1) {
      assets.value.splice(index, 1);
    }
  };

  // --- 计算属性 ---
  // 大部分计算属性已移除，因为筛选和统计由后端处理
  const totalAssets = computed(() => assetStats.value.totalAssets);
  const totalSize = computed(() => assetStats.value.totalSize);

  return {
    // 状态
    isLoading,
    isAppending,
    error,
    assets,
    rebuildProgress,
    assetStats,

    // 分页状态
    currentPage,
    totalPages,
    hasMore,
    totalItems,

    // 计算属性
    totalAssets,
    totalSize,

    // 方法 - 直接从 engine 暴露，因为它们是无状态的
    getAssetBasePath: assetManagerEngine.getAssetBasePath,
    getAssetBinary: assetManagerEngine.getAssetBinary,
    getAssetUrl: assetManagerEngine.getAssetUrl,
    getAssetIcon: assetManagerEngine.getAssetIcon,
    formatFileSize: assetManagerEngine.formatFileSize,

    // 方法 - 包装了状态管理
    loadAssetsPaginated,
    fetchAssetStats,
    importAssetFromPath,
    importMultipleAssets,
    importAssetFromBytes,
    importAssetFromClipboard,
    deleteAsset,
    deleteMultipleAssets,
    removeAsset, // 保持 deprecated 方法
    rebuildHashIndex,
    rebuildCatalogIndex,
  };
}

/**
 * 资产管理相关的工具函数
 */
export const assetUtils = {
  /**
   * 检查文件是否为支持的图片格式
   */
  isImageFile: (fileName: string): boolean => {
    const imageExtensions = [
      "jpg",
      "jpeg",
      "png",
      "gif",
      "webp",
      "svg",
      "bmp",
      "ico",
      "tiff",
      "avif",
    ];
    const ext = fileName.split(".").pop()?.toLowerCase();
    return ext ? imageExtensions.includes(ext) : false;
  },

  /**
   * 检查文件是否为支持的音频格式
   */
  isAudioFile: (fileName: string): boolean => {
    const audioExtensions = ["mp3", "wav", "ogg", "flac", "aac", "m4a"];
    const ext = fileName.split(".").pop()?.toLowerCase();
    return ext ? audioExtensions.includes(ext) : false;
  },

  /**
   * 检查文件是否为支持的视频格式
   */
  isVideoFile: (fileName: string): boolean => {
    const videoExtensions = ["mp4", "webm", "avi", "mov", "mkv", "flv"];
    const ext = fileName.split(".").pop()?.toLowerCase();
    return ext ? videoExtensions.includes(ext) : false;
  },

  /**
   * 检查文件是否为支持的文档格式
   */
  isDocumentFile: (fileName: string): boolean => {
    const documentExtensions = [
      "pdf",
      "doc",
      "docx",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "txt",
      "md",
      "json",
      "xml",
      "html",
      "css",
      "js",
      "ts",
    ];
    const ext = fileName.split(".").pop()?.toLowerCase();
    return ext ? documentExtensions.includes(ext) : false;
  },

  /**
   * 根据文件名推断资产类型
   */
  inferAssetType: (fileName: string): AssetType => {
    if (assetUtils.isImageFile(fileName)) return "image";
    if (assetUtils.isAudioFile(fileName)) return "audio";
    if (assetUtils.isVideoFile(fileName)) return "video";
    if (assetUtils.isDocumentFile(fileName)) return "document";
    return "other";
  },

  /**
   * 生成默认的导入选项
   */
  createDefaultImportOptions: (overrides?: Partial<AssetImportOptions>): AssetImportOptions => {
    return {
      generateThumbnail: true,
      enableDeduplication: true,
      ...overrides,
    };
  },
};

export type { Asset, AssetImportOptions, AssetType, AssetOrigin, AssetMetadata };
