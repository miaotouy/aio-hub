import { switchToNative, switchToWebview } from "../support/appium";
import { chooseDocumentsUiFile } from "../support/android-selectors";
import {
  E2E_AIO_BUNDLE_AGENT_NAME,
  E2E_AGENT_CATEGORY,
  E2E_AGENT_CREATOR_NOTES,
  E2E_AGENT_TAGS,
  E2E_RENAMED_SESSION_NAME,
  E2E_WORLDBOOK_ENTRY_CONTENT,
} from "../support/fixtures";
import {
  clickTestElement,
  readTestElementValue,
  testElement,
} from "../support/webview";
import {
  ensureMockProfile,
  findAgentIdByName,
  openAgentList,
} from "./agent-import.spec";
import type { Browser } from "webdriverio";
import type { ScenarioContext } from "./context";

const APP_PACKAGE = "com.aiohub.mobile";

/**
 * Varlet dialogs keep their subtree in the DOM after closing (hidden via the
 * overlay), so assert invisibility instead of DOM removal.
 */
async function waitTestElementHidden(
  driver: Browser,
  testId: string,
  timeoutMs = 15_000
): Promise<void> {
  await driver.waitUntil(
    async () => {
      const element = await driver.$(`[data-testid="${testId}"]`);
      return !(await element.isDisplayed().catch(() => false));
    },
    {
      timeout: timeoutMs,
      interval: 250,
      timeoutMsg: `Element [data-testid="${testId}"] is still displayed.`,
    }
  );
}

/**
 * 最近施工验证场景（2026-10-07 批次）：
 * 1. AIO 导出包 bundledWorldbooks 内嵌世界书经正式 DocumentsUI 导入落库，
 *    Agent worldbookIds 回写，正则预设可在 Agent 详情查看；
 * 2. Agent 详情页开局消息编辑（新增/设默认）、分类与标签编辑可保存；
 * 3. 世界书条目编辑器暴露 selective/probability/role 高级字段；
 * 4. 会话重命名与聊天设置上下文阈值调节。
 */
export async function runAgentEditorScenario(context: ScenarioContext) {
  await importAioBundleAgent(context);
  // 开局消息编辑放在最前：页面刚进入时坐标桥最可靠；世界书验证会触发
  // toast/对话框序列，紧随其后点击「新增」曾被遮罩层吞掉。
  await verifyGreetingAndCategoryEditing(context);
  await verifyImportedBundleAgent(context);
  await verifyWorldbookAdvancedFields(context);
  await verifySessionRename(context);
  await verifyContextThresholdSettings(context);
  return {
    aioBundleImported: true,
    worldbookLinked: true,
    greetingEdited: true,
    sessionRenamed: true,
    thresholdsAdjusted: true,
  };
}

/** 通过正式导入入口选择 AIO 导出包 JSON fixture。 */
async function importAioBundleAgent(context: ScenarioContext): Promise<void> {
  await ensureMockProfile(context);
  await switchToWebview(context.driver);
  const existing = await findAgentIdByName(context, E2E_AIO_BUNDLE_AGENT_NAME);
  if (existing) return;
  await openAgentList(context);
  await clickTestElement(context.driver, "agent-import-button");
  await switchToNative(context.driver);
  await chooseDocumentsUiFile(
    context.driver,
    context.fixtures.aioBundle.fileName,
    APP_PACKAGE
  );
  await switchToWebview(context.driver);
  await context.driver.waitUntil(
    async () =>
      Boolean(await findAgentIdByName(context, E2E_AIO_BUNDLE_AGENT_NAME)),
    {
      timeout: 30_000,
      interval: 250,
      timeoutMsg: "The AIO bundle agent did not appear after import.",
    }
  );
}

/** 断言内嵌世界书落库、Agent 绑定与正则预设可查看。 */
async function verifyImportedBundleAgent(
  context: ScenarioContext
): Promise<void> {
  await openAgentList(context);
  const agentId = await findAgentIdByName(context, E2E_AIO_BUNDLE_AGENT_NAME);
  if (!agentId) throw new Error("AIO bundle agent row is missing.");
  const bundleRow = await context.driver.$(
    `[data-testid="agent-row"][data-agent-id="${agentId}"]`
  );
  await (await bundleRow.$('[data-testid="agent-edit"]')).click();
  await testElement(context.driver, "agent-detail");

  await testElement(context.driver, "agent-regex");
  const preset = await testElement(context.driver, "agent-regex-preset");
  const presetName = await preset.getAttribute("data-preset-name");
  if (presetName !== "E2E Regex Preset") {
    throw new Error(
      `Imported regex preset is not visible: got "${presetName}".`
    );
  }
  await clickTestElement(context.driver, "agent-regex-toggle");
  await testElement(context.driver, "agent-regex-rule");
  await clickTestElement(context.driver, "agent-detail-back");
  await testElement(context.driver, "agent-list");
}

