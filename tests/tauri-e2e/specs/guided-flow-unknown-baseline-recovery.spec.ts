import { $, browser } from "@wdio/globals";

const recoveryDescribe =
  process.env.AIO_E2E_PRESET_ID === "guided-flow-baseline" &&
  process.env.AIO_E2E_PHASE === "recovery"
    ? describe
    : describe.skip;

recoveryDescribe("Guided Flow unknown baseline recovery", () => {
  it("does not auto-queue the acknowledged release on same-root restart", async () => {
    const body = await $("body");
    await body.waitForExist();
    await browser.pause(3_000);

    const shell = await $('.guided-flow-shell[data-flow-id="app-upgrade"]');
    if (await shell.isExisting()) {
      throw new Error(
        "Acknowledged unknown-baseline release was queued again after restart."
      );
    }
  });
});
