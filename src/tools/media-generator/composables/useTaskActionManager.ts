import type { Ref } from "vue";
import type { MediaTask, MediaMessage, MediaTaskType } from "../types";
import type { Asset } from "@/types/asset-management";
import { useNodeManager } from "./useNodeManager";
import { createModuleLogger } from "@/utils/logger";

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
   * 添加新任务（同时生成消息流节点）
   */
  const addTaskNode = (task: MediaTask, attachments: Asset[]) => {
    const { nodes, tasks, activeLeafId, rootNodeId } = context;

    // 1. 记录任务
    tasks.value.unshift(task);

    // 2. 创建用户消息节点
    const userNode = nodeManager.createNode({
      role: "user",
      content: task.input.prompt,
      parentId: activeLeafId.value || rootNodeId.value,
      attachments: attachments.length > 0 ? [...attachments] : undefined,
    }) as MediaMessage;

    nodes.value[userNode.id] = userNode;
    if (userNode.parentId && nodes.value[userNode.parentId]) {
      nodes.value[userNode.parentId].childrenIds.push(userNode.id);
    }

    // 3. 创建助手消息节点（绑定任务）
    const assistantNode = nodeManager.createNode({
      role: "assistant",
      content: "",
      parentId: userNode.id,
      status: "generating",
      metadata: {
        taskId: task.id,
        isMediaTask: true,
        includeContext: task.input.includeContext,
        taskSnapshot: JSON.parse(JSON.stringify(task)), // 保存快照用于重试
      },
    }) as MediaMessage;

    assistantNode.id = task.id; // 保持 ID 一致，方便追踪
    nodes.value[assistantNode.id] = assistantNode;
    userNode.childrenIds.push(assistantNode.id);

    // 更新活跃叶子
    activeLeafId.value = assistantNode.id;

    logger.info("任务与消息节点已添加", {
      taskId: task.id,
      type: task.type,
      leafId: activeLeafId.value,
    });

    return { userNode, assistantNode };
  };

  /**
   * 获取重试所需的任务参数
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
      const assistantId = node.childrenIds.find((id) => nodes.value[id]?.role === "assistant");
      if (assistantId) {
        task = nodes.value[assistantId].metadata?.taskSnapshot;
      }
    }

    if (task) {
      // 姐姐，重试时我们直接使用当前界面的全局配置
      // 这样姐姐只要在侧边栏换了模型，点重试就能立即生效
      const mediaType = task.type;
      const configForType = currentConfig.value.types[mediaType];
      const { modelCombo, params: currentParams } = configForType;

      // 稳健解析当前选中的模型 ID
      const [profileId, modelId] = (modelCombo || "").includes(":")
        ? modelCombo.split(":")
        : (modelCombo || "").split("/");

      if (!profileId || !modelId) {
        logger.warn("重试失败：当前未选择有效的生成模型");
        return null;
      }

      return {
        isMediaTask: true,
        type: mediaType,
        options: {
          ...currentParams,
          seed: -1,
          prompt: task.input.prompt, // 仅保留原始提示词
          modelId,
          profileId,
          // 从节点恢复附件上下文
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
      const parentNode = nodes.value[node.parentId!];
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

    // 如果是用户消息且没有关联任务，则作为新 Prompt 触发当前配置的生成
    if (node.role === "user") {
      const mediaType = currentConfig.value.activeType;
      const configForType = currentConfig.value.types[mediaType];
      const { modelCombo, params } = configForType;
      const [profileId, modelId] = (modelCombo || "").split(":");

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
