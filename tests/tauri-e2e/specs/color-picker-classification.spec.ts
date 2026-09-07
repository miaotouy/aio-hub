import { $, $$, browser, expect } from "@wdio/globals";
import fs from "node:fs";
import path from "node:path";

// Real WebView/IPC regression: a reclassification must not decode the image again,
// and the copy destination must use the edited rule rather than the original label.
describe("batch color reclassification", () => {
  it("reclassifies an analyzed image and archives it with the current rules", async () => {
    const artifacts = process.env.AIO_E2E_ARTIFACT_DIR!;
    const fixture = path.join(artifacts, "color-source");
    const target = path.join(artifacts, "color-archive");
    fs.mkdirSync(fixture, { recursive: true });
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(
      path.join(fixture, "blue.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#0000ff"/></svg>'
    );
    await $("body").waitForExist();
    await browser.execute(() => {
      document
        .querySelector<HTMLElement>(
          '[data-testid="guided-flow-close"], [data-testid="guided-flow-skip"]'
        )
        ?.click();
      window.history.pushState({}, "", "/color-picker");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await $(".color-picker-wrapper").waitForDisplayed({ timeout: 30_000 });
    const batchMode = await $('//label[contains(., "批量整理")]');
    await batchMode.click();
    await $(".batch-color-organizer").waitForDisplayed();
    const input = await $(
      '.batch-input-sidebar input[placeholder="拖拽、输入或选择目录路径"]'
    );
    await input.setValue(fixture);
    await browser.keys("Enter");
    await $(
      '//button[contains(., "开始分析") and not(@disabled)]'
    ).waitForExist();
    await $('//button[contains(., "开始分析")]').scrollIntoView();
    await $('//button[contains(., "开始分析")]').click();
    await $('//strong[contains(., "蓝 / 极暗")]').waitForDisplayed({
      timeout: 30_000,
    });
    // Make the source unavailable while reclassifying: the UI must retain the successful analysis.
    const originalSource = path.join(fixture, "blue.svg");
    const heldSource = path.join(fixture, "blue.held");
    fs.renameSync(originalSource, heldSource);
    const slider = await $('[role="slider"][aria-label="极暗阈值"]');
    await slider.scrollIntoView();
    await browser.execute(() => {
      const slider = document.querySelector<HTMLElement>(
        '[role="slider"][aria-label="极暗阈值"]'
      );
      slider?.focus();
      slider?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Home", bubbles: true })
      );
    });
    await $('//strong[contains(., "蓝 / 偏暗")]').waitForDisplayed();
    await $('//button[normalize-space(.)="管理色系"]').click();
    const names = await $$('.rules-editor input[aria-label="色系名称"]');
    for (const name of names) {
      if ((await name.getValue()) === "蓝") {
        await name.setValue("海蓝");
        break;
      }
    }
    await browser.waitUntil(() =>
      browser.execute(() => {
        const dialog = document.querySelector(".base-dialog-container");
        return !!dialog && getComputedStyle(dialog).opacity === "1";
      })
    );
    await browser.saveScreenshot(
      path.join(artifacts, "color-rules-editor.png")
    );
    await $('//button[normalize-space(.)="应用"]').click();
    await $('//strong[contains(., "海蓝 / 偏暗")]').waitForDisplayed();
    await $('//button[normalize-space(.)="全选当前"]').click();
    const toggleRed = async () =>
      browser.execute(() => {
        const chip = Array.from(
          document.querySelectorAll<HTMLButtonElement>(".color-family-chip")
        ).find((el) => el.textContent?.trim() === "红");
        chip?.dispatchEvent(
          new PointerEvent("pointerdown", { button: 0, bubbles: true })
        );
        window.dispatchEvent(
          new PointerEvent("pointerup", { button: 0, bubbles: true })
        );
      });
    await toggleRed();
    await expect($(".image-card")).not.toExist();
    await toggleRed();
    await $(".image-card").waitForDisplayed();
    await expect($(".card-checkbox input")).not.toBeSelected();
    await browser.saveScreenshot(
      path.join(artifacts, "color-reclassified.png")
    );
    await $('//button[normalize-space(.)="全选当前"]').click();
    await $(
      '//div[contains(@class, "batch-result-toolbar")]//button[contains(., "开始归档")]'
    ).click();
    fs.renameSync(heldSource, originalSource);
    const targetInput = await $(
      'input[placeholder="请选择或输入归档目标目录"]'
    );
    await targetInput.setValue(target);
    const archiveButton = await $(
      '//div[contains(@class, "base-dialog-backdrop")]//button[contains(., "开始归档")]'
    );
    await archiveButton.waitForEnabled({ timeout: 15_000 });
    await archiveButton.click();
    const expectedPath = path.join(target, "海蓝", "偏暗", "blue.svg");
    await browser.waitUntil(() => fs.existsSync(expectedPath), {
      timeout: 20_000,
      timeoutMsg: "Archive did not use current classification",
    });
    if (
      fs.readFileSync(expectedPath, "utf8") !==
      fs.readFileSync(path.join(fixture, "blue.svg"), "utf8")
    )
      throw new Error("Archived content differs from source");
    await browser.saveScreenshot(
      path.join(artifacts, "color-archive-result.png")
    );
    await $('//button[normalize-space(.)="完成"]').click();
  });
});
