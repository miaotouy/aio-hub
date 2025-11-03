import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import { ref, computed } from 'vue';
import type {
  Asset,
  AssetImportOptions,
  AssetType,
  AssetOrigin,
  AssetMetadata
} from '@/types/asset-management';

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
    return await invoke<string>('get_asset_base_path');
  },

  /**
   * 从文件路径导入资产
   */
  importAssetFromPath: async (
    originalPath: string,
    options?: AssetImportOptions
  ): Promise<Asset> => {
    return await invoke<Asset>('import_asset_from_path', {
      originalPath,
      options
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
    return await invoke<Asset>('import_asset_from_bytes', {
      bytes: Array.from(uint8Array),
      originalName,
      options
    });
  },

  /**
   * 获取资产的二进制数据
   */
  getAssetBinary: async (relativePath: string): Promise<ArrayBuffer> => {
    const bytes = await invoke<number[]>('get_asset_binary', {
      relativePath
    });
    return new Uint8Array(bytes).buffer;
  },

  /**
   /**
    * 将资产路径转换为可用的 URL（同步版本）
    * @param relativePath 相对于资产根目录的路径
    * @param basePath 资产根目录的绝对路径（必需）
    */
   convertToAssetProtocol: (relativePath: string, basePath: string): string => {
     try {
       // 标准化路径分隔符为反斜杠（Windows）
       const normalizedBase = basePath.replace(/\//g, '\\');
       const normalizedRelative = relativePath.replace(/\//g, '\\');
       
       // 拼接完整路径
       const fullPath = `${normalizedBase}\\${normalizedRelative}`;
       
       // 使用 Tauri v2 的 convertFileSrc
       return convertFileSrc(fullPath, 'asset');
     } catch (error) {
       console.error('转换资产 URL 失败:', error, relativePath);
       return '';
     }
   },
  /**
   * 获取资产的显示 URL (异步获取 Blob URL)
   */
  getAssetUrl: async (asset: Asset, useThumbnail = false): Promise<string> => {
    try {
      const path = useThumbnail && asset.thumbnailPath ? asset.thumbnailPath : asset.path;
      
      // 获取二进制数据
      const bytes = await invoke<number[]>('get_asset_binary', {
        relativePath: path,
      });
      
      // 转换为 Uint8Array
      const uint8Array = new Uint8Array(bytes);
      
      // 创建 Blob
      const blob = new Blob([uint8Array], { type: asset.mimeType });
      
      // 创建 Blob URL
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('获取资产 URL 失败:', error, asset);
      return '';
    }
  },

  /**
   * 根据资产类型获取图标
   */
  getAssetIcon: (asset: Asset): string => {
    switch (asset.type) {
      case 'image':
        return '🖼️'; // 对于图片，返回 emoji，URL 由调用方单独获取
      case 'audio':
        return '🎵';
      case 'video':
        return '🎬';
      case 'document':
        return '📄';
      default:
        return '📎';
    }
  },

  /**
   * 格式化文件大小
   */
  formatFileSize: (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  },

  /**
   * 列出所有已导入的资产
   */
  listAllAssets: async (): Promise<Asset[]> => {
    return await invoke<Asset[]>('list_all_assets');
  }
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
  const error = ref<string | null>(null);
  const assets = ref<Asset[]>([]);

  // --- 方法 ---

  const handleError = (err: unknown, message: string) => {
    const errorMsg = `${message}: ${err instanceof Error ? err.message : String(err)}`;
    error.value = errorMsg;
    throw new Error(errorMsg);
  };

  const withLoading = async <T>(promise: Promise<T>): Promise<T> => {
    isLoading.value = true;
    error.value = null;
    try {
      return await promise;
    } finally {
      isLoading.value = false;
    }
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
      assets.value.push(asset);
      return asset;
    } catch (err) {
      handleError(err, '导入资产失败');
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
    return await withLoading(
      Promise.all(paths.map(path => importAssetFromPath(path, options)))
    );
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
      assets.value.push(asset);
      return asset;
    } catch (err) {
      handleError(err, '导入字节数据失败');
      // @ts-ignore
      return Promise.reject(err);
    }
  };

  /**
   * 从剪贴板导入图片
   */
  const importAssetFromClipboard = async (
    options?: AssetImportOptions
  ): Promise<Asset> => {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const arrayBuffer = await blob.arrayBuffer();
            const extension = type.split('/')[1] || 'png';
            const fileName = `clipboard-image-${Date.now()}.${extension}`;
            const importOptions: AssetImportOptions = {
              ...options,
              origin: { type: 'clipboard', source: 'clipboard' }
            };
            return await importAssetFromBytes(arrayBuffer, fileName, importOptions);
          }
        }
      }
      throw new Error('剪贴板中没有找到图片');
    } catch (err) {
      return handleError(err, '从剪贴板导入失败');
    }
  };

  /**
   * 根据类型过滤资产
   */
  const getAssetsByType = (type: AssetType): Asset[] => {
    return assets.value.filter(asset => asset.type === type);
  };

  /**
   * 根据来源过滤资产
   */
  const getAssetsByOrigin = (originType: AssetOrigin['type']): Asset[] => {
    return assets.value.filter(asset => asset.origin?.type === originType);
  };

  /**
   * 搜索资产
   */
  const searchAssets = (query: string): Asset[] => {
    if (!query.trim()) return assets.value;
    const lowerQuery = query.toLowerCase();
    return assets.value.filter(asset =>
      asset.name.toLowerCase().includes(lowerQuery) ||
      asset.mimeType.toLowerCase().includes(lowerQuery)
    );
  };

  /**
   * 清空本地资产列表
   */
  const clearAssets = (): void => {
    assets.value = [];
  };

  /**
   * 从后端加载所有资产
   */
  const loadAssets = async (): Promise<void> => {
    try {
      const promise = assetManagerEngine.listAllAssets();
      const loadedAssets = await withLoading(promise);
      assets.value = loadedAssets;
    } catch (err) {
      handleError(err, '加载资产列表失败');
    }
  };

  /**
   * 移除指定资产
   */
  const removeAsset = (assetId: string): void => {
    const index = assets.value.findIndex(asset => asset.id === assetId);
    if (index !== -1) {
      assets.value.splice(index, 1);
    }
  };

  // --- 计算属性 ---
  const imageAssets = computed(() => getAssetsByType('image'));
  const videoAssets = computed(() => getAssetsByType('video'));
  const audioAssets = computed(() => getAssetsByType('audio'));
  const documentAssets = computed(() => getAssetsByType('document'));
  const otherAssets = computed(() => getAssetsByType('other'));

  const localAssets = computed(() => getAssetsByOrigin('local'));
  const clipboardAssets = computed(() => getAssetsByOrigin('clipboard'));
  const networkAssets = computed(() => getAssetsByOrigin('network'));

  const totalAssets = computed(() => assets.value.length);
  const totalSize = computed(() =>
    assets.value.reduce((sum, asset) => sum + asset.size, 0)
  );

  return {
    // 状态
    isLoading,
    error,
    assets,

    // 计算属性
    imageAssets,
    videoAssets,
    audioAssets,
    documentAssets,
    otherAssets,
    localAssets,
    clipboardAssets,
    networkAssets,
    totalAssets,
    totalSize,

    // 方法 - 直接从 engine 暴露，因为它们是无状态的
    getAssetBasePath: assetManagerEngine.getAssetBasePath,
    getAssetBinary: assetManagerEngine.getAssetBinary,
    getAssetUrl: assetManagerEngine.getAssetUrl,
    getAssetIcon: assetManagerEngine.getAssetIcon,
    formatFileSize: assetManagerEngine.formatFileSize,

    // 方法 - 包装了状态管理
    loadAssets,
    importAssetFromPath,
    importMultipleAssets,
    importAssetFromBytes,
    importAssetFromClipboard,
    getAssetsByType,
    getAssetsByOrigin,
    searchAssets,
    clearAssets,
    removeAsset
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
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'avif'];
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext ? imageExtensions.includes(ext) : false;
  },

  /**
   * 检查文件是否为支持的音频格式
   */
  isAudioFile: (fileName: string): boolean => {
    const audioExtensions = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'];
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext ? audioExtensions.includes(ext) : false;
  },

  /**
   * 检查文件是否为支持的视频格式
   */
  isVideoFile: (fileName: string): boolean => {
    const videoExtensions = ['mp4', 'webm', 'avi', 'mov', 'mkv', 'flv'];
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext ? videoExtensions.includes(ext) : false;
  },

  /**
   * 检查文件是否为支持的文档格式
   */
  isDocumentFile: (fileName: string): boolean => {
    const documentExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'json', 'xml', 'html', 'css', 'js', 'ts'];
    const ext = fileName.split('.').pop()?.toLowerCase();
    return ext ? documentExtensions.includes(ext) : false;
  },

  /**
   * 根据文件名推断资产类型
   */
  inferAssetType: (fileName: string): AssetType => {
    if (assetUtils.isImageFile(fileName)) return 'image';
    if (assetUtils.isAudioFile(fileName)) return 'audio';
    if (assetUtils.isVideoFile(fileName)) return 'video';
    if (assetUtils.isDocumentFile(fileName)) return 'document';
    return 'other';
  },

  /**
   * 生成默认的导入选项
   */
  createDefaultImportOptions: (overrides?: Partial<AssetImportOptions>): AssetImportOptions => {
    return {
      generateThumbnail: true,
      enableDeduplication: true,
      ...overrides
    };
  }
};

export type { Asset, AssetImportOptions, AssetType, AssetOrigin, AssetMetadata };