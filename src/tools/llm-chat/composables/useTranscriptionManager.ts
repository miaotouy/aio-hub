import { watch, onUnmounted } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useChatInputManager } from "./useChatInputManager";
import { useChatSettings } from "./useChatSettings";
import { transcriptionRegistry } from "@/tools/transcription/transcription.registry";
import { useTranscriptionStore } from "@/tools/transcription/stores/transcriptionStore";
import { saveTranscriptionResult } from "@/tools/transcription/engines/base";
import type { Asset } from "@/types/asset-management";

const logger = createModuleLogger("useTranscriptionManager");
const errorHandler = createModuleErrorHandler("useTranscriptionManager");

// 使用全局状态来追踪已处理的资产，防止在组件生命周期内重复触发
const processedAssetIds = new Set<string>();

export function useTranscriptionManager() {
  const { settings } = useChatSettings();
  const transcriptionStore = useTranscriptionStore();
  let unlistenAssetImport: UnlistenFn | null = null;

  /**
   * 初始化管理器，将 llm-chat 的转写配置同步到工具 Store
   */
  const init = async () => {
    logger.info("正在初始化转写管理器 (llm-chat 适配层)...");

    // 1. 同步配置
    const syncConfig = () => {
      const chatConfig = settings.value.transcription;
      Object.assign(transcriptionStore.config, {
        strategy: chatConfig.strategy,
        forceTranscriptionAfter: chatConfig.forceTranscriptionAfter,
        autoStartOnImport: chatConfig.autoStartOnImport,
        modelIdentifier: chatConfig.modelIdentifier,
        customPrompt: chatConfig.customPrompt,
        temperature: chatConfig.temperature,
        maxTokens: chatConfig.maxTokens,
        maxConcurrentTasks: chatConfig.maxConcurrentTasks,
        executionDelay: chatConfig.executionDelay,
        maxRetries: chatConfig.maxRetries,
        timeout: chatConfig.timeout,
        enableImageSlicer: chatConfig.enableImageSlicer,
        imageSlicerConfig: chatConfig.imageSlicerConfig,
        ffmpegPath: chatConfig.ffmpegPath,
        image: chatConfig.image,
        audio: chatConfig.audio,
        video: chatConfig.video,
        document: chatConfig.document,
      });
    };

    syncConfig();
    watch(() => settings.value.transcription, syncConfig, { deep: true });

    // 2. 监听资产导入事件 (作为事件驱动的补充)
    if (!unlistenAssetImport) {
      listen<Asset>("asset-imported", (event) => {
        const asset = event.payload;
        // 仅处理本模块导入的资产
        if (asset.sourceModule === "llm-chat" || asset.sourceModule === "llm-chat-paste") {
          // 如果已经在 watch 中处理过了，这里就跳过
          if (processedAssetIds.has(asset.id)) return;

          logger.debug("收到资产导入事件，尝试触发转写", { assetId: asset.id });
          handleAssetImport(asset);
        }
      }).then((unlisten) => {
        unlistenAssetImport = unlisten;
      });
    }

    // 3. 显式监听输入框附件的状态变化 (显式可控的转写触发)
    const inputManager = useChatInputManager();

    watch(
      () => inputManager.attachments.value,
      (newAssets) => {
        const chatConfig = settings.value.transcription;
        if (!chatConfig.enabled || !chatConfig.autoStartOnImport) return;

        newAssets.forEach((asset) => {
          // 核心逻辑：如果资产状态是 'complete' 且我们还没处理过它
          const isReady = asset.importStatus === "complete" && !processedAssetIds.has(asset.id);

          if (isReady) {
            logger.debug("检测到资产就绪，触发自动转写", {
              assetId: asset.id,
              name: asset.name
            });
            handleAssetImport(asset);
          } else if (asset.importStatus === "importing") {
            // 如果资产正在导入，确保它不在已处理列表中（以防 ID 复用或其他异常）
            processedAssetIds.delete(asset.id);
          }
        });

        // 定期清理不再存在于附件列表中的 ID（可选，为了防止内存增长）
        if (newAssets.length === 0 && processedAssetIds.size > 100) {
          processedAssetIds.clear();
        }
      },
      { deep: true, immediate: true }
    );
  };

  /**
   * 处理资产导入（用于自动触发转写）
   */
  const handleAssetImport = async (asset: Asset) => {
    const chatConfig = settings.value.transcription;
    const config = transcriptionStore.config;
    if (!chatConfig.enabled || !config.autoStartOnImport) return;

    // 1. 检查是否已经处理过这个 ID (防重)
    // 注意：如果是从 localStorage 恢复的，我们可能没处理过它，但它可能已经在后端转写过了
    if (processedAssetIds.has(asset.id)) {
      const status = getTranscriptionStatus(asset);
      if (status !== "none" && status !== "error") {
        return;
      }
    }

    // 先标记为已处理，防止并发触发
    processedAssetIds.add(asset.id);

    // 2. 检查转写内容是否已经存在 (姐姐要求的检查)
    // 关键：对于持久化恢复的资产，metadata 可能是旧的，我们需要获取最新资产状态
    let currentAsset = asset;
    const hasResultInHand = !!asset.metadata?.derived?.transcription?.path;

    if (!hasResultInHand) {
      // 尝试获取后端最新状态
      const latest = await assetManagerEngine.getAssetById(asset.id);
      if (latest) {
        currentAsset = latest;
      }
    }

    const derived = currentAsset.metadata?.derived?.transcription;
    if (derived?.path) {
      logger.debug("资产后端已有转写结果，跳过自动触发", { assetId: asset.id });
      return;
    }

    // 3. 检查任务列表是否已经有该资产的任务
    const existingTask = transcriptionStore.getTaskByAssetId(asset.id);
    if (existingTask && existingTask.status !== "error") {
      logger.debug("资产已有正在进行的转写任务，跳过自动触发", { assetId: asset.id, status: existingTask.status });
      return;
    }

    // 解析配置中的模型
    const [profileId, modelId] = (config.modelIdentifier || "").split(":");

    // 4. 检查必要性
    if (checkTranscriptionNecessity(currentAsset, modelId, profileId)) {
      logger.info("触发自动转写", { assetId: asset.id, name: asset.name });
      addTask(currentAsset);
    }
  };
  /**
   * 添加任务
   */
  const addTask = (asset: Asset, options?: { modelId?: string; additionalPrompt?: string }) => {
    const overrideConfig = options ? {
      modelIdentifier: options.modelId,
      customPrompt: options.additionalPrompt, // 这里的逻辑需要注意：llm-chat 的 additionalPrompt 是追加，而 Registry 的 override 是覆盖
    } : undefined;

    // 如果有 additionalPrompt，我们需要在这里合并一下，因为 Registry 目前只支持覆盖
    if (options?.additionalPrompt) {
      const basePrompt = transcriptionStore.config.customPrompt;
      overrideConfig!.customPrompt = `${basePrompt}\n\n${options.additionalPrompt}`;
    }

    return transcriptionRegistry.addTask(asset, overrideConfig);
  };

  /**
   * 获取转写状态
   */
  const getTranscriptionStatus = (asset: Asset) => {
    const task = transcriptionStore.getTaskByAssetId(asset.id);
    if (task) {
      if (task.status === "error") return "error";
      if (task.status === "pending") return "pending";
      if (task.status === "cancelled") return "none";
      if (task.status === "completed" && task.resultPath) return "success";
      return "processing";
    }

    const derived = asset.metadata?.derived?.transcription;
    if (derived) {
      if (derived.error) return "error";
      if (derived.warning) return "warning";
      if (derived.path) return "success";
    }

    return "none";
  };

  /**
   * 重试
   */
  const retryTranscription = (asset: Asset, options?: { modelId?: string; additionalPrompt?: string }) => {
    addTask(asset, options);
  };

  /**
   * 取消
   */
  const cancelTranscription = (assetId: string) => {
    transcriptionRegistry.cancelTask(assetId);
  };

  /**
   * 手动更新
   */
  const updateTranscriptionContent = async (asset: Asset, text: string) => {
    try {
      const derived = asset.metadata?.derived?.transcription;
      const provider = derived?.provider || "manual";
      await saveTranscriptionResult(asset.id, asset.path, text, provider);
    } catch (error) {
      errorHandler.handle(error, { userMessage: "更新转写内容失败" });
      throw error;
    }
  };

  /**
   * 获取转写文本
   */
  const getTranscriptionText = (asset: Asset) => {
    return transcriptionRegistry.getTranscriptionText(asset);
  };

  /**
   * 检查必要性 (业务逻辑：检查模型是否具备原生处理能力)
   */
  const checkTranscriptionNecessity = (asset: Asset, modelId: string, profileId: string) => {
    // 如果策略是始终转写，则必要性始终为真
    if (settings.value.transcription.strategy === "always") return true;

    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(profileId);
    const model = profile?.models.find((m) => m.id === modelId);

    if (!model) return true;

    const cap = model.capabilities || {};
    if (asset.type === "image") return !cap.vision;
    if (asset.type === "audio") return !cap.audio;
    if (asset.type === "video") return !cap.video;
    if (asset.type === "document" && asset.mimeType === "application/pdf") return !cap.document;

    return false;
  };

  /**
   * 计算是否使用转写
   */
  const computeWillUseTranscription = (
    asset: Asset,
    modelId: string,
    profileId: string,
    messageDepth?: number
  ): boolean => {
    const config = settings.value.transcription;
    if (!config.enabled) return false;

    const isSupportedType =
      asset.type === "image" ||
      asset.type === "audio" ||
      asset.type === "video" ||
      (asset.type === "document" && asset.mimeType === "application/pdf");

    if (!isSupportedType) return false;

    // 1. 始终转写策略
    if (config.strategy === "always") {
      return true;
    }

    // 2. 智能转写策略 - 检查消息深度
    if (
      config.strategy === "smart" &&
      messageDepth !== undefined &&
      config.forceTranscriptionAfter > 0 &&
      messageDepth >= config.forceTranscriptionAfter
    ) {
      return true;
    }

    // 3. 兜底逻辑：检查模型原生能力
    return checkTranscriptionNecessity(asset, modelId, profileId);
  };

  /**
   * 确保转写完成（发送前等待）
   */
  const ensureTranscriptions = async (
    assets: Asset[],
    modelId: string,
    profileId: string,
    forceAssetIds?: Set<string>
  ): Promise<Map<string, Asset>> => {
    const updatedAssets = new Map<string, Asset>();
    for (const asset of assets) {
      updatedAssets.set(asset.id, asset);
    }

    const assetsToTranscribe = assets.filter((asset) => {
      const isForced = forceAssetIds?.has(asset.id) ?? false;
      if (isForced) {
        return (
          asset.type === "image" ||
          asset.type === "audio" ||
          asset.type === "video" ||
          (asset.type === "document" && asset.mimeType === "application/pdf")
        );
      }
      return checkTranscriptionNecessity(asset, modelId, profileId);
    });

    if (assetsToTranscribe.length === 0) return updatedAssets;

    for (const asset of assetsToTranscribe) {
      const latestAsset = await assetManagerEngine.getAssetById(asset.id);
      const assetToCheck = latestAsset || asset;
      updatedAssets.set(asset.id, assetToCheck);

      const status = getTranscriptionStatus(assetToCheck);
      if (status === "none" || status === "error") {
        addTask(assetToCheck);
      }
    }

    const timeoutMs = (settings.value.transcription.timeout || 120) * 1000;

    return new Promise((resolve, reject) => {
      let isSettled = false;
      const timeoutTimer = setTimeout(() => {
        if (isSettled) return;
        isSettled = true;
        clearInterval(checkInterval);
        reject(new Error("等待转写超时"));
      }, timeoutMs);

      const checkInterval = setInterval(async () => {
        if (isSettled) return;
        let allFinished = true;
        for (const asset of assetsToTranscribe) {
          const latestAsset = await assetManagerEngine.getAssetById(asset.id);
          const assetToCheck = latestAsset || asset;
          updatedAssets.set(asset.id, assetToCheck);
          const status = getTranscriptionStatus(assetToCheck);
          if (status === "pending" || status === "processing") {
            allFinished = false;
            break;
          }
        }
        if (allFinished) {
          isSettled = true;
          clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          resolve(updatedAssets);
        }
      }, 500);
    });
  };

  onUnmounted(() => {
    if (unlistenAssetImport) {
      unlistenAssetImport();
      unlistenAssetImport = null;
    }
  });

  return {
    tasks: transcriptionStore.tasks,
    processingCount: transcriptionStore.processingCount,
    init,
    handleAssetImport,
    addTask,
    retryTranscription,
    cancelTranscription,
    updateTranscriptionContent,
    getTranscriptionStatus,
    getTranscriptionText,
    checkTranscriptionNecessity,
    computeWillUseTranscription,
    ensureTranscriptions,
  };
}
