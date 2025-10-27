import { invoke } from '@tauri-apps/api/core';
import { ref, computed } from 'vue';
import type { 
  Asset, 
  AssetImportOptions, 
  AssetType, 
  AssetOrigin,
  AssetMetadata 
} from '@/types/asset-management';

/**
 * 资产管理 Composable
 * 
 * 提供统一的资产管理接口，包括导入、读取和协议转换功能
 */
export function useAssetManager() {
  // 状态管理
  const isLoading = ref(false);
  const error = ref<string | null>(null);
  const assets = ref<Asset[]>([]);

  /**
   * 获取资产存储根目录
   */
  const getAssetBasePath = async (): Promise<string> => {
    try {
      const path = await invoke<string>('get_asset_base_path');
      return path;
    } catch (err) {
      const errorMsg = `获取资产根目录失败: ${err}`;
      error.value = errorMsg;
      throw new Error(errorMsg);
    }
  };

  /**
   * 从文件路径导入资产
   * @param originalPath 原始文件路径
   * @param options 导入选项
   * @returns 导入的资产对象
   */
  const importAssetFromPath = async (
    originalPath: string,
    options?: AssetImportOptions
  ): Promise<Asset> => {
    isLoading.value = true;
    error.value = null;

    try {
      const asset = await invoke<Asset>('import_asset_from_path', {
        originalPath,
        options
      });
      
      // 添加到本地资产列表
      assets.value.push(asset);
      
      return asset;
    } catch (err) {
      const errorMsg = `导入资产失败: ${err}`;
      error.value = errorMsg;
      throw new Error(errorMsg);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 批量导入资产
   * @param paths 文件路径数组
   * @param options 导入选项
   * @returns 导入的资产对象数组
   */
  const importMultipleAssets = async (
    paths: string[],
    options?: AssetImportOptions
  ): Promise<Asset[]> => {
    isLoading.value = true;
    error.value = null;

    try {
      // 并行导入多个文件
      const importPromises = paths.map(path => 
        importAssetFromPath(path, options)
      );
      
      const importedAssets = await Promise.all(importPromises);
      return importedAssets;
    } catch (err) {
      const errorMsg = `批量导入资产失败: ${err}`;
      error.value = errorMsg;
      throw new Error(errorMsg);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 从字节数据导入资产
   * @param bytes 文件字节数据
   * @param originalName 原始文件名
   * @param options 导入选项
   * @returns 导入的资产对象
   */
  const importAssetFromBytes = async (
    bytes: ArrayBuffer,
    originalName: string,
    options?: AssetImportOptions
  ): Promise<Asset> => {
    isLoading.value = true;
    error.value = null;

    try {
      // 将 ArrayBuffer 转换为 Uint8Array
      const uint8Array = new Uint8Array(bytes);
      
      const asset = await invoke<Asset>('import_asset_from_bytes', {
        bytes: Array.from(uint8Array),
        originalName,
        options
      });
      
      // 添加到本地资产列表
      assets.value.push(asset);
      
      return asset;
    } catch (err) {
      const errorMsg = `导入字节数据失败: ${err}`;
      error.value = errorMsg;
      throw new Error(errorMsg);
    } finally {
      isLoading.value = false;
    }
  };

  /**
   * 从剪贴板导入图片
   * @param options 导入选项
   * @returns 导入的资产对象
   */
  const importAssetFromClipboard = async (
    options?: AssetImportOptions
  ): Promise<Asset> => {
    try {
      // 读取剪贴板图片
      const clipboardItems = await navigator.clipboard.read();
      
      for (const item of clipboardItems) {
        for (const type of item.types) {
          if (type.startsWith('image/')) {
            const blob = await item.getType(type);
            const arrayBuffer = await blob.arrayBuffer();
            
            // 从 MIME 类型推断文件扩展名
            const extension = type.split('/')[1] || 'png';
            const fileName = `clipboard-image-${Date.now()}.${extension}`;
            
            // 设置来源为剪贴板
            const importOptions: AssetImportOptions = {
              ...options,
              origin: {
                type: 'clipboard',
                source: 'clipboard'
              }
            };
            
            return await importAssetFromBytes(arrayBuffer, fileName, importOptions);
          }
        }
      }
      
      throw new Error('剪贴板中没有找到图片');
    } catch (err) {
      const errorMsg = `从剪贴板导入失败: ${err}`;
      error.value = errorMsg;
      throw new Error(errorMsg);
    }
  };

  /**
   * 获取资产的二进制数据
   * @param relativePath 资产的相对路径
   * @returns 文件的 ArrayBuffer
   */
  const getAssetBinary = async (relativePath: string): Promise<ArrayBuffer> => {
    try {
      const bytes = await invoke<number[]>('get_asset_binary', {
        relativePath
      });
      
      // 将数字数组转换为 ArrayBuffer
      return new Uint8Array(bytes).buffer;
    } catch (err) {
      const errorMsg = `读取资产二进制数据失败: ${err}`;
      error.value = errorMsg;
      throw new Error(errorMsg);
    }
  };

  /**
   * 将资产路径转换为 asset:// 协议 URL
   * @param relativePath 资产的相对路径
   * @returns asset:// 协议 URL
   *
   * 注意：此函数的逻辑与后端保持一致，编码所有特殊字符但保留路径分隔符 /
   */
  const convertToAssetProtocol = (relativePath: string): string => {
    try {
      // 编码路径，但保留 / 分隔符（与后端逻辑一致）
      const encoded = encodeURIComponent(relativePath).replace(/%2F/g, '/');
      return `asset://${encoded}`;
    } catch (err) {
      const errorMsg = `转换资产协议失败: ${err}`;
      error.value = errorMsg;
      throw new Error(errorMsg);
    }
  };

  /**
   * 获取资产的显示 URL
   * @param asset 资产对象
   * @param useThumbnail 是否使用缩略图
   * @returns 可用于显示的 URL
   */
  const getAssetUrl = (asset: Asset, useThumbnail = false): string => {
    const path = useThumbnail && asset.thumbnailPath 
      ? asset.thumbnailPath 
      : asset.path;
    return convertToAssetProtocol(path);
  };

  /**
   * 根据资产类型获取图标
   * @param asset 资产对象
   * @returns 图标名称或 URL
   */
  const getAssetIcon = (asset: Asset): string => {
    switch (asset.type) {
      case 'image':
        return getAssetUrl(asset, true); // 使用缩略图
      case 'audio':
        return '🎵';
      case 'video':
        return '🎬';
      case 'document':
        return '📄';
      default:
        return '📎';
    }
  };

  /**
   * 格式化文件大小
   * @param bytes 字节数
   * @returns 格式化的文件大小字符串
   */
  const formatFileSize = (bytes: number): string => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  /**
   * 根据类型过滤资产
   * @param type 资产类型
   * @returns 过滤后的资产列表
   */
  const getAssetsByType = (type: AssetType): Asset[] => {
    return assets.value.filter(asset => asset.type === type);
  };

  /**
   * 根据来源过滤资产
   * @param originType 来源类型
   * @returns 过滤后的资产列表
   */
  const getAssetsByOrigin = (originType: AssetOrigin['type']): Asset[] => {
    return assets.value.filter(asset =>
      asset.origin?.type === originType
    );
  };

  /**
   * 搜索资产
   * @param query 搜索关键词
   * @returns 匹配的资产列表
   */
  const searchAssets = (query: string): Asset[] => {
    if (!query.trim()) {
      return assets.value;
    }
    
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
   * 移除指定资产
   * @param assetId 资产 ID
   */
  const removeAsset = (assetId: string): void => {
    const index = assets.value.findIndex(asset => asset.id === assetId);
    if (index !== -1) {
      assets.value.splice(index, 1);
    }
  };

  // 计算属性
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
    
    // 方法
    getAssetBasePath,
    importAssetFromPath,
    importMultipleAssets,
    importAssetFromBytes,
    importAssetFromClipboard,
    getAssetBinary,
    convertToAssetProtocol,
    getAssetUrl,
    getAssetIcon,
    formatFileSize,
    getAssetsByType,
    getAssetsByOrigin,
    searchAssets,
    clearAssets,
    removeAsset,
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