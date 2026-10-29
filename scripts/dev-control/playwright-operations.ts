import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Locator, Page } from "playwright-core";
import type { ControlStep, ControlTarget } from "./protocol";
import { CONTROL_ROOT, type DevInstance } from "./discovery";
import { ControlError } from "./errors";
import { inspectElement } from "./dom-inspect";
import { resizeWindow, readDiagnostics } from "./page-actions";

type Role = Parameters<Page["getByRole"]>[0];
function remainingTimeout(deadline: number): number {
  const remaining = deadline - Date.now();
  if (remaining <= 0)
    throw new ControlError(
      "COMMAND_TIMEOUT",
      "指令执行超时。",
      "操作可能已生效，请先 observe 确认当前状态。"
    );
  return remaining;
}
function locatorFor(page: Page, target: ControlTarget): Locator {
  const root = target.scope ? page.locator(target.scope) : page;
  const exact = target.exact ?? true;
  if (target.testid) return root.getByTestId(target.testid);
  if (target.role)
    return root.getByRole(target.role as Role, { name: target.name, exact });
  if (target.label) return root.getByLabel(target.label, { exact });
  if (target.placeholder)
    return root.getByPlaceholder(target.placeholder, { exact });
  return root.locator(target.css!);
}
async function unique(
  page: Page,
  target: ControlTarget,
  timeout: number
): Promise<Locator> {
  const deadline = Date.now() + timeout;
  const locator = locatorFor(page, target);
  let count = await locator.count();
  if (count === 0) {
    try {
      await locator.waitFor({
        state: "attached",
        timeout: remainingTimeout(deadline),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        throw new ControlError(
          "TARGET_NOT_FOUND",
          "等待结束后仍未找到目标控件。",
          "确认当前页面、面板与定位条件；使用 inspect 查看可用控件。"
        );
      }
      throw error;
    }
    count = await locator.count();
  }
  if (count !== 1) {
    const candidates = await locator.evaluateAll((elements) =>
      elements.slice(0, 8).map((element) => ({
        tag: element.tagName.toLowerCase(),
        testid: element.getAttribute("data-testid"),
        name: (
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          element.textContent ||
          ""
        )
          .trim()
          .slice(0, 80),
      }))
    );
    throw new ControlError(
      "TARGET_AMBIGUOUS",
      `目标匹配到 ${count} 个元素。`,
      "添加 scope 或使用更精确的定位方式。",
      candidates
    );
  }
  return locator;
}

async function inspect(
  page: Page,
  target: ControlTarget | undefined,
  limit: number | undefined,
  timeout: number
) {
  const root = target
    ? await unique(page, target, timeout)
    : page.locator("body");
  return root.evaluate(inspectElement, limit ?? 60);
}

async function screenshot(
  page: Page,
  instance: DevInstance,
  target: ControlTarget | undefined,
  selectors: string[] | undefined,
  timeout: number
) {
  const dir = path.join(CONTROL_ROOT, "artifacts", instance.startupId);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(
    dir,
    `screenshot-${Date.now()}-${randomUUID().slice(0, 8)}.png`
  );
  const mask = [
    'input[type="password"]',
    "[data-dev-sensitive]",
    ...(selectors ?? []),
  ].map((selector) => page.locator(selector));
  if (target)
    await (
      await unique(page, target, timeout)
    ).screenshot({
      path: file,
      type: "png",
      mask,
      caret: "initial",
      animations: "allow",
    });
  else
    await page.screenshot({
      path: file,
      type: "png",
      fullPage: false,
      mask,
      caret: "initial",
      animations: "allow",
    });
  return {
    path: file,
    kind: target ? "element" : "viewport",
    observedAt: new Date().toISOString(),
  };
}

export async function executePlaywrightStep(
  page: Page,
  instance: DevInstance,
  step: ControlStep,
  timeout: number
): Promise<unknown> {
  const deadline = Date.now() + timeout;
  const timeLeft = () => remainingTimeout(deadline);
  const targetLocator = async (target: ControlTarget) => {
    const locator = await unique(page, target, timeLeft());
    // Locating and acting share one budget; locating must not restart the clock.
    page.setDefaultTimeout(timeLeft());
    return locator;
  };
  page.setDefaultTimeout(timeout);
  switch (step.op) {
    case "resize":
      return page.evaluate(resizeWindow, {
        width: step.width,
        height: step.height,
        timeoutMs: timeout,
      });
    case "diagnostics":
      return page.evaluate(readDiagnostics, {
        since: step.since ?? 0,
        limit: step.limit ?? 30,
        documentId: step.documentId,
      });
    case "navigate":
      return page.evaluate(
        ({ path, timeout }) =>
          window.__AIO_DEV_CONTROL__!.navigate(path, timeout),
        { path: step.path, timeout }
      );
    case "inspect":
      return inspect(page, step.target, step.limit, timeout);
    case "observe": {
      const snapshot = await inspect(page, step.target, step.limit, timeout);
      const image =
        step.screenshot === false
          ? undefined
          : await screenshot(page, instance, step.target, undefined, timeout);
      return { snapshot, screenshot: image };
    }
    case "screenshot":
      return screenshot(page, instance, step.target, step.mask, timeout);
    case "click":
      return (await targetLocator(step.target)).click({
        timeout: timeLeft(),
        modifiers: step.modifiers,
      });
    case "dblclick":
      return (await targetLocator(step.target)).dblclick({
        timeout: timeLeft(),
        modifiers: step.modifiers,
      });
    case "fill":
      return (await targetLocator(step.target)).fill(step.text, {
        timeout: timeLeft(),
      });
    case "press":
      if (step.target)
        return (await targetLocator(step.target)).press(step.key, {
          timeout: timeLeft(),
        });
      return page.keyboard.press(step.key);
    case "select":
      return (await targetLocator(step.target)).selectOption(step.value, {
        timeout: timeLeft(),
      });
    case "scroll": {
      let point: { x: number; y: number };
      if (step.target) {
        const locator = await targetLocator(step.target);
        await locator.scrollIntoViewIfNeeded({ timeout: timeLeft() });
        const box = await locator.boundingBox();
        if (!box) throw new ControlError("TARGET_HIDDEN", "滚动目标不可见。");
        point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        const hit = await locator.evaluate((element, point) => {
          const hit = document.elementFromPoint(point.x, point.y);
          return hit === element || (hit !== null && element.contains(hit));
        }, point);
        if (!hit)
          throw new ControlError("TARGET_OBSCURED", "滚动目标被其他元素遮挡。");
      } else {
        point = await page.evaluate(() => ({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
        }));
      }
      await page.mouse.move(point.x, point.y);
      await page.mouse.wheel(step.deltaX ?? 0, step.deltaY ?? 600);
      return;
    }
    case "wait":
      if (step.target)
        return locatorFor(page, step.target).waitFor({
          state: step.state ?? "visible",
          timeout,
        });
      return page
        .waitForFunction(
          (route) => {
            const description = window.__AIO_DEV_CONTROL__?.describe();
            return (
              description?.ready && (!route || description.route === route)
            );
          },
          step.route,
          { timeout }
        )
        .then((handle) => handle.dispose());
    case "state":
      return page.evaluate(
        (scope) => window.__AIO_DEV_CONTROL__!.readState(scope),
        step.scope
      );
    case "action":
      return page.evaluate(
        ({ name, args }) => window.__AIO_DEV_CONTROL__!.runAction(name, args),
        { name: step.name, args: step.args }
      );
    case "eval":
      return page.evaluate(step.expression);
  }
}
