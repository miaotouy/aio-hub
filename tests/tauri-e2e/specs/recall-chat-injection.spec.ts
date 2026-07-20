import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import {
  RECALL_ENTRY_IDS,
  recallChatScenarios,
} from "../fixtures/recall-scenarios";
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
const phase = process.env.AIO_E2E_PHASE || "initial";
const lane = process.env.AIO_E2E_LANE || "deterministic-mock";
const { manifest, embeddingModelId, embeddingDimension } = recallRuntimeFixture;

interface ChatSummary {
  scenarioId: string | null;
  scenarioMatch: boolean;
  status: number;
  requiredEvidence: Array<{ matched: boolean }>;
  mismatchReason: string | null;
}

interface EmbeddingSummary {
  inputs?: Array<{ inputHash: string; topicId: string | null }>;
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

async function navigateTo(pathname: string): Promise<void> {
  await browser.execute((target) => {
    window.history.pushState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, pathname);
}

async function selectSession(sessionId: string): Promise<void> {
  const sessionButton = await $('[data-testid="chat-session-list-button"]');
  await sessionButton.waitForClickable({ timeout: 20_000 });
  await sessionButton.click();
  const session = await $(
    `[data-testid="chat-session-item"][data-session-id="${sessionId}"]`
  );
  await session.waitForDisplayed({ timeout: 20_000 });
  await session.click();
  await browser.waitUntil(
    async () =>
      (await session.getAttribute("data-session-active")) === "true" ||
      (await session.getAttribute("class"))?.includes("active") === true,
    { timeout: 20_000, timeoutMsg: `Session did not activate: ${sessionId}` }
  );
}

async function selectFixtureAgent(): Promise<void> {
  const agent = await $(
    `[data-testid="chat-agent-item"][data-agent-id="${manifest.agent.id}"]`
  );
  await agent.waitForDisplayed({ timeout: 30_000 });
  await agent.click();
  await browser.waitUntil(
    async () =>
      (await agent.getAttribute("class"))?.includes("selected") === true,
    { timeout: 20_000, timeoutMsg: "Fixture Agent did not become selected." }
  );
}

async function fillChatInput(content: string): Promise<void> {
  const editor = await $('[data-testid="chat-message-editor"]');
  await editor.waitForDisplayed({ timeout: 20_000 });
  const textarea = await editor.$("textarea");
  if (await textarea.isExisting()) {
    await textarea.click();
    await textarea.setValue(content);
    return;
  }
  const editable = await editor.$('[contenteditable="true"]');
  await editable.waitForDisplayed({ timeout: 20_000 });
  await editable.click();
  await editable.setValue(content);
}

async function waitForChatSummary(
  scenarioId: string,
  status: number
): Promise<ChatSummary> {
  let summary: ChatSummary | undefined;
  await browser.waitUntil(
    async () => {
      const summaries = readJsonLines<ChatSummary>("chat-requests.jsonl");
      summary = [...summaries]
        .reverse()
        .find((candidate) => candidate.scenarioId === scenarioId);
      return summary?.status === status;
    },
    {
      timeout: 60_000,
      interval: 250,
      timeoutMsg: `Chat mock did not record ${scenarioId} with status ${status}.`,
    }
  );
  return summary!;
}

function readSession(sessionId: string): {
  nodes: Record<string, { role: string; content: string; status: string }>;
  messageCount: number;
} {
  const filePath = path.join(
    dataDir,
    "llm-chat",
    "sessions",
    `${sessionId}.json`
  );
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    nodes: Record<string, { role: string; content: string; status: string }>;
    messageCount: number;
  };
}

async function waitForSessionFailure(sessionId: string): Promise<void> {
  await browser.waitUntil(
    async () =>
      Object.values(readSession(sessionId).nodes).some(
        (node) => node.role === "assistant" && node.status === "error"
      ),
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: `Fail-closed session did not persist an error state: ${sessionId}`,
    }
  );
}

