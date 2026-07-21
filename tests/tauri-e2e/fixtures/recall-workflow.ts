import {
  RECALL_ENTRY_IDS,
  RECALL_EVIDENCE_MARKERS,
  recallChatScenarios,
} from "./recall-scenarios";
import { recallCuratedCorpus } from "./recall-curated-corpus";

export const RECALL_WORKFLOW_SCHEMA_VERSION = 1 as const;
export const RECALL_FIXTURE_TIMESTAMP = "2026-01-15T08:00:00.000Z";
export const RECALL_FIXTURE_TIME_MS = Date.parse(RECALL_FIXTURE_TIMESTAMP);

export const RECALL_WORKFLOW_IDS = {
  recallId: "10000000-0000-4000-8000-000000000001",
  agentId: "e2e-recall-agent",
  emptySessionId: "e2e-recall-session",
  noResultSessionId: "e2e-recall-no-result-session",
  failClosedSessionId: "e2e-recall-fail-closed-session",
  historySessionId: "e2e-recall-history-session",
  presetRecallNodeId: "e2e-recall-preset-node",
  emptyRootNodeId: "e2e-recall-empty-root",
  noResultRootNodeId: "e2e-recall-no-result-root",
  failClosedRootNodeId: "e2e-recall-fail-closed-root",
  historyRootNodeId: "e2e-recall-history-root",
  historyUserNodeId: "e2e-recall-history-user",
  historyAssistantNodeId: "e2e-recall-history-assistant",
} as const;

export interface RecallFixtureModelRef {
  profileId: string;
  modelId: string;
}

export interface RecallFixtureRoleModels {
  chat: RecallFixtureModelRef;
  embedding: RecallFixtureModelRef & { dimension: number };
}

