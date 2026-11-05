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
  ChatAgent,
} from "../../types";
import type {
  ToolCallConfig,
  ParsedToolRequest,
  ToolApprovalResult,
  ToolApprovalSecurityContext,
  ToolCallStatus,
  ToolCallCycleResult,
} from "../../../tool-calling/types";
import type { ToolContext } from "@/services/types";
import type {
  OrchestrateParams,
  SingleNodeExecuteParams,
  SingleNodeExecuteResult,
} from "./types";
import { waitForExecutionDelay } from "./waitForExecutionDelay";
export type { OrchestrateParams } from "./types";

/** Host ports for the existing Agent loop; no store, window, or UI ownership here. */
export interface ChatOrchestrationPorts {
  executeSingleNode(
    params: SingleNodeExecuteParams
  ): Promise<SingleNodeExecuteResult>;
  parseRequests(
    text: string,
    protocol: ToolCallConfig["protocol"]
  ): ParsedToolRequest[];
  processCycle(
    text: string,
    config: ToolCallConfig,
    approve: (
      request: ParsedToolRequest,
      security?: ToolApprovalSecurityContext
    ) => Promise<ToolApprovalResult | boolean>,
    status: (requestId: string, status: ToolCallStatus) => void,
    agent: ToolContext["agent"],
    delegationDepth: number | undefined,
    modelBinding: ToolContext["modelBinding"]
  ): Promise<ToolCallCycleResult>;
  formatCycleResults(
    results: ToolCallCycleResult["executionResults"],
    protocol: ToolCallConfig["protocol"]
  ): string;
  requestApproval(input: {
    sessionId: string;
    request: ParsedToolRequest;
    security?: ToolApprovalSecurityContext;
    signal: AbortSignal;
    agent: ChatAgent;
  }): Promise<ToolApprovalResult>;
  waitForContextCompression(
    sessionId: string,
    signal: AbortSignal
  ): Promise<boolean>;
  getNodePath(session: ChatSessionDetail, nodeId: string): ChatMessageNode[];
  updateActiveLeaf(session: ChatSessionDetail, nodeId: string): void;
  persistSession(session: ChatSessionDetail): void | Promise<void>;
  generateSessionTopic(sessionId: string): void;
  handleNodeError(
    session: ChatSessionDetail,
    nodeId: string,
    error: unknown,
    context: string
  ): void;
  beforeToolNode?(): Promise<void>;
  logger: {
    info(message: string, details?: unknown): void;
    warn(message: string, details?: unknown): void;
  };
}
export interface ChatOrchestrationResult {
  status: "complete" | "cancelled" | "error";
  nodeId: string;
  iterations: number;
  stopReason?: "iteration-limit" | "denied" | "silent";
  error?: unknown;
}

