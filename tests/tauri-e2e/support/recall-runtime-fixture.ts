import {
  buildRecallWorkflowManifestForCorpus,
  type RecallFixtureEntry,
} from "../fixtures/recall-workflow";
import type { RecallCorpusMode } from "./runner-options";
import { invokeTauriCommand } from "./tauri-command";

export function requiredE2eEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Recall E2E.`);
  return value;
}

function toPersistedEntry(entry: RecallFixtureEntry) {
  return {
    id: entry.id,
    key: entry.key,
    content: entry.content,
    summary: "",
    tags: entry.tags.map((tag) => ({ ...tag, hash: "" })),
    assets: [],
    priority: entry.priority,
    enabled: entry.enabled,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    contentHash: null,
  };
}

const corpusMode = requiredE2eEnv("AIO_E2E_CORPUS_MODE") as RecallCorpusMode;
const chatProfileId = requiredE2eEnv("AIO_E2E_CHAT_PROFILE_ID");
const chatModelId = requiredE2eEnv("AIO_E2E_CHAT_MODEL_ID");
const embeddingProfileId = requiredE2eEnv("AIO_E2E_EMBEDDING_PROFILE_ID");
const embeddingModelId = requiredE2eEnv("AIO_E2E_EMBEDDING_MODEL_ID");
const embeddingDimension = Number(
  requiredE2eEnv("AIO_E2E_EMBEDDING_DIMENSION")
);
const fixtureMode =
  process.env.AIO_E2E_FIXTURE_MODE === "verify" ? "verify" : "write";
const manifest = buildRecallWorkflowManifestForCorpus(
  {
    chat: { profileId: chatProfileId, modelId: chatModelId },
    embedding: {
      profileId: embeddingProfileId,
      modelId: embeddingModelId,
      dimension: embeddingDimension,
    },
  },
  corpusMode
);

export const recallRuntimeFixture = {
  corpusMode,
  chatProfileId,
  chatModelId,
  embeddingProfileId,
  embeddingModelId,
  embeddingDimension,
  fixtureMode,
  manifest,
};

export async function setupRecallRuntimeFixture(): Promise<void> {
  await invokeTauriCommand<void>("recall_initialize");
  if (fixtureMode !== "write") return;

  const existing =
    await invokeTauriCommand<Array<{ id: string }>>("recall_list_bases");
  if (existing.some((item) => item.id === manifest.recall.id)) {
    await invokeTauriCommand<void>("recall_delete_base", {
      recallId: manifest.recall.id,
    });
  }

  await invokeTauriCommand<void>("recall_save_base_meta", {
    recallId: manifest.recall.id,
    meta: {
      id: manifest.recall.id,
      name: manifest.recall.name,
      description: manifest.recall.description,
      createdAt: manifest.fixedTimeMs,
      updatedAt: manifest.fixedTimeMs,
      author: null,
      vectorization: {
        isIndexed: false,
        lastIndexedAt: null,
        modelUsed: "",
        dimension: 0,
        totalTokens: 0,
      },
      models: [],
      tags: ["e2e", corpusMode],
      icon: null,
      entries: [],
      config: { searchTopK: 5, minScore: 0.2 },
    },
  });

  for (const entry of manifest.recall.entries) {
    await invokeTauriCommand("recall_upsert_entry", {
      recallId: manifest.recall.id,
      entry: toPersistedEntry(entry),
    });
  }
}