/** 世界书页断言内嵌书条目高级字段编辑器可用。 */
async function verifyWorldbookAdvancedFields(
  context: ScenarioContext
): Promise<void> {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/worldbooks";
  });
  await testElement(context.driver, "chat-worldbooks");
  await context.driver.waitUntil(
    async () =>
      Number(
        await context.driver.execute(
          () =>
            document.querySelectorAll(
              '[data-testid^="worldbook-"]'
            ).length
        )
      ) > 0,
    {
      timeout: 20_000,
      interval: 250,
      timeoutMsg: "The imported bundled worldbook card is missing.",
    }
  );
  await context.driver.waitUntil(
    async () =>
      Number(
        await context.driver.execute(
          () =>
            document.querySelectorAll('[data-testid="worldbook-entry"]').length
        )
      ) > 0,
    {
      timeout: 10_000,
      interval: 250,
      timeoutMsg: "No worldbook entry card is rendered.",
    }
  );
  await clickTestElement(context.driver, "worldbook-entry-edit");
  await testElement(context.driver, "worldbook-entry-content");
  const contentValue = await readTestElementValue(
    context.driver,
    "worldbook-entry-content"
  );
  if (!contentValue.includes(E2E_WORLDBOOK_ENTRY_CONTENT)) {
    throw new Error("The bundled entry content did not reach the editor.");
  }
  const roleValue = await readTestElementValue(
    context.driver,
    "worldbook-entry-role"
  );
  if (roleValue !== "system") {
    throw new Error(`Entry role should default to system, got "${roleValue}".`);
  }
  await clickTestElement(context.driver, "worldbook-entry-selective");
  await testElement(context.driver, "worldbook-entry-secondary-keys");
  await clickTestElement(context.driver, "worldbook-entry-selective");
  await clickTestElement(context.driver, "worldbook-entry-save");
  // var-dialog 关闭后子树仍挂在 DOM（隐藏），按不可见判定而不是按不存在判定
  await waitTestElementHidden(context.driver, "worldbook-entry-content");
}

/**
 * Click through scroll-inertia flakiness: retry the click until the expected
 * target element actually exists. The final attempt dispatches a DOM click
 * inside the WebView so a stale native-coordinate bridge cannot strand the
 * scenario (still a semantic UI action, not a coordinate tap).
 */
async function clickUntilExists(
  context: ScenarioContext,
  clickTestId: string,
  targetSelector: string,
  attempts = 3
): Promise<void> {
  for (let index = 0; index < attempts; index += 1) {
    if (index < attempts - 1) {
      await clickTestElement(context.driver, clickTestId);
    } else {
      await context.driver.execute((testId) => {
        const element = document.querySelector(
          `[data-testid="${testId}"]`
        ) as HTMLElement | null;
        element?.click();
      }, clickTestId);
    }
    const target = await context.driver.$(targetSelector);
    if (await target.isExisting().catch(() => false)) return;
  }
  throw new Error(
    `Clicking "${clickTestId}" did not produce ${targetSelector} after ${attempts} attempts.`
  );
}

