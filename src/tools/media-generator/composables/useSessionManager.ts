import { v4 as uuidv4 } from "uuid";
import type { GenerationSession, MediaTypeConfig } from "../types";
import { useMediaStorage } from "./useMediaStorage";
import { useNodeManager } from "./useNodeManager";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("media-generator/session-manager");
const errorHandler = createModuleErrorHandler("media-generator/session-manager");

export function useSessionManager() {
  const storage = useMediaStorage();
  const nodeManager = useNodeManager();

  /**
   * 创建默认的媒体类型配置模板
   */
  const createDefaultTypeConfig = (): MediaTypeConfig => ({
    modelCombo: "",
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
    },
  });

  /**
   * 创建一个全新的会话对象
   */
  const createSessionObject = (name?: string): GenerationSession => {
    const newId = uuidv4();
    const now = new Date().toISOString();

    // 初始化根节点
    const rootNode = nodeManager.createNode({
      role: "system",
      content: "Media Generation Root",
      parentId: null,
      name: "Root",
    });

    const session: GenerationSession = {
      id: newId,
      name: name || `新生成会话`,
      type: "media-gen",
      createdAt: now,
      updatedAt: now,
      tasks: [],
      generationConfig: {
        activeType: "image",
        includeContext: false,
        types: {
          image: createDefaultTypeConfig(),
          video: createDefaultTypeConfig(),
          audio: createDefaultTypeConfig(),
        },
      },
      nodes: {
        [rootNode.id]: rootNode as any,
      },
      rootNodeId: rootNode.id,
      activeLeafId: rootNode.id,
      inputPrompt: "",
    };

    return session;
  };

  /**
   * 加载所有会话
   */
  const loadSessions = async () => {
    try {
      const result = await storage.loadSessions();
      logger.info("加载会话成功", { sessionCount: result.sessions.length });
      return result;
    } catch (error) {
      errorHandler.handle(error as Error, { userMessage: "加载会话失败" });
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
    loadSessions,
    persistSession,
    deleteSession,
  };
}
