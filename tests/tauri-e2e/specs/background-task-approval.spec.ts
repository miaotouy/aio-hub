import { $, browser } from "@wdio/globals";

const runnerLane = process.env.AIO_E2E_LANE || "deterministic-mock";
const describeDeterministic =
  runnerLane === "deterministic-mock" ? describe : describe.skip;

const AGENT_ID = "e2e-bg-parent";
const DISPATCH_TOOL_NAME = "sub-agent_ask";

async function navigateTo(path: string): Promise<void> {
  await browser.execute((targetPath) => {
    window.history.pushState({}, "", targetPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function waitForAppShell(): Promise<void> {
  await browser.waitUntil(
    async () =>
      await browser.execute(() => {
        const app = document.getElementById("app");
        return !!app && app.children.length > 0;
      }),
    { timeout: 90_000, timeoutMsg: "App shell did not mount" }
  );
}

interface MockRequest {
  type?: string;
  marker?: string | null;
  verdict?: string;
  status?: number;
}

async function readMockRequests(): Promise<MockRequest[]> {
  const baseUrl = process.env.AIO_E2E_MOCK_BASE_URL;
  if (!baseUrl) throw new Error("AIO_E2E_MOCK_BASE_URL was not provided");
  const response = await fetch(`${baseUrl}/__requests`);
  if (!response.ok) {
    throw new Error(`Mock request log returned ${response.status}`);
  }
  const body = (await response.json()) as { requests?: MockRequest[] };
  return body.requests ?? [];
}

async function decisionRequestsFor(marker: string): Promise<MockRequest[]> {
  const requests = await readMockRequests();
  return requests.filter(
    (request) => request.type === "systemone" && request.marker === marker
  );
}

async function selectAgentAndNewSession(): Promise<void> {
  await waitForAppShell();
  await navigateTo("/llm-chat");
  await $('[data-testid="chat-message-input"]').waitForDisplayed({
    timeout: 60_000,
  });

  const agentItem = await $(
    `[data-testid="chat-agent-item"][data-agent-id="${AGENT_ID}"]`
  );
  await agentItem.waitForDisplayed({ timeout: 30_000 });
  await agentItem.click();
  await $(
    `[data-testid="chat-agent-item"][data-agent-id="${AGENT_ID}"].selected`
  ).waitForDisplayed({ timeout: 20_000 });

  await $('[data-testid="chat-session-list-button"]').click();
  await $('[data-testid="chat-new-session"]').waitForClickable();
  await $('[data-testid="chat-new-session"]').click();
}

async function sendMarker(marker: string): Promise<void> {
  const editor = await $('[data-testid="chat-message-editor"]');
  const editable = await editor.$('[contenteditable="true"]');
  await editable.waitForDisplayed({ timeout: 20_000 });
  await editable.click();
  await editable.addValue(marker);
  await $('[data-testid="chat-send-message"]').click();
}

async function waitForToolCard(toolName: string) {
  const card = await $(
    `[data-testid="chat-tool-call"][data-tool-name="${toolName}"]`
  );
  await card.waitForDisplayed({ timeout: 60_000 });
  return card;
}

async function waitForToolStatus(
  card: Awaited<ReturnType<typeof waitForToolCard>>,
  statuses: string[]
): Promise<void> {
  await browser.waitUntil(
    async () =>
      statuses.includes((await card.getAttribute("data-tool-status")) ?? ""),
    {
      timeout: 60_000,
      timeoutMsg: `Tool card did not reach status: ${statuses.join(", ")}`,
    }
  );
}

async function waitForBodyText(text: string, timeout = 60_000): Promise<void> {
  await browser.waitUntil(
    async () =>
      await browser.execute((needle) => document.body.innerText.includes(needle), text),
    { timeout, timeoutMsg: `Body did not contain text: ${text}` }
  );
}

const approvalBar = () => $('[data-testid="tool-approval-bar"]');
const taskCenterCapsule = () => $('[data-testid="task-center-capsule"]');
const taskRow = () => $('[data-testid="background-task-row"]');
const taskDetailState = () => $('[data-testid="task-detail-state"]');

async function waitForTaskState(state: string, timeout = 60_000): Promise<void> {
  await browser.waitUntil(
    async () => (await taskDetailState().getAttribute("data-task-state")) === state,
    { timeout, timeoutMsg: `Task state did not become ${state}` }
  );
}

async function openTaskCenter(): Promise<void> {
  const capsule = await taskCenterCapsule();
  await capsule.waitForDisplayed({ timeout: 60_000 });
  await capsule.click();
  const row = await taskRow();
  await row.waitForDisplayed({ timeout: 30_000 });
  await row.click();
}

describeDeterministic("Background task approval", () => {
  it("escalates a sub-agent approval into the task center and resumes on approve", async () => {
    await selectAgentAndNewSession();
    await sendMarker("[e2e:bg:escalate]");

    const dispatchCard = await waitForToolCard(DISPATCH_TOOL_NAME);
    await waitForToolStatus(dispatchCard, ["success"]);

    // 子任务升级人工时，父会话审批条展示提醒（P4 父会话提醒）。
    const bar = await approvalBar();
    await bar.waitForDisplayed({ timeout: 60_000 });

    // 任务中心展示等待审批状态与逐项批准入口。
    await openTaskCenter();
    await waitForTaskState("awaiting_approval");
    await $('[data-testid="task-pending-approval"]').waitForDisplayed({
      timeout: 30_000,
    });

    await $('[data-testid="task-approval-approve"]').click();

    // 批准后子任务恢复执行，最终完成并写回审批审计记录。
    await waitForTaskState("completed", 90_000);
    await $('[data-testid="task-approval-record"]').waitForDisplayed({
      timeout: 30_000,
    });
    await waitForBodyText("后台任务已完成");

    const decisions = await decisionRequestsFor("escalate");
    if (decisions.length !== 1) {
      throw new Error(
        `Expected exactly one escalate decision request, got ${decisions.length}`
      );
    }
  });

  it("auto-approves a low-risk sub-agent call without opening approval UI", async () => {
    await selectAgentAndNewSession();
    await sendMarker("[e2e:bg:approve]");

    const dispatchCard = await waitForToolCard(DISPATCH_TOOL_NAME);
    await waitForToolStatus(dispatchCard, ["success"]);

    // JEV 自动放行：不出现审批条，子任务直接完成并回报父会话。
    await waitForBodyText("后台任务已完成");

    if (await approvalBar().isExisting()) {
      throw new Error("Auto-approved sub-agent request must not open the approval bar");
    }

    const decisions = await decisionRequestsFor("approve");
    if (decisions.length !== 1 || decisions[0].verdict !== "approve") {
      throw new Error("Expected exactly one approve decision request");
    }
  });
});
