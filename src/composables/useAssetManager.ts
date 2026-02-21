import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, emit } from "@tauri-apps/api/event";
import { ref, computed, onUnmounted } from "vue";
import { createModuleLogger } from "@/utils/logger";
import type {
  Asset,
  AssetImportOptions,
  AssetType,
  AssetOrigin,
  AssetMetadata,
  ListAssetsPaginatedPayload,
  PaginatedAssetsResponse,
  AssetStats,
  AssetSidecarAction,
} from "@/types/asset-management";
import { toolRegistryManager } from "@/services/registry";

// 缓存资产根目录，避免重复 IPC 调用
let _cachedBasePath: string | null = null;

// 动态注册的附属操作
const _registeredSidecarActions = ref<AssetSidecarAction[]>([]);
let _isActionsInitialized = false;

/**
 * 重置资产根目录的缓存。
 * 当用户在设置中更改了资产路径时，需要调用此函数。
 */
export function resetAssetBasePathCache() {
  _cachedBasePath = null;
}

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
    if (_cachedBasePath) return _cachedBasePath;
    _cachedBasePath = await invoke<string>("get_asset_base_path");
    return _cachedBasePath;
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
      bytes: uint8Array,
      originalName,
      options,
    });
  },

  /**
   * 获取资产的二进制数据
   * 注意：对于大文件（>10MB），此方法由于 Tauri 的 JSON 序列化限制（Vec<u8> 转数组）会非常慢且阻塞主线程。
   * 建议优先使用 getAssetBase64。
   */
  getAssetBinary: async (relativePath: string): Promise<ArrayBuffer> => {
    const bytes = await invoke<number[]>("get_asset_binary", {
      relativePath,
    });
    return new Uint8Array(bytes).buffer;
  },

  /**
   * 获取资产的 Base64 编码数据
   * 相比 getAssetBinary，此方法在 Rust 侧直接转换，避免了巨大的 JSON 数字数组传输，效率更高。
   */
  getAssetBase64: async (relativePath: string): Promise<string> => {
    return await invoke<string>("get_asset_base64", {
      relativePath,
    });
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
   * 获取资产的显示 URL
   * 对于缩略图，使用 Blob URL 以便缓存和快速显示
   * 对于原图/视频，优先使用 asset:// 协议以支持流式加载和避免内存阻塞
   */
  getAssetUrl: async (asset: Asset, useThumbnail = false): Promise<string> => {
    try {
      if (useThumbnail && asset.thumbnailPath) {
        // 获取缩略图二进制数据 (缩略图通常较小，适合 Blob)
        const bytes = await invoke<number[]>("get_asset_binary", {
          relativePath: asset.thumbnailPath,
        });
        const uint8Array = new Uint8Array(bytes);
        const blob = new Blob([uint8Array], { type: "image/jpeg" }); // 缩略图通常是 JPEG
        return URL.createObjectURL(blob);
      } else {
        // 获取原始文件，使用 asset:// 协议
        const basePath = await assetManagerEngine.getAssetBasePath();
        return assetManagerEngine.convertToAssetProtocol(asset.path, basePath);
      }
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
   * 为现有资产添加一个来源
   */
  addAssetSource: async (assetId: string, origin: AssetOrigin): Promise<Asset> => {
    return await invoke<Asset>("add_asset_source", { assetId, origin });
  },

  /**
   * 从资产中移除一个来源。如果这是最后一个来源，资产将被删除。
   * @returns {Promise<{deleted: boolean, asset: Asset | null}>} 返回操作结果，如果资产被删除，asset为null
   */
  removeAssetSource: async (
    assetId: string,
    sourceModule: string
  ): Promise<{ deleted: boolean; asset: Asset | null }> => {
    return await invoke<{ deleted: boolean; asset: Asset | null }>("remove_asset_source", {
      assetId,
      sourceModule,
    });
  },

  /**
   * 完全删除资产（移除所有来源并删除文件）
   */
  removeAssetCompletely: async (assetId: string): Promise<void> => {
    return await invoke<void>("remove_asset_completely", { assetId });
  },

  /**
   * 根据 ID 获取单个资产
   */
  getAssetById: async (assetId: string): Promise<Asset | null> => {
    return await invoke<Asset | null>("get_asset_by_id", { assetId });
  },

  /**
   * 批量完全删除资产（移除所有来源并删除文件）
   * @returns {Promise<string[]>} 返回删除失败的资产 ID 列表
   */
  removeAssetsCompletely: async (assetIds: string[]): Promise<string[]> => {
    return await invoke<string[]>("remove_assets_completely", { assetIds });
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

  /**
   * 保存资产缩略图
   * @param assetId 资产 ID
   * @param base64Data Base64 编码的图片数据
   */
  saveAssetThumbnail: async (assetId: string, base64Data: string): Promise<Asset> => {
    return await invoke<Asset>("save_asset_thumbnail", {
      assetId,
      base64Data,
    });
  },

  /**
   * 初始化并收集所有工具提供的附属操作
   */
  initializeSidecarActions: () => {
    if (_isActionsInitialized) return;

    const tools = toolRegistryManager.getAllTools();
    for (const tool of tools) {
      if (tool.getAssetSidecarActions) {
        const actions = tool.getAssetSidecarActions();
        actions.forEach((action) => {
          if (!_registeredSidecarActions.value.some((a) => a.id === action.id)) {
            _registeredSidecarActions.value.push(action);
          }
        });
      }
    }
    _isActionsInitialized = true;
  },

  /**
   * 注册一个新的附属操作
   */
  registerSidecarAction: (action: AssetSidecarAction) => {
    if (!_registeredSidecarActions.value.some((a) => a.id === action.id)) {
      _registeredSidecarActions.value.push(action);
    }
  },

  /**
   * 获取资产的附属操作列表
   */
  getSidecarActions: (asset: Asset): AssetSidecarAction[] => {
    // 确保已从 Registry 收集
    assetManagerEngine.initializeSidecarActions();

    return _registeredSidecarActions.value
      .filter((action) => action.isVisible(asset))
      .sort((a, b) => (a.order || 0) - (b.order || 0));
  },
};

const logger = createModuleLogger("useAssetManager");

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
    sourceModuleCounts: {},
    originCounts: { local: 0, clipboard: 0, network: 0, generated: 0 },
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
      if (backendPayload.filterSourceModule === "all") {
        delete backendPayload.filterSourceModule;
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
      const stats = await assetManagerEngine.getAssetStats();
      assetStats.value = stats;

      // 记录统计信息
      const moduleCount = Object.keys(stats.sourceModuleCounts || {}).length;
      const moduleCounts = stats.sourceModuleCounts || {};

      logger.info("资产统计已更新", {
        totalAssets: stats.totalAssets,
        totalSize: assetManagerEngine.formatFileSize(stats.totalSize),
        sourceModuleCount: moduleCount,
        rawSourceModuleCounts: moduleCounts,
      });

      if (moduleCount > 0) {
        logger.debug("来源模块分布", { moduleCounts });
      } else {
        logger.warn("未找到任何来源模块统计数据", {
          hint: "可能需要重建 Catalog 索引或检查资产的 origins 数据",
          rawStats: stats,
        });
      }
    } catch (err) {
      handleError(err, "获取资产统计信息失败");
    }
  };

  /**
   * 导入后刷新
   * @param updatedOrNewAsset
   */
  const handlePostImport = async (updatedOrNewAsset: Asset) => {
    // 检查资产是否已存在于列表中
    const existingAssetIndex = assets.value.findIndex((a) => a.id === updatedOrNewAsset.id);

    if (existingAssetIndex !== -1) {
      // 如果存在，说明是为现有资产添加了新来源，更新它
      assets.value.splice(existingAssetIndex, 1, updatedOrNewAsset);
    } else {
      // 如果不存在，是新资产，添加到列表顶部
      assets.value.unshift(updatedOrNewAsset);
      totalItems.value++;
    }
    // 导入成功后，重新获取统计信息
    await fetchAssetStats();

    // 发射全局事件，通知其他模块（如转写管理器）
    emit("asset-imported", updatedOrNewAsset).catch((err) => {
      logger.error("发射 asset-imported 事件失败", err);
    });
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
              origin: {
                type: "clipboard",
                source: "clipboard",
                sourceModule: options?.sourceModule || options?.origin?.sourceModule || "unknown",
              },
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
   * 从资产中移除指定来源（供业务模块使用）
   *
   * 这是业务模块（如 LLM Chat、Smart OCR）删除附件时应该调用的方法。
   * 后端会自动判断：如果移除来源后资产没有任何来源在使用，则自动删除物理文件。
   *
   * @param assetId 资产 ID
   * @param sourceModule 来源模块标识（如 'llm-chat', 'smart-ocr'）
   *
   * @example
   * // LLM Chat 删除附件时
   * await removeSourceFromAsset(attachment.id, 'llm-chat');
   */
  const removeSourceFromAsset = async (assetId: string, sourceModule: string): Promise<void> => {
    try {
      const result = await assetManagerEngine.removeAssetSource(assetId, sourceModule);

      const index = assets.value.findIndex((a) => a.id === assetId);
      if (index === -1) return; // Not in the current list, do nothing

      if (result.deleted) {
        // 资产被完全删除（不再有任何来源）
        assets.value.splice(index, 1);
        totalItems.value--;
        await fetchAssetStats(); // Update stats
      } else if (result.asset) {
        // 资产已更新（来源已移除，但仍有其他来源）
        assets.value.splice(index, 1, result.asset);
      }
    } catch (err) {
      handleError(err, "移除资产来源失败");
    }
  };

  /**
   * 完全删除资产（供资产管理器使用）
   *
   * 这个方法会移除所有来源并删除物理文件，主要供资产管理器工具使用。
   * 业务模块应该使用 removeSourceFromAsset 而不是这个方法。
   *
   * @param assetId 资产 ID
   *
   * @example
   * // 资产管理器中删除资产
   * await deleteAssetCompletely(asset.id);
   */
  const deleteAssetCompletely = async (assetId: string): Promise<void> => {
    try {
      await assetManagerEngine.removeAssetCompletely(assetId);

      const index = assets.value.findIndex((a) => a.id === assetId);
      if (index !== -1) {
        assets.value.splice(index, 1);
        totalItems.value--;
        await fetchAssetStats();
      }
    } catch (err) {
      handleError(err, "删除资产失败");
    }
  };

  /**
   * 批量移除资产来源（供业务模块使用）
   *
   * @param assetIds 资产 ID 列表
   * @param sourceModule 来源模块标识
   */
  const removeSourceFromAssets = async (assetIds: string[], sourceModule: string): Promise<void> => {
    await withLoading(Promise.all(assetIds.map((id) => removeSourceFromAsset(id, sourceModule))));
  };

  /**
   * 批量完全删除资产（供资产管理器使用）
   *
   * @param assetIds 资产 ID 列表
   * @returns 删除失败的资产 ID 列表
   */
  const deleteAssetsCompletely = async (assetIds: string[]): Promise<string[]> => {
    try {
      const failedIds = await assetManagerEngine.removeAssetsCompletely(assetIds);

      // 从本地列表中移除成功删除的资产
      const successIds = assetIds.filter(id => !failedIds.includes(id));
      assets.value = assets.value.filter(a => !successIds.includes(a.id));
      totalItems.value -= successIds.length;

      await fetchAssetStats();
      return failedIds;
    } catch (err) {
      handleError(err, "批量删除资产失败");
      return assetIds; // All failed
    }
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
    getAssetById: assetManagerEngine.getAssetById,
    getAssetBasePath: assetManagerEngine.getAssetBasePath,
    convertToAssetProtocol: assetManagerEngine.convertToAssetProtocol,
    getAssetBinary: assetManagerEngine.getAssetBinary,
    getAssetBase64: assetManagerEngine.getAssetBase64,
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

    // 删除方法 - 业务模块应使用 removeSourceFromAsset
    removeSourceFromAsset,
    removeSourceFromAssets,

    // 删除方法 - 资产管理器使用
    deleteAssetCompletely,
    deleteAssetsCompletely,

    // Deprecated 方法
    removeAsset, // @deprecated 直接操作本地列表，不推荐使用

    rebuildHashIndex,
    rebuildCatalogIndex,
    saveAssetThumbnail: assetManagerEngine.saveAssetThumbnail,
    getSidecarActions: assetManagerEngine.getSidecarActions,
    registerSidecarAction: assetManagerEngine.registerSidecarAction,
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