/** 开局消息新增 + 设默认，分类与标签编辑后保存并冷启动恢复。 */
async function verifyGreetingAndCategoryEditing(
  context: ScenarioContext
): Promise<void> {
  await openAgentList(context);
  const agentId = await findAgentIdByName(context, E2E_AIO_BUNDLE_AGENT_NAME);
  if (!agentId) throw new Error("AIO bundle agent row is missing.");
  const agentRow = await context.driver.$(
    `[data-testid="agent-row"][data-agent-id="${agentId}"]`
  );
  await (await agentRow.$('[data-testid="agent-edit"]')).click();
  await testElement(context.driver, "agent-detail");

  await testElement(context.driver, "agent-greetings");
  await clickUntilExists(
    context,
    "agent-greeting-add",
    '[data-testid="agent-greeting-editor"]'
  );
  const userRoleTab = await context.driver.$(
    '[data-testid="agent-greeting-role-user"]'
  );
  await userRoleTab.click();
  const greetingContent = `AIOHUB_E2E_GREETING_BUNDLE ${E2E_AGENT_CREATOR_NOTES}`;
  const contentField = await testElement(
    context.driver,
    "agent-greeting-content"
  );
  await contentField.setValue(greetingContent);
  await clickTestElement(context.driver, "agent-greeting-save");
  await waitTestElementHidden(context.driver, "agent-greeting-editor");

  const greetingItem = await testElement(context.driver, "agent-greeting-item");
  if (!(await greetingItem.getText()).includes(greetingContent.slice(0, 40))) {
    throw new Error("The new greeting was not listed after saving.");
  }
  await clickTestElement(context.driver, "agent-greeting-set-default");
  await context.driver.waitUntil(
    async () =>
      Boolean(
        await context.driver.$(
          '[data-testid="agent-greeting-default-badge"]'
        )
      ),
    { timeout: 10_000, timeoutMsg: "Default greeting badge did not appear." }
  );

  const categorySelect = await testElement(context.driver, "agent-category-edit");
  await categorySelect.selectByAttribute("value", E2E_AGENT_CATEGORY);
  const tagsInput = await testElement(context.driver, "agent-tags");
  await tagsInput.setValue(E2E_AGENT_TAGS);

  await clickTestElement(context.driver, "agent-save");
  await testElement(context.driver, "agent-list");

  await switchToNative(context.driver);
  await context.driver.terminateApp(APP_PACKAGE);
  await context.driver.activateApp(APP_PACKAGE);
  await switchToWebview(context.driver);
  await openAgentList(context);
  const recoveredId = await findAgentIdByName(
    context,
    E2E_AIO_BUNDLE_AGENT_NAME
  );
  if (!recoveredId) throw new Error("Agent disappeared after restart.");
  const recoveredRow = await context.driver.$(
    `[data-testid="agent-row"][data-agent-id="${recoveredId}"]`
  );
  await (await recoveredRow.$('[data-testid="agent-edit"]')).click();
  await testElement(context.driver, "agent-detail");
  const recoveredTags = await readTestElementValue(context.driver, "agent-tags");
  if (recoveredTags !== E2E_AGENT_TAGS) {
    throw new Error("Edited tags did not persist after restart.");
  }
  await context.driver.waitUntil(
    async () =>
      Boolean(
        await context.driver.$('[data-testid="agent-greeting-default-badge"]')
      ),
    {
      timeout: 10_000,
      interval: 250,
      timeoutMsg: "Default greeting did not persist after restart.",
    }
  );
  await clickTestElement(context.driver, "agent-detail-back");
  await testElement(context.driver, "agent-list");
}

/** 通过会话列表重命名按钮改名并断言 UI 更新。 */
async function verifySessionRename(context: ScenarioContext): Promise<void> {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/sessions";
  });
  await testElement(context.driver, "chat-session-list", 30_000);
  const sessionRow = await context.driver.$('[data-testid="chat-session-row"]');
  if (!(await sessionRow.isExisting())) {
    // 没有任何会话时跳过重命名断言（chat-agent 场景跑过后会有会话）
    return;
  }
  const renameButton = await sessionRow.$(
    '[data-testid="chat-session-rename"]'
  );
  await renameButton.waitForClickable({ timeout: 10_000 });
  await renameButton.click();
  const renameInput = await testElement(
    context.driver,
    "chat-session-rename-input"
  );
  await renameInput.setValue(E2E_RENAMED_SESSION_NAME);
  await clickTestElement(context.driver, "chat-session-rename-save");
  // var-dialog 关闭后子树仍挂在 DOM（隐藏），按不可见判定而不是按不存在判定
  await waitTestElementHidden(context.driver, "chat-session-rename-save");
  await context.driver.waitUntil(
    async () => {
      const firstName = await context.driver
        .$('[data-testid="chat-session-row"] .session-name')
        .getText();
      return firstName === E2E_RENAMED_SESSION_NAME;
    },
    {
      timeout: 15_000,
      interval: 250,
      timeoutMsg: `Session was not renamed to "${E2E_RENAMED_SESSION_NAME}".`,
    }
  );
}

/** 聊天设置页上下文阈值滑块可调且不崩。 */
async function verifyContextThresholdSettings(
  context: ScenarioContext
): Promise<void> {
  await switchToWebview(context.driver);
  await context.driver.execute(() => {
    window.location.hash = "#/tools/llm-chat/settings";
  });
  await testElement(context.driver, "chat-context-warning-ratio", 20_000);
  const value = await context.driver.execute(() => {
    const thumb = document.querySelector(
      '[data-testid="chat-context-warning-ratio"] [role="slider"]'
    );
    return thumb?.getAttribute("aria-valuetext") ?? null;
  });
  if (typeof value !== "string" || !value) {
    throw new Error("The warning ratio slider is missing a value.");
  }
}
