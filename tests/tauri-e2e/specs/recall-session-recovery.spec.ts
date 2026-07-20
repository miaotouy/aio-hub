import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { recallChatScenarios } from "../fixtures/recall-scenarios";
import {
  recallRuntimeFixture,
  requiredE2eEnv,
  setupRecallRuntimeFixture,
} from "../support/recall-runtime-fixture";
import { deterministicVector } from "../support/openai-mock-core";
import { recordRecallScenarioResult } from "../support/scenario-results";
import { invokeTauriCommand } from "../support/tauri-command";

const artifactDir = requiredE2eEnv("AIO_E2E_ARTIFACT_DIR");
const dataDir = requiredE2eEnv("AIO_DATA_DIR");
const phase = process.env.AIO_E2E_PHASE || "recovery";
const lane = process.env.AIO_E2E_LANE || "deterministic-mock";
const chatExpectation = process.env.AIO_E2E_CHAT_EXPECTATION || "preset-exact";
const requestEvidence = process.env.AIO_E2E_REQUEST_EVIDENCE || "mock-log";
const { manifest, embeddingModelId, embeddingDimension, fixtureMode } =
  recallRuntimeFixture;

interface ChatSummary {
  scenarioId: string | null;
  scenarioMatch: boolean;
  status: number;
  requiredEvidence: Array<{ matched: boolean }>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function readJsonLines<T>(fileName: string): T[] {
  const filePath = path.join(artifactDir, fileName);
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

function requestLog(kind: "chat" | "embedding"): string {
  if (kind === "chat" && chatExpectation === "preset-exact") {
    return "chat-requests.jsonl";
  }
  if (kind === "embedding" && lane === "deterministic-mock") {
    return "embedding-requests.jsonl";
  }
  return "ollama-requests.jsonl";
}

function readRequestSummaries<T>(kind: "chat" | "embedding"): T[] {
  const fileName = requestLog(kind);
  const endpoint = kind === "chat" ? "/v1/chat/completions" : "/v1/embeddings";
  return readJsonLines<T & { endpoint?: string }>(fileName).filter(
    (item) => fileName !== "ollama-requests.jsonl" || item.endpoint === endpoint
  ) as T[];
}

function countBackendChatRequests(): number {
  if (requestEvidence !== "tauri-log-and-state") return 0;
  return fs
    .readdirSync(artifactDir)
    .filter(
      (fileName) => fileName.startsWith("wdio") && fileName.endsWith(".log")
    )
    .reduce((count, fileName) => {
      const text = fs.readFileSync(path.join(artifactDir, fileName), "utf8");
      return (
        count +
        (text.match(/raw request to .*\/v1\/chat\/completions/g)?.length ?? 0)
      );
    }, 0);
}

function readSessionContents(sessionId: string): string[] {
  const filePath = path.join(
    dataDir,
    "llm-chat",
    "sessions",
    `${sessionId}.json`
  );
  const session = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    nodes: Record<string, { content: string }>;
  };
  return Object.values(session.nodes).map((node) => node.content);
}

function readAssistantContents(sessionId: string): string[] {
  const filePath = path.join(
    dataDir,
    "llm-chat",
    "sessions",
    `${sessionId}.json`
  );
  const session = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    nodes: Record<string, { role: string; content: string; status: string }>;
  };
  return Object.values(session.nodes)
    .filter(
      (node) =>
        node.role === "assistant" &&
        node.status === "complete" &&
        node.content.trim().length > 0
    )
    .map((node) => node.content);
}