async function waitForSessionContent(
  sessionId: string,
  requiredContent: string[]
): Promise<ReturnType<typeof readSession>> {
  let session: ReturnType<typeof readSession> | undefined;
  await browser.waitUntil(
    async () => {
      session = readSession(sessionId);
      const contents = Object.values(session.nodes).map((node) => node.content);
      return requiredContent.every((content) => contents.includes(content));
    },
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: `Session detail did not persist expected content: ${sessionId}`,
    }
  );
  return session!;
}

async function resolveTopEntry(query: string): Promise<string | undefined> {
  if (lane !== "deterministic-mock") return undefined;
  const response = await invokeTauriCommand<Array<{ entry?: { id?: string } }>>(
    "recall_search",
    {
      query,
      filters: {
        recallIds: [manifest.recall.id],
        limit: 3,
        minScore: 0.2,
      },
      engineId: "vector",
      vectorPayload: deterministicVector(query, embeddingDimension).vector,
      model: embeddingModelId,
    }
  );
  return response[0]?.entry?.id;
}

async function ensureVectors(): Promise<void> {
  await navigateTo("/recall");
  await browser.waitUntil(
    async () =>
      await browser.execute(() => window.location.pathname === "/recall"),
    { timeout: 20_000, timeoutMsg: "Recall route did not become active." }
  );
  await $('[data-testid="recall-workspace"]').waitForDisplayed({
    timeout: 30_000,
  });
  const vectorizeAll = await $('[data-testid="recall-vectorize-all"]');
  await vectorizeAll.waitForClickable({ timeout: 20_000 });
  await vectorizeAll.click();
  await browser.waitUntil(
    async () => {
      const coverage = await invokeTauriCommand<{
        missingEntries: number;
      }>("recall_check_vector_coverage", {
        recallIds: [manifest.recall.id],
        modelId: embeddingModelId,
      });
      return coverage.missingEntries === 0;
    },
    {
      timeout: 120_000,
      interval: 500,
      timeoutMsg: "Recall vectors were not ready before Chat injection.",
    }
  );
}

async function verifyAgentRecallBinding(): Promise<void> {
  await navigateTo("/agent-manager");
  await $('[data-testid="agent-manager"]').waitForDisplayed({
    timeout: 30_000,
  });
  const card = await $(
    `[data-testid="agent-manager-card"][data-agent-id="${manifest.agent.id}"]`
  );
  await card.waitForDisplayed({ timeout: 20_000 });
  await card.$('[data-testid="agent-manager-edit"]').click();
  const editor = await $('[data-testid="agent-editor"]');
  await editor.waitForDisplayed({ timeout: 20_000 });
  await $('[data-tab-id="recall"]').click();
  const enabled = await $('[data-testid="agent-recall-enabled"]');
  const checkbox = await enabled.$('input[type="checkbox"]');
  assert(
    await checkbox.isSelected(),
    "Seeded Agent Recall switch is disabled."
  );
  const binding = await $(
    `[data-testid="agent-recall-binding"][data-recall-id="${manifest.recall.id}"]`
  );
  await binding.waitForDisplayed({ timeout: 20_000 });
  assert(
    (await binding.getAttribute("data-binding-enabled")) === "true",
    "Seeded Agent Recall binding is disabled."
  );
  await $('[data-testid="agent-editor-cancel"]').click();
  await editor.waitForDisplayed({ reverse: true, timeout: 20_000 });
}

