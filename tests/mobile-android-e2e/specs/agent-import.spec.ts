import { switchToNative, switchToWebview } from "../support/appium";
import { chooseDocumentsUiFile } from "../support/android-selectors";
import {
  MOBILE_E2E_MODEL_ID,
  MOBILE_E2E_MODEL_PREFIX,
} from "../support/openai-conformance";
import {
  E2E_AGENT_CHARACTER_NAME,
  E2E_AGENT_CREATOR_NOTES,
} from "../support/fixtures";
import {
  clickTestElement,
  readTestElementValue,
  testElement,
} from "../support/webview";
import { configureOpenAiProfile } from "./chat-attachment.spec";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";
const E2E_AGENT_PROFILE_NAME = "Android E2E Mock";

export interface AgentHandle {
  id: string;
  name: string;
  displayName: string;
}

/** Ensure the deterministic OpenAI profile exists before any agent import. */
export async function ensureMockProfile(context: ScenarioContext): Promise<void> {
  if (!context.deterministicBaseUrl) {
    throw new Error("The agent preset requires the deterministic server.");
  }
  await configureOpenAiProfile(context, {
    name: E2E_AGENT_PROFILE_NAME,
    baseUrl: context.deterministicBaseUrl,
    modelId: MOBILE_E2E_MODEL_ID,
    searchTerm: MOBILE_E2E_MODEL_PREFIX,
  });
  await switchToWebview(context.driver);
}

export async function openAgentList(context: ScenarioContext): Promise<void> {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/agent-manager/list";
  });
  await testElement(context.driver, "agent-list");
}

export function agentRowSelector(agentId: string) {
  return `[data-testid="agent-row"][data-agent-id="${agentId.replaceAll('"', '\\"')}"]`;
}

/** Find an agent row by displayed text and return its stable agent ID. */
export async function findAgentIdByName(
  context: ScenarioContext,
  name: string
): Promise<string | null> {
  const rows = await context.driver.$$('[data-testid="agent-row"]');
  for (const row of rows) {
    const text = await row.getText().catch(() => "");
    if (!text.includes(name)) continue;
    const id = await row.getAttribute("data-agent-id");
    if (id) return id;
  }
  return null;
}

async function waitForAgentId(
  context: ScenarioContext,
  name: string
): Promise<string> {
  await context.driver.waitUntil(
    async () => Boolean(await findAgentIdByName(context, name)),
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: `Agent row did not appear for ${name}.`,
    }
  );
  const id = await findAgentIdByName(context, name);
  if (!id) throw new Error(`Agent row is missing for ${name}.`);
  return id;
}

/**
 * Import the SillyTavern PNG character card through the formal DocumentsUI
 * path. Reuses an already imported agent so later scenarios stay idempotent.
 */
export async function ensureAgentImported(
  context: ScenarioContext
): Promise<AgentHandle> {
  await ensureMockProfile(context);
  await openAgentList(context);
  const name = E2E_AGENT_CHARACTER_NAME;
  let id = await findAgentIdByName(context, name);
  if (!id) {
    await clickTestElement(context.driver, "agent-import-button");
    await switchToNative(context.driver);
    await chooseDocumentsUiFile(
      context.driver,
      context.fixtures.agentCard.fileName,
      APP_PACKAGE
    );
    await switchToWebview(context.driver);
    id = await waitForAgentId(context, name);
  }
  return { id, name, displayName: name };
}

export async function runAgentImportScenario(context: ScenarioContext) {
  const handle = await ensureAgentImported(context);
  await openAgentList(context);
  await waitForAgentId(context, handle.name);
  let row = await context.driver.$(agentRowSelector(handle.id));

  const avatar = await row.$(".agent-avatar img");
  await avatar.waitForDisplayed({ timeout: 20_000 });
  const avatarSrc = await avatar.getAttribute("src");
  if (!avatarSrc?.startsWith("data:image/png")) {
    throw new Error("Imported agent avatar is not the character-card preview.");
  }

  await (await row.$('[data-testid="agent-edit"]')).click();
  await testElement(context.driver, "agent-detail");
  const displayName = await readTestElementValue(
    context.driver,
    "agent-display-name"
  );
  if (displayName !== E2E_AGENT_CHARACTER_NAME) {
    throw new Error("Imported agent display name did not come from the card.");
  }
  const innerName = await readTestElementValue(context.driver, "agent-name");
  if (innerName !== E2E_AGENT_CHARACTER_NAME) {
    throw new Error("Imported agent internal name did not come from the card.");
  }
  const description = await readTestElementValue(
    context.driver,
    "agent-description"
  );
  if (description !== E2E_AGENT_CREATOR_NOTES) {
    throw new Error("Imported agent description did not come from the card.");
  }

  await context.driver.switchContext("NATIVE_APP");
  await context.driver.terminateApp(APP_PACKAGE);
  await context.driver.activateApp(APP_PACKAGE);
  await switchToWebview(context.driver);
  await openAgentList(context);
  await waitForAgentId(context, handle.name);
  row = await context.driver.$(agentRowSelector(handle.id));
  await (await row.$('[data-testid="agent-edit"]')).click();
  await testElement(context.driver, "agent-detail");
  const recoveredName = await readTestElementValue(
    context.driver,
    "agent-display-name"
  );
  if (recoveredName !== E2E_AGENT_CHARACTER_NAME) {
    throw new Error("Imported agent did not persist after the app restart.");
  }

  return {
    agentId: handle.id,
    name: handle.name,
    avatarVisible: true,
    fieldsPersisted: true,
  };
}
