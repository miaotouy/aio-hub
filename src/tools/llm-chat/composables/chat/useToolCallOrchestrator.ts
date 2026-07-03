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

import type {
  ChatSessionDetail,
  ChatMessageNode,
  LlmParameters,
  UserProfile,
  ChatAgent,
} from "../../types";
import { useSingleNodeExecutor } from "./useSingleNodeExecutor";
import { useToolCalling } from "@/tools/tool-calling/composables/useToolCalling";
import { useToolCallingStore } from "../../stores/toolCallingStore";
import { useSessionManager } from "../session/useSessionManager";
import { useNodeManager } from "../session/useNodeManager";
import { useChatResponseHandler } from "./useChatResponseHandler";
import { useLlmChatStore } from "../../stores/llmChatStore";
import { parseToolRequests } from "@/tools/tool-calling/core/parser";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/tool-call-orchestrator");

export interface OrchestrateParams {
  session: ChatSessionDetail;
  /** 初始助手响应节点 */
  assistantNode: ChatMessageNode;
  /** 到用户消息的完整路径 */
  pathToUserNode: ChatMessageNode[];
  isContinuation?: boolean;
  /** Agent 配置 */
  agentConfig: {
    profileId: string;
    modelId: string;
    parameters: LlmParameters;
  };
  /** 完整的执行 Agent 对象 */
  executionAgent: ChatAgent;
  /** 生效的用户档案 */
  effectiveUserProfile: UserProfile | null;
  /** 外部传入的状态集合 */
  abortControllers: Map<string, AbortController>;
  generatingNodes: Set<string>;
  /** 是否为 VCP 渠道 */
  isVcpChannel: boolean;
  /** 是否为重新解析模式（跳过第一轮 LLM 请求，直接解析现有内容） */
  isReparse?: boolean;
}

