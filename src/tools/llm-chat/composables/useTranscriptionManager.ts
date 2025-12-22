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
import type { ModelCapabilities } from "@/types/llm-profiles";
import { convertPdfToImages } from "@/utils/pdfUtils";
import SmartOcrRegistry from "@/tools/smart-ocr/smartOcr.registry";

const logger = createModuleLogger("useTranscriptionManager");
const errorHandler = createModuleErrorHandler("useTranscriptionManager");

/**
 * 清理 LLM 输出，移除思考链部分
 * 支持多种常见的思考链格式：
 * - **Reasoning:** ... **Response:**
 * - <think>...</think>
 * - [思考]...[/思考]
 */
const cleanLlmOutput = (text: string): string => {
  let cleaned = text;

  // 1. 移除 **Reasoning:** ... **Response:** 格式
  // 匹配从 **Reasoning:** 开始到 **Response:** 之前的所有内容
  cleaned = cleaned.replace(/\*\*Reasoning:\*\*[\s\S]*?\*\*Response:\*\*\s*/gi, "");

  // 2. 移除 <think>...</think> 格式
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>\s*/gi, "");

  // 3. 移除 [思考]...[/思考] 格式
  cleaned = cleaned.replace(/\[思考\][\s\S]*?\[\/思考\]\s*/gi, "");

  // 4. 移除开头可能残留的 **Response:** 标记
  cleaned = cleaned.replace(/^\s*\*\*Response:\*\*\s*/i, "");

  return cleaned.trim();
};