export async function runChatOrchestration(
  params: OrchestrateParams,
  ports: ChatOrchestrationPorts
): Promise<ChatOrchestrationResult> {
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
    consumeTextCallsLocally,
    isReparse = false,
    delegationDepth,
  } = params;

  const {
    executeSingleNode,
    processCycle,
    formatCycleResults,
    handleNodeError,
    logger,
  } = ports;

  // 1. 创建共享的 AbortController
  const abortController = params.abortController ?? new AbortController();

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
  let activeToolNodeId: string | undefined;
  let stopReason: ChatOrchestrationResult["stopReason"];
  const maxIterations = executionAgent.toolCallConfig?.maxIterations ?? 5;

  // 速率限制状态
  let lastRequestStartTime = 0;
  let lastStreamEndTime = 0;

  try {
    while (iterationCount < maxIterations) {
      abortController.signal.throwIfAborted();
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
              delayMs = rateLimitInterval * 1000 - (now - lastRequestStartTime);
            }
          }

          if (delayMs > 0) {
            logger.info(
              `⏳ 触发速率限制，等待 ${Math.ceil(delayMs / 1000)} 秒...`
            );
            await waitForExecutionDelay(delayMs, abortController.signal);
          }
        }

        // 确保节点已注册
        if (!generatingNodes.has(currentAssistantNode.id)) {
          registerNode(currentAssistantNode.id);
        }

        lastRequestStartTime = Date.now();

        const waitedForCompression = await ports.waitForContextCompression(
          session.id,
          abortController.signal
        );
        if (waitedForCompression) {
          const pathEnd =
            currentPathToUserNode[currentPathToUserNode.length - 1]?.id;
          currentPathToUserNode = ports.getNodePath(
            session,
            pathEnd || currentAssistantNode.parentId || ""
          );
        }

        abortController.signal.throwIfAborted();
        const { response } = await executeSingleNode({
          session,
          assistantNode: currentAssistantNode,
          currentPathToUserNode,
          isContinuation: iterationCount === 1 ? isContinuation : false,
          agentConfig,
          executionAgent,
          effectiveUserProfile,
          abortController,
          splitVcpResponses: params.splitVcpResponses,
          onResponseNode: (node) => {
            generatingNodes.delete(currentAssistantNode.id);
            currentAssistantNode = node;
            registerNode(node.id);
          },
        });

        lastStreamEndTime = Date.now();

        // 节点完成后立即从生成集合中移除
        generatingNodes.delete(currentAssistantNode.id);

        if (!response) break;
        responseContent = response.content;
      }

      abortController.signal.throwIfAborted();
      // 3. 工具调用检测与执行
      if (executionAgent.toolCallConfig?.enabled && consumeTextCallsLocally) {
        let toolNode: ChatMessageNode | null = null;
        const statusCheckpoints: Promise<void>[] = [];

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
          await ports.beforeToolNode?.();
          abortController.signal.throwIfAborted();
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
            status: "waiting",
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
          activeToolNodeId = newNode.id;
          registerNode(newNode.id);

          // 4. 切换到新分支
          ports.updateActiveLeaf(session, newNode.id);
          await ports.persistSession(session);
        };

        // --- 提前解析并创建节点 ---
        const preParsedRequests = ports.parseRequests(
          responseContent,
          executionAgent.toolCallConfig?.protocol || "vcp"
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

        abortController.signal.throwIfAborted();
        const cycleResult = await processCycle(
          responseContent,
          executionAgent.toolCallConfig,
          async (request, security) => {
            abortController.signal.throwIfAborted();
            return ports.requestApproval({
              sessionId: session.id,
              request,
              security,
              signal: abortController.signal,
              agent: executionAgent,
            });
          },
          (requestId, status) => {
            // 简化回调：仅更新已有节点的元数据状态
            if (toolNode && session.nodes?.[toolNode.id]) {
              const node = session.nodes[toolNode.id];
              if (node.metadata?.toolCalls) {
                const tc = node.metadata.toolCalls.find(
                  (t) => t.requestId === requestId
                );
                if (tc) {
                  tc.status = status;

                  // 工具节点在审批期间展示等待，审批通过进入执行态。
                  const hasPendingApproval = node.metadata.toolCalls.some(
                    (toolCall) => toolCall.status === "awaiting_approval"
                  );
                  if (hasPendingApproval) {
                    node.status = "waiting";
                  } else if (status === "executing") {
                    node.status = "generating";
                  }

                  // 同步更新助手节点的请求状态
                  const req =
                    currentAssistantNode.metadata?.toolCallsRequested?.find(
                      (r) => r.requestId === requestId
                    );
                  if (req) req.status = status;

                  // 持久化以触发 UI 更新
                  const previous =
                    statusCheckpoints[statusCheckpoints.length - 1] ??
                    Promise.resolve();
                  const checkpoint = previous.then(() =>
                    ports.persistSession(session)
                  );
                  statusCheckpoints.push(checkpoint);
                  // processCycle status callbacks are notifications; drain writes below.
                  void checkpoint.catch(() => {});
                }
              }
            }
          },
          {
            id: executionAgent.id,
            knowledgeAccess: executionAgent.knowledgeAccess,
          },
          delegationDepth,
          { profileId: agentConfig.profileId, modelId: agentConfig.modelId }
        );

        await Promise.all(statusCheckpoints);

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
              localMedia: cycleResult.executionResults.flatMap(
                (result) => result.localMedia ?? []
              ),
              status: "complete",
              metadata: {
                ...node.metadata,
                toolCalls: cycleResult.executionResults.map((res, idx) => ({
                  requestId: res.requestId,
                  toolName: res.toolName,
                  status: res.status,
                  durationMs: res.durationMs,
                  rawArgs: cycleResult.parsedRequests[idx]?.args,
                  resultMetadata: res.metadata,
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
            await ports.persistSession(session);
          } else {
            logger.warn(`🛠️ 正常完成时工具节点为 null`);
          }

          if (currentAssistantNode.metadata?.toolCallsRequested) {
            currentAssistantNode.metadata.toolCallsRequested.forEach((req) => {
              req.status = "completed";
            });
          }

          // Approval cancellation can settle as a denied result. Keep that audit,
          // then classify the run using its owner's cancellation signal.
          abortController.signal.throwIfAborted();

          // 检查是否需要停止循环
          // 如果节点元数据中标记了 isSilent (由 UI 层控制)，或者所有请求都被拒绝，则停止循环
          const isSilent = toolNode?.metadata?.isSilent;
          const isAllDenied = cycleResult.executionResults.every(
            (r) => r.status === "denied"
          );

          if (isSilent || isAllDenied) {
            stopReason = isSilent ? "silent" : "denied";
            logger.info(`🛠️ 停止工具调用循环`, { isSilent, isAllDenied });
            break;
          }

          abortController.signal.throwIfAborted();
          if (iterationCount >= maxIterations) {
            stopReason = "iteration-limit";
            break;
          }
          // 创建下一个助手节点
          const nextAssistantNode: ChatMessageNode = {
            id: `assistant-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            parentId: toolNode!.id,
            childrenIds: [],
            role: "assistant",
            content: "",
            status: "waiting",
            timestamp: new Date().toISOString(),
            metadata: {
              agentId: executionAgent.id,
              ...currentAssistantNode.metadata,
              // A tool result starts a new response with its own reasoning.
              reasoningContent: undefined,
              reasoningArtifacts: undefined,
              reasoningStateStatus: undefined,
              reasoningStateWarning: undefined,
              reasoningStartTime: undefined,
              reasoningEndTime: undefined,
              reasoningActive: undefined,
              reasoningActiveSince: undefined,
              reasoningDurationMs: undefined,
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
          registerNode(nextAssistantNode.id);

          ports.updateActiveLeaf(session, nextAssistantNode.id);
          await ports.persistSession(session);

          currentPathToUserNode = [
            ...currentPathToUserNode,
            currentAssistantNode,
            toolNode!,
          ];
          currentAssistantNode = nextAssistantNode;
          continue;
        }
      }
      abortController.signal.throwIfAborted();
      break;
    }

    // 4. 自动命名
    ports.generateSessionTopic(session.id);
    return {
      status: "complete",
      nodeId: currentAssistantNode.id,
      iterations: iterationCount,
      stopReason,
    };
  } catch (error) {
    handleNodeError(
      session,
      currentAssistantNode.id,
      error,
      isReparse ? "重新解析执行" : "请求执行"
    );
    const toolNode = activeToolNodeId
      ? session.nodes?.[activeToolNodeId]
      : undefined;
    if (
      toolNode &&
      (toolNode.status === "waiting" || toolNode.status === "generating")
    ) {
      toolNode.status = "error";
      toolNode.metadata = {
        ...toolNode.metadata,
        error: abortController.signal.aborted
          ? "已取消"
          : error instanceof Error
            ? error.message
            : String(error),
      };
    }
    await ports.persistSession(session);
    return {
      status: abortController.signal.aborted ? "cancelled" : "error",
      nodeId: currentAssistantNode.id,
      iterations: iterationCount,
      error,
    };
  } finally {
    // 5. 清理状态
    for (const nodeId of trackedNodeIds) {
      abortControllers.delete(nodeId);
      generatingNodes.delete(nodeId);
    }
  }
}
