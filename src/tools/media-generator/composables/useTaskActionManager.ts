// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type { Ref } from "vue";
import type { MediaTask, MediaMessage, MediaTaskType } from "../types";
import { normalizeMediaTaskType } from "../types";
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

  const resolveTaskType = (task: MediaTask): MediaTaskType => {
    const rawType = task.type as string;
    if (rawType !== "audio") return normalizeMediaTaskType(rawType, "image");

    const params = task.input?.params || {};
    const modelText =
      `${task.input?.modelId || ""} ${task.input?.profileId || ""}`.toLowerCase();
    return modelText.includes("suno") ||
      params.suno_mode !== undefined ||
      params.tags ||
      params.make_instrumental !== undefined
      ? "music"
      : "speech";
  };

  /**
   * 添加新任务（同时生成消息流节点）
   * 对齐 Chat 逻辑：新消息永远挂在当前活跃节点下。
   * 如果当前活跃节点是同内容的 User 节点，则合并。
   */
  const addTaskNode = (task: MediaTask, attachments: Asset[]) => {
    const { nodes, tasks, activeLeafId, rootNodeId } = context;
    const sessionContext = getSessionContext();

    // 1. 记录任务。会话提交路径会先写入全局任务池，这里只补漏，避免任务列表重复。
    if (!tasks.value.some((item) => item.id === task.id)) {
      tasks.value.unshift(task);
    }

    let parentUserNodeId: string;
    const currentNode = nodes.value[activeLeafId.value];

    // 2. 挂载点判断
    // 移除复杂的重试挂载逻辑，新消息始终挂在当前活跃节点下
    if (
      currentNode?.role === "user" &&
      currentNode.content === task.input.prompt
    ) {
      // 情况 A: 当前活跃节点就是同一个 Prompt 的 User 节点，直接挂在它下面
      parentUserNodeId = currentNode.id;
      logger.debug("在现有 User 节点下直接追加生成", { parentUserNodeId });
    } else {
      // 情况 B: 创建新的 User 节点，挂在当前 activeLeafId 后面
      const userNode = nodeManager.createNode({
        role: "user",
        content: task.input.prompt,
        parentId: activeLeafId.value || rootNodeId.value || null,
        attachments: attachments.length > 0 ? [...attachments] : undefined,
      }) as MediaMessage;

      nodeManager.addNodeToSession(sessionContext, userNode);
      syncActiveLeaf(sessionContext);
      parentUserNodeId = userNode.id;
      logger.debug("创建了新的 User 节点", {
        userNodeId: userNode.id,
        parentId: userNode.parentId,
      });
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
        (id) =>
          nodes.value[id]?.role === "assistant" &&
          nodes.value[id]?.metadata?.isMediaTask
      );
      if (assistantId) {
        task = nodes.value[assistantId].metadata?.taskSnapshot;
      }
    }

    if (task) {
      const mediaType = resolveTaskType(task);
      const configForType = currentConfig.value.types[mediaType];
      const { modelCombo, params: currentParams } = configForType;
      const [profileId, modelId] = parseModelCombo(modelCombo);
      const snapshotProfileId = task.input?.profileId;
      const snapshotModelId = task.input?.modelId;
      const snapshotParamKeys = task.input?.params
        ? Object.keys(task.input.params)
        : [];
      const currentParamKeys = currentParams ? Object.keys(currentParams) : [];

      if (!profileId || !modelId) {
        logger.warn("获取参数失败：当前未选择有效的生成模型", {
          messageId,
          mediaType,
          currentModelCombo: modelCombo,
          snapshotProfileId,
          snapshotModelId,
        });
        return null;
      }

      logger.info("重生成参数解析完成", {
        messageId,
        mediaType,
        currentModelCombo: modelCombo,
        currentProfileId: profileId,
        currentModelId: modelId,
        snapshotProfileId,
        snapshotModelId,
        isUsingDifferentModel:
          snapshotProfileId !== profileId || snapshotModelId !== modelId,
        currentParamKeys,
        snapshotParamKeys,
      });

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
