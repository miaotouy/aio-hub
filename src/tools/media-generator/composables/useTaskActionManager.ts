import type { Ref } from "vue";
import type { MediaTask, MediaMessage, MediaTaskType } from "../types";
import type { Asset } from "@/types/asset-management";
import { useNodeManager } from "./useNodeManager";
import { createModuleLogger } from "@/utils/logger";
import { parseModelCombo } from "@/utils/modelIdUtils";

const logger = createModuleLogger("media-generator/task-action-manager");

/**
 * 任务操作管理器
 * 负责复杂的任务添加、重试参数提取等业务逻辑
 */
export function useTaskActionManager(context: {
  nodes: Ref<Record<string, MediaMessage>>;
  tasks: Ref<MediaTask[]>;
  activeLeafId: Ref<string>;
  rootNodeId: Ref<string>;
  currentConfig: Ref<{
    activeType: MediaTaskType;
    includeContext: boolean;
    types: Record<MediaTaskType, any>;
  }>;
}) {
  const nodeManager = useNodeManager();

  /**
   * 辅助函数：构造一个符合 GenerationSession 接口要求的上下文对象
   */
  const getSessionContext = () => {
    const { nodes, activeLeafId, rootNodeId } = context;
    return {
      id: "current",
      nodes: nodes.value,
      activeLeafId: activeLeafId.value,
      rootNodeId: rootNodeId.value,
      updatedAt: new Date().toISOString(),
    } as any;
  };

  /**
   * 内部同步 activeLeafId 到 sessionContext
   */
  const syncActiveLeaf = (session: any) => {
    context.activeLeafId.value = session.activeLeafId;
  };

  /**
   * 添加新任务（同时生成消息流节点）
   * 逻辑自动识别是"追加新对话"还是"在现有节点上创建分支"
   */
  const addTaskNode = (task: MediaTask, attachments: Asset[]) => {
    const { nodes, tasks, activeLeafId, rootNodeId } = context;
    const sessionContext = getSessionContext();

    // 1. 记录任务
    tasks.value.unshift(task);

    let parentUserNodeId: string;
    const currentNode = nodes.value[activeLeafId.value];

    // 2. 状态机判断挂载点
    if (currentNode?.role === "assistant") {
      // 情况 A: 当前是在助手节点上发起的（通常是重试或同一 Prompt 的多次尝试）
      // 挂载点是它的父 User 节点
      parentUserNodeId = currentNode.parentId!;
      logger.debug("在现有 Assistant 的父 User 下创建新分支", { parentUserNodeId });
    } else if (currentNode?.role === "user") {
      // 情况 B: 当前是在 User 节点上发起的
      if (currentNode.content === task.input.prompt) {
        // 同 Prompt 生成（如并行生成多张图）
        parentUserNodeId = currentNode.id;
        logger.debug("在现有 User 节点下直接追加生成", { parentUserNodeId });
      } else {
        // Prompt 变了，在当前 User 节点后开新分支
        const userNode = nodeManager.createNode({
          role: "user",
          content: task.input.prompt,
          parentId: currentNode.id,
          attachments: attachments.length > 0 ? [...attachments] : undefined,
        }) as MediaMessage;

        nodeManager.addNodeToSession(sessionContext, userNode);
        syncActiveLeaf(sessionContext);
        parentUserNodeId = userNode.id;
        logger.debug("创建了新的 User 节点挂在旧 User 后", { userNodeId: userNode.id });
      }
    } else {
      // 情况 C: 在 Root 或其他位置发起
      const userNode = nodeManager.createNode({
        role: "user",
        content: task.input.prompt,
        parentId: activeLeafId.value || rootNodeId.value,
        attachments: attachments.length > 0 ? [...attachments] : undefined,
      }) as MediaMessage;

      nodeManager.addNodeToSession(sessionContext, userNode);
      syncActiveLeaf(sessionContext);
      parentUserNodeId = userNode.id;
      logger.debug("创建了全新的 User 节点", { userNodeId: userNode.id });
    }

    // 3. 创建助手消息节点（绑定任务）
    const assistantNode = nodeManager.createNode({
      role: "assistant",
      content: "",
      parentId: parentUserNodeId,
      status: "generating",
      metadata: {
        taskId: task.id,
        isMediaTask: true,
        includeContext: task.input.includeContext,
        taskSnapshot: JSON.parse(JSON.stringify(task)), // 保存快照用于重试
      },
    }) as MediaMessage;

    assistantNode.id = task.id; // 保持 ID 一致
    nodeManager.addNodeToSession(sessionContext, assistantNode);
    syncActiveLeaf(sessionContext);

    logger.info("任务与消息节点已添加", {
      taskId: task.id,
      type: task.type,
      leafId: activeLeafId.value,
    });

    return { userNode: nodes.value[parentUserNodeId], assistantNode };
  };

  /**
   * 获取重试所需的任务参数
   * 这个函数现在是纯读取的，没有任何副作用
   */
  const getRetryParams = (messageId: string) => {
    const { nodes, currentConfig } = context;
    const node = nodes.value[messageId];
    if (!node) return null;

    // 情况 1: 这是一个媒体生成任务相关节点
    let task: MediaTask | undefined;
    if (node.role === "assistant" && node.metadata?.taskSnapshot) {
      task = node.metadata.taskSnapshot;
    } else if (node.role === "user") {
      // 优先找关联了任务的助手子节点
      const assistantId = node.childrenIds.find(
        (id) => nodes.value[id]?.role === "assistant" && nodes.value[id]?.metadata?.isMediaTask,
      );
      if (assistantId) {
        task = nodes.value[assistantId].metadata?.taskSnapshot;
      }
    }

    if (task) {
      const mediaType = task.type;
      const configForType = currentConfig.value.types[mediaType];
      const { modelCombo, params: currentParams } = configForType;
      const [profileId, modelId] = parseModelCombo(modelCombo);

      if (!profileId || !modelId) {
        logger.warn("获取参数失败：当前未选择有效的生成模型");
        return null;
      }

      return {
        isMediaTask: true,
        type: mediaType,
        options: {
          ...currentParams,
          seed: -1,
          prompt: task.input.prompt,
          modelId,
          profileId,
          inputAttachments:
            node.role === "assistant"
              ? node.parentId
                ? nodes.value[node.parentId]?.attachments || []
                : []
              : node.attachments || [],
          includeContext: currentConfig.value.includeContext,
          numInferenceSteps: currentParams.steps,
          guidanceScale: currentParams.cfgScale,
        },
      };
    }

    // 情况 2: 这是一个普通对话节点 (例如提示词优化产生的对话)
    if (node.role === "assistant") {
      const parentNode = node.parentId ? nodes.value[node.parentId] : null;
      if (parentNode) {
        return {
          isMediaTask: false,
          role: "assistant",
          content: parentNode.content,
          parentId: parentNode.id,
          metadata: node.metadata,
        };
      }
    }

    // 情况 3: 如果是用户消息且没有关联任务，则作为新 Prompt 触发当前配置的生成
    if (node.role === "user") {
      const mediaType = currentConfig.value.activeType;
      const configForType = currentConfig.value.types[mediaType];
      const { modelCombo, params } = configForType;
      const [profileId, modelId] = parseModelCombo(modelCombo);

      return {
        isMediaTask: true,
        type: mediaType,
        options: {
          ...params,
          prompt: node.content,
          modelId,
          profileId,
          inputAttachments: node.attachments || [],
          includeContext: currentConfig.value.includeContext,
          numInferenceSteps: params.steps,
          guidanceScale: params.cfgScale,
        },
      };
    }

    return null;
  };

  return {
    addTaskNode,
    getRetryParams,
  };
}
