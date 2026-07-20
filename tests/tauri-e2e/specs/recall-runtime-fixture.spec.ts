import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import {
  buildRecallWorkflowManifestForCorpus,
  type RecallFixtureEntry,
} from "../fixtures/recall-workflow";
import type { RecallCorpusMode } from "../support/runner-options";
import { invokeTauriCommand } from "../support/tauri-command";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for Recall E2E.`);
  return value;
}

function attributeSelector(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function navigateTo(targetPath: string): Promise<void> {
  await browser.execute((nextPath) => {
    window.history.pushState({}, "", nextPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, targetPath);
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

const corpusMode = requiredEnv("AIO_E2E_CORPUS_MODE") as RecallCorpusMode;
const chatProfileId = requiredEnv("AIO_E2E_CHAT_PROFILE_ID");
const chatModelId = requiredEnv("AIO_E2E_CHAT_MODEL_ID");
const embeddingProfileId = requiredEnv("AIO_E2E_EMBEDDING_PROFILE_ID");
const embeddingModelId = requiredEnv("AIO_E2E_EMBEDDING_MODEL_ID");
const embeddingDimension = Number(requiredEnv("AIO_E2E_EMBEDDING_DIMENSION"));
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

describe("Recall runtime fixture", () => {
  before(async () => {
    await invokeTauriCommand<void>("recall_initialize");

    if (fixtureMode === "write") {
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
  });

  it("loads the explicitly selected Chat and Embedding profiles", async () => {
    await navigateTo("/settings?section=llm-service");
    await $('[data-testid="llm-service-settings"]').waitForDisplayed({
      timeout: 30_000,
    });

    for (const profileId of new Set([chatProfileId, embeddingProfileId])) {
      await $(
        `[data-profile-id="${attributeSelector(profileId)}"]`
      ).waitForDisplayed({ timeout: 20_000 });
    }
  });

  it("persists the selected corpus through production Recall IPC", async () => {
    const entryIds = await invokeTauriCommand<string[]>(
      "recall_list_entry_ids",
      { recallId: manifest.recall.id }
    );
    const expectedIds = manifest.recall.entries.map((entry) => entry.id).sort();
    if (JSON.stringify([...entryIds].sort()) !== JSON.stringify(expectedIds)) {
      throw new Error(
        `Recall ${corpusMode} corpus mismatch: expected ${expectedIds.length}, received ${entryIds.length}.`
      );
    }

    const meta = await invokeTauriCommand<{
      id: string;
      entries: Array<{ id: string }>;
    } | null>("recall_load_base_meta", {
      recallId: manifest.recall.id,
      modelId: embeddingModelId,
    });
    if (!meta || meta.id !== manifest.recall.id) {
      throw new Error("Seeded Recall collection could not be read back.");
    }
    if (meta.entries.length !== expectedIds.length) {
      throw new Error(
        `Recall metadata indexed ${meta.entries.length} of ${expectedIds.length} entries.`
      );
    }

    const artifactDir = requiredEnv("AIO_E2E_ARTIFACT_DIR");
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(
      path.join(artifactDir, "recall-state-summary.json"),
      `${JSON.stringify(
        {
          schemaVersion: manifest.schemaVersion,
          fixtureMode,
          corpusMode,
          recallId: manifest.recall.id,
          entryIds: expectedIds,
          chatProfileId,
          chatModelId,
          embeddingProfileId,
          embeddingModelId,
          embeddingDimension,
        },
        null,
        2
      )}\n`,
      "utf8"
    );
  });

  it("shows the IPC-backed collection and entries in the Recall UI", async () => {
    await navigateTo("/recall");
    const workspace = await $('[data-testid="recall-workspace"]');
    await workspace.waitForDisplayed({ timeout: 30_000 });
    await browser.waitUntil(
      async () =>
        (await workspace.getAttribute("data-recall-id")) === manifest.recall.id,
      {
        timeout: 20_000,
        timeoutMsg: "Recall UI did not activate the seeded collection.",
      }
    );
    const firstEntry = await $('[data-testid="recall-entry-row"]');
    await firstEntry.waitForDisplayed({ timeout: 20_000 });
    const firstEntryId = await firstEntry.getAttribute("data-entry-id");
    if (!manifest.recall.entries.some((entry) => entry.id === firstEntryId)) {
      throw new Error(
        "Recall UI displayed an entry outside the selected corpus."
      );
    }
  });
});