export interface TranscriptionTask {
  id: string;
  assetId: string;
  assetType: "image" | "audio" | "video" | "document";
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
const lastTaskStartTime = ref(0);

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
      strategy: settings.value.transcription.strategy,
    });

    try {
      await listen<Asset>("asset-imported", (event) => {
        const asset = event.payload;
        const config = settings.value.transcription;

        logger.debug("收到资产导入事件", {
          assetId: asset.id,
          type: asset.type,
          enabled: config.enabled,
          autoStart: config.autoStartOnImport,
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
          profileId,
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
    const existingTask = tasks.find((t) => t.assetId === asset.id);
    if (existingTask) {
      // 如果任务正在处理中或等待中，跳过
      if (existingTask.status === "pending" || existingTask.status === "processing") {
        logger.warn("任务已存在且正在处理中，跳过", { assetId: asset.id, status: existingTask.status });
        return;
      }
      // 如果任务已完成，跳过（不应该重复转写成功的任务）
      if (existingTask.status === "completed") {
        logger.debug("任务已完成，跳过", { assetId: asset.id });
        return;
      }
      // 如果任务是 error 状态，重用该任务而不是创建新任务
      if (existingTask.status === "error") {
        logger.info("重用已存在的失败任务", { assetId: asset.id });
        existingTask.status = "pending";
        existingTask.retryCount = 0;
        existingTask.error = undefined;
        existingTask.path = asset.path; // 更新路径（可能文件被重新导入）
        existingTask.mimeType = asset.mimeType;
        processQueue();
        return;
      }
    }

    // 检查类型支持
    const isSupportedType =
      asset.type === "image" ||
      asset.type === "audio" ||
      asset.type === "video" ||
      (asset.type === "document" && asset.mimeType === "application/pdf");

    if (!isSupportedType) {
      logger.debug("不支持的资产类型，跳过转写", { assetId: asset.id, type: asset.type });
      return;
    }

    const task: TranscriptionTask = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      assetType: asset.type as "image" | "audio" | "video" | "document",
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
   * 等待速率限制冷却
   * 这是一个全局锁，确保任何请求发送（任务启动或批次处理）都遵循最小间隔
   */
  const waitForRateLimit = async () => {
    const executionDelay = settings.value.transcription.executionDelay || 0;
    if (executionDelay <= 0) return;

    // 使用循环确保在多任务竞争中正确等待
    while (true) {
      const now = Date.now();
      const timeSinceLastStart = now - lastTaskStartTime.value;

      if (timeSinceLastStart >= executionDelay) {
        lastTaskStartTime.value = now; // 更新时间戳，抢占当前时间槽
        return;
      }

      const waitTime = executionDelay - timeSinceLastStart;
      // logger.debug(`速率限制冷却中，等待 ${waitTime}ms`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  };

  /**
   * 处理任务队列
   */
  const processQueue = async () => {
    const maxConcurrent = settings.value.transcription.maxConcurrentTasks;
    if (processingCount.value >= maxConcurrent) return;

    const pendingTask = tasks.find((t) => t.status === "pending");
    if (!pendingTask) return;

    // 预先标记状态以避免重复调度（虽然在 await waitForRateLimit 期间可能会有其他调度进来，但 find 只会找 pending 的）
    // 但为了安全，我们在获取锁之后再检查一次状态

    // 等待速率限制
    // 注意：这里会阻塞当前 processQueue 的执行，但不会阻塞 UI
    await waitForRateLimit();

    // 再次检查条件，因为等待期间可能发生了变化
    if (processingCount.value >= maxConcurrent) return;
    if (pendingTask.status !== "pending") return; // 已经被其他调度处理了

    pendingTask.status = "processing";
    processingCount.value++;

    // 尝试调度下一个任务（非阻塞），以填满并发池
    processQueue();

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
    const timeout = config.timeout;

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
      } else if (task.assetType === "document") {
        // 假设 PDF 使用与图片相同的配置
        modelIdentifier = config.image.modelIdentifier || modelIdentifier;
        prompt = config.image.customPrompt || prompt;
        temperature = config.image.temperature ?? temperature;
        maxTokens = config.image.maxTokens ?? maxTokens;
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
          const tempFullPath = `${basePath}/${task.tempFilePath}`.replace(/\\/g, "/");
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
        const fullPath = `${basePath}/${assetPath}`.replace(/\\/g, "/");

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
                logger.info(`视频大小 (${sizeMB.toFixed(2)}MB) 超过阈值 (${maxDirectSizeMB}MB)，将尝试压缩`, {
                  assetId: task.assetId,
                });
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

            logger.info("开始压缩视频", {
              input: fullPath,
              output: outputPath,
              preset,
              maxSizeMb: maxDirectSizeMB,
              maxFps,
              maxResolution,
            });

            // 调用 Rust 压缩
            await invoke("compress_video", {
              inputPath: fullPath,
              outputPath: outputPath,
              preset: preset,
              ffmpegPath: ffmpegPath, // 补上漏传的 ffmpegPath
              maxSizeMb: maxDirectSizeMB,
              maxFps: maxFps,
              maxResolution: maxResolution,
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

    // 2. 检查图片是否需要切图
    let imageBatchData: { base64: string }[] | undefined;
    if (task.assetType === "image") {
      const enableSlicer = !!config.enableImageSlicer;
      const slicerConfig = config.imageSlicerConfig;

      if (enableSlicer) {
        const buffer = await assetManagerEngine.getAssetBinary(finalPath);
        const blob = new Blob([buffer], { type: task.mimeType });
        const dataUrl = URL.createObjectURL(blob);

        try {
          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
          });

          const ocrRegistry = new SmartOcrRegistry();
          const { blocks } = await ocrRegistry.sliceImage(img, slicerConfig, task.assetId);

          if (blocks.length > 1) {
            logger.info(`图片触发智能切图，共切分为 ${blocks.length} 块`, { assetId: task.assetId });
            imageBatchData = blocks.map((b) => ({ base64: b.dataUrl.split(",")[1] }));
          }
        } catch (e) {
          logger.warn("图片切图检查失败，将使用原图", e);
        } finally {
          URL.revokeObjectURL(dataUrl);
        }
      }
    }

    // 3. 构建 LLM 请求内容
    const [profileId, modelId] = modelIdentifier.split(":");
    if (!profileId || !modelId) {
      throw new Error(`无效的模型标识符: ${modelIdentifier}`);
    }
    const profile = getProfileById(profileId);
    const model = profile?.models.find((m) => m.id === modelId);
    const capabilities = model?.capabilities || {};

    const content: LlmMessageContent[] = [];

    // PDF 特殊处理
    if (task.assetType === "document" && task.mimeType === "application/pdf") {
      await handlePdfTranscription(task, content, capabilities);
    } else {
      // 原有逻辑：处理 Image, Audio, Video
      const buffer = await assetManagerEngine.getAssetBinary(finalPath);
      const base64Data = await convertArrayBufferToBase64(buffer);
      content.push(createMediaContent(task, base64Data));
    }

    // 4. 构建 Prompt
    if (!prompt) {
      if (task.assetType === "video") {
        prompt = "请详细描述这段视频的内容，包括主要事件、场景变化和关键信息。输出格式为 Markdown。";
      } else if (task.assetType === "audio") {
        prompt = "请详细转写这段音频的内容，区分不同的说话人（如果有）。输出格式为 Markdown。";
      } else if (task.assetType === "document") {
        prompt =
          "这是一个多页文档，请详细描述每一页的内容，提取关键信息和文字。按页码顺序依次描述。输出格式为 Markdown。";
      } else {
        prompt = "请详细描述这张图片的内容，包括主要物体、文字信息（OCR）和场景细节。输出格式为 Markdown。";
      }
    }

    // 检查是否有分批数据需要处理（PDF 或 切分后的图片）
    const pdfBatchData = (content as LlmMessageContent[] & {
      _pdfBatchData?: { pageNumber: number; base64: string; width: number; height: number }[];
    })._pdfBatchData;

    let transcriptionText: string;

    if (pdfBatchData || imageBatchData) {
      // 分批处理模式
      const batches = pdfBatchData
        ? pdfBatchData.map(img => ({ base64: img.base64, label: `第 ${img.pageNumber} 页` }))
        : imageBatchData!.map((img, i) => ({ base64: img.base64, label: `第 ${i + 1} 部分` }));

      transcriptionText = await processBatches(
        batches,
        prompt,
        profileId,
        modelId,
        temperature,
        maxTokens,
        timeout
      );
    } else {
      // 常规模式：将 prompt 插入到内容数组的开头
      content.unshift({ type: "text", text: prompt });

      const requestOptions: LlmRequestOptions = {
        profileId,
        modelId,
        messages: [{ role: "user", content }],
        stream: false,
        temperature,
        maxTokens,
        timeout,
      };

      // 5. 发送请求
      const response = await sendRequest(requestOptions);
      transcriptionText = response.content;
    }

    // 6. 清理思考链并保存结果
    const cleanedText = cleanLlmOutput(transcriptionText);
    const resultPath = await saveTranscriptionResult(task.assetId, assetPath, cleanedText, modelId);
    task.resultPath = resultPath;
  };

  const createMediaContent = (task: TranscriptionTask, base64Data: string): LlmMessageContent => {
    const mimeType = task.mimeType!;
    switch (task.assetType) {
      case "image":
        return { type: "image", imageBase64: base64Data };
      case "audio":
        return { type: "audio", source: { type: "base64", media_type: mimeType, data: base64Data } };
      case "video":
        return { type: "video", source: { type: "base64", media_type: mimeType, data: base64Data } };
      case "document":
        // 对于原生支持的 PDF
        return { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64Data } };
      default:
        throw new Error(`Unsupported asset type for media content: ${task.assetType}`);
    }
  };

  // PDF 分批处理常量
  const PDF_BATCH_SIZE = 5; // 每批处理的页数

  const handlePdfTranscription = async (
    task: TranscriptionTask,
    content: LlmMessageContent[],
    capabilities: ModelCapabilities
  ) => {
    const buffer = await assetManagerEngine.getAssetBinary(task.path);

    // 方案一：如果模型原生支持 PDF
    if (capabilities.document) {
      logger.debug("模型原生支持 PDF，直接发送", { assetId: task.assetId });
      const base64Data = await convertArrayBufferToBase64(buffer);
      content.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: base64Data,
        },
      });
      return;
    }

    // 方案二：如果模型不支持 PDF，但支持视觉，则将 PDF 转为图片
    if (capabilities.vision) {
      logger.debug("模型不支持 PDF 但支持视觉，回退到逐页转图片", { assetId: task.assetId });

      const images = await convertPdfToImages(buffer);

      if (images.length === 0) {
        throw new Error("PDF 转图片失败：未生成任何图片");
      }

      // 如果页数较少，直接全部放入 content
      if (images.length <= PDF_BATCH_SIZE) {
        for (const img of images) {
          content.push({
            type: "image",
            imageBase64: img.base64,
          });
        }
        return;
      }

      // 页数较多时，标记需要分批处理
      // 我们将图片数据附加到 content 的特殊结构中，由调用方处理
      // 使用特殊的 _pdfBatchData 标记
      (content as LlmMessageContent[] & { _pdfBatchData?: typeof images })._pdfBatchData = images;
      logger.info(`PDF 页数 (${images.length}) 超过单批限制 (${PDF_BATCH_SIZE})，将进行分批转写`);
      return;
    }

    throw new Error("无法处理 PDF：模型既不支持原生 PDF，也不支持视觉（图片）");
  };

  /**
   * 分批处理媒体数据并合并转写结果
   */
  const processBatches = async (
    items: { base64: string; label: string }[],
    prompt: string,
    profileId: string,
    modelId: string,
    temperature: number,
    maxTokens: number,
    timeout?: number
  ): Promise<string> => {
    const batches: typeof items[] = [];
    for (let i = 0; i < items.length; i += PDF_BATCH_SIZE) {
      batches.push(items.slice(i, i + PDF_BATCH_SIZE));
    }

    logger.info(`开始分批处理，共 ${items.length} 项，分为 ${batches.length} 批`);

    const batchResults: string[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      // 每一批次发送前，也需要等待速率限制
      // 这样可以确保即使是同一个任务内的连续请求，也不会违反全局速率限制
      // 同时也让其他并发任务有机会插入（公平竞争时间槽）
      await waitForRateLimit();

      const batch = batches[batchIndex];
      const startLabel = batch[0].label;
      const endLabel = batch[batch.length - 1].label;

      logger.debug(`处理第 ${batchIndex + 1}/${batches.length} 批 (${startLabel} 到 ${endLabel})`);

      const batchContent: LlmMessageContent[] = [
        {
          type: "text",
          text: `${prompt}\n\n[这是内容的 ${startLabel} 到 ${endLabel}，共 ${items.length} 项]`,
        },
      ];

      for (const item of batch) {
        batchContent.push({
          type: "image",
          imageBase64: item.base64,
        });
      }

      const requestOptions: LlmRequestOptions = {
        profileId,
        modelId,
        messages: [{ role: "user", content: batchContent }],
        stream: false,
        temperature,
        maxTokens,
        timeout,
      };

      const response = await sendRequest(requestOptions);
      batchResults.push(`## ${startLabel}-${endLabel}\n\n${response.content}`);
    }

    // 合并所有批次的结果
    return batchResults.join("\n---\n\n");
  };

  /**
   * 保存转写结果
   */
  const saveTranscriptionResult = async (
    assetId: string,
    assetPath: string,
    text: string,
    provider: string
  ): Promise<string> => {
    try {
      // 构建保存路径: derived/{type}/{date}/{uuid}/transcription.md
      // assetPath 格式为: {type}/{date}/{uuid}/{filename}
      const pathParts = assetPath.split("/");
      if (pathParts.length < 3) {
        throw new Error(`无法解析资产路径结构: ${assetPath}`);
      }

      const typeDir = pathParts[0]; // e.g., "image", "audio", "video", "document"
      const dateDir = pathParts[1]; // e.g., "2024-01-01"

      // 相对路径
      const derivedRelPath = `derived/${typeDir}/${dateDir}/${assetId}/transcription.md`;

      // 获取绝对路径以进行写入
      const basePath = await assetManagerEngine.getAssetBasePath();
      // 简单的路径拼接，注意 Windows 兼容性
      const fullPath = `${basePath}/${derivedRelPath}`.replace(/\\/g, "/");
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf("/"));

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
  const getTranscriptionStatus = (
    asset: Asset
  ): "none" | "pending" | "processing" | "success" | "error" => {
    // 1. 检查队列
    const task = tasks.find((t) => t.assetId === asset.id);
    if (task) {
      if (task.status === "error") return "error";
      if (task.status === "pending") return "pending";
      // completed 状态需要进一步检查，因为 asset 可能还没更新
      if (task.status === "completed" && task.resultPath) return "success";
      return "processing";
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
      const fullPath = `${basePath}/${path}`.replace(/\\/g, "/");
      await remove(fullPath);
      logger.debug("已清理临时文件", { path });
    } catch (e) {
      logger.warn("清理临时文件失败 (可能已不存在)", { path, error: e });
    }
  };

  /**
   * 检查附件是否需要转写（基于模型能力，不考虑消息深度）
   * @param asset 资产对象
   * @param modelId 当前使用的模型 ID
   * @param profileId 配置文件 ID
   */
  const checkTranscriptionNecessity = (asset: Asset, modelId: string, profileId: string): boolean => {
    const config = settings.value.transcription;
    if (!config.enabled) return false;

    const isSupportedType =
      asset.type === "image" ||
      asset.type === "audio" ||
      asset.type === "video" ||
      (asset.type === "document" && asset.mimeType === "application/pdf");

    if (!isSupportedType) return false;

    // 1. Always 策略：总是转写
    if (config.strategy === "always") {
      return true;
    }

    // 2. Smart 策略：根据模型能力判断
    if (config.strategy === "smart") {
      const profile = getProfileById(profileId);
      const model = profile?.models.find((m) => m.id === modelId);

      if (!model) {
        logger.warn("无法找到模型信息，默认需要转写", { modelId, profileId });
        return true;
      }

      const capabilities = model.capabilities || {};

      if (asset.type === "image") {
        return !capabilities.vision;
      }

      if (asset.type === "audio") {
        return !capabilities.audio;
      }

      if (asset.type === "video") {
        return !capabilities.video;
      }

      if (asset.type === "document" && asset.mimeType === "application/pdf") {
        // 如果模型原生支持 PDF (document:true)，则不需要转写。否则需要（通过转为图片）
        return !capabilities.document;
      }
    }

    return false;
  };

  /**
   * 计算附件在发送时是否会使用转写结果
   * 这是一个统一的方法，综合考虑：
   * 1. 模型能力（通过 checkTranscriptionNecessity）
   * 2. 消息深度和强制转写设置（forceTranscriptionAfter）
   * @param asset 资产对象
   * @param modelId 模型 ID
   * @param profileId 配置文件 ID
   * @param messageDepth 消息深度（可选，0 表示最新消息，未提供则不考虑深度）
   * @returns true 表示发送时会使用转写结果，false 表示会使用原始媒体
   */
  const computeWillUseTranscription = (
    asset: Asset,
    modelId: string,
    profileId: string,
    messageDepth?: number
  ): boolean => {
    const config = settings.value.transcription;

    // 如果转写功能未启用，永远不会使用转写
    if (!config.enabled) return false;

    // 检查资产类型是否支持转写
    const isSupportedType =
      asset.type === "image" ||
      asset.type === "audio" ||
      asset.type === "video" ||
      (asset.type === "document" && asset.mimeType === "application/pdf");

    if (!isSupportedType) {
      return false;
    }

    // 1. 检查消息深度是否触发强制转写
    if (
      config.strategy === "smart" &&
      messageDepth !== undefined &&
      config.forceTranscriptionAfter > 0 &&
      messageDepth >= config.forceTranscriptionAfter
    ) {
      // 强制转写：无论模型是否支持，都会使用转写
      return true;
    }

    // 2. 检查模型能力
    // 如果模型不支持该媒体类型，则需要使用转写
    return checkTranscriptionNecessity(asset, modelId, profileId);
  };

  /**
   * 确保所有需要转写的附件都已完成转写
   * 用于 "send_and_wait" 模式
   * @param assets 资产数组
   * @param modelId 模型 ID
   * @param profileId 配置文件 ID
   * @param forceAssetIds 强制转写的资产 ID 集合（无论模型是否支持，例如基于消息深度）
   * @returns 更新后的 Asset 映射 (id -> Asset)，包含最新的转写状态
   */
  const ensureTranscriptions = async (
    assets: Asset[],
    modelId: string,
    profileId: string,
    forceAssetIds?: Set<string>
  ): Promise<Map<string, Asset>> => {
    // 用于存储更新后的 Asset
    const updatedAssets = new Map<string, Asset>();

    // 初始化：先将所有传入的 Asset 放入映射
    for (const asset of assets) {
      updatedAssets.set(asset.id, asset);
    }

    // 筛选需要转写的资产：
    // 1. 根据模型能力需要转写的
    // 2. 被强制要求转写的（forceAssetIds）
    const assetsToTranscribe = assets.filter((asset) => {
      // 检查是否被强制要求转写
      const isForced = forceAssetIds?.has(asset.id) ?? false;
      if (isForced) {
        // 强制转写只对支持的媒体类型有效
        return (
          asset.type === "image" ||
          asset.type === "audio" ||
          asset.type === "video" ||
          (asset.type === "document" && asset.mimeType === "application/pdf")
        );
      }
      // 否则根据模型能力判断
      return checkTranscriptionNecessity(asset, modelId, profileId);
    });

    if (assetsToTranscribe.length === 0) return updatedAssets;

    logger.info("开始确保转写任务", {
      count: assetsToTranscribe.length,
      forcedCount: forceAssetIds?.size ?? 0,
      assets: assetsToTranscribe.map((a) => a.name),
    });

    // 1. 触发所有未开始的任务
    for (const asset of assetsToTranscribe) {
      // 在检查状态前，先获取最新的 Asset 对象，以确保 metadata 是最新的
      const latestAsset = await assetManagerEngine.getAssetById(asset.id);
      const assetToCheck = latestAsset || asset; // 如果获取失败，则回退到传入的 asset

      // 更新映射
      updatedAssets.set(asset.id, assetToCheck);

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
          if (s === "pending" || s === "processing") {
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

          // 更新映射（确保最终返回的是最新状态）
          updatedAssets.set(asset.id, assetToCheck);

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
          resolve(updatedAssets);
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
    computeWillUseTranscription,
    ensureTranscriptions,
  };
}
