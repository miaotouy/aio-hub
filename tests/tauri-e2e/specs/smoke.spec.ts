import { $, browser } from "@wdio/globals";

describe("AIO Hub Tauri smoke", () => {
  it("opens the main WebView", async () => {
    const body = await $("body");
    await body.waitForExist();

    const title = await browser.getTitle();
    if (!title || title === "about:blank") {
      throw new Error(`Unexpected Tauri window title: ${title}`);
    }
  });
});
