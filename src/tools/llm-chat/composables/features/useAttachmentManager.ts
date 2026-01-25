import { ref, computed, type Ref, type ComputedRef } from "vue";
import { invoke } from "@tauri-apps/api/core";
import type { Asset, AssetImportStatus } from "@/types/asset-management";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { nanoid } from "nanoid";
import { useAgentStore } from "../../stores/agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useChatSettings } from "../settings/useChatSettings";
import { detectFileType, isTextFile as checkIsTextFile } from "@/utils/fileTypeDetector";

const logger = createModuleLogger("AttachmentManager");
const errorHandler = createModuleErrorHandler("AttachmentManager");

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
  /**
   * 同步附件列表（智能合并）
   * 保留正在导入的本地资产引用，避免状态丢失
   */
  syncAttachments: (newAssets: Asset[]) => void;
  /** 附件数量 */
  count: ComputedRef<number>;
  /** 是否有附件 */
  hasAttachments: ComputedRef<boolean>;
  /** 是否已满 */
  isFull: ComputedRef<boolean>;
  /** 最大数量 */
  maxCount: number;
}

/**
 * 附件管理 Composable
 * 用于管理消息的附件列表
 */
export function useAttachmentManager(
  options: AttachmentManagerOptions = {}
): UseAttachmentManagerReturn {
  const {
    maxCount = 100,
    maxFileSize = 50 * 1024 * 1024, // 默认 50MB
    allowedTypes = [],
    generateThumbnail = true,
  } = options;

  const attachments = ref<Asset[]>([]);
  const isProcessing = ref(false);

  // 在顶层初始化 composables，避免在嵌套函数中调用导致状态获取问题
  const agentStore = useAgentStore();
  const { getProfileById } = useLlmProfiles();
  const { settings } = useChatSettings();

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
      errorHandler.handle(error, { userMessage: "验证文件失败", context: { path }, showToUser: false });
      customMessage.error("验证文件失败");
      return false;
    }
  };

  /**
   * 检查模型对附件类型的支持情况
   * @returns 返回警告信息，如果支持则返回 null
   */
  const checkModelCapability = (asset: Asset): string | null => {
    const assetType = asset.type;

    // 如果是文本文件，不需要检查文档能力（会被直接插入为文本）
    if (assetType === "document" && checkIsTextFile(asset.name, asset.mimeType)) {
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
    const transcriptionEnabled = settings.value.transcription.enabled;

    logger.debug("检查模型能力", {
      assetType,
      assetName: asset.name,
      modelId: agentConfig.modelId,
      modelName: model?.name,
      hasCapabilities: !!capabilities,
      visionSupport: capabilities?.vision,
      documentSupport: capabilities?.document,
      audioSupport: capabilities?.audio,
      videoSupport: capabilities?.video,
      transcriptionEnabled,
    });

    // 无配置视为不支持（安全默认）
    if (!capabilities) {
      logger.info("模型未配置能力信息，视为不支持该附件类型", {
        assetType,
        assetName: asset.name,
        modelName: model?.name || agentConfig.modelId,
      });

      // 如果开启了转写，特定类型的附件可以被转写为文本
      if (transcriptionEnabled) {
        if (assetType === "image" || assetType === "audio" || assetType === "video" || (assetType === "document" && asset.mimeType === "application/pdf")) {
          return null;
        }
      }

      if (assetType === "image") {
        return `当前模型「${model?.name || agentConfig.modelId}」未配置视觉能力，可能不支持图片输入。建议切换至支持视觉的模型（如 GPT-4o、Claude、Gemini）或开启多模态转写。`;
      }

      if (assetType === "audio") {
        return `当前模型「${model?.name || agentConfig.modelId}」未配置音频能力，可能不支持音频输入。建议切换至支持音频的模型（如 GPT-4o-Audio、Gemini）或开启多模态转写。`;
      }

      if (assetType === "video") {
        // 视频转写已支持，但此处仍可作为模型原生能力的提示
        if (!transcriptionEnabled) {
          return `当前模型「${model?.name || agentConfig.modelId}」未配置视频能力，可能不支持视频输入。建议切换至支持视频的模型（如 Gemini 1.5 Pro）或开启多模态转写。`;
        }
      }

      if (assetType === "document") {
        const specificDocWarning = `当前模型「${model?.name || agentConfig.modelId}」未配置文档处理能力，可能不支持 ${asset.name}。建议切换至支持文档的模型或开启多模态转写。`;
        // 如果是 PDF 且转写未开启
        if (asset.mimeType === "application/pdf" && !transcriptionEnabled) {
          return specificDocWarning;
        }
        // 其他文档类型
        if (asset.mimeType !== "application/pdf") {
          return specificDocWarning;
        }
      }

      return null;
    }

    // 检查图片支持
    if (assetType === "image" && !capabilities.vision) {
      // 如果开启了转写，则允许
      if (transcriptionEnabled) {
        return null;
      }
      const warning = `当前模型「${model?.name || agentConfig.modelId}」不支持图片输入。建议切换至支持视觉的模型（如 GPT-4o、Claude、Gemini）或开启多模态转写。`;
      logger.info("检测到不支持的附件类型：图片", {
        modelName: model?.name || agentConfig.modelId,
      });
      return warning;
    }

    // 检查音频支持
    if (assetType === "audio" && !capabilities.audio) {
      // 如果开启了转写，则允许
      if (transcriptionEnabled) {
        return null;
      }
      const warning = `当前模型「${model?.name || agentConfig.modelId}」不支持音频输入。建议切换至支持音频的模型（如 GPT-4o-Audio、Gemini）或开启多模态转写。`;
      logger.info("检测到不支持的附件类型：音频", {
        modelName: model?.name || agentConfig.modelId,
      });
      return warning;
    }

    // 检查视频支持
    if (assetType === "video" && !capabilities.video) {
      // 如果开启了转写，则允许
      if (transcriptionEnabled) {
        return null;
      }
      const warning = `当前模型「${model?.name || agentConfig.modelId}」不支持视频输入。建议切换至支持视频的模型（如 Gemini 1.5 Pro）或开启多模态转写。`;
      logger.info("检测到不支持的附件类型：视频", {
        modelName: model?.name || agentConfig.modelId,
      });
      return warning;
    }

    // 检查文档支持（非文本文件）
    if (assetType === "document" && !capabilities.document) {
      // 如果是 PDF，转写可以作为备选方案
      if (asset.mimeType === "application/pdf" && transcriptionEnabled) {
        return null;
      }
      const warning = `当前模型「${model?.name || agentConfig.modelId}」不支持文档输入。建议切换至支持文档的模型（如 GPT-4o、Claude、Gemini）或开启多模态转写。`;
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

      // 使用新的文件类型检测工具
      const { mimeType, assetType } = await detectFileType(path, fileName);

      const pendingAsset: Asset = {
        id: nanoid(), // 临时 ID
        type: assetType,
        mimeType,
        name: fileName,
        path: path, // 暂时存储原始路径用于预览
        size: metadata.size,
        createdAt: new Date().toISOString(),
        sourceModule: "llm-chat",
        origins: [], // 待导入状态，暂无来源信息
        importStatus: "pending",
        originalPath: path, // 保存原始路径
      };

      return pendingAsset;
    } catch (error) {
      errorHandler.handle(error, { userMessage: "创建待导入资产失败", context: { path }, showToUser: false });
      return null;
    }
  };

  /**
   * 异步导入单个资产
   * 将 pending 状态的资产导入到存储系统
   */
  const importPendingAsset = async (pendingAsset: Asset): Promise<void> => {
    if (!pendingAsset.originalPath) {
      errorHandler.handle(new Error("缺少原始路径，无法导入"), {
        userMessage: "缺少原始路径，无法导入",
        context: { assetId: pendingAsset.id },
        showToUser: false,
      });
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
          sourceModule: "llm-chat",
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
        if ("originalPath" in updatedAsset) {
          delete (updatedAsset as { originalPath?: string }).originalPath;
        }

        // 使用数组的 splice 方法替换元素，确保触发响应式
        attachments.value.splice(index, 1, updatedAsset);

        logger.info("资产导入完成", {
          assetId: importedAsset.id,
          name: importedAsset.name,
        });
      }
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "导入资产失败",
        context: {
          assetId: pendingAsset.id,
          path: pendingAsset.originalPath,
        },
        showToUser: false,
      });

      // 标记为错误状态
      pendingAsset.importStatus = "error";
      pendingAsset.importError = error instanceof Error ? error.message : "导入失败";

      errorHandler.error(error, "导入失败", { assetName: pendingAsset.name });
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

  /**
   * 同步附件列表（智能合并）
   * 用于跨窗口同步时，保留本地正在导入的资产引用
   */
  const syncAttachments = (newAssets: Asset[]): void => {
    const currentAssets = attachments.value;
    const mergedAssets: Asset[] = [];
    let hasChanges = false;

    // 如果数量不同，肯定有变化
    if (currentAssets.length !== newAssets.length) {
      hasChanges = true;
    }

    for (const newAsset of newAssets) {
      // 查找本地是否存在同名/同ID资产
      const localAsset = currentAssets.find(a => a.id === newAsset.id);

      // 如果本地存在且正在导入（pending/importing），保留本地引用
      // 因为本地引用可能绑定了正在进行的后台任务或回调
      if (localAsset && (localAsset.importStatus === 'pending' || localAsset.importStatus === 'importing')) {
        mergedAssets.push(localAsset);
        // 如果新资产状态已经是完成，说明同步源比本地快（罕见），但为了安全保留本地引用
        // 实际上通常是本地比同步源快（本地已开始上传，同步源还是 pending）
      } else {
        // 否则使用同步过来的新资产
        mergedAssets.push(newAsset);
        if (!localAsset || JSON.stringify(localAsset) !== JSON.stringify(newAsset)) {
          hasChanges = true;
        }
      }
    }

    // 只有在真正有变化时才更新，避免不必要的响应式触发
    if (hasChanges) {
      attachments.value = mergedAssets;
      logger.debug("已同步附件列表（保留了正在导入的资产）", {
        count: mergedAssets.length,
        preservedCount: mergedAssets.filter(a => a.importStatus === 'pending' || a.importStatus === 'importing').length
      });
    }
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
    syncAttachments,
    count,
    hasAttachments,
    isFull,
    maxCount,
  };
}