async function runScenario(
  scenarioId: string,
  sessionId: string,
  expectedStatus: number
): Promise<void> {
  const scenario = recallChatScenarios.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`Unknown Recall Chat scenario: ${scenarioId}`);
  const query = manifest.chatScenarios.find(
    (item) => item.scenarioId === scenarioId
  )?.query;
  if (!query) throw new Error(`No fixture query for scenario: ${scenarioId}`);

  await navigateTo("/llm-chat");
  await $('[data-testid="chat-message-input"]').waitForDisplayed({
    timeout: 30_000,
  });
  await selectFixtureAgent();
  await selectSession(sessionId);
  const beforeEmbeddings = readJsonLines<EmbeddingSummary>(
    "embedding-requests.jsonl"
  ).length;
  await fillChatInput(query);
  await $('[data-testid="chat-send-message"]').click();

  const summary = await waitForChatSummary(scenarioId, expectedStatus);
  const embeddingRequests = readJsonLines<EmbeddingSummary>(
    "embedding-requests.jsonl"
  ).slice(beforeEmbeddings);
  const queryEmbedding = embeddingRequests.some((request) =>
    request.inputs?.some((input) =>
      scenario.expected.embeddingTopicId
        ? input.topicId === scenario.expected.embeddingTopicId
        : input.topicId === null
    )
  );
  const topEntryId = await resolveTopEntry(query);
  let sessionPersisted = false;
  let uiReply = false;
  if (expectedStatus === 200) {
    await browser.waitUntil(
      async () =>
        await browser.execute(
          (text) =>
            Array.from(
              document.querySelectorAll<HTMLElement>(
                '[data-testid="chat-message"]'
              )
            ).some(
              (message) =>
                message.dataset.messageRole === "assistant" &&
                message.dataset.messageStatus === "complete" &&
                message.innerText.includes(text)
            ),
          scenario.response.chunks.join("")
        ),
      {
        timeout: 60_000,
        timeoutMsg: `Assistant reply did not complete: ${scenarioId}`,
      }
    );
    uiReply = true;
    await waitForSessionContent(sessionId, [
      query,
      scenario.response.chunks.join(""),
    ]);
    sessionPersisted = true;
  } else {
    await browser.waitUntil(
      async () =>
        !(await browser.execute(() =>
          Array.from(
            document.querySelectorAll<HTMLElement>(
              '[data-testid="chat-message"]'
            )
          ).some(
            (message) =>
              message.dataset.messageRole === "assistant" &&
              message.innerText.includes("This response must never be returned")
          )
        )),
      { timeout: 20_000, timeoutMsg: "Fail-closed Chat produced a response." }
    );
    uiReply = true;
    await waitForSessionContent(sessionId, [query]);
    await waitForSessionFailure(sessionId);
    sessionPersisted = true;
  }

  const chatEvidence =
    expectedStatus === 200
      ? summary.scenarioMatch &&
        summary.requiredEvidence.every((item) => item.matched)
      : !summary.scenarioMatch &&
        summary.mismatchReason === scenario.expected.mismatchReason;
  const expectedTop = scenario.expected.topEntryId;
  const passed =
    embeddingRequests.length >= scenario.expected.embeddingRequests &&
    queryEmbedding === scenario.expected.embeddingRequests > 0 &&
    (!expectedTop || topEntryId === expectedTop) &&
    (scenarioId !== "no-result" || topEntryId === undefined) &&
    chatEvidence &&
    uiReply &&
    sessionPersisted;
  recordRecallScenarioResult(artifactDir, {
    scenarioId,
    phase,
    passed,
    queryEmbedding,
    embeddingRequests: embeddingRequests.length,
    topEntryId,
    chatStatus: summary.status,
    chatEvidence,
    uiReply,
    sessionPersisted,
  });
  assert(passed, `Recall Chat scenario failed: ${scenarioId}`);
}

describe("Recall Chat injection", () => {
  before(async () => {
    await setupRecallRuntimeFixture();
    await ensureVectors();
    await verifyAgentRecallBinding();
  });

  it("injects retrieved evidence and persists the streamed response", async () => {
    await runScenario(
      "renderer-positive",
      manifest.sessions.find((session) => session.kind === "empty")!.id,
      200
    );
  });

  it("returns the configured empty Recall context without unrelated evidence", async () => {
    await invokeTauriCommand<void>("recall_delete_base", {
      recallId: manifest.recall.id,
    });
    try {
      await runScenario(
        "no-result",
        manifest.sessions.find((session) => session.id.includes("no-result"))!
          .id,
        200
      );
    } finally {
      await setupRecallRuntimeFixture();
      await ensureVectors();
    }
  });

  it("fails closed when the required Recall evidence is missing", async () => {
    await runScenario(
      "missing-evidence-fail-closed",
      manifest.sessions.find((session) => session.id.includes("fail-closed"))!
        .id,
      422
    );
  });
});
