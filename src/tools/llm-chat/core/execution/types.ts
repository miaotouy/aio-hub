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
  MessageRole,
  ChatSessionDetail,
  ChatMessageNode,
  LlmParameters,
  UserProfile,
  ChatAgent,
} from "../../types";
import type { Asset } from "../../../../types/asset-management";
import type { LlmMessage, LlmReasoningArtifact } from "@/llm-apis/common";

export interface OrchestrateParams {
  /** The execution owner can provide its lifetime controller. */
  abortController?: AbortController;
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
  /** 当前渠道是否允许 AIO 在本地消费文本工具调用。 */
  consumeTextCallsLocally: boolean;
  splitVcpResponses?: boolean;
  /** 是否为重新解析模式（跳过第一轮 LLM 请求，直接解析现有内容） */
  isReparse?: boolean;
  /** 子智能体派发深度（透传至工具执行 ToolContext.delegationDepth） */
  delegationDepth?: number;
}

export interface SingleNodeExecuteParams {
  session: ChatSessionDetail;
  assistantNode: ChatMessageNode;
  /** 到请求上下文末节点的完整路径 */
  currentPathToUserNode: ChatMessageNode[];
  isContinuation?: boolean;
  splitVcpResponses?: boolean;
  onResponseNode?: (node: ChatMessageNode) => void;
  /** Agent 配置片段 */
  agentConfig: {
    profileId: string;
    modelId: string;
    parameters: LlmParameters;
  };
  /** 完整的执行 Agent 对象 */
  executionAgent: ChatAgent;
  /** 生效的用户档案 */
  effectiveUserProfile: UserProfile | null;
  /** 用于取消请求 */
  abortController: AbortController;
}

export interface SingleNodeExecuteResult {
  /** LLM 返回的原始响应 */
  response: any;
  /** 实际发送给 LLM 的消息列表 */
  messagesForRequest: Array<
    LlmMessage & { role: any; reasoningArtifacts?: LlmReasoningArtifact[] }
  >;
}

export interface CreateNodeConfig {
  role: MessageRole;
  content: string;
  parentId: string | null;
  status?: "complete" | "generating" | "waiting" | "error";
  isEnabled?: boolean;
  metadata?: Record<string, any>;
  attachments?: Asset[];
  name?: string;
}
