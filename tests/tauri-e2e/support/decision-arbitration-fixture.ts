import fs from "node:fs";
import path from "node:path";
import type { RecallFixtureAgent } from "../fixtures/recall-workflow";

export const DECISION_ARBITRATION_TIMESTAMP = "2026-01-16T08:00:00.000Z";

export const DECISION_ARBITRATION_IDS = {
  agentId: "e2e-decision-agent",
  sessionId: "e2e-decision-session",
  rootNodeId: "e2e-decision-root",
} as const;

export interface DecisionChatRole {
  profileId: string;
  modelId: string;
}

export interface DecisionArbitrationFixtureFiles {
  agentIndex: {
    version: "1.1.0";
    agents: Array<Record<string, unknown>>;
  };
  agentDetail: RecallFixtureAgent;
  sessionIndex: {
    version: "1.1.2";
    currentSessionId: string;
    sessions: Array<{
      id: string;
      name: string;
      displayAgentId: string;
      messageCount: number;
      createdAt: string;
      updatedAt: string;
      isFavorite: boolean;
      favoriteFolderId: string | null;
    }>;
    favoriteFolders: unknown[];
  };
  sessionDetail: Record<string, unknown>;
  channel: {
    profileId: string;
    model: string;
    timeoutMs: number;
    maxRetries: number;
  };
}

/**
 * 构造启用 JEV 决策仲裁的智能体。
 *
 * - `mode: "manual"`：所有工具调用都需要审批，确保进入仲裁收口点；
 * - `protocol: "vcp"`：mock 通过 VCP 文本块发出工具调用；
 * - `decisionArbitration.enabled: true`：触发仲裁；
 * - 仅启用 e2e 需要的两个工具，避免系统提示词膨胀。
 */
export function buildDecisionArbitrationAgent(
  chat: DecisionChatRole
): RecallFixtureAgent {
  return {
    version: 3,
    id: DECISION_ARBITRATION_IDS.agentId,
    name: "e2e-decision-agent",
    displayName: "E2E Decision Agent",
    description: "Deterministic JEV decision arbitration fixture",
    icon: "D",
    profileId: chat.profileId,
    modelId: chat.modelId,
    createdAt: DECISION_ARBITRATION_TIMESTAMP,
    lastUsedAt: DECISION_ARBITRATION_TIMESTAMP,
    parameters: { temperature: 0, maxTokens: 512 },
    presetMessages: [],
    greetings: [],
    recallConfig: {
      enabled: false,
      bindings: [],
      groups: [],
      autoInjectIfMacroMissing: false,
      autoInjectPosition: "context_head",
    },
    recallSettings: {
      defaultProfile: "semantic",
      defaultLimit: 3,
      maxRecallChars: 6000,
      defaultMinScore: 0.2,
      emptyText: "",
      enableCache: false,
    },
    toolCallConfig: {
      enabled: true,
      mode: "manual",
      toolToggles: {
        "json-formatter": true,
        "llm-chat-agent-mgmt": true,
      },
      methodToggles: {
        "json-formatter_formatJson": true,
        "llm-chat-agent-mgmt_set_agent_field": true,
      },
      autoApproveTools: {},
      autoApproveMethods: {},
      defaultToolEnabled: false,
      defaultAutoApprove: false,
      maxIterations: 3,
      timeout: 15000,
      parallelExecution: false,
      protocol: "vcp",
      convertToolRoleToUser: true,
      decisionArbitration: {
        enabled: true,
        mode: "gray-zone",
        autoRiskThreshold: 0.15,
        denyRiskThreshold: 0.75,
        intentThreshold: 0.6,
        confidenceThreshold: 0.7,
        forceApprovalRiskThreshold: 0.05,
        autoApproveExternalSources: false,
      },
    },
    extensionConfig: {
      enabled: false,
      extensionToggles: {},
      defaultExtensionEnabled: false,
    },
    avatarHistory: [],
    worldbookIds: [],
    quickActionSetIds: [],
    presetGroups: [],
    tags: ["e2e", "decision-arbitration"],
    category: "assistant",
    userProfileId: null,
  };
}

