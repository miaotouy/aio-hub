import { $, browser } from "@wdio/globals";

describe("AIO Hub Tauri smoke", () => {
  it("opens the main WebView", async () => {
    const body = await $("body");
    await body.waitForExist();

    const title = await browser.getTitle();
    if (!title || title === "about:blank") {
      throw new Error(`Unexpected Tauri window title: ${title}`);
    }

    const url = await browser.getUrl();
    const expectedUrl =
      process.env.AIO_E2E_FRONTEND_URL || "http://localhost:1420/";
    if (!url.startsWith(expectedUrl)) {
      throw new Error(`Tauri WebView did not load the application URL: ${url}`);
    }
  });
});
