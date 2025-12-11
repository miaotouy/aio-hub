import { ref, reactive } from "vue";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { writeTextFile, mkdir } from "@tauri-apps/plugin-fs";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { assetManagerEngine } from "@/composables/useAssetManager";
import { useChatSettings } from "./useChatSettings";
import { useLlmRequest } from "@/composables/useLlmRequest";
import type { Asset, DerivedDataInfo } from "@/types/asset-management";
import type { LlmRequestOptions, LlmMessageContent } from "@/llm-apis/common";

const logger = createModuleLogger("useTranscriptionManager");
const errorHandler = createModuleErrorHandler("useTranscriptionManager");

export interface TranscriptionTask {
  id: string;
  assetId: string;
  assetType: "image" | "audio";
  path: string; // Asset relative path
  status: "pending" | "processing" | "completed" | "error";
  error?: string;
  retryCount: number;
  createdAt: number;
  mimeType?: string;
}

// 单例状态
const tasks = reactive<TranscriptionTask[]>([]);
const processingCount = ref(0);
const isInitialized = ref(false);

export function useTranscriptionManager() {
  const { settings } = useChatSettings();
  const { sendRequest } = useLlmRequest();

  /**
   * 初始化管理器，监听资产导入事件
   */
  const init = async () => {
    if (isInitialized.value) return;

    try {
      await listen<Asset>("asset-imported", (event) => {
        const asset = event.payload;
        if (settings.value.transcription.enabled && settings.value.transcription.autoTranscribe) {
          logger.info("检测到新资产导入，自动添加到转写队列", { assetId: asset.id });
          addTask(asset);
        }
      });
      isInitialized.value = true;
      logger.info("转写管理器初始化成功");
    } catch (error) {
      errorHandler.error(error, "初始化转写管理器失败");
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
    if (asset.type !== "image" && asset.type !== "audio") {
      logger.debug("不支持的资产类型，跳过转写", { assetId: asset.id, type: asset.type });
      return;
    }

    const task: TranscriptionTask = {
      id: crypto.randomUUID(),
      assetId: asset.id,
      assetType: asset.type as "image" | "audio",
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
    } catch (error) {
      logger.error("转写任务失败", error, { taskId: pendingTask.id, assetId: pendingTask.assetId });

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
      }
    }

    if (!modelIdentifier) {
      throw new Error("未配置转写模型");
    }

    // 1. 获取二进制数据
    const assetPath = task.path;
    const buffer = await assetManagerEngine.getAssetBinary(assetPath);

    // 使用 Uint8Array 转换 Base64
    const base64Data = uint8ArrayToBase64(new Uint8Array(buffer));

    // 2. 确定 MIME Type
    let mimeType = task.mimeType;
    if (!mimeType) {
      // Fallback: 如果 Task 中没有 mimeType (旧任务)，尝试推断
      const ext = assetPath.split(".").pop()?.toLowerCase();
      if (task.assetType === "audio") {
        mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`;
      } else {
        mimeType = ext === "png" ? "image/png" : `image/${ext}`;
      }
      logger.warn("Task 缺少 mimeType，使用后缀推断", { assetId: task.assetId, mimeType });
    }

    // 3. 构建 Prompt
    if (!prompt) {
      prompt =
        "请详细描述这张图片的内容，包括主要物体、文字信息（OCR）和场景细节。输出格式为 Markdown。";
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
      // 音频处理：使用 document 类型
      content.push({
        type: "document",
        documentSource: {
          type: "base64",
          media_type: mimeType!,
          data: base64Data
        }
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
    await saveTranscriptionResult(task.assetId, assetPath, transcriptionText, modelId);
  };

  /**
   * 保存转写结果
   */
  const saveTranscriptionResult = async (assetId: string, assetPath: string, text: string, provider: string) => {
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
      logger.error("更新衍生数据状态失败", error, { assetId });
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
      errorHandler.error(error, "更新转写内容失败");
      throw error;
    }
  };

  /**
   * 获取转写文本
   */
  const getTranscriptionText = async (asset: Asset): Promise<string | null> => {
    const derived = asset.metadata?.derived?.transcription;
    if (!derived || !derived.path) return null;

    try {
      // 使用后端命令读取文本文件，这样更安全且支持相对路径
      return await invoke<string>("read_text_file", { relativePath: derived.path });
    } catch (error) {
      logger.error("读取转写文件失败", error, { path: derived.path });
      return null;
    }
  };

  // 辅助：Uint8Array 转 Base64
  const uint8ArrayToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
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
  };
}