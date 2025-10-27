import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import type { Asset } from '@/types/asset-management';
import { customMessage } from '@/utils/customMessage';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('AttachmentManager');

export interface AttachmentManagerOptions {
  /** 最大附件数量 */
  maxCount?: number;
  /** 最大单个文件大小（字节） */
  maxFileSize?: number;
  /** 允许的文件类型 */
  allowedTypes?: string[];
  /** 是否自动生成缩略图 */
  generateThumbnail?: boolean;
}

export interface UseAttachmentManagerReturn {
  /** 附件列表 */
  attachments: Readonly<Ref<Asset[]>>;
  /** 是否正在处理 */
  isProcessing: Readonly<Ref<boolean>>;
  /** 添加附件 */
  addAttachments: (paths: string[]) => Promise<void>;
  /** 直接添加已导入的资产 */
  addAsset: (asset: Asset) => boolean;
  /** 移除附件 */
  removeAttachment: (asset: Asset) => void;
  /** 清空附件 */
  clearAttachments: () => void;
  /** 附件数量 */
  count: ComputedRef<number>;
  /** 是否有附件 */
  hasAttachments: ComputedRef<boolean>;
  /** 是否已满 */
  isFull: ComputedRef<boolean>;
}

/**
 * 附件管理 Composable
 * 用于管理消息的附件列表
 */
export function useAttachmentManager(
  options: AttachmentManagerOptions = {}
): UseAttachmentManagerReturn {
  const {
    maxCount = 20,
    maxFileSize = 50 * 1024 * 1024, // 默认 50MB
    allowedTypes = [],
    generateThumbnail = true,
  } = options;

  const attachments = ref<Asset[]>([]);
  const isProcessing = ref(false);

  // 计算属性
  const count = computed(() => attachments.value.length);
  const hasAttachments = computed(() => attachments.value.length > 0);
  const isFull = computed(() => attachments.value.length >= maxCount);

  /**
   * 验证文件
   */
  const validateFile = async (path: string): Promise<boolean> => {
    try {
      // 检查文件是否存在
      const exists = await invoke<boolean>('path_exists', { path });
      if (!exists) {
        customMessage.warning(`文件不存在: ${path}`);
        return false;
      }

      // 检查是否为目录
      const isDir = await invoke<boolean>('is_directory', { path });
      if (isDir) {
        customMessage.warning('不支持添加文件夹作为附件');
        return false;
      }

      // 检查文件大小
      const metadata = await invoke<{ size: number }>('get_file_metadata', { path });
      if (metadata.size > maxFileSize) {
        const sizeMB = (metadata.size / (1024 * 1024)).toFixed(1);
        const maxSizeMB = (maxFileSize / (1024 * 1024)).toFixed(0);
        customMessage.warning(`文件大小 ${sizeMB}MB 超过限制 ${maxSizeMB}MB`);
        return false;
      }

      // 检查文件类型
      if (allowedTypes.length > 0) {
        const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
        if (!allowedTypes.includes(ext)) {
          customMessage.warning(`不支持的文件类型: ${ext}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error('验证文件失败', error, { path });
      customMessage.error('验证文件失败');
      return false;
    }
  };

  /**
   * 添加附件
   */
  const addAttachments = async (paths: string[]): Promise<void> => {
    if (isProcessing.value) {
      customMessage.warning('正在处理附件，请稍候');
      return;
    }

    if (isFull.value) {
      customMessage.warning(`最多只能添加 ${maxCount} 个附件`);
      return;
    }

    try {
      isProcessing.value = true;
      
      // 限制添加数量
      const availableSlots = maxCount - attachments.value.length;
      const pathsToAdd = paths.slice(0, availableSlots);

      if (pathsToAdd.length < paths.length) {
        customMessage.warning(`最多只能添加 ${availableSlots} 个附件，已自动限制`);
      }

      // 验证所有文件
      const validPaths: string[] = [];
      for (const path of pathsToAdd) {
        const isValid = await validateFile(path);
        if (isValid) {
          validPaths.push(path);
        }
      }

      if (validPaths.length === 0) {
        return;
      }

      // 导入资产
      const newAssets: Asset[] = [];
      for (const path of validPaths) {
        try {
          const asset = await invoke<Asset>('import_asset_from_path', {
            originalPath: path,
            options: {
              generateThumbnail,
              enableDeduplication: true,
            },
          });
          
          // 检查是否已存在（基于 ID 或 SHA256）
          const isDuplicate = attachments.value.some(
            (existing) => 
              existing.id === asset.id || 
              (existing.metadata?.sha256 && asset.metadata?.sha256 && 
               existing.metadata.sha256 === asset.metadata.sha256)
          );

          if (isDuplicate) {
            logger.info('跳过重复文件', { path, assetId: asset.id });
            continue;
          }

          newAssets.push(asset);
        } catch (error) {
          logger.error('导入资产失败', error, { path });
          customMessage.error(`导入失败: ${path.split(/[/\\]/).pop()}`);
        }
      }

      if (newAssets.length > 0) {
        attachments.value.push(...newAssets);
        
        const message = newAssets.length === 1
          ? `已添加附件: ${newAssets[0].name}`
          : `已添加 ${newAssets.length} 个附件`;
        customMessage.success(message);
        
        logger.info('添加附件成功', { 
          count: newAssets.length,
          totalCount: attachments.value.length 
        });
      }
    } catch (error) {
      logger.error('添加附件失败', error);
      customMessage.error('添加附件失败');
    } finally {
      isProcessing.value = false;
    }
  };

  /**
   * 移除附件
   */
  const removeAttachment = (asset: Asset): void => {
    const index = attachments.value.findIndex((a) => a.id === asset.id);
    if (index !== -1) {
      attachments.value.splice(index, 1);
      logger.info('移除附件', { assetId: asset.id, name: asset.name });
    }
  };

  /**
   * 直接添加已导入的资产
   */
  const addAsset = (asset: Asset): boolean => {
    if (isFull.value) {
      customMessage.warning(`最多只能添加 ${maxCount} 个附件`);
      return false;
    }

    // 检查是否已存在
    const isDuplicate = attachments.value.some(
      (existing) =>
        existing.id === asset.id ||
        (existing.metadata?.sha256 && asset.metadata?.sha256 &&
         existing.metadata.sha256 === asset.metadata.sha256)
    );

    if (isDuplicate) {
      logger.info('跳过重复资产', { assetId: asset.id });
      return false;
    }

    attachments.value.push(asset);
    logger.info('添加资产', { assetId: asset.id, name: asset.name });
    return true;
  };

  /**
   * 清空附件
   */
  const clearAttachments = (): void => {
    const count = attachments.value.length;
    attachments.value = [];
    logger.info('清空附件', { count });
  };

  return {
    attachments: attachments as Readonly<typeof attachments>,
    isProcessing: isProcessing as Readonly<typeof isProcessing>,
    addAttachments,
    addAsset,
    removeAttachment,
    clearAttachments,
    count,
    hasAttachments,
    isFull,
  };
}