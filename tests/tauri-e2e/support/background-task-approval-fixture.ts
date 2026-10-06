import fs from "node:fs";
import path from "node:path";
import type { RecallFixtureAgent } from "../fixtures/recall-workflow";

export const BACKGROUND_TASK_APPROVAL_TIMESTAMP = "2026-01-16T09:00:00.000Z";

export const BACKGROUND_TASK_APPROVAL_IDS = {
  parentAgentId: "e2e-bg-parent",
  childAgentId: "e2e-bg-child",
  sessionId: "e2e-bg-session",
  rootNodeId: "e2e-bg-root",
} as const;

export interface BackgroundTaskChatRole {
  profileId: string;
  modelId: string;
}

export interface BackgroundTaskApprovalFixtureFiles {
  agentIndex: {
    version: "1.1.0";
    agents: Array<Record<string, unknown>>;
  };
  parentAgentDetail: Record<string, unknown>;
  childAgentDetail: Record<string, unknown>;
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

interface BuildAgentOptions {
  id: string;
  name: string;
  displayName: string;
  description: string;
  chat: BackgroundTaskChatRole;
  toolCallConfig: Record<string, unknown>;
  subAgentConfig?: Record<string, unknown>;
}

function buildAgent(options: BuildAgentOptions): Record<string, unknown> {
  return {
    version: 3,
    id: options.id,
    name: options.name,
    displayName: options.displayName,
    description: options.description,
    icon: "B",
    profileId: options.chat.profileId,
    modelId: options.chat.modelId,
    createdAt: BACKGROUND_TASK_APPROVAL_TIMESTAMP,
    lastUsedAt: BACKGROUND_TASK_APPROVAL_TIMESTAMP,
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
    toolCallConfig: options.toolCallConfig,
    subAgentConfig: options.subAgentConfig ?? { enabled: false },
    extensionConfig: {
      enabled: false,
      extensionToggles: {},
      defaultExtensionEnabled: false,
    },
    avatarHistory: [],
    worldbookIds: [],
    quickActionSetIds: [],
    presetGroups: [],
    tags: ["e2e", "background-task-approval"],
    category: "assistant",
    userProfileId: null,
  };
}

/**
 * 构造后台任务审批场景的两个智能体：
 *
 * - 调度方（parent）：`mode: "auto"` + 仅开启 `sub-agent.ask`，使其能立即派发
 *   background 任务且自身调用不触发审批；
 * - 子智能体（child）：开启 `subAgentConfig.enabled` 以供调用，工具为 manual +
 *   `decisionArbitration.enabled`，使子会话内的 json-formatter 调用进入 JEV 仲裁。
 */
export function buildBackgroundTaskAgents(
  chat: BackgroundTaskChatRole
): { parent: Record<string, unknown>; child: Record<string, unknown> } {
  const parent = buildAgent({
    id: BACKGROUND_TASK_APPROVAL_IDS.parentAgentId,
    name: "e2e-bg-parent",
    displayName: "E2E BG Parent",
    description: "Deterministic background task dispatcher fixture",
    chat,
    toolCallConfig: {
      enabled: true,
      mode: "auto",
      toolToggles: { "sub-agent": true },
      methodToggles: { "sub-agent_ask": true },
      autoApproveTools: {},
      autoApproveMethods: { "sub-agent_ask": true },
      defaultToolEnabled: false,
      defaultAutoApprove: false,
      maxIterations: 3,
      timeout: 15000,
      parallelExecution: false,
      protocol: "vcp",
      convertToolRoleToUser: true,
    },
  });

  const child = buildAgent({
    id: BACKGROUND_TASK_APPROVAL_IDS.childAgentId,
    name: "e2e-bg-child",
    displayName: "E2E BG Child",
    description: "Deterministic background sub-agent approval fixture",
    chat,
    subAgentConfig: {
      enabled: true,
      modelBindingMode: "prefer_self",
      maxDelegationDepth: 1,
    },
    toolCallConfig: {
      enabled: true,
      mode: "manual",
      toolToggles: { "json-formatter": true },
      methodToggles: { "json-formatter_formatJson": true },
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
  });

  return { parent, child };
}

export function buildBackgroundTaskApprovalFixtureFiles(
  chat: BackgroundTaskChatRole
): BackgroundTaskApprovalFixtureFiles {
  const { parent, child } = buildBackgroundTaskAgents(chat);

  const session = {
    id: BACKGROUND_TASK_APPROVAL_IDS.sessionId,
    name: "E2E Background Task Session",
    displayAgentId: parent.id,
    messageCount: 0,
    rootNodeId: BACKGROUND_TASK_APPROVAL_IDS.rootNodeId,
    activeLeafId: BACKGROUND_TASK_APPROVAL_IDS.rootNodeId,
    nodes: {
      [BACKGROUND_TASK_APPROVAL_IDS.rootNodeId]: {
        id: BACKGROUND_TASK_APPROVAL_IDS.rootNodeId,
        parentId: null,
        childrenIds: [],
        content: "",
        role: "system",
        status: "complete",
        isEnabled: true,
        timestamp: BACKGROUND_TASK_APPROVAL_TIMESTAMP,
      },
    },
    createdAt: BACKGROUND_TASK_APPROVAL_TIMESTAMP,
    updatedAt: BACKGROUND_TASK_APPROVAL_TIMESTAMP,
  };

  const toIndexEntry = (agent: Record<string, unknown>) => ({
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
    tags: [...(agent.tags as string[])],
  });

  return {
    agentIndex: {
      version: "1.1.0",
      agents: [toIndexEntry(parent), toIndexEntry(child)],
    },
    parentAgentDetail: parent,
    childAgentDetail: child,
    sessionIndex: {
      version: "1.1.2",
      currentSessionId: session.id,
      sessions: [
        {
          id: session.id,
          name: session.name,
          displayAgentId: parent.id as string,
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
    throw new Error("Background-task fixture dataDir must be absolute");
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

export interface SeedBackgroundTaskApprovalOptions {
  dataDir: string;
  chat: BackgroundTaskChatRole;
}

/** 写入调度方 / 子智能体、父会话与全局决策渠道配置。 */
export function seedBackgroundTaskApprovalFixtures(
  options: SeedBackgroundTaskApprovalOptions
): string[] {
  const dataDir = safeDataDir(options.dataDir);
  const files = buildBackgroundTaskApprovalFixtureFiles(options.chat);
  const relativeFiles = [
    "agent-manager/agents-index.json",
    `agent-manager/agents/${BACKGROUND_TASK_APPROVAL_IDS.parentAgentId}/agent.json`,
    `agent-manager/agents/${BACKGROUND_TASK_APPROVAL_IDS.childAgentId}/agent.json`,
    "llm-chat/sessions-index.json",
    `llm-chat/sessions/${BACKGROUND_TASK_APPROVAL_IDS.sessionId}.json`,
    "decision-arbiter/channel.json",
  ];
  const values = [
    files.agentIndex,
    files.parentAgentDetail,
    files.childAgentDetail,
    files.sessionIndex,
    files.sessionDetail,
    files.channel,
  ];
  relativeFiles.forEach((relativePath, index) => {
    writeJson(path.join(dataDir, relativePath), values[index]);
  });
  return relativeFiles;
}

/** 仅用于类型复用，保证 fixture 兼容 RecallFixtureAgent 形状。 */
export type BackgroundTaskApprovalFixtureAgent = RecallFixtureAgent;