export interface RecallFixtureEntry {
  id: string;
  layer: "smoke" | "curated";
  key: string;
  content: string;
  tags: Array<{ name: string; weight: number }>;
  priority: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface RecallFixtureSession {
  id: string;
  name: string;
  kind: "empty" | "history";
  rootNodeId: string;
  activeLeafId: string;
  nodes: Record<string, RecallFixtureMessageNode>;
  createdAt: string;
  updatedAt: string;
}

export interface RecallFixtureMessageNode {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  content: string;
  name?: string;
  role: "system" | "user" | "assistant" | "tool";
  status: "complete" | "generating" | "error";
  isEnabled: boolean;
  timestamp: string;
  metadata?: {
    agentId?: string;
    agentName?: string;
    profileId?: string;
    modelId?: string;
  };
}

export interface RecallWorkflowManifest {
  schemaVersion: typeof RECALL_WORKFLOW_SCHEMA_VERSION;
  fixedTimestamp: string;
  fixedTimeMs: number;
  models: RecallFixtureRoleModels;
  profiles: Array<{ id: string; modelIds: string[] }>;
  recall: {
    id: string;
    name: string;
    description: string;
    layers: Array<{
      id: "smoke" | "curated";
      entryIds: string[];
    }>;
    entries: RecallFixtureEntry[];
  };
  agent: RecallFixtureAgent;
  sessions: RecallFixtureSession[];
  chatScenarios: Array<{
    scenarioId: string;
    sessionId: string;
    query: string;
    expectedTopEntryId?: string;
    expectedAssistantText: string;
  }>;
}

export interface RecallFixtureAgent {
  version: number;
  id: string;
  name: string;
  displayName: string;
  description: string;
  icon: string;
  profileId: string;
  modelId: string;
  createdAt: string;
  lastUsedAt: string;
  parameters: { temperature: number; maxTokens: number };
  presetMessages: RecallFixtureMessageNode[];
  greetings: [];
  recallConfig: {
    enabled: boolean;
    bindings: Array<{
      recallId: string;
      recallName: string;
      enabled: boolean;
      when: "always";
      limit: number;
      minScore: number;
      profile: "semantic";
    }>;
    groups: [];
    autoInjectIfMacroMissing: boolean;
    autoInjectPosition: "context_head";
  };
  recallSettings: {
    defaultProfile: "semantic";
    defaultLimit: number;
    maxRecallChars: number;
    defaultMinScore: number;
    emptyText: string;
    enableCache: boolean;
  };
  toolCallConfig: {
    enabled: boolean;
    mode: "auto";
    toolToggles: Record<string, boolean>;
    methodToggles: Record<string, boolean>;
    autoApproveTools: Record<string, boolean>;
    autoApproveMethods: Record<string, boolean>;
    defaultToolEnabled: boolean;
    defaultAutoApprove: boolean;
    maxIterations: number;
    timeout: number;
    parallelExecution: boolean;
    protocol: "vcp";
    convertToolRoleToUser: boolean;
  };
  extensionConfig: {
    enabled: boolean;
    extensionToggles: Record<string, boolean>;
    defaultExtensionEnabled: boolean;
  };
  avatarHistory: [];
  worldbookIds: [];
  quickActionSetIds: [];
  presetGroups: [];
  tags: string[];
  category: "assistant";
  userProfileId: null;
}

const smokeEntries: RecallFixtureEntry[] = [
  {
    id: RECALL_ENTRY_IDS.renderer,
    layer: "smoke",
    key: "renderer-heavy-components",
    content:
      `# Renderer V2\n\n${RECALL_EVIDENCE_MARKERS.renderer}\n` +
      "复杂 Markdown 流式渲染的停顿点来自重型组件初始化，而不是文本分片本身。",
    tags: [{ name: "renderer", weight: 1 }],
    priority: 120,
    enabled: true,
    createdAt: RECALL_FIXTURE_TIME_MS,
    updatedAt: RECALL_FIXTURE_TIME_MS,
  },
  {
    id: RECALL_ENTRY_IDS.base64,
    layer: "smoke",
    key: "base64-data-url-failure",
    content:
      `# Base64 image diagnostics\n\n${RECALL_EVIDENCE_MARKERS.base64}\n` +
      "排查时先检查畸形 data URL，再核对原始请求体是否被错误改写。",
    tags: [{ name: "base64", weight: 1 }],
    priority: 110,
    enabled: true,
    createdAt: RECALL_FIXTURE_TIME_MS,
    updatedAt: RECALL_FIXTURE_TIME_MS,
  },
  {
    id: RECALL_ENTRY_IDS.memory,
    layer: "smoke",
    key: "memory-compute-ownership",
    content:
      `# Memory compute layer\n\n${RECALL_EVIDENCE_MARKERS.memory}\n` +
      "前端继续持有数据真源，Rust 内存副本只承担计算加速，不能反向成为所有权真源。",
    tags: [{ name: "architecture", weight: 0.9 }],
    priority: 105,
    enabled: true,
    createdAt: RECALL_FIXTURE_TIME_MS,
    updatedAt: RECALL_FIXTURE_TIME_MS,
  },
  {
    id: RECALL_ENTRY_IDS.structure,
    layer: "smoke",
    key: "tool-directory-structure",
    content:
      `# Tool directory structure\n\n${RECALL_EVIDENCE_MARKERS.structure}\n` +
      "工具模块按 core、logic、config 和 stores 分层，组件只负责交互装配。",
    tags: [{ name: "refactor", weight: 0.9 }],
    priority: 100,
    enabled: true,
    createdAt: RECALL_FIXTURE_TIME_MS,
    updatedAt: RECALL_FIXTURE_TIME_MS,
  },
  {
    id: RECALL_ENTRY_IDS.rust,
    layer: "smoke",
    key: "rust-ownership",
    content:
      "Rust ownership and borrow checker rules prevent aliased mutable access.",
    tags: [{ name: "rust", weight: 1 }],
    priority: 90,
    enabled: true,
    createdAt: RECALL_FIXTURE_TIME_MS,
    updatedAt: RECALL_FIXTURE_TIME_MS,
  },
  {
    id: RECALL_ENTRY_IDS.banana,
    layer: "smoke",
    key: "banana-bread",
    content: "Banana bread uses ripe bananas, flour, and a moderate oven.",
    tags: [{ name: "cooking", weight: 1 }],
    priority: 80,
    enabled: true,
    createdAt: RECALL_FIXTURE_TIME_MS,
    updatedAt: RECALL_FIXTURE_TIME_MS,
  },
];

const curatedEntries: RecallFixtureEntry[] = recallCuratedCorpus.entries.map(
  (entry) => ({
    id: entry.id,
    layer: "curated",
    key: entry.title,
    content: `# ${entry.title}\n\n${entry.content}`,
    tags: entry.tags.map((name) => ({ name, weight: 1 })),
    priority:
      entry.role === "positive" ? 70 : entry.role === "near-negative" ? 40 : 10,
    enabled: true,
    createdAt: RECALL_FIXTURE_TIME_MS,
    updatedAt: RECALL_FIXTURE_TIME_MS,
  })
);

const workflowEntries = [...smokeEntries, ...curatedEntries];

function createProfiles(models: RecallFixtureRoleModels) {
  const profileModels = new Map<string, Set<string>>();
  for (const model of [models.chat, models.embedding]) {
    const modelIds = profileModels.get(model.profileId) ?? new Set<string>();
    modelIds.add(model.modelId);
    profileModels.set(model.profileId, modelIds);
  }
  return [...profileModels.entries()].map(([id, modelIds]) => ({
    id,
    modelIds: [...modelIds],
  }));
}

function sessionNode(
  id: string,
  parentId: string | null,
  childrenIds: string[],
  content: string,
  role: RecallFixtureMessageNode["role"],
  models: RecallFixtureRoleModels,
  withAgent = false
): RecallFixtureMessageNode {
  return {
    id,
    parentId,
    childrenIds,
    content,
    role,
    status: "complete",
    isEnabled: true,
    timestamp: RECALL_FIXTURE_TIMESTAMP,
    ...(withAgent
      ? {
          metadata: {
            agentId: RECALL_WORKFLOW_IDS.agentId,
            agentName: "E2E Recall Agent",
            profileId: models.chat.profileId,
            modelId: models.chat.modelId,
          },
        }
      : {}),
  };
}

export function buildRecallWorkflowManifest(
  models: RecallFixtureRoleModels
): RecallWorkflowManifest {
  const emptyRoot = sessionNode(
    RECALL_WORKFLOW_IDS.emptyRootNodeId,
    null,
    [],
    "",
    "system",
    models
  );
  const noResultRoot = sessionNode(
    RECALL_WORKFLOW_IDS.noResultRootNodeId,
    null,
    [],
    "",
    "system",
    models
  );
  const failClosedRoot = sessionNode(
    RECALL_WORKFLOW_IDS.failClosedRootNodeId,
    null,
    [],
    "",
    "system",
    models
  );
  const historyRoot = sessionNode(
    RECALL_WORKFLOW_IDS.historyRootNodeId,
    null,
    [RECALL_WORKFLOW_IDS.historyUserNodeId],
    "",
    "system",
    models
  );
  const historyUser = sessionNode(
    RECALL_WORKFLOW_IDS.historyUserNodeId,
    RECALL_WORKFLOW_IDS.historyRootNodeId,
    [RECALL_WORKFLOW_IDS.historyAssistantNodeId],
    "This seeded exchange must survive a process restart.",
    "user",
    models,
    true
  );
  const historyAssistant = sessionNode(
    RECALL_WORKFLOW_IDS.historyAssistantNodeId,
    RECALL_WORKFLOW_IDS.historyUserNodeId,
    [],
    "The seeded session history is available.",
    "assistant",
    models,
    true
  );
  const agent: RecallFixtureAgent = {
    version: 3,
    id: RECALL_WORKFLOW_IDS.agentId,
    name: "e2e-recall-agent",
    displayName: "E2E Recall Agent",
    description: "Deterministic Recall workflow fixture",
    icon: "R",
    profileId: models.chat.profileId,
    modelId: models.chat.modelId,
    createdAt: RECALL_FIXTURE_TIMESTAMP,
    lastUsedAt: RECALL_FIXTURE_TIMESTAMP,
    parameters: { temperature: 0, maxTokens: 512 },
    presetMessages: [
      {
        ...sessionNode(
          RECALL_WORKFLOW_IDS.presetRecallNodeId,
          null,
          [],
          "Use only the following retrieved context:\n\n{{recall}}",
          "system",
          models
        ),
        name: "Recall context",
      },
    ],
    greetings: [],
    recallConfig: {
      enabled: true,
      bindings: [
        {
          recallId: RECALL_WORKFLOW_IDS.recallId,
          recallName: "E2E Recall Collection",
          enabled: true,
          when: "always",
          limit: 3,
          minScore: 0.2,
          profile: "semantic",
        },
      ],
      groups: [],
      autoInjectIfMacroMissing: false,
      autoInjectPosition: "context_head",
    },
    recallSettings: {
      defaultProfile: "semantic",
      defaultLimit: 3,
      maxRecallChars: 6000,
      defaultMinScore: 0.2,
      emptyText: RECALL_EVIDENCE_MARKERS.empty,
      enableCache: true,
    },
    toolCallConfig: {
      enabled: false,
      mode: "auto",
      toolToggles: {},
      methodToggles: {},
      autoApproveTools: {},
      autoApproveMethods: {},
      defaultToolEnabled: false,
      defaultAutoApprove: false,
      maxIterations: 20,
      timeout: 30000,
      parallelExecution: false,
      protocol: "vcp",
      convertToolRoleToUser: true,
    },
    extensionConfig: {
      enabled: true,
      extensionToggles: {},
      defaultExtensionEnabled: true,
    },
    avatarHistory: [],
    worldbookIds: [],
    quickActionSetIds: [],
    presetGroups: [],
    tags: ["e2e", "recall"],
    category: "assistant",
    userProfileId: null,
  };

  const scenarioById = new Map(
    recallChatScenarios.map((scenario) => [scenario.id, scenario])
  );
  const scenario = (scenarioId: string) => {
    const value = scenarioById.get(scenarioId);
    if (!value) throw new Error(`Recall scenario is missing: ${scenarioId}`);
    return value;
  };
  const rendererScenario = scenario("renderer-positive");
  const noResultScenario = scenario("no-result");
  const missingEvidenceScenario = scenario("missing-evidence-fail-closed");
  const memoryScenario = scenario("memory-ownership");

  return {
    schemaVersion: RECALL_WORKFLOW_SCHEMA_VERSION,
    fixedTimestamp: RECALL_FIXTURE_TIMESTAMP,
    fixedTimeMs: RECALL_FIXTURE_TIME_MS,
    models: structuredClone(models),
    profiles: createProfiles(models),
    recall: {
      id: RECALL_WORKFLOW_IDS.recallId,
      name: "E2E Recall Collection",
      description: "Versioned deterministic Recall workflow fixture",
      layers: [
        {
          id: "smoke",
          entryIds: workflowEntries
            .filter((entry) => entry.layer === "smoke")
            .map((entry) => entry.id),
        },
        {
          id: "curated",
          entryIds: workflowEntries
            .filter((entry) => entry.layer === "curated")
            .map((entry) => entry.id),
        },
      ],
      entries: structuredClone(workflowEntries),
    },
    agent,
    sessions: [
      {
        id: RECALL_WORKFLOW_IDS.emptySessionId,
        name: "E2E Recall Empty Session",
        kind: "empty",
        rootNodeId: emptyRoot.id,
        activeLeafId: emptyRoot.id,
        nodes: { [emptyRoot.id]: emptyRoot },
        createdAt: RECALL_FIXTURE_TIMESTAMP,
        updatedAt: RECALL_FIXTURE_TIMESTAMP,
      },
      {
        id: RECALL_WORKFLOW_IDS.noResultSessionId,
        name: "E2E Recall No Result Session",
        kind: "empty",
        rootNodeId: noResultRoot.id,
        activeLeafId: noResultRoot.id,
        nodes: { [noResultRoot.id]: noResultRoot },
        createdAt: RECALL_FIXTURE_TIMESTAMP,
        updatedAt: RECALL_FIXTURE_TIMESTAMP,
      },
      {
        id: RECALL_WORKFLOW_IDS.failClosedSessionId,
        name: "E2E Recall Fail Closed Session",
        kind: "empty",
        rootNodeId: failClosedRoot.id,
        activeLeafId: failClosedRoot.id,
        nodes: { [failClosedRoot.id]: failClosedRoot },
        createdAt: RECALL_FIXTURE_TIMESTAMP,
        updatedAt: RECALL_FIXTURE_TIMESTAMP,
      },
      {
        id: RECALL_WORKFLOW_IDS.historySessionId,
        name: "E2E Recall History Session",
        kind: "history",
        rootNodeId: historyRoot.id,
        activeLeafId: historyAssistant.id,
        nodes: {
          [historyRoot.id]: historyRoot,
          [historyUser.id]: historyUser,
          [historyAssistant.id]: historyAssistant,
        },
        createdAt: RECALL_FIXTURE_TIMESTAMP,
        updatedAt: RECALL_FIXTURE_TIMESTAMP,
      },
    ],
    chatScenarios: [
      {
        scenarioId: rendererScenario.id,
        sessionId: RECALL_WORKFLOW_IDS.emptySessionId,
        query: `${rendererScenario.userMarker} 复杂 Markdown 流式渲染为何停顿？`,
        expectedTopEntryId: rendererScenario.expected.topEntryId,
        expectedAssistantText: rendererScenario.response.chunks.join(""),
      },
      {
        scenarioId: noResultScenario.id,
        sessionId: RECALL_WORKFLOW_IDS.noResultSessionId,
        query: `${noResultScenario.userMarker} unknown empty topic`,
        expectedTopEntryId: noResultScenario.expected.topEntryId,
        expectedAssistantText: noResultScenario.response.chunks.join(""),
      },
      {
        scenarioId: missingEvidenceScenario.id,
        sessionId: RECALL_WORKFLOW_IDS.failClosedSessionId,
        query: `${missingEvidenceScenario.userMarker} Rust ownership 与 borrow checker。`,
        expectedTopEntryId: missingEvidenceScenario.expected.topEntryId,
        expectedAssistantText: "",
      },
      {
        scenarioId: memoryScenario.id,
        sessionId: RECALL_WORKFLOW_IDS.historySessionId,
        query: `${memoryScenario.userMarker} 前端数据与 Rust 内存副本如何分工？`,
        expectedTopEntryId: memoryScenario.expected.topEntryId,
        expectedAssistantText: memoryScenario.response.chunks.join(""),
      },
    ],
  };
}

export function selectRecallFixtureEntries(
  manifest: RecallWorkflowManifest,
  corpusMode: "smoke" | "curated"
): RecallFixtureEntry[] {
  const includedLayers =
    corpusMode === "curated"
      ? new Set(["smoke", "curated"])
      : new Set(["smoke"]);
  return manifest.recall.entries
    .filter((entry) => includedLayers.has(entry.layer))
    .map((entry) => structuredClone(entry));
}

export function buildRecallWorkflowManifestForCorpus(
  models: RecallFixtureRoleModels,
  corpusMode: "smoke" | "curated"
): RecallWorkflowManifest {
  const manifest = buildRecallWorkflowManifest(models);
  manifest.recall.entries = selectRecallFixtureEntries(manifest, corpusMode);
  const selectedIds = new Set(manifest.recall.entries.map((entry) => entry.id));
  manifest.recall.layers = manifest.recall.layers
    .map((layer) => ({
      ...layer,
      entryIds: layer.entryIds.filter((id) => selectedIds.has(id)),
    }))
    .filter((layer) => layer.entryIds.length > 0);
  validateRecallWorkflowManifest(manifest);
  return manifest;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(`Invalid Recall workflow fixture: ${message}`);
}

function assertUnique(values: string[], label: string): void {
  assert(new Set(values).size === values.length, `${label} must be unique`);
}

export function validateRecallWorkflowManifest(
  manifest: RecallWorkflowManifest
): void {
  assert(
    manifest.schemaVersion === RECALL_WORKFLOW_SCHEMA_VERSION,
    `unsupported schemaVersion ${manifest.schemaVersion}`
  );
  assert(
    manifest.fixedTimestamp === RECALL_FIXTURE_TIMESTAMP &&
      manifest.fixedTimeMs === RECALL_FIXTURE_TIME_MS,
    "timestamps must use the fixture clock"
  );
  assert(
    Number.isInteger(manifest.models.embedding.dimension) &&
      manifest.models.embedding.dimension > 0,
    "embedding dimension must be a positive integer"
  );

  const profileModels = new Map(
    manifest.profiles.map((profile) => [profile.id, new Set(profile.modelIds)])
  );
  for (const [role, model] of Object.entries(manifest.models)) {
    assert(
      profileModels.has(model.profileId),
      `${role} profile does not exist`
    );
    assert(
      profileModels.get(model.profileId)!.has(model.modelId),
      `${role} model does not exist in its profile`
    );
  }
  assert(
    manifest.agent.profileId === manifest.models.chat.profileId &&
      manifest.agent.modelId === manifest.models.chat.modelId,
    "Agent must use the resolved Chat model"
  );
  assert(
    manifest.agent.presetMessages.some((message) =>
      message.content.includes("{{recall}}")
    ),
    "Agent must include a {{recall}} preset"
  );
  assert(
    manifest.agent.recallConfig.bindings.some(
      (binding) => binding.recallId === manifest.recall.id
    ),
    "Agent Recall binding does not resolve"
  );

  const entryIds = manifest.recall.entries.map((entry) => entry.id);
  assertUnique(entryIds, "entry IDs");
  const entryIdSet = new Set(entryIds);
  const layeredEntryIds = manifest.recall.layers.flatMap(
    (layer) => layer.entryIds
  );
  assertUnique(layeredEntryIds, "layer entry references");
  for (const id of layeredEntryIds) {
    assert(entryIdSet.has(id), `layer references missing entry ${id}`);
  }
  assert(
    layeredEntryIds.length === entryIds.length,
    "every entry must belong to exactly one layer"
  );
  for (const entry of manifest.recall.entries) {
    assert(
      entry.createdAt === manifest.fixedTimeMs &&
        entry.updatedAt === manifest.fixedTimeMs,
      `entry ${entry.id} must use the fixture clock`
    );
  }

  assertUnique(
    manifest.sessions.map((session) => session.id),
    "session IDs"
  );
  const sessionIds = new Set(manifest.sessions.map((session) => session.id));
  assert(
    manifest.sessions.some((session) => session.kind === "empty") &&
      manifest.sessions.some((session) => session.kind === "history"),
    "both empty and history sessions are required"
  );
  for (const session of manifest.sessions) {
    assert(
      session.createdAt === manifest.fixedTimestamp &&
        session.updatedAt === manifest.fixedTimestamp,
      `session ${session.id} must use the fixture clock`
    );
    assert(
      session.nodes[session.rootNodeId],
      `session ${session.id} root is missing`
    );
    assert(
      session.nodes[session.activeLeafId],
      `session ${session.id} active leaf is missing`
    );
    assert(
      session.nodes[session.rootNodeId].parentId === null,
      `session ${session.id} root must not have a parent`
    );
    for (const [nodeId, node] of Object.entries(session.nodes)) {
      assert(node.id === nodeId, `session ${session.id} node key/ID mismatch`);
      assert(
        node.timestamp === manifest.fixedTimestamp,
        `node ${node.id} must use the fixture clock`
      );
      if (node.parentId !== null) {
        assert(
          session.nodes[node.parentId],
          `node ${node.id} parent is missing`
        );
        assert(
          session.nodes[node.parentId].childrenIds.includes(node.id),
          `node ${node.id} is absent from its parent's children`
        );
      }
      for (const childId of node.childrenIds) {
        assert(session.nodes[childId], `node ${node.id} child is missing`);
        assert(
          session.nodes[childId].parentId === node.id,
          `node ${node.id} child has the wrong parent`
        );
      }
      if (node.metadata?.agentId) {
        assert(
          node.metadata.agentId === manifest.agent.id,
          `node ${node.id} Agent does not resolve`
        );
      }
    }
  }
  for (const scenario of manifest.chatScenarios) {
    assert(
      sessionIds.has(scenario.sessionId),
      `scenario ${scenario.scenarioId} session does not resolve`
    );
    if (scenario.expectedTopEntryId) {
      assert(
        entryIdSet.has(scenario.expectedTopEntryId),
        `scenario ${scenario.scenarioId} entry does not resolve`
      );
    }
  }
}