export function useToolCallOrchestrator() {
  const { execute: executeSingleNode } = useSingleNodeExecutor();
  const { resolveProtocol, processCycle, formatCycleResults } =
    useToolCalling();
  const { handleNodeError } = useChatResponseHandler();

  const toolCallingStore = useToolCallingStore();
  const sessionManager = useSessionManager();
  const nodeManager = useNodeManager();

  const orchestrate = async (params: OrchestrateParams): Promise<void> => {
    const {
      session,
      assistantNode,
      pathToUserNode,
      isContinuation,
      agentConfig,
      executionAgent,
      effectiveUserProfile,
      abortControllers,
      generatingNodes,
      isVcpChannel,
      isReparse = false,
    } = params;

    const llmChatStore = useLlmChatStore();

    // 1. 创建共享的 AbortController
    const abortController = new AbortController();

    // 跟踪所有在该次执行中注册过的节点 ID，用于最后统一清理
    const trackedNodeIds = new Set<string>();

    const registerNode = (nodeId: string) => {
      trackedNodeIds.add(nodeId);
      generatingNodes.add(nodeId);
      abortControllers.set(nodeId, abortController);
    };

    // 重新解析模式下，只在需要新请求时才标记为生成中
    if (!isReparse) {
      registerNode(assistantNode.id);
    }

    let currentAssistantNode = assistantNode;
    let currentPathToUserNode = [...pathToUserNode];
    let iterationCount = 0;
    const maxIterations = executionAgent.toolCallConfig?.maxIterations ?? 5;

    // 速率限制状态
    let lastRequestStartTime = 0;
    let lastStreamEndTime = 0;

    try {
      while (iterationCount < maxIterations) {
        iterationCount++;

        let responseContent: string;

        // 2. 执行单次请求（重新解析模式下第一轮跳过）
        if (isReparse && iterationCount === 1) {
          // 重新解析模式：直接使用现有内容
          logger.info(`🔄 重新解析模式：使用现有内容进行工具调用检测`);
          responseContent = currentAssistantNode.content;
        } else {
          if (iterationCount > 1) {
            logger.info(`🔄 开始第 ${iterationCount} 轮工具调用迭代...`);
          }

          // --- 速率限制等待逻辑 ---
          const rateLimitEnabled =
            executionAgent.toolCallConfig?.rateLimitEnabled ?? false;
          const rateLimitInterval =
            executionAgent.toolCallConfig?.rateLimitInterval ?? 0;

          if (rateLimitInterval > 0) {
            let delayMs = 0;
            const now = Date.now();
            if (rateLimitEnabled) {
              // 在结束时速率限制：从上一次流结束（即上一次请求完成）开始算起
              if (lastStreamEndTime > 0) {
                delayMs = rateLimitInterval * 1000 - (now - lastStreamEndTime);
              }
            } else {
              // 默认速率限制：从上一次请求开始算起
              if (lastRequestStartTime > 0) {
                delayMs =
                  rateLimitInterval * 1000 - (now - lastRequestStartTime);
              }
            }

            if (delayMs > 0) {
              logger.info(
                `⏳ 触发速率限制，等待 ${Math.ceil(delayMs / 1000)} 秒...`
              );
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }

          // 确保节点已注册
          if (!generatingNodes.has(currentAssistantNode.id)) {
            registerNode(currentAssistantNode.id);
          }

          lastRequestStartTime = Date.now();

          const { response } = await executeSingleNode({
            session,
            assistantNode: currentAssistantNode,
            currentPathToUserNode,
            isContinuation: iterationCount === 1 ? isContinuation : false,
            agentConfig,
            executionAgent,
            effectiveUserProfile,
            abortController,
          });

          lastStreamEndTime = Date.now();

          // 节点完成后立即从生成集合中移除
          generatingNodes.delete(currentAssistantNode.id);

          if (!response) break;
          responseContent = response.content;
        }

        // 3. 工具调用检测与执行
        if (executionAgent.toolCallConfig?.enabled && !isVcpChannel) {
          let toolNode: ChatMessageNode | null = null;

          const ensureNodesCreated = async (
            parsedRequests: Array<{
              requestId: string;
              toolName: string;
              args: any;
            }>
          ) => {
            if (toolNode) return;

            // 💡 逻辑延迟：避开上一个助手节点结束时的 UI 测量高峰。
            // AI 消息结束瞬间立即插入工具节点会导致虚拟列表高度计算竞争，引起滚动位置跳动或列表错乱。
            // 这里延迟一些给 UI 留出足够的缓冲时间。
            await import("vue").then((m) => m.nextTick());
            if (toolNode) return;

            const logPrefix = isReparse ? "🛠️ 重新解析：" : "🛠️";
            logger.info(
              `${logPrefix}检测到 ${parsedRequests.length} 个工具请求，准备执行...`
            );

            // 1. 更新助手节点的元数据，记录请求
            currentAssistantNode.metadata = {
              ...currentAssistantNode.metadata,
              toolCallsRequested: parsedRequests.map((req) => ({
                requestId: req.requestId,
                toolName: req.toolName,
                args: req.args,
                status: "awaiting_approval",
              })),
            };

            // 2. 创建工具节点
            const newNode: ChatMessageNode = {
              id: `tool-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              parentId: currentAssistantNode.id,
              childrenIds: [],
              role: "tool",
              content: "",
              status: "generating",
              timestamp: new Date().toISOString(),
              metadata: {
                agentId: executionAgent.id,
                isReparse: isReparse || undefined,
                // 提前注入工具调用信息，初始状态为等待审批
                toolCalls: parsedRequests.map((req) => ({
                  requestId: req.requestId,
                  toolName: req.toolName,
                  status: "awaiting_approval",
                  rawArgs: req.args,
                })),
              },
            };
            toolNode = newNode;

            // 3. 挂载到会话树
            if (session.nodes) session.nodes[newNode.id] = newNode;
            currentAssistantNode.childrenIds.push(newNode.id);
            generatingNodes.add(newNode.id);

            // 4. 切换到新分支
            nodeManager.updateActiveLeaf(session, newNode.id);
            const index = llmChatStore.sessionIndexMap.get(session.id);
            if (index) {
              sessionManager.persistSession(index, session, session.id);
            }
          };

          // --- 提前解析并创建节点 ---
          const protocol = resolveProtocol(
            executionAgent.toolCallConfig?.protocol || "vcp"
          );
          const preParsedRequests = parseToolRequests(
            responseContent,
            protocol
          );

          if (preParsedRequests.length > 0) {
            await ensureNodesCreated(
              preParsedRequests.map((req) => ({
                requestId: req.requestId,
                toolName: req.toolName,
                args: req.args,
              }))
            );
          }

          const cycleResult = await processCycle(
            responseContent,
            executionAgent.toolCallConfig,
            async (request) =>
              await toolCallingStore.requestApproval(session.id, request),
            async (requestId, status) => {
              // 简化回调：仅更新已有节点的元数据状态
              if (toolNode && session.nodes?.[toolNode.id]) {
                const node = session.nodes[toolNode.id];
                if (node.metadata?.toolCalls) {
                  const tc = node.metadata.toolCalls.find(
                    (t) => t.requestId === requestId
                  );
                  if (tc) {
                    tc.status = status;

                    // 同步更新助手节点的请求状态
                    const req =
                      currentAssistantNode.metadata?.toolCallsRequested?.find(
                        (r) => r.requestId === requestId
                      );
                    if (req) req.status = status;

                    // 持久化以触发 UI 更新
                    const index = llmChatStore.sessionIndexMap.get(session.id);
                    if (index) {
                      sessionManager.persistSession(index, session, session.id);
                    }
                  }
                }
              }
            }
          );

          if (cycleResult.hasToolRequests) {
            const toolResultText = formatCycleResults(
              cycleResult.executionResults,
              executionAgent.toolCallConfig.protocol
            );

            if (toolNode) {
              const node = toolNode as ChatMessageNode;
              logger.info(`🛠️ 更新工具节点状态（正常完成）`, {
                nodeId: node.id,
                executionResultsCount: cycleResult.executionResults.length,
                contentLength: toolResultText.length,
              });

              // 强制触发响应式更新：替换整个节点对象
              const updatedNode: ChatMessageNode = {
                ...node,
                content: toolResultText,
                status: "complete",
                metadata: {
                  ...node.metadata,
                  toolCalls: cycleResult.executionResults.map((res, idx) => ({
                    requestId: res.requestId,
                    toolName: res.toolName,
                    status: res.status,
                    durationMs: res.durationMs,
                    rawArgs: cycleResult.parsedRequests[idx]?.args,
                  })),
                },
              };

              // 替换 session.nodes 中的节点引用
              if (session.nodes) {
                session.nodes[node.id] = updatedNode;
              }
              toolNode = updatedNode;

              generatingNodes.delete(node.id);

              // 确保更新被持久化并触发响应式
              const index = llmChatStore.sessionIndexMap.get(session.id);
              if (index) {
                sessionManager.persistSession(index, session, session.id);
              }
            } else {
              logger.warn(`🛠️ 正常完成时工具节点为 null`);
            }

            if (currentAssistantNode.metadata?.toolCallsRequested) {
              currentAssistantNode.metadata.toolCallsRequested.forEach(
                (req) => {
                  req.status = "completed";
                }
              );
            }

            // 检查是否需要停止循环
            // 如果节点元数据中标记了 isSilent (由 UI 层控制)，或者所有请求都被拒绝，则停止循环
            const isSilent = toolNode?.metadata?.isSilent;
            const isAllDenied = cycleResult.executionResults.every(
              (r) => r.status === "denied"
            );

            if (isSilent || isAllDenied) {
              logger.info(`🛠️ 停止工具调用循环`, { isSilent, isAllDenied });
              break;
            }

            // 创建下一个助手节点
            const nextAssistantNode: ChatMessageNode = {
              id: `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
              parentId: toolNode!.id,
              childrenIds: [],
              role: "assistant",
              content: "",
              status: "generating",
              timestamp: new Date().toISOString(),
              metadata: {
                agentId: executionAgent.id,
                ...currentAssistantNode.metadata,
                firstTokenTime: undefined,
                requestStartTime: Date.now(),
                requestEndTime: undefined,
                usage: undefined,
                contentTokens: undefined,
                toolCallsRequested: undefined,
              },
            };

            if (session.nodes)
              session.nodes[nextAssistantNode.id] = nextAssistantNode;
            toolNode!.childrenIds.push(nextAssistantNode.id);
            generatingNodes.add(nextAssistantNode.id);
            abortControllers.set(nextAssistantNode.id, abortController);

            nodeManager.updateActiveLeaf(session, nextAssistantNode.id);
            const index = llmChatStore.sessionIndexMap.get(session.id);
            if (index) {
              sessionManager.persistSession(index, session, session.id);
            }

            currentPathToUserNode = [
              ...currentPathToUserNode,
              currentAssistantNode,
              toolNode!,
            ];
            currentAssistantNode = nextAssistantNode;
            continue;
          }
        }
        break;
      }

      // 4. 自动命名
      llmChatStore.generateSessionTopic(session.id);
    } catch (error) {
      handleNodeError(
        session,
        currentAssistantNode.id,
        error,
        isReparse ? "重新解析执行" : "请求执行"
      );
    } finally {
      // 5. 清理状态
      abortControllers.delete(assistantNode.id);
      generatingNodes.delete(assistantNode.id);
      if (currentAssistantNode?.id) {
        generatingNodes.delete(currentAssistantNode.id);
        if (currentAssistantNode.id !== assistantNode.id) {
          abortControllers.delete(currentAssistantNode.id);
        }
      }
    }
  };

  /**
   * 重新解析已有节点中的工具调用并继续执行
   * 这是 orchestrate 的便捷包装，设置 isReparse=true
   */
  const reparseAndOrchestrate = async (
    params: OrchestrateParams
  ): Promise<void> => {
    return orchestrate({ ...params, isReparse: true });
  };

  return { orchestrate, reparseAndOrchestrate };
}
