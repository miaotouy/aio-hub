import fs from "node:fs";
import path from "node:path";
import { $, browser } from "@wdio/globals";
import { recallChatScenarios } from "../fixtures/recall-scenarios";
import {
  recallRuntimeFixture,
  requiredE2eEnv,
  setupRecallRuntimeFixture,
} from "../support/recall-runtime-fixture";
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
  evidenceVerified?: boolean;
}

interface RecoverySessionSnapshot {
  messageCount: number;
  activeLeafId: string | null;
  nodes: Array<{
    id: string;
    role: string;
    status: string;
    contentLength: number;
  }>;
}

interface RecoveryLogCounters {
  pipelineStarted: number;
  pipelineCompleted: number;
  queryVectorStarted: number;
  queryVectorCompleted: number;
  llmRequestStarted: number;
}

interface RecoveryProbeContext {
  probeId: string;
  scenarioId: string;
  sessionId: string;
  startedAt: number;
  embeddingBaseline: number;
  chatBaseline: number;
  backendChatBaseline: number;
  logBaseline: RecoveryLogCounters;
}

const recoveryProbePath = path.join(
  artifactDir,
  "recall-recovery-probes.jsonl"
);

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

function countMatches(text: string, pattern: RegExp): number {
  return text.match(pattern)?.length ?? 0;
}

function readRecoveryLogCounters(): RecoveryLogCounters {
  const logDir = path.join(dataDir, "logs");
  if (!fs.existsSync(logDir)) {
    return {
      pipelineStarted: 0,
      pipelineCompleted: 0,
      queryVectorStarted: 0,
      queryVectorCompleted: 0,
      llmRequestStarted: 0,
    };
  }
  const text = fs
    .readdirSync(logDir)
    .filter(
      (fileName) => fileName.startsWith("app-") && fileName.endsWith(".log")
    )
    .map((fileName) => fs.readFileSync(path.join(logDir, fileName), "utf8"))
    .join("\n");
  return {
    pipelineStarted: countMatches(
      text,
      /\[llm-chat\/PipelineEngine\] 开始执行上下文管道/g
    ),
    pipelineCompleted: countMatches(
      text,
      /\[llm-chat\/PipelineEngine\] 上下文管道执行完毕/g
    ),
    queryVectorStarted: countMatches(
      text,
      /\[recall\/vector-cache\] 生成查询向量/g
    ),
    queryVectorCompleted: countMatches(
      text,
      /\[recall\/vector-cache\] 查询向量生成成功/g
    ),
    llmRequestStarted: countMatches(text, /\[LlmRequest\] 发送 LLM 请求/g),
  };
}

function subtractLogCounters(
  current: RecoveryLogCounters,
  baseline: RecoveryLogCounters
): RecoveryLogCounters {
  return {
    pipelineStarted: current.pipelineStarted - baseline.pipelineStarted,
    pipelineCompleted: current.pipelineCompleted - baseline.pipelineCompleted,
    queryVectorStarted:
      current.queryVectorStarted - baseline.queryVectorStarted,
    queryVectorCompleted:
      current.queryVectorCompleted - baseline.queryVectorCompleted,
    llmRequestStarted: current.llmRequestStarted - baseline.llmRequestStarted,
  };
}

function readRecoverySessionSnapshot(
  sessionId: string
): RecoverySessionSnapshot | null {
  const filePath = path.join(
    dataDir,
    "llm-chat",
    "sessions",
    `${sessionId}.json`
  );
  if (!fs.existsSync(filePath)) return null;
  const session = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    messageCount: number;
    activeLeafId?: string;
    nodes: Record<
      string,
      { id?: string; role: string; status: string; content?: string }
    >;
  };
  return {
    messageCount: session.messageCount,
    activeLeafId: session.activeLeafId ?? null,
    nodes: Object.entries(session.nodes).map(([id, node]) => ({
      id: node.id ?? id,
      role: node.role,
      status: node.status,
      contentLength: node.content?.length ?? 0,
    })),
  };
}

function readRedactedKeyState(): {
  stateCount: number;
  enabledCount: number;
  brokenCount: number;
  totalErrorCount: number;
} | null {
  const filePath = path.join(dataDir, "llm-service", "key-states.json");
  if (!fs.existsSync(filePath)) return null;
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    states?: Record<
      string,
      Record<
        string,
        { isEnabled?: boolean; isBroken?: boolean; errorCount?: number }
      >
    >;
  };
  const states = Object.values(payload.states ?? {}).flatMap((profile) =>
    Object.values(profile)
  );
  return {
    stateCount: states.length,
    enabledCount: states.filter((state) => state.isEnabled).length,
    brokenCount: states.filter((state) => state.isBroken).length,
    totalErrorCount: states.reduce(
      (total, state) => total + (state.errorCount ?? 0),
      0
    ),
  };
}

function redactProbeDetail(value: string): string {
  return value
    .replace(/Bearer\s+[^\s,}]+/gi, "Bearer [redacted]")
    .replace(/(api[-_ ]?key\s*[:=]\s*)[^\s,}]+/gi, "$1[redacted]")
    .slice(0, 500);
}

