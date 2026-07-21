import { $, browser } from "@wdio/globals";

let e2eAgentId: string | undefined;
const runnerLane = process.env.AIO_E2E_LANE || "deterministic-mock";
const describeDeterministic =
  runnerLane === "deterministic-mock" ? describe : describe.skip;

async function navigateTo(path: string): Promise<void> {
  await browser.execute((targetPath) => {
    window.history.pushState({}, "", targetPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

describeDeterministic("Knowledge cross-tool smoke", () => {
  it("creates an isolated library through the real Tauri UI", async () => {
    await navigateTo("/knowledge-base");

    const workspace = await $('[data-testid="knowledge-workspace"]');
    await workspace.waitForDisplayed({ timeout: 30_000 });

    const existingLibrary = await $('[data-testid="knowledge-library-row"]');
    if (!(await existingLibrary.isExisting())) {
      const createButton = await $(
        '[data-testid="knowledge-create-library-empty"]'
      );
      await createButton.waitForClickable();
      await createButton.click();

      const nameInput = await $(
        '[data-testid="knowledge-library-name"] input, input[data-testid="knowledge-library-name"]'
      );
      await nameInput.waitForDisplayed();
      await nameInput.setValue("E2E Knowledge Library");
      await $('[data-testid="knowledge-create-library-submit"]').click();
      await $(".base-dialog-backdrop").waitForDisplayed({
        reverse: true,
        timeout: 10_000,
      });
    }

    const libraryRow = await $('[data-testid="knowledge-library-row"]');
    await libraryRow.waitForDisplayed({ timeout: 20_000 });
    const libraryId = await libraryRow.getAttribute("data-library-id");
    if (!libraryId)
      throw new Error("Knowledge library did not expose a stable ID");
  });

  it("persists Agent Knowledge access through the real editor", async () => {
    await navigateTo("/knowledge-base");
    const libraryRow = await $('[data-testid="knowledge-library-row"]');
    await libraryRow.waitForDisplayed({ timeout: 30_000 });
    const libraryId = await libraryRow.getAttribute("data-library-id");
    if (!libraryId)
      throw new Error("Knowledge library ID is required for Agent access");

    await navigateTo("/agent-manager");
    await $('[data-testid="agent-manager"]').waitForDisplayed({
      timeout: 30_000,
    });
    await $('[data-testid="agent-manager-create"]').click();
    await $('[data-testid="agent-editor"]').waitForDisplayed();

    const nameInput = await $(
      '[data-testid="agent-name-input"] input, input[data-testid="agent-name-input"]'
    );
    await nameInput.setValue("E2E Knowledge Agent");

    await $('[data-tab-id="personality"]').click();
    const modelSelector = await $('[data-testid="agent-model-selector"]');
    await modelSelector.waitForDisplayed();
    const selectTrigger = await modelSelector.$(".el-select__wrapper");
    await selectTrigger.waitForClickable();
    await selectTrigger.click();
    const chatModel = await $(
      '.agent-model-selector-popper [data-testid="llm-model-option"]' +
        '[data-model-combo="e2e-openai-mock:e2e-chat"]'
    );
    await chatModel.waitForClickable();
    await chatModel.click();
    await chatModel.waitForDisplayed({ reverse: true, timeout: 10_000 });

    await $('[data-tab-id="knowledge"]').click();

    const enabled = await $('[data-testid="agent-knowledge-enabled"]');
    await enabled.click();
    await $('[data-testid="agent-knowledge-add-library"]').waitForClickable();
    await $('[data-testid="agent-knowledge-add-library"]').click();
    const option = await $(
      `[data-testid="agent-knowledge-library-option"][data-library-id="${libraryId}"]`
    );
    await option.waitForClickable();
    await option.click();
    await option.waitForDisplayed({ reverse: true, timeout: 10_000 });

    await $('[data-testid="agent-knowledge-search-all"]').click();
    await $('[data-testid="agent-knowledge-document-read"]').click();
    await $('[data-testid="agent-knowledge-research"]').click();
    const editor = await $('[data-testid="agent-editor"]');
    await $('[data-testid="agent-editor-save"]').click();
    await editor.waitForDisplayed({ reverse: true, timeout: 20_000 });

    const managerSearch = await $(
      '[data-testid="agent-manager-search"] input, input[data-testid="agent-manager-search"]'
    );
    await managerSearch.waitForDisplayed({ timeout: 20_000 });
    await managerSearch.setValue("E2E Knowledge Agent");
    const agentCard = await $('[data-testid="agent-manager-card"]');
    await agentCard.waitForDisplayed();
    const agentId = await agentCard.getAttribute("data-agent-id");
    if (!agentId) throw new Error("Created Agent did not expose a stable ID");
    e2eAgentId = agentId;

    await agentCard.$('[data-testid="agent-manager-edit"]').click();
    await $('[data-testid="agent-editor"]').waitForDisplayed();
    await $('[data-tab-id="knowledge"]').click();

    for (const selector of [
      '[data-testid="agent-knowledge-enabled"]',
      '[data-testid="agent-knowledge-search-all"]',
      '[data-testid="agent-knowledge-document-read"]',
      '[data-testid="agent-knowledge-research"]',
    ]) {
      const control = await $(selector);
      const checkbox = await control.$('input[type="checkbox"]');
      if (!(await checkbox.isSelected())) {
        throw new Error(
          `Agent Knowledge switch was not persisted: ${selector}`
        );
      }
    }
    await $(
      `[data-testid="agent-knowledge-authorized-library"][data-library-id="${libraryId}"]`
    ).waitForDisplayed();

    await $('[data-testid="agent-editor-cancel"]').click();
    await editor.waitForDisplayed({ reverse: true, timeout: 20_000 });
  });

  it("executes an explicit Knowledge search with a visible tool event", async () => {
    await navigateTo("/knowledge-base");
    const libraryRow = await $('[data-testid="knowledge-library-row"]');
    await libraryRow.waitForDisplayed({ timeout: 30_000 });
    const libraryId = await libraryRow.getAttribute("data-library-id");
    if (!libraryId) {
      throw new Error("Knowledge library ID is required for Chat reference");
    }

    await navigateTo("/agent-manager");
    await $('[data-testid="agent-manager"]').waitForDisplayed({
      timeout: 30_000,
    });

    await navigateTo("/llm-chat");
    await $('[data-testid="chat-message-input"]').waitForDisplayed({
      timeout: 30_000,
    });
    if (!e2eAgentId) throw new Error("Agent ID is required for Chat reference");
    const agentItem = await $(
      `[data-testid="chat-agent-item"][data-agent-id="${e2eAgentId}"]`
    );
    await agentItem.waitForDisplayed({ timeout: 30_000 });
    await agentItem.click();
    await $(
      `[data-testid="chat-agent-item"][data-agent-id="${e2eAgentId}"].selected`
    ).waitForDisplayed({ timeout: 20_000 });
    await $('[data-testid="chat-session-list-button"]').click();
    await $('[data-testid="chat-new-session"]').waitForClickable();
    await $('[data-testid="chat-new-session"]').click();
    const referenceButton = await $(
      '[data-testid="chat-knowledge-reference-button"]'
    );
    await browser.waitUntil(
      async () => (await referenceButton.getAttribute("disabled")) === null,
      {
        timeout: 30_000,
        timeoutMsg:
          "Knowledge reference remained disabled after selecting Agent",
      }
    );
    await referenceButton.click();

    const selector = await $(
      '[data-testid="chat-knowledge-reference-selector"]'
    );
    await selector.waitForDisplayed();
    const libraryOption = await $(
      `[data-testid="chat-knowledge-library-option"][data-library-id="${libraryId}"]`
    );
    await libraryOption.waitForClickable();
    await libraryOption.click();
    await $('[data-testid="chat-knowledge-reference-chip"]').waitForDisplayed();

    const editor = await $('[data-testid="chat-message-editor"]');
    const editable = await editor.$('[contenteditable="true"]');
    await editable.waitForDisplayed();
    await editable.click();
    await editable.addValue("E2E explicit Knowledge query");
    await $('[data-testid="chat-send-message"]').click();

    const toolCall = await $(
      '[data-testid="chat-tool-call"][data-tool-name="knowledge.search"]'
    );
    await toolCall.waitForDisplayed({ timeout: 60_000 });
    await browser.waitUntil(
      async () =>
        (await toolCall.getAttribute("data-tool-status")) === "success",
      {
        timeout: 60_000,
        timeoutMsg: "Knowledge search tool event did not complete",
      }
    );
  });

  it("starts with the deterministic local model mock available", async () => {
    await navigateTo("/settings?section=llm-service");
    await $('[data-testid="llm-service-settings"]').waitForDisplayed({
      timeout: 30_000,
    });
    const profile = await $('[data-profile-id="e2e-openai-mock"]');
    await profile.waitForDisplayed();
    if (!(await profile.getText()).includes("E2E Local Mock")) {
      throw new Error(
        "The isolated model profile was not loaded by the application"
      );
    }

    const mockBaseUrl = process.env.AIO_E2E_MOCK_BASE_URL;
    if (!mockBaseUrl) throw new Error("AIO_E2E_MOCK_BASE_URL was not provided");

    const response = await fetch(`${mockBaseUrl}/v1/models`);
    if (!response.ok)
      throw new Error(`Local model mock returned ${response.status}`);
    const body = (await response.json()) as { data?: Array<{ id?: string }> };
    const ids = new Set(body.data?.map((model) => model.id));
    if (!ids.has("e2e-chat") || !ids.has("e2e-embedding")) {
      throw new Error("Local model mock did not expose both E2E models");
    }
  });
});
