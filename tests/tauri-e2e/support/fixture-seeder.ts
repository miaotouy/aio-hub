import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type RecallFixtureAgent,
  type RecallFixtureSession,
  type RecallWorkflowManifest,
  validateRecallWorkflowManifest,
} from "../fixtures/recall-workflow";

export interface RecallFixtureFiles {
  agentIndex: {
    version: "1.1.0";
    agents: Array<{
      id: string;
      name: string;
      displayName: string;
      description: string;
      icon: string;
      profileId: string;
      modelId: string;
      lastUsedAt: string;
      createdAt: string;
      category: string;
      tags: string[];
    }>;
  };
  agentDetails: Record<string, RecallFixtureAgent>;
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
      isFavorite: false;
      favoriteFolderId: null;
    }>;
    favoriteFolders: [];
  };
  sessionDetails: Record<
    string,
    Omit<RecallFixtureSession, "kind"> & {
      displayAgentId: string;
      messageCount: number;
    }
  >;
}

export interface SeedRecallWorkflowOptions {
  dataDir: string;
  manifest: RecallWorkflowManifest;
  enabled: boolean;
  mode?: "write" | "verify";
  artifactDir?: string;
}

export interface SeedRecallWorkflowResult {
  schemaVersion: number;
  mode: "write" | "verify";
  agentIds: string[];
  sessionIds: string[];
  recallIds: string[];
  files: string[];
}

function effectiveMessageCount(session: RecallFixtureSession): number {
  return Object.keys(session.nodes).filter((id) => id !== session.rootNodeId)
    .length;
}

export function buildRecallFixtureFiles(
  manifest: RecallWorkflowManifest
): RecallFixtureFiles {
  validateRecallWorkflowManifest(manifest);
  const agent = structuredClone(manifest.agent);
  const sessions = manifest.sessions.map((session) => structuredClone(session));
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
    agentDetails: { [agent.id]: agent },
    sessionIndex: {
      version: "1.1.2",
      currentSessionId: manifest.sessions[0].id,
      sessions: sessions.map((session) => ({
        id: session.id,
        name: session.name,
        displayAgentId: agent.id,
        messageCount: effectiveMessageCount(session),
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        isFavorite: false,
        favoriteFolderId: null,
      })),
      favoriteFolders: [],
    },
    sessionDetails: Object.fromEntries(
      sessions.map((session) => {
        const { kind: _kind, ...persistedSession } = session;
        return [
          session.id,
          {
            ...persistedSession,
            displayAgentId: agent.id,
            messageCount: effectiveMessageCount(session),
          },
        ];
      })
    ),
  };
}

function walk(
  value: unknown,
  visit: (key: string, value: unknown) => void
): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walk(child, visit);
  }
}

