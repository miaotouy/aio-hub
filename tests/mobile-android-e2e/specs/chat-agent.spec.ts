import { switchToWebview } from "../support/appium";
import type { Element } from "webdriverio";
import {
  MOBILE_E2E_MODEL_ID,
  MOBILE_E2E_MODEL_PREFIX,
  MOBILE_E2E_RICH_TEXT_MODEL_ID,
} from "../support/openai-conformance";
import { E2E_AGENT_GREETING_MARKER } from "../support/fixtures";
import { clickTestElement, testElement } from "../support/webview";
import {
  configureOpenAiProfile,
  ensureUserProfile,
  setInput,
} from "./chat-attachment.spec";
import {
  agentRowSelector,
  ensureAgentImported,
  findAgentIdByName,
  openAgentList,
} from "./agent-import.spec";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";

/**
 * Point the Agent at the deterministic rich-text model and write generation
 * parameters through the formal Agent detail UI so the chat request carries an
 * intentionally non-attachment mode plus observable parameters.
 */
async function configureAgentForChat(
  context: ScenarioContext,
  agentId: string
): Promise<void> {
  await switchToWebview(context.driver);
  await context.driver.execute((id) => {
    window.location.hash = `#/tools/agent-manager/${encodeURIComponent(id)}`;
  }, agentId);
  await testElement(context.driver, "agent-detail");
  const modelSelect = await testElement(context.driver, "agent-model");
  await context.driver.waitUntil(
    async () =>
      await (
        await modelSelect.$(
          `option[value="${MOBILE_E2E_RICH_TEXT_MODEL_ID}"]`
        )
      ).isExisting(),
    {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: "The deterministic rich-text model was not selectable.",
    }
  );
  await modelSelect.selectByAttribute("value", MOBILE_E2E_RICH_TEXT_MODEL_ID);
  await setInput(context, "agent-parameter-temperature", "0.35");
  await setInput(context, "agent-parameter-maxTokens", "2048");
  await clickTestElement(context.driver, "agent-save");
  await openAgentList(context);
}

async function countAgentRows(context: ScenarioContext): Promise<number> {
  const count = await context.driver.execute(() =>
    document.querySelectorAll('[data-testid="agent-row"]').length
  );
  return Number(count);
}

async function ensurePeerAgent(context: ScenarioContext): Promise<void> {
  await openAgentList(context);
  if ((await countAgentRows(context)) >= 2) return;
  await clickTestElement(context.driver, "agent-create");
  await testElement(context.driver, "agent-detail");
  await clickTestElement(context.driver, "agent-save");
  await openAgentList(context);
}

