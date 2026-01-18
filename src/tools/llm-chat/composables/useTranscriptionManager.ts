import { watch } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useAgentStore } from "../stores/agentStore";
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

// 模块级别的单例状态，防止重复注册监听器
let unlistenAssetImport: UnlistenFn | null = null;

/**
 * 转写管理器 (llm-chat 适配层)
 * 采用单例模式，确保在非组件上下文（如工具函数、异步任务）中调用时不会触发 Vue 生命周期警告，
 * 且不会重复注册监听器。
 */

// 模块级别的状态引用
const { settings } = useChatSettings();

export function useTranscriptionManager() {
  const transcriptionStore = useTranscriptionStore();

  /**
   * 内部工具：检查资产是否支持转写
   */
  const isSupportedTranscriptionType = (asset: Asset) => {
    return (
      asset.type === "image" ||
      asset.type === "audio" ||
      asset.type === "video" ||
      (asset.type === "document" && asset.mimeType === "application/pdf")
    );
  };

  /**
   * 内部工具：获取执行转写的模型标识符 (四级兜底逻辑)
   * 优先级：类型专用模型 > 转写兜底模型 > Chat 全局默认模型 > 当前会话模型
   */
  const getTranscribeModelIdentifier = (asset: Asset, currentAgent?: any) => {
    const chatConfig = settings.value.transcription;
    let modelIdentifier = "";

    // (1) 类型专用模型
    if (asset.type === "image") modelIdentifier = chatConfig.image?.modelIdentifier;
    else if (asset.type === "audio") modelIdentifier = chatConfig.audio?.modelIdentifier;
    else if (asset.type === "video") modelIdentifier = chatConfig.video?.modelIdentifier;
    else if (asset.type === "document") modelIdentifier = chatConfig.document?.modelIdentifier;

    // (2) 转写兜底模型
    if (!modelIdentifier) modelIdentifier = chatConfig.modelIdentifier;

    // (3) Chat 全局默认模型
    if (!modelIdentifier) modelIdentifier = settings.value.modelPreferences.defaultModel;

    // (4) 当前会话/Agent 模型
    if (!modelIdentifier && currentAgent) {
      modelIdentifier = `${currentAgent.profileId}:${currentAgent.modelId}`;
    }

    return modelIdentifier;
  };

  /**
   * 处理资产导入（用于自动触发转写）
   */
  const handleAssetImport = async (asset: Asset) => {
    const chatConfig = settings.value.transcription;
    if (!chatConfig.enabled || !chatConfig.autoStartOnImport) return;

    // 基础过滤
    if (!isSupportedTranscriptionType(asset)) return;

    // 1. 检查是否已经处理过这个 ID (防重)
    if (processedAssetIds.has(asset.id)) {
      const status = getTranscriptionStatus(asset);
      if (status !== "none" && status !== "error") {
        return;
      }
    }

    // 先标记为已处理，防止并发触发
    processedAssetIds.add(asset.id);

    // 2. 检查转写内容是否已经存在
    let currentAsset = asset;
    const hasResultInHand = !!asset.metadata?.derived?.transcription?.path;

    if (!hasResultInHand) {
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

    // 4. 获取当前聊天上下文的模型 (用于判断必要性)
    const agentStore = useAgentStore();
    const currentAgent = agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;

    // 5. 确定执行转写的模型
    const transcribeModelIdentifier = getTranscribeModelIdentifier(currentAsset, currentAgent);

    // 6. 检查必要性 (基于当前聊天模型判断)
    if (checkTranscriptionNecessity(currentAsset, currentAgent?.modelId, currentAgent?.profileId)) {
      if (transcribeModelIdentifier) {
        logger.info("触发自动转写", {
          assetId: asset.id,
          name: asset.name,
          usingModel: transcribeModelIdentifier
        });
        addTask(currentAsset, { modelId: transcribeModelIdentifier });
      } else {
        logger.debug("需要转写但未找到任何可用模型执行任务，跳过自动触发", { assetId: asset.id });
      }
    }
  };

  /**
   * 标记资产为已处理（防止重复触发自动转写）
   */
  const markAsProcessed = (assetId: string) => {
    processedAssetIds.add(assetId);
  };

  /**
   * 初始化管理器 (llm-chat 适配层)
   */
  const init = async () => {
    logger.info("正在初始化转写管理器 (llm-chat 适配层)...");

    // 1. 监听资产导入事件 (作为事件驱动的补充)
    if (!unlistenAssetImport) {
      logger.debug("注册资产导入监听器");
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
   * 添加任务
   *
   * 注意：llm-chat 发起的任务应该携带聊天侧的私有配置，
   * 这样可以避免修改并持久化 transcriptionStore 的全局配置。
   */
  const addTask = (
    asset: Asset,
    options?: {
      modelId?: string;
      additionalPrompt?: string;
      enableRepetitionDetection?: boolean;
    }
  ) => {
    const chatConfig = settings.value.transcription;

    // 构造覆盖配置，优先使用传入的 options，否则使用聊天设置
    const overrideConfig: any = {
      modelIdentifier: options?.modelId || chatConfig.modelIdentifier,
      customPrompt: chatConfig.customPrompt,
      temperature: chatConfig.temperature,
      maxTokens: chatConfig.maxTokens,
      timeout: chatConfig.timeout,
      // 性能与并发控制也使用聊天侧的设置进行覆盖
      maxConcurrentTasks: chatConfig.maxConcurrentTasks,
      executionDelay: chatConfig.executionDelay,
      maxRetries: chatConfig.maxRetries,
      // 复读处理
      enableRepetitionDetection: options?.enableRepetitionDetection ?? chatConfig.enableRepetitionDetection,
      repetitionThreshold: chatConfig.repetitionThreshold,
      repetitionCount: chatConfig.repetitionCount,
      repetitionWhitelist: chatConfig.repetitionWhitelist,
      // 其他配置
      enableImageSlicer: chatConfig.enableImageSlicer,
      imageSlicerConfig: chatConfig.imageSlicerConfig,
      ffmpegPath: chatConfig.ffmpegPath,
      image: chatConfig.image,
      audio: chatConfig.audio,
      video: chatConfig.video,
      document: chatConfig.document,
    };

    // 处理 additionalPrompt 追加逻辑
    if (options?.additionalPrompt) {
      overrideConfig.customPrompt = `${overrideConfig.customPrompt}\n\n${options.additionalPrompt}`;
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
  const retryTranscription = (
    asset: Asset,
    options?: {
      modelId?: string;
      additionalPrompt?: string;
      enableRepetitionDetection?: boolean;
    }
  ) => {
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
  const checkTranscriptionNecessity = (asset: Asset, modelId?: string, profileId?: string) => {
    // 1. 首先检查是否是支持转写的类型
    if (!isSupportedTranscriptionType(asset)) return false;

    // 2. 如果策略是始终转写，则必要性始终为真
    if (settings.value.transcription.strategy === "always") return true;

    // 3. 确定参考模型 (用于判断当前聊天环境是否能原生处理该附件)
    let refModelId = modelId;
    let refProfileId = profileId;

    if (!refModelId) {
      const agentStore = useAgentStore();
      const currentAgent = agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;
      const fullId = getTranscribeModelIdentifier(asset, currentAgent);

      if (fullId) {
        [refProfileId, refModelId] = fullId.split(":");
      }
    }

    if (!refModelId) return true; // 找不到任何模型信息，保守起见认为需要转写

    const { getProfileById } = useLlmProfiles();
    const profile = getProfileById(refProfileId || "");
    const model = profile?.models.find((m) => m.id === refModelId);

    // 如果找不到模型定义，保守起见认为需要转写
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

    if (!isSupportedTranscriptionType(asset)) return false;

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
        return isSupportedTranscriptionType(asset);
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
        // 确定执行转写的模型
        const agentStore = useAgentStore();
        const currentAgent = agentStore.currentAgentId ? agentStore.getAgentById(agentStore.currentAgentId) : null;
        const transcribeModelId = getTranscribeModelIdentifier(assetToCheck, currentAgent);

        if (transcribeModelId) {
          logger.debug("发送前补齐转写任务", { assetId: asset.id, usingModel: transcribeModelId });
          addTask(assetToCheck, { modelId: transcribeModelId });
        } else {
          logger.warn("需要转写但未找到可用模型，跳过任务创建", { assetId: asset.id });
        }
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

  // 注意：不再在 Composable 顶层直接注册 onUnmounted，
  // 因为这个 Composable 经常在非组件上下文（如 resolveAttachmentContent）中被调用。
  // 监听器的清理应该由显式调用 init 的组件负责，或者采用全局单例模式不清理。

  return {
    tasks: transcriptionStore.tasks,
    processingCount: transcriptionStore.processingCount,
    init,
    markAsProcessed,
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