export function assertFixtureIsSanitized(value: unknown): void {
  walk(value, (key, child) => {
    if (/^(apiKeys?|authorization|authHeaders?|credentials?)$/i.test(key)) {
      throw new Error(`Fixture contains forbidden secret field: ${key}`);
    }
    if (
      typeof child === "string" &&
      (/^[a-zA-Z]:[\\/]/.test(child) ||
        /^file:\/\//i.test(child) ||
        /^\/(?:home|Users|tmp|var\/folders)\//.test(child))
    ) {
      throw new Error(
        `Fixture contains an absolute user path in field: ${key}`
      );
    }
  });
}

export function validateRecallFixtureFiles(
  manifest: RecallWorkflowManifest,
  files: RecallFixtureFiles,
  options: { requireSanitized?: boolean } = {}
): void {
  validateRecallWorkflowManifest(manifest);
  const agentIds = new Set(Object.keys(files.agentDetails));
  const sessionIds = new Set(Object.keys(files.sessionDetails));
  for (const item of files.agentIndex.agents) {
    if (!agentIds.has(item.id) || files.agentDetails[item.id].id !== item.id) {
      throw new Error(`Agent index/detail ID mismatch: ${item.id}`);
    }
    const detail = files.agentDetails[item.id];
    if (
      item.profileId !== detail.profileId ||
      item.modelId !== detail.modelId
    ) {
      throw new Error(`Agent index/detail model mismatch: ${item.id}`);
    }
  }
  const stableAgent = files.agentDetails[manifest.agent.id];
  if (!stableAgent) {
    throw new Error(`Stable Agent does not resolve: ${manifest.agent.id}`);
  }
  if (
    stableAgent.profileId !== manifest.models.chat.profileId ||
    stableAgent.modelId !== manifest.models.chat.modelId
  ) {
    throw new Error("Stable Agent no longer uses the resolved Chat model");
  }
  if (
    !stableAgent.recallConfig?.bindings.some(
      (binding) => binding.recallId === manifest.recall.id && binding.enabled
    )
  ) {
    throw new Error("Stable Agent Recall binding does not resolve");
  }
  for (const item of files.sessionIndex.sessions) {
    const detail = files.sessionDetails[item.id];
    if (!sessionIds.has(item.id) || detail.id !== item.id) {
      throw new Error(`Session index/detail ID mismatch: ${item.id}`);
    }
    if (!agentIds.has(item.displayAgentId)) {
      throw new Error(`Session displayAgentId does not resolve: ${item.id}`);
    }
    if (detail.displayAgentId !== item.displayAgentId) {
      throw new Error(`Session index/detail Agent mismatch: ${item.id}`);
    }
    if (!detail.nodes[detail.rootNodeId]) {
      throw new Error(`Session root does not resolve: ${item.id}`);
    }
    if (!detail.nodes[detail.activeLeafId]) {
      throw new Error(`Session active leaf does not resolve: ${item.id}`);
    }
    for (const node of Object.values(detail.nodes)) {
      if (node.metadata?.agentId && !agentIds.has(node.metadata.agentId)) {
        throw new Error(`Session node Agent does not resolve: ${node.id}`);
      }
      if (node.parentId !== null && !detail.nodes[node.parentId]) {
        throw new Error(`Session node parent does not resolve: ${node.id}`);
      }
      for (const childId of node.childrenIds) {
        if (!detail.nodes[childId]) {
          throw new Error(`Session node child does not resolve: ${node.id}`);
        }
      }
    }
  }
  for (const session of manifest.sessions) {
    if (
      !files.sessionIndex.sessions.some((item) => item.id === session.id) ||
      !files.sessionDetails[session.id]
    ) {
      throw new Error(`Stable session does not resolve: ${session.id}`);
    }
  }
  if (!sessionIds.has(files.sessionIndex.currentSessionId)) {
    throw new Error("Current session does not resolve");
  }
  if (options.requireSanitized !== false) assertFixtureIsSanitized(files);
}

function safeDataDir(dataDir: string): string {
  if (!path.isAbsolute(dataDir)) {
    throw new Error("Recall fixture dataDir must be absolute");
  }
  const resolved = path.resolve(dataDir);
  const root = path.parse(resolved).root;
  const forbidden = new Set([
    path.resolve(root),
    path.resolve(os.homedir()),
    path.resolve(process.cwd()),
  ]);
  if (forbidden.has(resolved)) {
    throw new Error("Recall fixture dataDir is not an isolated directory");
  }
  return resolved;
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeFixtureFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    const existing = fs.readFileSync(filePath, "utf8");
    if (existing === content) return;
    throw new Error(
      `Refusing to overwrite a different fixture: ${path.basename(filePath)}`
    );
  }
  const tempPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, content, { encoding: "utf8", flag: "wx" });
  fs.renameSync(tempPath, filePath);
}

function verifyExactFile(filePath: string, content: string): void {
  if (
    !fs.existsSync(filePath) ||
    fs.readFileSync(filePath, "utf8") !== content
  ) {
    throw new Error(
      `Seeded fixture verification failed: ${path.basename(filePath)}`
    );
  }
}