async function recordRecoveryProbe(
  context: RecoveryProbeContext,
  event: string,
  detail?: string
): Promise<void> {
  try {
    const ui = await browser.execute(() => ({
      pathname: window.location.pathname,
      messages: Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="chat-message"]')
      ).map((message) => ({
        id: message.dataset.messageId ?? null,
        role: message.dataset.messageRole ?? null,
        status: message.dataset.messageStatus ?? null,
        contentLength: message.innerText.length,
      })),
      sendDisabled:
        document
          .querySelector<HTMLElement>('[data-testid="chat-send-message"]')
          ?.hasAttribute("disabled") ?? null,
      stopVisible: Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-testid="chat-stop-generation"]'
        )
      ).some((element) => element.offsetParent !== null),
    }));
    const embeddingRequests = readRequestSummaries("embedding").length;
    const chatRequests = readRequestSummaries("chat").length;
    const backendChatRequests = countBackendChatRequests();
    fs.appendFileSync(
      recoveryProbePath,
      `${JSON.stringify({
        schemaVersion: 1,
        at: new Date().toISOString(),
        elapsedMs: Date.now() - context.startedAt,
        probeId: context.probeId,
        event,
        scenarioId: context.scenarioId,
        lane,
        chatExpectation,
        requestEvidence,
        requestDelta: {
          embedding: embeddingRequests - context.embeddingBaseline,
          chat: chatRequests - context.chatBaseline,
          backendChat: backendChatRequests - context.backendChatBaseline,
        },
        logDelta: subtractLogCounters(
          readRecoveryLogCounters(),
          context.logBaseline
        ),
        session: readRecoverySessionSnapshot(context.sessionId),
        keyState: readRedactedKeyState(),
        ui,
        ...(detail ? { detail: redactProbeDetail(detail) } : {}),
      })}\n`,
      "utf8"
    );
  } catch (error) {
    fs.appendFileSync(
      recoveryProbePath,
      `${JSON.stringify({
        schemaVersion: 1,
        at: new Date().toISOString(),
        elapsedMs: Date.now() - context.startedAt,
        probeId: context.probeId,
        event: `${event}-probe-error`,
        detail: redactProbeDetail(
          error instanceof Error ? error.message : String(error)
        ),
      })}\n`,
      "utf8"
    );
  }
}

function probeHeartbeat(
  context: RecoveryProbeContext,
  event: string
): () => Promise<void> {
  let lastProbeAt = 0;
  return async () => {
    if (Date.now() - lastProbeAt < 2_000) return;
    lastProbeAt = Date.now();
    await recordRecoveryProbe(context, event);
  };
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

const recallRecoveryDescribe =
  process.env.AIO_E2E_PHASE === "recovery" &&
  process.env.AIO_E2E_ACTIVE_SPEC?.includes("recall-session-recovery")
    ? describe
    : describe.skip;

recallRecoveryDescribe("Recall session recovery", () => {
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
    const chatRequestBaseline = readRequestSummaries("chat").length;
    const backendChatBaseline = countBackendChatRequests();
    const probeContext: RecoveryProbeContext = {
      probeId: `recovery-${Date.now()}`,
      scenarioId: scenario.id,
      sessionId: fixture.sessionId,
      startedAt: Date.now(),
      embeddingBaseline,
      chatBaseline: chatRequestBaseline,
      backendChatBaseline,
      logBaseline: readRecoveryLogCounters(),
    };

    await recordRecoveryProbe(probeContext, "session-selected");

    try {
      await fillChatInput(fixture.query);
      await recordRecoveryProbe(probeContext, "input-filled");
      await $('[data-testid="chat-send-message"]').click();
      await recordRecoveryProbe(probeContext, "send-clicked");

      let summary: ChatSummary | undefined;
      const requestHeartbeat = probeHeartbeat(
        probeContext,
        "waiting-for-chat-request"
      );
      if (requestEvidence === "tauri-log-and-state") {
        await browser.waitUntil(
          async () => {
            await requestHeartbeat();
            return countBackendChatRequests() > backendChatBaseline;
          },
          {
            timeout: chatExpectation === "response-present" ? 180_000 : 60_000,
            timeoutMsg: "Recovery Chat request was not recorded.",
          }
        );
        summary = {
          scenarioId: scenario.id,
          scenarioMatch: false,
          status: 200,
          requiredEvidence: [],
          evidenceVerified: false,
        };
      } else {
        await browser.waitUntil(
          async () => {
            await requestHeartbeat();
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
      await recordRecoveryProbe(probeContext, "chat-request-recorded");

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
      const assistantHeartbeat = probeHeartbeat(
        probeContext,
        "waiting-for-assistant"
      );
      await browser.waitUntil(
        async () => {
          await assistantHeartbeat();
          return await browser.execute(
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
          );
        },
        {
          timeout: chatExpectation === "response-present" ? 180_000 : 60_000,
          timeoutMsg: "Recovery assistant reply did not complete.",
        }
      );
      await recordRecoveryProbe(probeContext, "assistant-completed");

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
      await recordRecoveryProbe(probeContext, "session-persisted");

      const evidenceVerified = requestEvidence !== "tauri-log-and-state";
      const chatEvidence =
        evidenceVerified &&
        summary!.scenarioMatch &&
        summary!.requiredEvidence.every((item) => item.matched);
      const passed =
        queryEmbedding &&
        (chatExpectation === "response-present" || chatEvidence);
      recordRecallScenarioResult(artifactDir, {
        scenarioId: scenario.id,
        phase,
        passed,
        queryEmbedding,
        embeddingRequests: embeddingRequests.length,
        chatStatus: summary!.status,
        chatEvidence,
        evidenceVerified,
        uiReply: true,
        sessionPersisted: true,
      });
      assert(passed, "Recall Chat failed after process restart.");
      await recordRecoveryProbe(probeContext, "passed");
    } catch (error) {
      await recordRecoveryProbe(
        probeContext,
        "failed",
        error instanceof Error ? error.message : String(error)
      );
      throw error;
    }
  });
});
