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

/**
 * 审批仲裁器装配（方案 C：审批入口依赖注入）
 *
 * llmChatStore 初始化时调用一次；全局渠道设置异步加载（fire-and-forget），
 * 仲裁时实时读取。Agent 级配置从 agentStore 的 toolCallConfig.decisionArbitration
 * 解析并合并默认值。
 */

import {
  setApprovalArbiter,
  setTaskApprovalBridge,
} from "@/tools/llm-chat/stores/toolCallingStore";
import {
  createDecisionArbiter,
  getDecisionChannelSettings,
  loadDecisionChannelSettings,
} from "@/services/decision-arbiter";
import { backgroundTaskApprovalBridge } from "@/services/background-tasks/approvalBridge";
import {
  DEFAULT_DECISION_ARBITRATION_CONFIG,
  type DecisionArbitrationConfig,
} from "@/services/decision-arbiter/types";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useLlmChatStore } from "@/tools/llm-chat/stores/llmChatStore";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("llm-chat/arbiter-assembly");

let assembled = false;

/** 解析 Agent 级仲裁配置（未启用 Agent 或未配置时返回默认值）。 */
export function resolveArbitrationConfig(
  agentId?: string
): DecisionArbitrationConfig {
  if (!agentId) return { ...DEFAULT_DECISION_ARBITRATION_CONFIG };
  try {
    const agentStore = useAgentStore();
    const agent = agentStore.getAgentById(agentId);
    const cfg = agent?.toolCallConfig?.decisionArbitration;
    if (!cfg) return { ...DEFAULT_DECISION_ARBITRATION_CONFIG };
    return { ...DEFAULT_DECISION_ARBITRATION_CONFIG, ...cfg };
  } catch {
    return { ...DEFAULT_DECISION_ARBITRATION_CONFIG };
  }
}

/**
 * 读取指定会话活动路径上最近一条用户消息摘要（帮助 intent 评估）。
 * 必须按请求所属会话读取：外部 / VCP 请求未携带本地聊天会话时不返回任何内容，
 * 避免把当前 UI 会话的无关用户消息附加到外部请求的裁决上下文。
 */
function getRecentUserMessage(sessionId?: string): string | undefined {
  if (!sessionId) return undefined;
  try {
    const llmChatStore = useLlmChatStore();
    const detail = llmChatStore.sessionDetailMap.get(sessionId);
    if (!detail?.nodes) return undefined;
    const candidates = Object.values(detail.nodes)
      .filter((node) => node.role === "user" && node.content?.trim())
      .sort(
        (a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? "") // ISO 字符串倒序即最新在前
      );
    return candidates[0]?.content.slice(0, 400);
  } catch {
    return undefined;
  }
}

/**
 * 装配审批仲裁器。幂等；重复调用只刷新渠道设置。
 */
export function setupApprovalArbiter(): void {
  // 渠道设置异步加载，加载完成后仲裁时实时读取（fire-and-forget）
  void loadDecisionChannelSettings().catch(() => undefined);
  if (assembled) return;
  assembled = true;

  const arbiter = createDecisionArbiter({
    getChannelSettings: () => getDecisionChannelSettings(),
    getArbitrationConfig: (agentId) => resolveArbitrationConfig(agentId),
    getProfileById: (profileId) =>
      useLlmProfiles().getProfileById(profileId),
    getRecentUserMessage: (ctx) => getRecentUserMessage(ctx.sessionId),
  });

  setApprovalArbiter(arbiter);
  // P4：装配后台任务审批桥接，把子会话审批状态投影到任务快照与可靠通知队列。
  setTaskApprovalBridge(backgroundTaskApprovalBridge);
  logger.info("审批仲裁器与后台任务审批桥接已装配");
}
