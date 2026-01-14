import { watch } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useChatSettings } from "./useChatSettings";
import { transcriptionRegistry } from "@/tools/transcription/transcription.registry";
import { useTranscriptionStore } from "@/tools/transcription/stores/transcriptionStore";
import { saveTranscriptionResult } from "@/tools/transcription/engines/base";
import type { Asset } from "@/types/asset-management";

const logger = createModuleLogger("useTranscriptionManager");
const errorHandler = createModuleErrorHandler("useTranscriptionManager");

export function useTranscriptionManager() {
  const { settings } = useChatSettings();
  const transcriptionStore = useTranscriptionStore();

  /**
   * 初始化管理器，将 llm-chat 的转写配置同步到工具 Store
   */
  const init = async () => {
    logger.info("正在初始化转写管理器 (llm-chat 适配层)...");

    // 1. 同步配置
    // 注意：这里我们选择将 llm-chat 的配置单向同步给 transcriptionStore
    // 这样 transcriptionStore 就能使用 llm-chat 中定义的模型和 Prompt
    const syncConfig = () => {
      const chatConfig = settings.value.transcription;
      Object.assign(transcriptionStore.config, {
        enabled: chatConfig.enabled,
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
        enableTypeSpecificConfig: chatConfig.enableTypeSpecificConfig,
        ffmpegPath: chatConfig.ffmpegPath,
        image: chatConfig.image,
        audio: chatConfig.audio,
        video: chatConfig.video,
        document: chatConfig.document,
      });
    };

    syncConfig();
    watch(() => settings.value.transcription, syncConfig, { deep: true });
  };

  /**
   * 处理资产导入（用于自动触发转写）
   */
  const handleAssetImport = (asset: Asset) => {
    const config = transcriptionStore.config;
    if (!config.enabled || !config.autoStartOnImport) return;

    // 解析配置中的模型
    const [profileId, modelId] = (config.modelIdentifier || "").split(":");

    // 检查必要性
    if (checkTranscriptionNecessity(asset, modelId, profileId)) {
      logger.info("触发自动转写", { assetId: asset.id });
      addTask(asset);
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
