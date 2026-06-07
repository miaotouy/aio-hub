import { v4 as uuidv4 } from "uuid";
import type {
  GenerationSession,
  GenerationSessionDetail,
  MediaGenerationConfig,
  MediaMessage,
  MediaSessionIndexItem,
  MediaTaskType,
  MediaTypeConfig,
} from "../types";
import { normalizeMediaTaskType } from "../types";
import { useMediaStorage } from "./useMediaStorage";
import { useNodeManager } from "./useNodeManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("media-generator/session-manager");
const errorHandler = createModuleErrorHandler(
  "media-generator/session-manager"
);

export function useSessionManager() {
  const storage = useMediaStorage();
  const nodeManager = useNodeManager();

  /**
   * 更新会话的任务数量统计
   */
  const updateTaskCount = (
    sessionId: string,
    nodes: Record<string, MediaMessage>,
    sessionIndexMap: Map<string, MediaSessionIndexItem>
  ): void => {
    const index = sessionIndexMap.get(sessionId);
    if (index) {
      // 增加 Math.max(0, ...) 保护
      const taskCount = Object.values(nodes).filter(
        (n) => n.metadata?.isMediaTask
      ).length;
      index.taskCount = Math.max(0, taskCount);
      logger.debug("更新任务计数", { sessionId, taskCount: index.taskCount });
    }
  };

  /**
   * 创建默认的媒体类型配置模板
   */
  const createDefaultTypeConfig = (
    type: MediaTaskType = "image"
  ): MediaTypeConfig => ({
    modelCombo: "",
    includeContext: false,
    params: {
      size: "1024x1024",
      quality: "standard",
      style: "vivid",
      negativePrompt: "",
      seed: -1,
      steps: 20,
      cfgScale: 7.0,
      background: "opaque",
      inputFidelity: "low",
      duration: 5,
      durationSeconds: 5,
      aspectRatio: "16:9",
      resolution: "720p",
      promptEnhancement: false,
      generateAudio: false,
      watermark: false,
      cameraFixed: false,
      movementAmplitude: "auto",
      // Suno (NewAPI) 专属
      suno_mode: "simple",
      mv: "chirp-v4",
      tags: "",
      title: "",
      make_instrumental: false,
      audioConfig: {
        voice: "alloy",
        responseFormat: "mp3",
        speed: 1,
      },
      instructions: "",
      ...(type === "music"
        ? {
            quality: "standard",
            // MiniMax Music 专属
            minimax_music_mode: "song",
            lyrics_source: "optimizer",
            lyrics: "",
            lyrics_generation_enabled: false,
            lyrics_generation_prompt: "",
            lyrics_optimizer: true,
            is_instrumental: false,
            output_format: "url",
            audio_url: "",
            audio_setting: {
              sample_rate: 44100,
              bitrate: 256000,
              format: "mp3",
            },
          }
        : {}),
      ...(type === "speech"
        ? {
            quality: "standard",
          }
        : {}),
    },
  });

  const inferLegacyAudioType = (config?: MediaTypeConfig): MediaTaskType => {
    const combo = (config?.modelCombo || "").toLowerCase();
    return combo.includes("suno") ? "music" : "speech";
  };

  const normalizeGenerationConfig = (
    config?: Partial<MediaGenerationConfig> | null
  ): MediaGenerationConfig => {
    const legacyTypes = (config?.types || {}) as Record<
      string,
      MediaTypeConfig
    >;
    const legacyAudioConfig = legacyTypes.audio;
    const rawActiveType = config?.activeType as string | undefined;
    const activeType =
      rawActiveType === "audio"
        ? inferLegacyAudioType(legacyAudioConfig)
        : normalizeMediaTaskType(rawActiveType, "image");
    const legacyIncludeContext = config?.includeContext ?? false;

    return {
      activeType,
      includeContext: legacyIncludeContext,
      types: {
        image: {
          ...createDefaultTypeConfig("image"),
          ...(legacyTypes.image || {}),
          includeContext:
            legacyTypes.image?.includeContext ??
            (activeType === "image" ? legacyIncludeContext : false),
          params: {
            ...createDefaultTypeConfig("image").params,
            ...(legacyTypes.image?.params || {}),
          },
        },
        video: {
          ...createDefaultTypeConfig("video"),
          ...(legacyTypes.video || {}),
          includeContext:
            legacyTypes.video?.includeContext ??
            (activeType === "video" ? legacyIncludeContext : false),
          params: {
            ...createDefaultTypeConfig("video").params,
            ...(legacyTypes.video?.params || {}),
          },
        },
        speech: {
          ...createDefaultTypeConfig("speech"),
          ...(legacyAudioConfig || {}),
          ...(legacyTypes.speech || {}),
          includeContext:
            legacyTypes.speech?.includeContext ??
            legacyAudioConfig?.includeContext ??
            (activeType === "speech" ? legacyIncludeContext : false),
          params: {
            ...createDefaultTypeConfig("speech").params,
            ...(legacyAudioConfig?.params || {}),
            ...(legacyTypes.speech?.params || {}),
          },
        },
        music: {
          ...createDefaultTypeConfig("music"),
          ...(legacyAudioConfig || {}),
          ...(legacyTypes.music || {}),
          includeContext:
            legacyTypes.music?.includeContext ??
            legacyAudioConfig?.includeContext ??
            (activeType === "music" ? legacyIncludeContext : false),
          params: {
            ...createDefaultTypeConfig("music").params,
            ...(legacyAudioConfig?.params || {}),
            ...(legacyTypes.music?.params || {}),
          },
        },
      },
    };
  };

  /**
   * 创建一个全新的会话对象（拆分为 index 和 detail）
   */
  const createSessionObject = (
    name?: string
  ): { index: MediaSessionIndexItem; detail: GenerationSessionDetail } => {
    const newId = uuidv4();
    const now = new Date().toISOString();

    // 初始化根节点
    const rootNode = nodeManager.createNode({
      role: "system",
      content: "Media Generation Root",
      parentId: null,
      name: "Root",
    });

    const index: MediaSessionIndexItem = {
      id: newId,
      name: name || `新生成会话`,
      createdAt: now,
      updatedAt: now,
      taskCount: 0,
    };

    const detail: GenerationSessionDetail = {
      id: newId,
      type: "media-gen",
      updatedAt: now,
      generationConfig: {
        activeType: "image",
        includeContext: false,
        types: {
          image: createDefaultTypeConfig("image"),
          video: createDefaultTypeConfig("video"),
          speech: createDefaultTypeConfig("speech"),
          music: createDefaultTypeConfig("music"),
        },
      },
      nodes: {
        [rootNode.id]: rootNode as any,
      },
      rootNodeId: rootNode.id,
      activeLeafId: rootNode.id,
      inputPrompt: "",
      history: [],
      historyIndex: -1,
    };

    return { index, detail };
  };

  /**
   * 加载会话索引（轻量级）
   */
  const loadSessionsIndex = async () => {
    try {
      const result = await storage.loadSessionsIndex();
      logger.info("加载会话索引成功", { sessionCount: result.sessions.length });
      return result;
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "加载会话索引失败" });
      return { sessions: [], currentSessionId: null };
    }
  };

  /**
   * 加载所有会话（全量加载）
   */
  const loadSessions = async () => {
    try {
      const result = await storage.loadSessionsAll();
      logger.info("加载全量会话成功", { sessionCount: result.sessions.length });
      return result;
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "加载全量会话失败" });
      return { sessions: [], currentSessionId: null };
    }
  };

  /**
   * 持久化会话
   */
  const persistSession = async (session: GenerationSession) => {
    try {
      await storage.persistSession(session, session.id);
      logger.debug("会话已持久化", { sessionId: session.id });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "保存会话失败",
        context: { sessionId: session.id },
      });
    }
  };

  /**
   * 删除会话
   */
  const deleteSession = async (sessionId: string) => {
    try {
      await storage.deleteSession(sessionId);
      logger.info("会话已删除", { sessionId });
      return true;
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "删除会话失败",
        context: { sessionId },
      });
      return false;
    }
  };

  return {
    createSessionObject,
    createDefaultTypeConfig,
    normalizeGenerationConfig,
    loadSessionsIndex,
    loadSessions,
    persistSession,
    deleteSession,
    updateTaskCount,
  };
}