export function buildDecisionArbitrationFixtureFiles(
  chat: DecisionChatRole
): DecisionArbitrationFixtureFiles {
  const agent = buildDecisionArbitrationAgent(chat);
  const session = {
    id: DECISION_ARBITRATION_IDS.sessionId,
    name: "E2E Decision Session",
    displayAgentId: agent.id,
    messageCount: 0,
    rootNodeId: DECISION_ARBITRATION_IDS.rootNodeId,
    activeLeafId: DECISION_ARBITRATION_IDS.rootNodeId,
    nodes: {
      [DECISION_ARBITRATION_IDS.rootNodeId]: {
        id: DECISION_ARBITRATION_IDS.rootNodeId,
        parentId: null,
        childrenIds: [],
        content: "",
        role: "system",
        status: "complete",
        isEnabled: true,
        timestamp: DECISION_ARBITRATION_TIMESTAMP,
      },
    },
    createdAt: DECISION_ARBITRATION_TIMESTAMP,
    updatedAt: DECISION_ARBITRATION_TIMESTAMP,
  };

  return {
    agentIndex: {
      version: "1.1.0",
      agents: [
        {
          id: agent.id,
          name: agent.name,
          displayName: agent.displayName,
          description: agent.description,
          icon: agent.icon,
          profileId: agent.profileId,
          modelId: agent.modelId,
          lastUsedAt: agent.lastUsedAt,
          createdAt: agent.createdAt,
          category: agent.category,
          tags: [...agent.tags],
        },
      ],
    },
    agentDetail: agent,
    sessionIndex: {
      version: "1.1.2",
      currentSessionId: session.id,
      sessions: [
        {
          id: session.id,
          name: session.name,
          displayAgentId: agent.id,
          messageCount: 0,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          isFavorite: false,
          favoriteFolderId: null,
        },
      ],
      favoriteFolders: [],
    },
    sessionDetail: session,
    channel: {
      profileId: chat.profileId,
      model: "e2e-jev",
      timeoutMs: 8000,
      maxRetries: 1,
    },
  };
}

function safeDataDir(dataDir: string): string {
  if (!path.isAbsolute(dataDir)) {
    throw new Error("Decision-arbitration fixture dataDir must be absolute");
  }
  return path.resolve(dataDir);
}

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  if (fs.existsSync(filePath)) {
    if (fs.readFileSync(filePath, "utf8") === content) return;
    throw new Error(
      `Refusing to overwrite a different fixture: ${path.basename(filePath)}`
    );
  }
  fs.writeFileSync(filePath, content, "utf8");
}

export interface SeedDecisionArbitrationOptions {
  dataDir: string;
  chat: DecisionChatRole;
}

/** 写入启用 JEV 仲裁的智能体、一个空会话与全局决策渠道配置。 */
export function seedDecisionArbitrationFixtures(
  options: SeedDecisionArbitrationOptions
): string[] {
  const dataDir = safeDataDir(options.dataDir);
  const files = buildDecisionArbitrationFixtureFiles(options.chat);
  const relativeFiles = [
    "agent-manager/agents-index.json",
    `agent-manager/agents/${DECISION_ARBITRATION_IDS.agentId}/agent.json`,
    "llm-chat/sessions-index.json",
    `llm-chat/sessions/${DECISION_ARBITRATION_IDS.sessionId}.json`,
    "decision-arbiter/channel.json",
  ];
  const values = [
    files.agentIndex,
    files.agentDetail,
    files.sessionIndex,
    files.sessionDetail,
    files.channel,
  ];
  relativeFiles.forEach((relativePath, index) => {
    writeJson(path.join(dataDir, relativePath), values[index]);
  });
  return relativeFiles;
}