function readJsonFile<T>(filePath: string): T {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Seeded fixture file is missing: ${path.basename(filePath)}`
    );
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    throw new Error(
      `Seeded fixture JSON is invalid: ${path.basename(filePath)}`
    );
  }
}

function loadRecallFixtureFiles(dataDir: string): RecallFixtureFiles {
  const agentIndex = readJsonFile<RecallFixtureFiles["agentIndex"]>(
    path.join(dataDir, "agent-manager", "agents-index.json")
  );
  const agentDetails = Object.fromEntries(
    agentIndex.agents.map((agent) => [
      agent.id,
      readJsonFile<RecallFixtureAgent>(
        path.join(dataDir, "agent-manager", "agents", agent.id, "agent.json")
      ),
    ])
  );
  const sessionIndex = readJsonFile<RecallFixtureFiles["sessionIndex"]>(
    path.join(dataDir, "llm-chat", "sessions-index.json")
  );
  const sessionDetails = Object.fromEntries(
    sessionIndex.sessions.map((session) => [
      session.id,
      readJsonFile<RecallFixtureFiles["sessionDetails"][string]>(
        path.join(dataDir, "llm-chat", "sessions", `${session.id}.json`)
      ),
    ])
  );
  return { agentIndex, agentDetails, sessionIndex, sessionDetails };
}

function artifactSummary(manifest: RecallWorkflowManifest) {
  return {
    schemaVersion: manifest.schemaVersion,
    fixedTimestamp: manifest.fixedTimestamp,
    profileIds: manifest.profiles.map((profile) => profile.id),
    chatModelId: manifest.models.chat.modelId,
    embeddingModelId: manifest.models.embedding.modelId,
    embeddingDimension: manifest.models.embedding.dimension,
    recallIds: [manifest.recall.id],
    entryIds: manifest.recall.entries.map((entry) => entry.id),
    agentIds: [manifest.agent.id],
    sessionIds: manifest.sessions.map((session) => session.id),
    scenarioIds: manifest.chatScenarios.map((scenario) => scenario.scenarioId),
  };
}

export function seedRecallWorkflowFixtures(
  options: SeedRecallWorkflowOptions
): SeedRecallWorkflowResult {
  if (!options.enabled) {
    throw new Error(
      "Recall fixture seeding requires the AIO_E2E_SEED_FIXTURES opt-in"
    );
  }
  const dataDir = safeDataDir(options.dataDir);
  const mode = options.mode ?? "write";
  const initialFiles = buildRecallFixtureFiles(options.manifest);
  validateRecallFixtureFiles(options.manifest, initialFiles);
  const files =
    mode === "verify" ? loadRecallFixtureFiles(dataDir) : initialFiles;
  if (mode === "verify") {
    validateRecallFixtureFiles(options.manifest, files, {
      requireSanitized: false,
    });
  }

  const relativeFiles = [
    "agent-manager/agents-index.json",
    ...Object.keys(files.agentDetails).map(
      (id) => `agent-manager/agents/${id}/agent.json`
    ),
    "llm-chat/sessions-index.json",
    ...Object.keys(files.sessionDetails).map(
      (id) => `llm-chat/sessions/${id}.json`
    ),
  ];
  const values = [
    files.agentIndex,
    ...Object.values(files.agentDetails),
    files.sessionIndex,
    ...Object.values(files.sessionDetails),
  ];
  if (mode === "write") {
    relativeFiles.forEach((relativePath, index) => {
      writeFixtureFile(path.join(dataDir, relativePath), json(values[index]));
    });
  }

  if (options.artifactDir) {
    const artifactDir = safeDataDir(path.resolve(options.artifactDir));
    const summary = artifactSummary(options.manifest);
    assertFixtureIsSanitized(summary);
    const artifactPath = path.join(artifactDir, "recall-fixture-manifest.json");
    if (mode === "verify") verifyExactFile(artifactPath, json(summary));
    else writeFixtureFile(artifactPath, json(summary));
  }

  return {
    schemaVersion: options.manifest.schemaVersion,
    mode,
    agentIds: Object.keys(files.agentDetails),
    sessionIds: Object.keys(files.sessionDetails),
    recallIds: [options.manifest.recall.id],
    files: relativeFiles,
  };
}
