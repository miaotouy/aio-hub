import { $, browser } from "@wdio/globals";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for baseline E2E.`);
  return value;
}

const recoveryDescribe =
  process.env.AIO_E2E_PRESET_ID === "guided-flow-baseline" &&
  process.env.AIO_E2E_PHASE === "recovery"
    ? describe
    : describe.skip;

recoveryDescribe("Guided Flow unknown baseline recovery", () => {
  it("does not queue release-only work or duplicate its stable notification", async () => {
    const expectedVersion = requiredEnv("AIO_E2E_EXPECTED_APP_VERSION");
    const stableNotificationPrefix = `release-notes:${expectedVersion}:r`;
    const body = await $("body");
    await body.waitForExist();
    await browser.pause(3_000);

    const shell = await $('.guided-flow-shell[data-flow-id="app-upgrade"]');
    if (await shell.isExisting()) {
      throw new Error(
        "Acknowledged unknown-baseline release was queued as Guided Flow after restart."
      );
    }

    const notificationCount = await browser.execute((notificationPrefix) => {
      const stored = JSON.parse(
        localStorage.getItem("app-notifications") ?? "[]"
      ) as Array<{ id: string }>;
      return stored.filter((item) => item.id.startsWith(notificationPrefix))
        .length;
    }, stableNotificationPrefix);
    if (notificationCount !== 1) {
      throw new Error(
        `Expected one stable release notification, received ${notificationCount}.`
      );
    }
  });
});