async function readSessionId(context: ScenarioContext): Promise<string> {
  const sessionId = await context.driver.execute(() => {
    const match = window.location.hash.match(/\/chat\/([^?]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  });
  if (typeof sessionId !== "string" || !sessionId) {
    throw new Error("Could not determine the active chat session ID.");
  }
  return sessionId;
}

export async function runChatAgentScenario(context: ScenarioContext) {
  if (!context.deterministicBaseUrl || !context.deterministicRequests) {
    throw new Error("Chat agent requires the deterministic server.");
  }
  const handle = await ensureAgentImported(context);
  await configureOpenAiProfile(context, {
    name: "Android E2E Mock",
    baseUrl: context.deterministicBaseUrl,
    modelId: MOBILE_E2E_MODEL_ID,
    searchTerm: MOBILE_E2E_MODEL_PREFIX,
  });
  await ensureUserProfile(context);
  await configureAgentForChat(context, handle.id);
  await ensurePeerAgent(context);

  await openAgentList(context);
  if (!(await findAgentIdByName(context, handle.name))) {
    throw new Error("Target agent row is missing before chat.");
  }
  const row = await context.driver.$(agentRowSelector(handle.id));
  const startChat = await row.$('[data-testid="agent-start-chat"]');
  await startChat.waitForClickable({ timeout: 15_000 });
  await startChat.click();
  await testElement(context.driver, "chat-view", 30_000);

  const toggle = await testElement(context.driver, "chat-agent-selector-toggle");
  if (!(await toggle.getText()).includes(handle.displayName)) {
    throw new Error("Chat session is not bound to the selected agent.");
  }

  const greeting = await context.driver.$(
    '[data-testid="chat-message"][data-message-role="assistant"]'
  );
  await greeting.waitForDisplayed({ timeout: 20_000 });
  const greetingText = await greeting.getText();
  if (!greetingText.includes(E2E_AGENT_GREETING_MARKER)) {
    throw new Error("The card first message was not rendered as the opener.");
  }

  await setInput(context, "chat-message-input", "Android E2E agent chat probe.");
  await clickTestElement(context.driver, "chat-send");
  const completedAssistantSelector =
    '[data-testid="chat-message"][data-message-role="assistant"][data-message-status="complete"]';
  await context.driver.waitUntil(
    async () =>
      Number(
        await context.driver.execute(
          (selector) => document.querySelectorAll(selector).length,
          completedAssistantSelector
        )
      ) >= 2,
    {
      timeout: 90_000,
      interval: 250,
      timeoutMsg: "The agent chat reply did not complete.",
    }
  );

  const request = context.deterministicRequests.find(
    (summary) => summary.hasAgentMarker === true
  );
  if (!request) {
    throw new Error("Mock did not observe the imported agent persona marker.");
  }
  if (request.hasUnrenderedAgentMacro !== false) {
    throw new Error("Request pipeline did not expand the agent greeting macros.");
  }
  const generationParameters = request.generationParameters as
    | Record<string, unknown>
    | undefined;
  if (
    generationParameters?.temperature !== 0.35 ||
    generationParameters.maxTokens !== 2048
  ) {
    throw new Error("Mock did not receive the saved Agent parameters.");
  }
  if (request.sseEventCount !== 6) {
    throw new Error("Agent chat reply did not complete the deterministic SSE stream.");
  }

  const sessionId = await readSessionId(context);
  const greetingBeforeSwitch = await greeting.getText();

  await clickTestElement(context.driver, "chat-agent-selector-toggle");
  await testElement(context.driver, "chat-agent-selector");
  const items = await context.driver.$$(
    '[data-testid="chat-agent-selector-item"]'
  );
  let peerItem: Element | null = null;
  for (const item of items) {
    const agentId = await item.getAttribute("data-agent-id");
    if (agentId && agentId !== handle.id) {
      peerItem = item;
      break;
    }
  }
  if (!peerItem) {
    throw new Error("No peer agent was available to switch the chat to.");
  }
  await peerItem.click();
  await context.driver.waitUntil(
    async () => {
      const label = await context.driver.$(
        '[data-testid="chat-agent-selector-toggle"]'
      );
      return !(await label.getText()).includes(handle.displayName);
    },
    {
      timeout: 15_000,
      timeoutMsg: "Switching agents did not update the active agent label.",
    }
  );
  const greetingAfterSwitch = await (
    await context.driver.$(
      '[data-testid="chat-message"][data-message-role="assistant"]'
    )
  ).getText();
  if (greetingAfterSwitch !== greetingBeforeSwitch) {
    throw new Error("Switching agents rewrote the existing greeting history.");
  }

  await context.driver.switchContext("NATIVE_APP");
  await context.driver.terminateApp(APP_PACKAGE);
  await context.driver.activateApp(APP_PACKAGE);
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/sessions";
  });
  await testElement(context.driver, "chat-session-list", 30_000);
  const sessionRow = await context.driver.$(
    `[data-testid="chat-session-row"][data-session-id="${sessionId}"]`
  );
  await sessionRow.waitForDisplayed({ timeout: 30_000 });
  await sessionRow.click();
  await testElement(context.driver, "chat-view", 30_000);
  const recoveredMessageCount = Number(
    await context.driver.execute(
      () => document.querySelectorAll('[data-testid="chat-message"]').length
    )
  );
  if (recoveredMessageCount < 3) {
    throw new Error("Chat session messages did not recover after restart.");
  }

  return {
    agentId: handle.id,
    sessionId,
    markerObserved: true,
    macroRendered: true,
    agentSwitchPersisted: true,
    restartRecovered: true,
  };
}
