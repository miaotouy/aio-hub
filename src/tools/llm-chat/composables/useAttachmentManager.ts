import { ref, computed, type Ref, type ComputedRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { Asset, AssetImportStatus } from "@/types/asset-management";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@utils/logger";
import { nanoid } from "nanoid";

const logger = createModuleLogger("AttachmentManager");

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
      const exists = await invoke<boolean>("path_exists", { path });
      if (!exists) {
        customMessage.warning(`文件不存在: ${path}`);
        return false;
      }

      // 检查是否为目录
      const isDir = await invoke<boolean>("is_directory", { path });
      if (isDir) {
        customMessage.warning("不支持添加文件夹作为附件");
        return false;
      }

      // 检查文件大小
      const metadata = await invoke<{ size: number }>("get_file_metadata", { path });
      if (metadata.size > maxFileSize) {
        const sizeMB = (metadata.size / (1024 * 1024)).toFixed(1);
        const maxSizeMB = (maxFileSize / (1024 * 1024)).toFixed(0);
        customMessage.warning(`文件大小 ${sizeMB}MB 超过限制 ${maxSizeMB}MB`);
        return false;
      }

      // 检查文件类型
      if (allowedTypes.length > 0) {
        const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
        if (!allowedTypes.includes(ext)) {
          customMessage.warning(`不支持的文件类型: ${ext}`);
          return false;
        }
      }

      return true;
    } catch (error) {
      logger.error("验证文件失败", error, { path });
      customMessage.error("验证文件失败");
      return false;
    }
  };
  /**
   * 从文件路径推断 MIME 类型
   */
  const inferMimeType = (path: string): string => {
    const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
    const mimeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".txt": "text/plain",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
    };
    return mimeMap[ext] || "application/octet-stream";
  };

  /**
   * 从文件路径推断资产类型
   */
  const inferAssetType = (path: string): Asset["type"] => {
    const ext = path.substring(path.lastIndexOf(".")).toLowerCase();
    const imageExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"];
    const audioExts = [".mp3", ".wav", ".ogg", ".flac", ".aac", ".m4a"];
    const videoExts = [".mp4", ".webm", ".avi", ".mov", ".mkv"];
    const docExts = [".pdf", ".doc", ".docx", ".txt", ".md"];

    if (imageExts.includes(ext)) return "image";
    if (audioExts.includes(ext)) return "audio";
    if (videoExts.includes(ext)) return "video";
    if (docExts.includes(ext)) return "document";
    return "other";
  };

  /**
   * 创建待导入的占位 Asset 对象
   * 用于立即显示预览，不阻塞 UI
   */
  const createPendingAsset = async (path: string): Promise<Asset | null> => {
    try {
      // 获取文件元数据（文件名、大小等）
      const metadata = await invoke<{ size: number }>("get_file_metadata", { path });
      const fileName = path.split(/[/\\]/).pop() || "unknown";

      const pendingAsset: Asset = {
        id: nanoid(), // 临时 ID
        type: inferAssetType(path),
        mimeType: inferMimeType(path),
        name: fileName,
        path: path, // 暂时存储原始路径用于预览
        size: metadata.size,
        createdAt: new Date().toISOString(),
        importStatus: "pending",
        originalPath: path, // 保存原始路径
      };

      return pendingAsset;
    } catch (error) {
      logger.error("创建待导入资产失败", error, { path });
      return null;
    }
  };

  /**
   * 异步导入单个资产
   * 将 pending 状态的资产导入到存储系统
   */
  const importPendingAsset = async (pendingAsset: Asset): Promise<void> => {
    if (!pendingAsset.originalPath) {
      logger.error("缺少原始路径，无法导入", { assetId: pendingAsset.id });
      return;
    }

    try {
      // 更新状态为 importing
      pendingAsset.importStatus = "importing";

      // 调用后端导入
      const importedAsset = await invoke<Asset>("import_asset_from_path", {
        originalPath: pendingAsset.originalPath,
        options: {
          generateThumbnail,
          enableDeduplication: true,
        },
      });

      // 检查是否已存在（基于 SHA256）
      const existingIndex = attachments.value.findIndex(
        (a) =>
          a.id !== pendingAsset.id &&
          a.metadata?.sha256 &&
          importedAsset.metadata?.sha256 &&
          a.metadata.sha256 === importedAsset.metadata.sha256
      );

      if (existingIndex !== -1) {
        // 发现重复，移除当前的 pending 资产
        const index = attachments.value.findIndex((a) => a.id === pendingAsset.id);
        if (index !== -1) {
          attachments.value.splice(index, 1);
        }
        logger.info("检测到重复文件，已移除", {
          pendingId: pendingAsset.id,
          existingId: attachments.value[existingIndex].id,
        });
        return;
      }

      // 更新 pending 资产为导入完成的资产
      Object.assign(pendingAsset, {
        ...importedAsset,
        importStatus: "complete" as AssetImportStatus,
      });
      delete pendingAsset.originalPath;

      logger.info("资产导入完成", {
        assetId: importedAsset.id,
        name: importedAsset.name,
      });
    } catch (error) {
      logger.error("导入资产失败", error, {
        assetId: pendingAsset.id,
        path: pendingAsset.originalPath,
      });

      // 标记为错误状态
      pendingAsset.importStatus = "error";
      pendingAsset.importError = error instanceof Error ? error.message : "导入失败";

      customMessage.error(`导入失败: ${pendingAsset.name}`);
    }
  };

  /**
   * 添加附件（优化版：立即预览 + 异步导入）
   *
   * 工作流程：
   * 1. 立即创建 pending 状态的 Asset 对象并显示预览
   * 2. 在后台异步导入到存储系统
   * 3. 导入完成后更新 Asset 对象状态
   */
  const addAttachments = async (paths: string[]): Promise<void> => {
    if (isFull.value) {
      customMessage.warning(`最多只能添加 ${maxCount} 个附件`);
      return;
    }

    // 限制添加数量
    const availableSlots = maxCount - attachments.value.length;
    const pathsToAdd = paths.slice(0, availableSlots);

    if (pathsToAdd.length < paths.length) {
      customMessage.warning(`最多只能添加 ${availableSlots} 个附件，已自动限制`);
    }

    // 第一阶段：快速验证并创建 pending 资产（用于立即预览）
    const pendingAssets: Asset[] = [];
    for (const path of pathsToAdd) {
      const isValid = await validateFile(path);
      if (!isValid) continue;

      const pendingAsset = await createPendingAsset(path);
      if (pendingAsset) {
        pendingAssets.push(pendingAsset);
      }
    }

    if (pendingAssets.length === 0) {
      return;
    }

    // 立即添加到附件列表（用户立即看到预览）
    attachments.value.push(...pendingAssets);

    const message =
      pendingAssets.length === 1
        ? `已添加附件: ${pendingAssets[0].name}`
        : `已添加 ${pendingAssets.length} 个附件`;
    customMessage.success(message);

    logger.info("附件预览已显示", {
      count: pendingAssets.length,
      totalCount: attachments.value.length,
    });

    // 第二阶段：异步导入到存储系统（不阻塞 UI）
    // 并行导入所有资产
    const importPromises = pendingAssets.map((asset) => importPendingAsset(asset));
    await Promise.allSettled(importPromises);

    logger.info("所有附件导入完成", {
      count: pendingAssets.length,
    });
  };

  /**
   * 移除附件
   */
  const removeAttachment = (asset: Asset): void => {
    const index = attachments.value.findIndex((a) => a.id === asset.id);
    if (index !== -1) {
      attachments.value.splice(index, 1);
      logger.info("移除附件", { assetId: asset.id, name: asset.name });
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
        (existing.metadata?.sha256 &&
          asset.metadata?.sha256 &&
          existing.metadata.sha256 === asset.metadata.sha256)
    );

    if (isDuplicate) {
      logger.info("跳过重复资产", { assetId: asset.id });
      return false;
    }

    attachments.value.push(asset);
    logger.info("添加资产", { assetId: asset.id, name: asset.name });
    return true;
  };

  /**
   * 清空附件
   */
  const clearAttachments = (): void => {
    const count = attachments.value.length;
    attachments.value = [];
    logger.info("清空附件", { count });
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
