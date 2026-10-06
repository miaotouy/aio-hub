import { $, browser } from "@wdio/globals";

const runnerLane = process.env.AIO_E2E_LANE || "deterministic-mock";
const describeDeterministic =
  runnerLane === "deterministic-mock" ? describe : describe.skip;

const AGENT_ID = "e2e-decision-agent";
const TOOL_NAME = "json-formatter_formatJson";
const FORCE_TOOL_NAME = "llm-chat-agent-mgmt_set_agent_field";

async function navigateTo(path: string): Promise<void> {
  await browser.execute((targetPath) => {
    window.history.pushState({}, "", targetPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

/** 等待应用外壳挂载，避免首个用例在冷启动期丢失早期导航。 */
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
  risk?: number;
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

const approvalBar = () => $('[data-testid="tool-approval-bar"]');
const auditBadge = () => $('[data-testid="tool-audit-badge"]');
const jevBadge = () => $('[data-testid="approval-jev-badge"]');

describeDeterministic("JEV decision arbitration", () => {
  it("auto-approves a low-risk gray-zone tool call (Jev 自动放行)", async () => {
    await selectAgentAndNewSession();
    await sendMarker("[e2e:jev:approve]");

    const card = await waitForToolCard(TOOL_NAME);
    await waitForToolStatus(card, ["success"]);

    const badge = await auditBadge();
    await badge.waitForDisplayed({ timeout: 30_000 });
    if ((await badge.getAttribute("data-audit-key")) !== "jev-approve") {
      throw new Error("Approve path did not render the Jev auto-approve badge");
    }
    const label = (await badge.getText()).trim();
    if (!label.includes("Jev 自动放行")) {
      throw new Error(`Unexpected approve badge label: ${label}`);
    }
    if (await approvalBar().isExisting()) {
      throw new Error("Auto-approved request must not open the approval bar");
    }

    const decisions = await decisionRequestsFor("approve");
    if (decisions.length !== 1 || decisions[0].verdict !== "approve") {
      throw new Error("Expected exactly one approve decision request");
    }
  });

  it("blocks a high-risk tool call (Jev 风险拦截)", async () => {
    await selectAgentAndNewSession();
    await sendMarker("[e2e:jev:deny]");

    const card = await waitForToolCard(TOOL_NAME);
    await waitForToolStatus(card, ["error"]);

    const badge = await auditBadge();
    await badge.waitForDisplayed({ timeout: 30_000 });
    if ((await badge.getAttribute("data-audit-key")) !== "jev-deny") {
      throw new Error("Deny path did not render the Jev risk-block badge");
    }
    if ((await badge.getText()).trim().indexOf("Jev 风险拦截") < 0) {
      throw new Error("Deny badge label is not the risk-block wording");
    }
    if (await approvalBar().isExisting()) {
      throw new Error("Denied request must not open the approval bar");
    }
  });

  it("escalates a contradictory decision to manual approval", async () => {
    await selectAgentAndNewSession();
    await sendMarker("[e2e:jev:contradiction]");

    await waitForToolCard(TOOL_NAME);
    const bar = await approvalBar();
    await bar.waitForDisplayed({ timeout: 60_000 });

    const badge = await jevBadge();
    await badge.waitForDisplayed({ timeout: 20_000 });
    if ((await badge.getAttribute("data-jev-action")) !== "escalate") {
      throw new Error("Escalated request badge is not an escalate action");
    }
    if ((await badge.getAttribute("data-jev-degraded")) === "true") {
      throw new Error("Contradiction escalate must not be a channel degrade");
    }
    const label = (await badge.getText()).trim();
    if (!label.includes("需人工确认")) {
      throw new Error(`Unexpected escalate badge label: ${label}`);
    }

    await bar.$('[data-testid="approval-allow"]').click();
    await bar.waitForDisplayed({ reverse: true, timeout: 30_000 });
    await waitForToolStatus(await waitForToolCard(TOOL_NAME), ["success"]);
  });

  it("skips arbitration for static danger features and asks for manual approval", async () => {
    await selectAgentAndNewSession();
    await sendMarker("[e2e:jev:danger]");

    await waitForToolCard(TOOL_NAME);
    const bar = await approvalBar();
    await bar.waitForDisplayed({ timeout: 60_000 });

    if (await jevBadge().isExisting()) {
      throw new Error("Danger skip must not attach a Jev arbitration badge");
    }
    if ((await decisionRequestsFor("danger")).length !== 0) {
      throw new Error(
        "Danger features must not consume the decision model channel"
      );
    }

    await bar.$('[data-testid="approval-reject"]').click();
    await bar.waitForDisplayed({ reverse: true, timeout: 30_000 });
  });

  it("fails closed to a degraded manual approval when the channel errors", async () => {
    await selectAgentAndNewSession();
    await sendMarker("[e2e:jev:fail]");

    await waitForToolCard(TOOL_NAME);
    const bar = await approvalBar();
    await bar.waitForDisplayed({ timeout: 60_000 });

    const badge = await jevBadge();
    await badge.waitForDisplayed({ timeout: 20_000 });
    if ((await badge.getAttribute("data-jev-degraded")) !== "true") {
      throw new Error("Channel error was not marked as a fail-closed degrade");
    }
    if (!(await badge.getText()).includes("Jev 离线")) {
      throw new Error(
        "Degraded badge label is not the offline fallback wording"
      );
    }

    await bar.$('[data-testid="approval-reject"]').click();
    await bar.waitForDisplayed({ reverse: true, timeout: 30_000 });
  });

  it("skips arbitration for gray-zone force-approval without touching the channel", async () => {
    await selectAgentAndNewSession();
    await sendMarker("[e2e:jev:force]");

    await waitForToolCard(FORCE_TOOL_NAME);
    const bar = await approvalBar();
    await bar.waitForDisplayed({ timeout: 60_000 });

    if (await jevBadge().isExisting()) {
      throw new Error(
        "Gray-zone force approval must not attach a Jev arbitration badge"
      );
    }
    if ((await decisionRequestsFor("force")).length !== 0) {
      throw new Error(
        "Gray-zone force approval must not consume the decision channel"
      );
    }

    await bar.$('[data-testid="approval-reject"]').click();
    await bar.waitForDisplayed({ reverse: true, timeout: 30_000 });
  });
});
