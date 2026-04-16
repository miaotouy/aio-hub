import type { ChatSessionDetail, ChatMessageNode, LlmParameters, UserProfile, ChatAgent } from "../../types";
import { useSingleNodeExecutor } from "./useSingleNodeExecutor";
import { useToolCalling } from "@/tools/tool-calling/composables/useToolCalling";
import { useToolCallingStore } from "../../stores/toolCallingStore";
import { useSessionManager } from "../session/useSessionManager";
import { useNodeManager } from "../session/useNodeManager";
import { useChatResponseHandler } from "./useChatResponseHandler";
import { useLlmChatStore } from "../../stores/llmChatStore";
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
  const { processCycle, formatCycleResults } = useToolCalling();
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

          // 确保节点已注册
          if (!generatingNodes.has(currentAssistantNode.id)) {
            registerNode(currentAssistantNode.id);
          }

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

          // 节点完成后立即从生成集合中移除
          generatingNodes.delete(currentAssistantNode.id);

          if (!response) break;
          responseContent = response.content;
        }

        // 3. 工具调用检测与执行
        if (executionAgent.toolCallConfig?.enabled && !isVcpChannel) {
          let toolNode: ChatMessageNode | null = null;

          const ensureNodesCreated = async (
            parsedRequests: Array<{ requestId: string; toolName: string; args: any }>,
          ) => {
            if (toolNode) return;

            // 💡 逻辑延迟：避开上一个助手节点结束时的 UI 测量高峰。
            // AI 消息结束瞬间立即插入工具节点会导致虚拟列表高度计算竞争，引起滚动位置跳动或列表错乱。
            // 这里延迟一些给 UI 留出足够的缓冲时间。
            await new Promise((resolve) => setTimeout(resolve, 200));
            if (toolNode) return;

            const logPrefix = isReparse ? "🛠️ 重新解析：" : "🛠️";
            logger.info(`${logPrefix}检测到 ${parsedRequests.length} 个工具请求，准备执行...`);

            // 如果是重新解析模式，我们不修改原始助手节点的元数据，
            // 而是将这些请求信息记录在即将创建的工具节点或新的元数据快照中？
            // 不，为了保持逻辑一致，我们还是记录在当前助手节点上，
            // 但因为是 push 到 childrenIds，它会产生新分支。

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
                // 提前注入工具调用信息，避免 UI 显示“未知工具”
                toolCalls: parsedRequests.map((req) => ({
                  requestId: req.requestId,
                  toolName: req.toolName,
                  status: "executing",
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
            const chatStore = await import("../../stores/llmChatStore").then((m) => m.useLlmChatStore());
            const index = chatStore.sessionIndexMap.get(session.id);
            if (index) {
              sessionManager.persistSession(index, session, session.id);
            }
          };

          const cycleResult = await processCycle(
            responseContent,
            executionAgent.toolCallConfig,
            async (request) => await toolCallingStore.requestApproval(session.id, request),
            async (requestId, status) => {
              // 处理 executing 状态：确保节点已创建
              if (status === "executing") {
                const reqs = currentAssistantNode.metadata?.toolCallsRequested;
                if (reqs) {
                  const req = reqs.find((r) => r.requestId === requestId);
                  if (req) {
                    req.status = "executing";
                    await ensureNodesCreated(
                      reqs.map((r) => ({ requestId: r.requestId, toolName: r.toolName, args: r.args })),
                    );
                    const chatStore = useLlmChatStore();
                    const index = chatStore.sessionIndexMap.get(session.id);
                    if (index) {
                      sessionManager.persistSession(index, session, session.id);
                    }
                  }
                }
              }
            },
          );

          if (cycleResult.hasToolRequests) {
            await ensureNodesCreated(cycleResult.parsedRequests);

            const hasSilentCancel = cycleResult.executionResults.some((r) => r.result === "SILENT_CANCEL");
            const hasSilentStop = cycleResult.executionResults.some((r) => r.silentStop);

            if (hasSilentCancel || hasSilentStop) {
              const toolResultText = formatCycleResults(
                cycleResult.executionResults,
                executionAgent.toolCallConfig.protocol,
              );

              // 如果是静默取消，必须确保工具节点已创建并标记为取消
              if (hasSilentCancel) {
                await ensureNodesCreated(cycleResult.parsedRequests);
              }

              if (toolNode) {
                const node = toolNode as ChatMessageNode;
                logger.info(`🛠️ 更新工具节点状态（静默取消/停止）`, {
                  nodeId: node.id,
                  hasSilentCancel,
                  hasSilentStop,
                  executionResultsCount: cycleResult.executionResults.length,
                });

                // 强制触发响应式更新：替换整个节点对象
                const updatedNode: ChatMessageNode = {
                  ...node,
                  status: "complete",
                  content: hasSilentCancel ? "已取消执行" : toolResultText,
                  metadata: {
                    ...node.metadata,
                    isCancelled: hasSilentCancel || undefined,
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
                const chatStore = useLlmChatStore();
                const index = chatStore.sessionIndexMap.get(session.id);
                if (index) {
                  sessionManager.persistSession(index, session, session.id);
                }
              } else {
                logger.warn(`🛠️ 静默取消/停止时工具节点为 null`, {
                  hasSilentCancel,
                  hasSilentStop,
                });
              }

              if (currentAssistantNode.metadata?.toolCallsRequested) {
                currentAssistantNode.metadata.toolCallsRequested.forEach((req) => {
                  req.status = "completed";
                });
              }

              break;
            }

            const toolResultText = formatCycleResults(
              cycleResult.executionResults,
              executionAgent.toolCallConfig.protocol,
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
              const chatStore = useLlmChatStore();
              const index = chatStore.sessionIndexMap.get(session.id);
              if (index) {
                sessionManager.persistSession(index, session, session.id);
              }
            } else {
              logger.warn(`🛠️ 正常完成时工具节点为 null`);
            }

            if (currentAssistantNode.metadata?.toolCallsRequested) {
              currentAssistantNode.metadata.toolCallsRequested.forEach((req) => {
                req.status = "completed";
              });
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

            if (session.nodes) session.nodes[nextAssistantNode.id] = nextAssistantNode;
            toolNode!.childrenIds.push(nextAssistantNode.id);
            generatingNodes.add(nextAssistantNode.id);
            abortControllers.set(nextAssistantNode.id, abortController);

            nodeManager.updateActiveLeaf(session, nextAssistantNode.id);
            const chatStore = useLlmChatStore();
            const index = chatStore.sessionIndexMap.get(session.id);
            if (index) {
              sessionManager.persistSession(index, session, session.id);
            }

            currentPathToUserNode = [...currentPathToUserNode, currentAssistantNode, toolNode!];
            currentAssistantNode = nextAssistantNode;
            continue;
          }
        }
        break;
      }

      // 4. 自动命名
      const llmChatStore = await import("../../stores/llmChatStore").then((m) => m.useLlmChatStore());
      llmChatStore.generateSessionTopic(session.id);
    } catch (error) {
      handleNodeError(session, assistantNode.id, error, isReparse ? "重新解析执行" : "请求执行");
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
  const reparseAndOrchestrate = async (params: OrchestrateParams): Promise<void> => {
    return orchestrate({ ...params, isReparse: true });
  };

  return { orchestrate, reparseAndOrchestrate };
}
