import { $, browser } from "@wdio/globals";
import { selectNativeFiles, selectNativeFolder } from "../support/native-ui";

type NativePidResult =
  | { status: "pending" }
  | { status: "resolved"; processId: number }
  | { status: "failed"; error: string };

interface NativePidWindow extends Window {
  __AIO_E2E_PID_RESULT__?: NativePidResult;
  __TAURI_INTERNALS__?: {
    invoke<T>(command: string, args: Record<string, never>): Promise<T>;
  };
}

async function navigateTo(path: string): Promise<void> {
  await browser.execute((targetPath) => {
    window.history.pushState({}, "", targetPath);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

async function ensureLibrary(): Promise<void> {
  await navigateTo("/knowledge-base");
  await $('[data-testid="knowledge-workspace"]').waitForDisplayed({
    timeout: 30_000,
  });
  const libraryRow = await $('[data-testid="knowledge-library-row"]');
  if (await libraryRow.isExisting()) return;

  await $('[data-testid="knowledge-create-library-empty"]').click();
  const nameInput = await $(
    '[data-testid="knowledge-library-name"] input, input[data-testid="knowledge-library-name"]'
  );
  await nameInput.waitForDisplayed();
  await nameInput.setValue("E2E Native UI Library");
  await $('[data-testid="knowledge-create-library-submit"]').click();
  await $(".base-dialog-backdrop").waitForDisplayed({
    reverse: true,
    timeout: 10_000,
  });
  await libraryRow.waitForDisplayed({ timeout: 20_000 });
}

async function getAppProcessId(): Promise<number> {
  await browser.execute(() => {
    const e2eWindow = window as NativePidWindow;
    const tauriInternals = e2eWindow.__TAURI_INTERNALS__;
    e2eWindow.__AIO_E2E_PID_RESULT__ = { status: "pending" };

    if (!tauriInternals) {
      e2eWindow.__AIO_E2E_PID_RESULT__ = {
        status: "failed",
        error: "Tauri IPC internals are unavailable",
      };
      return;
    }

    void tauriInternals
      .invoke<number>("wa_get_self_pid", {})
      .then((processId) => {
        e2eWindow.__AIO_E2E_PID_RESULT__ = {
          status: "resolved",
          processId,
        };
      })
      .catch((error: unknown) => {
        e2eWindow.__AIO_E2E_PID_RESULT__ = {
          status: "failed",
          error: String(error),
        };
      });
  });

  await browser.waitUntil(
    async () => {
      const result = await browser.execute(
        () => (window as NativePidWindow).__AIO_E2E_PID_RESULT__
      );
      return result?.status !== "pending";
    },
    { timeout: 5_000, timeoutMsg: "Timed out while resolving the Tauri PID" }
  );
  const result = await browser.execute(
    () => (window as NativePidWindow).__AIO_E2E_PID_RESULT__
  );

  if (
    result?.status !== "resolved" ||
    !Number.isInteger(result.processId) ||
    result.processId <= 0
  ) {
    throw new Error(
      result?.status === "failed"
        ? result.error
        : "Failed to resolve the Tauri process ID"
    );
  }
  return result.processId;
}

const nativeDescribe =
  process.env.AIO_E2E_NATIVE_UI === "1" ? describe : describe.skip;

nativeDescribe("Windows native Knowledge selectors", () => {
  let appProcessId = 0;

  before(async () => {
    await ensureLibrary();
    appProcessId = await getAppProcessId();
  });

  it("imports a fixture through the Windows file picker", async () => {
    const fixturePath = process.env.AIO_E2E_NATIVE_FILE;
    if (!fixturePath) throw new Error("AIO_E2E_NATIVE_FILE is required");

    await $('[data-testid="knowledge-import"]').click();
    const result = selectNativeFiles([fixturePath], appProcessId);
    if (!result.success)
      throw new Error(result.error || "Native file selection failed");

    const documentRow = await $(
      '[data-testid="knowledge-document-row"][data-document-title="native-selector-file"]'
    );
    await documentRow.waitForDisplayed({ timeout: 30_000 });
  });

  it("adds a persistent source through the Windows folder picker", async () => {
    const fixtureDirectory = process.env.AIO_E2E_NATIVE_DIRECTORY;
    if (!fixtureDirectory)
      throw new Error("AIO_E2E_NATIVE_DIRECTORY is required");

    await $('[data-testid="knowledge-view-settings"]').click();
    await $('[data-testid="knowledge-settings"]').waitForDisplayed({
      timeout: 20_000,
    });
    const addDirectory = await $('[data-testid="knowledge-add-directory"]');
    await addDirectory.waitForClickable({ timeout: 20_000 });
    await addDirectory.click();
    const result = selectNativeFolder(fixtureDirectory, appProcessId);
    if (!result.success)
      throw new Error(result.error || "Native folder selection failed");

    const sourceRow = await $(
      '[data-testid="knowledge-source-row"][data-source-kind="directory"][data-source-name="directory-source"]'
    );
    await sourceRow.waitForDisplayed({ timeout: 30_000 });
  });
});