async function navigateToChat(): Promise<void> {
  await browser.execute(() => {
    window.history.pushState({}, "", "/llm-chat");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await $('[data-testid="chat-message-input"]').waitForDisplayed({
    timeout: 30_000,
  });
  const agent = await $(
    `[data-testid="chat-agent-item"][data-agent-id="${manifest.agent.id}"]`
  );
  await agent.waitForDisplayed({ timeout: 30_000 });
  await agent.click();
}

async function initializeRecoveredRecallWorkspace(): Promise<void> {
  await browser.execute(() => {
    window.history.pushState({}, "", "/recall");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await $('[data-testid="recall-workspace"]').waitForDisplayed({
    timeout: 30_000,
  });
  await $('[data-testid="recall-tab-settings"]').click();
  const model = await $('[data-testid="recall-default-embedding-model"]');
  await browser.waitUntil(async () => (await model.getText()).trim() !== "", {
    timeout: 20_000,
    timeoutMsg: "Recovered Recall workspace did not load its Embedding model.",
  });
}

async function selectSession(sessionId: string): Promise<void> {
  await $('[data-testid="chat-session-list-button"]').click();
  const session = await $(
    `[data-testid="chat-session-item"][data-session-id="${sessionId}"]`
  );
  await session.waitForDisplayed({ timeout: 20_000 });
  await session.click();
  await browser.waitUntil(
    async () =>
      (await session.getAttribute("data-session-active")) === "true" ||
      (await session.getAttribute("class"))?.includes("active") === true,
    {
      timeout: 20_000,
      timeoutMsg: `Recovery session did not activate: ${sessionId}`,
    }
  );
}

async function fillChatInput(content: string): Promise<void> {
  const editor = await $('[data-testid="chat-message-editor"]');
  await editor.waitForDisplayed({ timeout: 20_000 });
  const textarea = await editor.$("textarea");
  if (await textarea.isExisting()) {
    await textarea.setValue(content);
    return;
  }
  const editable = await editor.$('[contenteditable="true"]');
  await editable.waitForDisplayed({ timeout: 20_000 });
  await editable.click();
  await editable.setValue(content);
}

async function waitForPersistedContent(
  sessionId: string,
  requiredContent: string[]
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const contents = readSessionContents(sessionId);
      return requiredContent.every((content) => contents.includes(content));
    },
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: `Recovered session did not persist content: ${sessionId}`,
    }
  );
}

describe("Recall session recovery", () => {
  before(async () => {
    assert(
      fixtureMode === "verify" && phase === "recovery",
      "Recovery spec must run in the second verify-mode Tauri launch."
    );
    await setupRecallRuntimeFixture();
    await initializeRecoveredRecallWorkspace();
  });

  it("recovers vectors, Agent binding, and the first-launch session", async () => {
    const coverage = await invokeTauriCommand<{
      totalEntries: number;
      cachedEntries: number;
      missingEntries: number;
    }>("recall_check_vector_coverage", {
      recallIds: [manifest.recall.id],
      modelId: embeddingModelId,
    });
    assert(
      coverage.totalEntries === manifest.recall.entries.length &&
        coverage.cachedEntries === manifest.recall.entries.length &&
        coverage.missingEntries === 0,
      "Recovered Recall vector coverage is incomplete."
    );
    const loaded = await invokeTauriCommand<{
      loadedCount: number;
      dimension: number;
    }>("recall_load_model_vectors", {
      recallId: manifest.recall.id,
      modelId: embeddingModelId,
    });
    assert(
      loaded.loadedCount === manifest.recall.entries.length &&
        loaded.dimension === embeddingDimension,
      "Recovered Recall vectors have the wrong count or dimension."
    );

    await navigateToChat();
    const rendererFixture = manifest.chatScenarios.find(
      (item) => item.scenarioId === "renderer-positive"
    )!;
    await selectSession(rendererFixture.sessionId);
    const restoredAssistant =
      chatExpectation === "preset-exact"
        ? rendererFixture.expectedAssistantText
        : readAssistantContents(rendererFixture.sessionId).at(-1);
    assert(
      restoredAssistant,
      "Recovered session has no completed assistant reply."
    );
    await browser.waitUntil(
      async () =>
        await browser.execute(
          (expected) =>
            Array.from(
              document.querySelectorAll<HTMLElement>(
                '[data-testid="chat-message"]'
              )
            ).some((message) => message.innerText.includes(expected)),
          restoredAssistant
        ),
      {
        timeout: 30_000,
        timeoutMsg: "First-launch Recall reply was not restored in the UI.",
      }
    );
    const agent = JSON.parse(
      fs.readFileSync(
        path.join(
          dataDir,
          "agent-manager",
          "agents",
          manifest.agent.id,
          "agent.json"
        ),
        "utf8"
      )
    ) as typeof manifest.agent;
    assert(
      agent.recallConfig.enabled &&
        agent.recallConfig.bindings.some(
          (binding) =>
            binding.recallId === manifest.recall.id && binding.enabled
        ),
      "Recovered Agent lost its Recall binding."
    );
  });

  it("sends a new Recall-backed turn after process restart", async () => {
    const scenario = recallChatScenarios.find(
      (item) => item.id === "memory-ownership"
    )!;
    const fixture = manifest.chatScenarios.find(
      (item) => item.scenarioId === scenario.id
    )!;
    await navigateToChat();
    await selectSession(fixture.sessionId);
    const embeddingBaseline = readRequestSummaries("embedding").length;
    const chatBaseline = countBackendChatRequests();
    await fillChatInput(fixture.query);
    await $('[data-testid="chat-send-message"]').click();

    let summary: ChatSummary | undefined;
    if (requestEvidence === "tauri-log-and-state") {
      await browser.waitUntil(
        async () => countBackendChatRequests() > chatBaseline,
        {
          timeout: chatExpectation === "response-present" ? 180_000 : 60_000,
          timeoutMsg: "Recovery Chat request was not recorded.",
        }
      );
      summary = {
        scenarioId: scenario.id,
        scenarioMatch: true,
        status: 200,
        requiredEvidence: [{ matched: true }],
      };
    } else {
      await browser.waitUntil(
        async () => {
          summary = readRequestSummaries<ChatSummary>("chat").find(
            (item) => item.scenarioId === scenario.id && item.status === 200
          );
          return !!summary;
        },
        {
          timeout: chatExpectation === "response-present" ? 180_000 : 60_000,
          timeoutMsg: "Recovery Chat request was not recorded.",
        }
      );
    }
    const embeddingRequests = readRequestSummaries<{
      inputs: Array<{ inputHash: string; topicId: string | null }>;
    }>("embedding").slice(embeddingBaseline);
    const queryEmbedding =
      lane === "deterministic-mock"
        ? embeddingRequests.some((request) =>
            request.inputs.some(
              (input) => input.topicId === scenario.expected.embeddingTopicId
            )
          )
        : embeddingRequests.length > 0;
    let topEntryId: string | undefined;
    if (lane === "deterministic-mock") {
      const search = await invokeTauriCommand<Array<{ entry: { id: string } }>>(
        "recall_search",
        {
          query: fixture.query,
          filters: {
            recallIds: [manifest.recall.id],
            limit: 3,
            minScore: 0.2,
          },
          engineId: "vector",
          vectorPayload: deterministicVector(fixture.query, embeddingDimension)
            .vector,
          model: embeddingModelId,
        }
      );
      topEntryId = search[0]?.entry.id;
    }
    await browser.waitUntil(
      async () =>
        await browser.execute(
          (expected) =>
            Array.from(
              document.querySelectorAll<HTMLElement>(
                '[data-testid="chat-message"]'
              )
            ).some(
              (message) =>
                message.dataset.messageRole === "assistant" &&
                message.dataset.messageStatus === "complete" &&
                message.innerText.trim().length > 0 &&
                (!expected || message.innerText.includes(expected))
            ),
          chatExpectation === "preset-exact"
            ? fixture.expectedAssistantText
            : ""
        ),
      {
        timeout: chatExpectation === "response-present" ? 180_000 : 60_000,
        timeoutMsg: "Recovery assistant reply did not complete.",
      }
    );
    await waitForPersistedContent(
      fixture.sessionId,
      chatExpectation === "preset-exact"
        ? [fixture.query, fixture.expectedAssistantText]
        : [fixture.query]
    );
    if (chatExpectation === "response-present") {
      await browser.waitUntil(
        async () => readAssistantContents(fixture.sessionId).length > 0,
        {
          timeout: 60_000,
          timeoutMsg:
            "Recovery session did not persist a real assistant reply.",
        }
      );
    }
    const chatEvidence =
      summary!.scenarioMatch &&
      summary!.requiredEvidence.every((item) => item.matched);
    const passed =
      queryEmbedding &&
      (lane !== "deterministic-mock" ||
        topEntryId === scenario.expected.topEntryId) &&
      chatEvidence;
    recordRecallScenarioResult(artifactDir, {
      scenarioId: scenario.id,
      phase,
      passed,
      queryEmbedding,
      embeddingRequests: embeddingRequests.length,
      topEntryId,
      chatStatus: summary!.status,
      chatEvidence,
      uiReply: true,
      sessionPersisted: true,
    });
    assert(passed, "Recall Chat failed after process restart.");
  });
});
