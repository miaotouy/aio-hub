import { ref, reactive } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, mkdir, stat, remove } from "@tauri-apps/plugin-fs";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useChatSettings } from "./useChatSettings";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useAgentStore } from "../agentStore";
import { convertArrayBufferToBase64 } from "@/utils/base64";
import type { Asset, DerivedDataInfo } from "@/types/asset-management";
import type { LlmRequestOptions, LlmMessageContent } from "@/llm-apis/common";

const logger = createModuleLogger("useTranscriptionManager");
const errorHandler = createModuleErrorHandler("useTranscriptionManager");

export interface TranscriptionTask {
  id: string;
  assetId: string;
  assetType: "image" | "audio" | "video";
  path: string; // Asset relative path
  status: "pending" | "processing" | "completed" | "error";
  error?: string;
  retryCount: number;
  createdAt: number;
  mimeType?: string;
  resultPath?: string; // 缓存结果路径，解决 Asset 更新延迟导致的读取失败问题
  tempFilePath?: string; // 临时文件路径（如压缩后的视频），用于重试复用和最终清理
}

// 单例状态
const tasks = reactive<TranscriptionTask[]>([]);
const processingCount = ref(0);
const isInitialized = ref(false);

export function useTranscriptionManager() {
  const { settings } = useChatSettings();
  const { sendRequest } = useLlmRequest();
  const { getProfileById } = useLlmProfiles();

  /**
   * 初始化管理器，监听资产导入事件
   */
  const init = async () => {
    if (isInitialized.value) {
      logger.debug("转写管理器已初始化，跳过 init");
      return;
    }

    logger.info("正在初始化转写管理器...", {
      enabled: settings.value.transcription.enabled,
      autoStart: settings.value.transcription.autoStartOnImport,
      strategy: settings.value.transcription.strategy
    });

    try {
      await listen<Asset>("asset-imported", (event) => {
        const asset = event.payload;
        const config = settings.value.transcription;

        logger.debug("收到资产导入事件", {
          assetId: asset.id,
          type: asset.type,
          enabled: config.enabled,
          autoStart: config.autoStartOnImport
        });

        if (!config.enabled || !config.autoStartOnImport) {
          logger.debug("转写功能未启用或未开启自动转写，跳过", { config });
          return;
        }

        // 获取当前 Agent 配置以进行智能判断
        const agentStore = useAgentStore();
        const currentAgentId = agentStore.currentAgentId;

        // 默认使用转写配置中的模型（仅作占位，实际 checkTranscriptionNecessity 会处理）
        let modelId = "";
        let profileId = "";

        // 尝试获取当前会话使用的模型信息
        // 这对于 Smart 策略至关重要：我们需要知道"发送时会用哪个模型"来决定是否需要转写
        if (currentAgentId) {
          const agentConfig = agentStore.getAgentConfig(currentAgentId);
          if (agentConfig) {
            modelId = agentConfig.modelId;
            profileId = agentConfig.profileId;
          }
        }

        const necessary = checkTranscriptionNecessity(asset, modelId, profileId);

        // 检查是否已经有转写结果（例如秒传的文件）
        const currentStatus = getTranscriptionStatus(asset);
        const alreadyTranscribed = currentStatus === "success";

        logger.debug("转写必要性检查", {
          assetId: asset.id,
          necessary,
          alreadyTranscribed,
          status: currentStatus,
          modelId,
          profileId
        });

        if (necessary) {
          if (alreadyTranscribed) {
            logger.info("资产已有转写结果，跳过自动转写", { assetId: asset.id });
          } else {
            logger.info("自动触发转写任务 (导入时)", { assetId: asset.id });
            addTask(asset);
          }
        }
      });
      isInitialized.value = true;
      logger.info("转写管理器初始化成功");
    } catch (error) {
      errorHandler.handle(error, { userMessage: "初始化转写管理器失败" });
    }
  };

  /**
   * 添加任务到队列
   */
  const addTask = (asset: Asset) => {
    // 检查是否已存在任务
    if (tasks.some((t) => t.assetId === asset.id && t.status !== "error")) {
      logger.warn("任务已存在，跳过", { assetId: asset.id });
      return;
    }

    // 检查类型支持
    if (asset.type !== "image" && asset.type !== "audio" && asset.type !== "video") {
      logger.debug("不支持的资产类型，跳过转写", { assetId: asset.id, type: asset.type });
      return;
    }

    const task: TranscriptionTask = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      assetType: asset.type as "image" | "audio" | "video",
      path: asset.path,
      status: "pending",
      retryCount: 0,
      createdAt: Date.now(),
      mimeType: asset.mimeType,
    };

    tasks.push(task);
    processQueue();
  };

  /**
   * 处理任务队列
   */
  const processQueue = async () => {
    const maxConcurrent = settings.value.transcription.maxConcurrentTasks;
    if (processingCount.value >= maxConcurrent) return;

    const pendingTask = tasks.find((t) => t.status === "pending");
    if (!pendingTask) return;

    pendingTask.status = "processing";
    processingCount.value++;

    try {
      await executeTranscription(pendingTask);
      pendingTask.status = "completed";

      // 任务成功，清理临时文件
      if (pendingTask.tempFilePath) {
        cleanupTempFile(pendingTask.tempFilePath);
        pendingTask.tempFilePath = undefined;
      }
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "转写任务失败",
        context: { taskId: pendingTask.id, assetId: pendingTask.assetId },
        showToUser: false,
      });

      const maxRetries = settings.value.transcription.maxRetries;
      if (pendingTask.retryCount < maxRetries) {
        pendingTask.retryCount++;
        pendingTask.status = "pending"; // 重试
        logger.info(`任务 ${pendingTask.id} 将重试 (${pendingTask.retryCount}/${maxRetries})`);
      } else {
        pendingTask.status = "error";
        pendingTask.error = error instanceof Error ? error.message : String(error);

        // 更新 Asset 的 derived 状态为错误
        await updateDerivedStatus(pendingTask.assetId, {
          updatedAt: new Date().toISOString(),
          error: pendingTask.error,
        });

        // 任务最终失败，清理临时文件
        if (pendingTask.tempFilePath) {
          cleanupTempFile(pendingTask.tempFilePath);
          pendingTask.tempFilePath = undefined;
        }
      }
    } finally {
      processingCount.value--;
      processQueue(); // 继续处理下一个
    }
  };

  /**
   * 执行转写逻辑
   */
  const executeTranscription = async (task: TranscriptionTask) => {
    const config = settings.value.transcription;
    let modelIdentifier = config.modelIdentifier;
    let prompt = config.customPrompt;
    let temperature = config.temperature;
    let maxTokens = config.maxTokens;

    // 处理分类型精细配置
    if (config.enableTypeSpecificConfig) {
      if (task.assetType === "image") {
        modelIdentifier = config.image.modelIdentifier || modelIdentifier;
        prompt = config.image.customPrompt || prompt;
        temperature = config.image.temperature ?? temperature;
        maxTokens = config.image.maxTokens ?? maxTokens;
      } else if (task.assetType === "audio") {
        modelIdentifier = config.audio.modelIdentifier || modelIdentifier;
        prompt = config.audio.customPrompt || prompt;
        temperature = config.audio.temperature ?? temperature;
        maxTokens = config.audio.maxTokens ?? maxTokens;
      } else if (task.assetType === "video") {
        modelIdentifier = config.video.modelIdentifier || modelIdentifier;
        prompt = config.video.customPrompt || prompt;
        temperature = config.video.temperature ?? temperature;
        maxTokens = config.video.maxTokens ?? maxTokens;
      }
    }

    if (!modelIdentifier) {
      throw new Error("未配置转写模型");
    }

    // 1. 获取二进制数据 (处理视频压缩逻辑)
    const assetPath = task.path;
    let finalPath = assetPath;

    // 视频特殊处理：检查是否需要压缩，或复用已有的压缩文件
    if (task.assetType === "video") {
      // 检查是否有可复用的临时文件
      let reuseTempFile = false;
      if (task.tempFilePath) {
        try {
          // 验证文件是否存在
          const basePath = await assetManagerEngine.getAssetBasePath();
          const tempFullPath = `${basePath}/${task.tempFilePath}`.replace(/\\/g, '/');
          await stat(tempFullPath);
          finalPath = task.tempFilePath;
          reuseTempFile = true;
          logger.info("复用已有的压缩视频文件", { assetId: task.assetId, path: finalPath });
        } catch (e) {
          logger.warn("记录的临时文件不存在，将重新压缩", { path: task.tempFilePath });
          task.tempFilePath = undefined;
        }
      }

      if (!reuseTempFile) {
        const ffmpegPath = config.ffmpegPath;
        const maxDirectSizeMB = config.video?.maxDirectSizeMB || 10;

        // 获取文件信息
        const basePath = await assetManagerEngine.getAssetBasePath();
        const fullPath = `${basePath}/${assetPath}`.replace(/\\/g, '/');

        let shouldCompress = false;
        // 只有在启用了压缩且配置了 FFmpeg 路径时才进行检查
        if (config.video?.enableCompression && ffmpegPath) {
          // 检查 FFmpeg 是否可用
          const isFfmpegAvailable = await invoke<boolean>("check_ffmpeg_availability", { path: ffmpegPath });
          if (isFfmpegAvailable) {
            try {
              // 检查文件大小
              const fileStat = await stat(fullPath);
              const sizeMB = fileStat.size / (1024 * 1024);

              if (sizeMB > maxDirectSizeMB) {
                shouldCompress = true;
                logger.info(`视频大小 (${sizeMB.toFixed(2)}MB) 超过阈值 (${maxDirectSizeMB}MB)，将尝试压缩`, { assetId: task.assetId });
              } else {
                logger.debug(`视频大小 (${sizeMB.toFixed(2)}MB) 未超过阈值，直接上传`, { assetId: task.assetId });
              }
            } catch (e) {
              logger.warn("无法获取视频文件大小，将尝试直接处理", e);
            }
          }
        }

        if (shouldCompress) {
          try {
            // 固定使用 auto_size 策略，目标是压缩到 maxDirectSizeMB
            const preset = "auto_size";
            const maxFps = config.video?.maxFps || 12;
            const maxResolution = config.video?.maxResolution || 720;
            const outputPath = `${fullPath}_compressed.mp4`; // 临时文件路径

            logger.info("开始压缩视频", { input: fullPath, output: outputPath, preset, maxSizeMb: maxDirectSizeMB, maxFps, maxResolution });

            // 调用 Rust 压缩
            await invoke("compress_video", {
              inputPath: fullPath,
              outputPath: outputPath,
              preset: preset,
              ffmpegPath: ffmpegPath, // 补上漏传的 ffmpegPath
              maxSizeMb: maxDirectSizeMB,
              maxFps: maxFps,
              maxResolution: maxResolution
            });

            // 构建压缩文件的相对路径，以便通过 AssetManager 读取
            // outputPath 是 fullPath + 后缀，所以它仍在 Asset 目录内，可以通过相对路径访问
            finalPath = `${assetPath}_compressed.mp4`;
            task.tempFilePath = finalPath; // 记录临时文件路径以便复用和清理
            logger.info("视频压缩完成，使用压缩文件", { finalPath });
          } catch (e) {
            logger.error("视频压缩失败，回退到原始文件", e);
            // 回退到原始文件
            finalPath = assetPath;
          }
        }
      }
    }

    const buffer = await assetManagerEngine.getAssetBinary(finalPath);

    // 使用 Worker 转换 Base64，避免阻塞 UI
    const base64Data = await convertArrayBufferToBase64(buffer);

    // 2. 确定 MIME Type
    let mimeType = task.mimeType;
    if (!mimeType) {
      // Fallback: 如果 Task 中没有 mimeType (旧任务)，尝试推断
      const ext = assetPath.split(".").pop()?.toLowerCase();
      if (task.assetType === "audio") {
        mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;
      } else if (task.assetType === "video") {
        mimeType = ext === "mp4" ? "video/mp4" : `video/${ext}`;
      } else {
        mimeType = ext === "png" ? "image/png" : `image/${ext}`;
      }
      logger.warn("Task 缺少 mimeType，使用后缀推断", { assetId: task.assetId, mimeType });
    }

    // 3. 构建 Prompt
    if (!prompt) {
      if (task.assetType === "video") {
        prompt = "请详细描述这段视频的内容，包括主要事件、场景变化和关键信息。输出格式为 Markdown。";
      } else if (task.assetType === "audio") {
        prompt = "请详细转写这段音频的内容，区分不同的说话人（如果有）。输出格式为 Markdown。";
      } else {
        prompt = "请详细描述这张图片的内容，包括主要物体、文字信息（OCR）和场景细节。输出格式为 Markdown。";
      }
    }

    // 4. 构建 LLM 请求
    const [profileId, modelId] = modelIdentifier.split(":");
    if (!profileId || !modelId) {
      throw new Error(`无效的模型标识符: ${modelIdentifier}`);
    }


    const content: LlmMessageContent[] = [
      { type: "text", text: prompt }
    ];

    if (task.assetType === "image") {
      content.push({
        type: "image",
        imageBase64: base64Data
      });
    } else if (task.assetType === "audio") {
      content.push({
        type: "audio",
        source: {
          type: "base64",
          media_type: mimeType!,
          data: base64Data,
        },
      });
    } else if (task.assetType === "video") {
      content.push({
        type: "video",
        source: {
          type: "base64",
          media_type: mimeType!,
          data: base64Data,
        },
        // 转写任务的目的是获取全部内容，因此不应附加 videoMetadata。
        // videoMetadata 应该在用户直接与视频进行交互式对话时，由 asset-resolver 根据需要添加。
      });
    }

    const requestOptions: LlmRequestOptions = {
      profileId,
      modelId,
      messages: [
        { role: "user", content }
      ],
      stream: false,
      temperature,
      maxTokens,
    };

    // 5. 发送请求
    const response = await sendRequest(requestOptions);
    const transcriptionText = response.content;

    // 6. 保存结果
    const resultPath = await saveTranscriptionResult(task.assetId, assetPath, transcriptionText, modelId);
    task.resultPath = resultPath;
  };

  /**
   * 保存转写结果
   */
  const saveTranscriptionResult = async (assetId: string, assetPath: string, text: string, provider: string): Promise<string> => {
    try {
      // 构建保存路径: derived/{type}/{date}/{uuid}/transcription.md
      const pathParts = assetPath.split('/');
      if (pathParts.length < 3) {
        throw new Error(`无法解析资产路径结构: ${assetPath}`);
      }

      const typeDir = pathParts[0];
      const dateDir = pathParts[1];

      // 相对路径
      const derivedRelPath = `derived/${typeDir}/${dateDir}/${assetId}/transcription.md`;

      // 获取绝对路径以进行写入
      const basePath = await assetManagerEngine.getAssetBasePath();
      // 简单的路径拼接，注意 Windows 兼容性
      const fullPath = `${basePath}/${derivedRelPath}`.replace(/\\/g, '/');
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));

      // 创建目录
      await mkdir(dirPath, { recursive: true });

      // 写入文件
      await writeTextFile(fullPath, text);

      // 更新元数据
      await updateDerivedStatus(assetId, {
        path: derivedRelPath,
        updatedAt: new Date().toISOString(),
        provider,
      });

      logger.info("转写结果保存成功", { assetId, path: derivedRelPath });
      return derivedRelPath;
    } catch (e) {
      throw new Error(`保存转写文件失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /**
   * 更新 Asset 的 derived 状态
   */
  const updateDerivedStatus = async (assetId: string, info: DerivedDataInfo) => {
    try {
      await invoke("update_asset_derived_data", {
        assetId,
        key: "transcription",
        data: info,
      });
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "更新衍生数据状态失败",
        context: { assetId },
        showToUser: false,
      });
    }
  };

  /**
   * 获取转写状态（用于 UI）
   */
  const getTranscriptionStatus = (asset: Asset): "none" | "pending" | "processing" | "success" | "error" => {
    // 1. 检查队列
    const task = tasks.find((t) => t.assetId === asset.id);
    if (task) {
      if (task.status === "error") return "error";
      return task.status === "completed" ? "success" : "processing";
    }

    // 2. 检查 Asset 元数据
    const derived = asset.metadata?.derived?.transcription;
    if (derived) {
      if (derived.error) return "error";
      if (derived.path) return "success";
    }

    return "none";
  };

  /**
   * 重试转写任务
   */
  const retryTranscription = (asset: Asset) => {
    const existingTask = tasks.find((t) => t.assetId === asset.id);
    if (existingTask) {
      logger.info("重试转写任务", { assetId: asset.id });
      existingTask.status = "pending";
      existingTask.retryCount = 0;
      existingTask.error = undefined;
      // 补充 mimeType
      if (!existingTask.mimeType) {
        existingTask.mimeType = asset.mimeType;
      }
      processQueue();
    } else {
      addTask(asset);
    }
  };

  /**
   * 手动更新转写内容
   */
  const updateTranscriptionContent = async (asset: Asset, text: string) => {
    try {
      const derived = asset.metadata?.derived?.transcription;
      const provider = derived?.provider || "manual";

      // 复用 saveTranscriptionResult
      await saveTranscriptionResult(asset.id, asset.path, text, provider);
      logger.info("手动更新转写内容成功", { assetId: asset.id });
    } catch (error) {
      errorHandler.handle(error, { userMessage: "更新转写内容失败" });
      throw error;
    }
  };

  /**
   * 获取转写文本
   */
  const getTranscriptionText = async (asset: Asset): Promise<string | null> => {
    // 1. 优先从任务中获取路径（针对刚刚完成但 Asset 尚未同步的情况）
    const task = tasks.find((t) => t.assetId === asset.id && t.status === "completed" && t.resultPath);
    let path = task?.resultPath;

    // 2. 如果任务中没有，则从 Asset 元数据获取
    if (!path) {
      path = asset.metadata?.derived?.transcription?.path;
    }

    if (!path) return null;

    try {
      // 统一使用 assetManagerEngine 读取，保持数据流向一致
      // 读取为二进制然后解码，避免直接调用后端 read_text_file
      const buffer = await assetManagerEngine.getAssetBinary(path);
      const text = new TextDecoder("utf-8").decode(buffer);
      return text;
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "读取转写文件失败",
        context: { path },
        showToUser: false,
      });
      return null;
    }
  };
  /**
   * 清理临时文件
   */
  const cleanupTempFile = async (path: string) => {
    try {
      const basePath = await assetManagerEngine.getAssetBasePath();
      const fullPath = `${basePath}/${path}`.replace(/\\/g, '/');
      await remove(fullPath);
      logger.debug("已清理临时文件", { path });
    } catch (e) {
      logger.warn("清理临时文件失败 (可能已不存在)", { path, error: e });
    }
  };

  /**
   * 检查附件是否需要转写
   * @param asset 资产对象
   * @param modelId 当前使用的模型 ID
   */
  const checkTranscriptionNecessity = (asset: Asset, modelId: string, profileId: string): boolean => {
    const config = settings.value.transcription;
    if (!config.enabled) return false;

    // 1. Always 策略：总是转写（只要是支持的类型）
    if (config.strategy === "always") {
      return asset.type === "image" || asset.type === "audio";
    }

    // 3. Smart 策略：根据模型能力判断
    if (config.strategy === "smart") {
      const profile = getProfileById(profileId);
      const model = profile?.models.find((m) => m.id === modelId);

      if (!model) {
        logger.warn("无法找到模型信息，默认需要转写", { modelId, profileId });
        return true;
      }

      const capabilities = model.capabilities || {};

      if (asset.type === "image") {
        // 如果模型支持视觉识别，且支持该图片格式（这里简化判断，假设支持所有图片），则不需要转写
        // 反之，如果不支持视觉，则需要转写
        return !capabilities.vision;
      }

      if (asset.type === "audio") {
        // 如果模型支持音频输入，则不需要转写
        return !capabilities.audio;
      }

      if (asset.type === "video") {
        // 如果模型支持视频输入，则不需要转写
        return !capabilities.video;
      }
    }

    return false;
  };

  /**
   * 确保所有需要转写的附件都已完成转写
   * 用于 "send_and_wait" 模式
   * @returns Promise，当所有必要的转写都完成（或失败）后 resolve
   */
  const ensureTranscriptions = async (
    assets: Asset[],
    modelId: string,
    profileId: string
  ): Promise<void> => {
    const assetsToTranscribe = assets.filter(asset =>
      checkTranscriptionNecessity(asset, modelId, profileId)
    );

    if (assetsToTranscribe.length === 0) return;

    logger.info("开始确保转写任务", {
      count: assetsToTranscribe.length,
      assets: assetsToTranscribe.map(a => a.name)
    });

    // 1. 触发所有未开始的任务
    for (const asset of assetsToTranscribe) {
      // 在检查状态前，先获取最新的 Asset 对象，以确保 metadata 是最新的
      const latestAsset = await assetManagerEngine.getAssetById(asset.id);
      const assetToCheck = latestAsset || asset; // 如果获取失败，则回退到传入的 asset

      const status = getTranscriptionStatus(assetToCheck);
      if (status === "none" || status === "error") {
        // 如果是 error 状态，自动重试
        if (status === "error") {
          retryTranscription(assetToCheck);
        } else {
          addTask(assetToCheck);
        }
      }
    }

    // 2. 等待所有任务完成
    // 使用轮询检查状态，并增加超时保护
    const timeoutMs = settings.value.transcription.timeout || 120000;

    return new Promise((resolve, reject) => {
      let isSettled = false;

      // 超时计时器
      const timeoutTimer = setTimeout(async () => {
        if (isSettled) return;
        isSettled = true;
        clearInterval(checkInterval);

        // 获取最新的挂起任务数量
        let pendingCount = 0;
        for (const asset of assetsToTranscribe) {
          const latestAsset = await assetManagerEngine.getAssetById(asset.id);
          const assetToCheck = latestAsset || asset;
          const s = getTranscriptionStatus(assetToCheck);
          if (s === 'pending' || s === 'processing') {
            pendingCount++;
          }
        }

        logger.warn("等待转写任务超时", {
          timeoutMs,
          pendingCount,
        });

        reject(new Error("等待转写超时"));
      }, timeoutMs);

      // 轮询检查
      const checkInterval = setInterval(async () => {
        if (isSettled) return;

        let allFinished = true;

        for (const asset of assetsToTranscribe) {
          // 关键修复：获取最新的 Asset 对象
          const latestAsset = await assetManagerEngine.getAssetById(asset.id);
          const assetToCheck = latestAsset || asset; // 回退到旧的以防万一

          const status = getTranscriptionStatus(assetToCheck);
          // 只要有一个还在 pending 或 processing，就继续等待
          if (status === "pending" || status === "processing") {
            allFinished = false;
            break;
          }
        }

        if (allFinished) {
          isSettled = true;
          clearInterval(checkInterval);
          clearTimeout(timeoutTimer);
          logger.info("所有转写任务已结束");
          resolve();
        }
      }, 500); // 每 500ms 检查一次
    });
  };

  return {
    tasks,
    processingCount,
    init,
    addTask,
    retryTranscription,
    updateTranscriptionContent,
    getTranscriptionStatus,
    getTranscriptionText,
    checkTranscriptionNecessity,
    ensureTranscriptions,
  };
}