import { ref, computed, type Ref, type ComputedRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { Asset, AssetImportStatus } from "@/types/asset-management";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@utils/logger";
import { nanoid } from "nanoid";
import { useAgentStore } from "../agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";

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
  /** 批量添加 Asset 对象 */
  addAssets: (assets: Asset[]) => number;
  /** 移除附件 */
  removeAttachment: (asset: Asset) => void;
  /** 通过 ID 移除附件 */
  removeAttachmentById: (assetId: string) => void;
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
  
  // 在顶层初始化 composables，避免在嵌套函数中调用导致状态获取问题
  const agentStore = useAgentStore();
  const { getProfileById } = useLlmProfiles();

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
   * 判断文件是否为纯文本文件
   * 这些文件会被直接读取为文本插入到消息中，不需要特殊的文档处理能力
   */
  const isTextFile = (fileName: string, mimeType?: string): boolean => {
    const textMimeTypes = [
      "text/plain",
      "text/markdown",
      "text/html",
      "text/css",
      "text/javascript",
      "application/json",
      "application/xml",
      "text/xml",
    ];

    // 检查 MIME 类型
    if (mimeType && textMimeTypes.includes(mimeType)) {
      return true;
    }

    // 检查文件扩展名
    const textExtensions = /\.(txt|md|json|xml|html|css|js|ts|tsx|jsx|py|java|c|cpp|h|hpp|rs|go|rb|php|sh|yaml|yml|toml|ini|conf|log)$/i;
    return textExtensions.test(fileName);
  };

  /**
   * 检查模型对附件类型的支持情况
   * @returns 返回警告信息，如果支持则返回 null
   */
  const checkModelCapability = (asset: Asset): string | null => {
    const assetType = asset.type;
    
    // 如果是文本文件，不需要检查文档能力（会被直接插入为文本）
    if (assetType === "document" && isTextFile(asset.name, asset.mimeType)) {
      logger.debug("文本文件不需要文档处理能力", {
        assetName: asset.name,
        mimeType: asset.mimeType,
      });
      return null;
    }
    
    // 如果没有选中的 Agent，跳过检查
    if (!agentStore.currentAgentId) {
      logger.debug("未选中 Agent，跳过能力检查");
      return null;
    }

    const agentConfig = agentStore.getAgentConfig(agentStore.currentAgentId);
    if (!agentConfig) {
      logger.debug("无法获取 Agent 配置，跳过能力检查");
      return null;
    }

    // 获取模型能力
    const profile = getProfileById(agentConfig.profileId);
    const model = profile?.models.find((m) => m.id === agentConfig.modelId);
    const capabilities = model?.capabilities;

    logger.debug("检查模型能力", {
      assetType,
      assetName: asset.name,
      modelId: agentConfig.modelId,
      modelName: model?.name,
      hasCapabilities: !!capabilities,
      visionSupport: capabilities?.vision,
      documentSupport: capabilities?.document,
    });

    // 无配置视为不支持（安全默认）
    if (!capabilities) {
      logger.info("模型未配置能力信息，视为不支持该附件类型", {
        assetType,
        assetName: asset.name,
        modelName: model?.name || agentConfig.modelId,
      });
      
      if (assetType === "image") {
        return `当前模型「${model?.name || agentConfig.modelId}」未配置视觉能力，可能不支持图片输入。建议切换至支持视觉的模型（如 GPT-4o、Claude、Gemini）。`;
      }
      
      if (assetType === "document") {
        return `当前模型「${model?.name || agentConfig.modelId}」未配置文档处理能力，可能不支持文档输入。建议切换至支持文档的模型（如 GPT-4o、Claude、Gemini）。`;
      }
      
      // 其他类型（音频、视频等）目前不检查
      return null;
    }

    // 检查图片支持
    if (assetType === "image" && !capabilities.vision) {
      const warning = `当前模型「${model?.name || agentConfig.modelId}」不支持图片输入。建议切换至支持视觉的模型（如 GPT-4o、Claude、Gemini）。`;
      logger.info("检测到不支持的附件类型：图片", {
        modelName: model?.name || agentConfig.modelId,
      });
      return warning;
    }

    // 检查文档支持（只检查非文本的文档，如 PDF）
    if (assetType === "document" && !capabilities.document) {
      const warning = `当前模型「${model?.name || agentConfig.modelId}」不支持文档输入。建议切换至支持文档的模型（如 GPT-4o、Claude、Gemini）。`;
      logger.info("检测到不支持的附件类型：文档", {
        modelName: model?.name || agentConfig.modelId,
        assetName: asset.name,
      });
      return warning;
    }

    logger.debug("模型支持该附件类型", { assetType });
    return null;
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

      const assetType = inferAssetType(path);

      const pendingAsset: Asset = {
        id: nanoid(), // 临时 ID
        type: assetType,
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

      // 找到数组中的索引并替换整个对象（触发 Vue 响应式更新）
      const index = attachments.value.findIndex((a) => a.id === pendingAsset.id);
      if (index !== -1) {
        // 创建新对象替换，确保触发响应式更新
        const updatedAsset = {
          ...importedAsset,
          importStatus: "complete" as AssetImportStatus,
        };
        // 删除 originalPath 属性（如果存在）
        delete (updatedAsset as any).originalPath;
        
        // 使用数组的 splice 方法替换元素，确保触发响应式
        attachments.value.splice(index, 1, updatedAsset);
        
        logger.info("资产导入完成", {
          assetId: importedAsset.id,
          name: importedAsset.name,
        });
      }
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

    // 检查模型能力并显示警告（不阻止添加）
    const uniqueWarnings = new Set<string>();
    for (const asset of pendingAssets) {
      const warning = checkModelCapability(asset);
      if (warning) {
        uniqueWarnings.add(warning);
      }
    }

    // 显示去重后的警告
    for (const warning of uniqueWarnings) {
      customMessage.warning(warning);
    }

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
   * 通过 ID 移除附件
   */
  const removeAttachmentById = (assetId: string): void => {
    const index = attachments.value.findIndex((a) => a.id === assetId);
    if (index !== -1) {
      const assetName = attachments.value[index].name;
      attachments.value.splice(index, 1);
      logger.info("通过 ID 移除附件", { assetId, name: assetName });
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

    // 检查模型能力并显示警告（不阻止添加）
    const warning = checkModelCapability(asset);
    logger.debug("能力检查结果", {
      assetId: asset.id,
      assetType: asset.type,
      hasWarning: !!warning,
      warning: warning || "无警告",
    });
    
    if (warning) {
      logger.info("显示模型能力警告", { warning });
      customMessage.warning(warning);
    }

    return true;
  };

  /**
   * 批量添加 Asset 对象
   * @returns 成功添加的数量
   */
  const addAssets = (assetsToAdd: Asset[]): number => {
    let addedCount = 0;
    for (const asset of assetsToAdd) {
      if (addAsset(asset)) {
        addedCount++;
      }
      if (isFull.value) {
        logger.warn("附件已满，停止批量添加");
        break;
      }
    }
    return addedCount;
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
    addAssets,
    removeAttachment,
    removeAttachmentById,
    clearAttachments,
    count,
    hasAttachments,
    isFull,
  };
}
