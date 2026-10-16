import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Locator, Page } from "playwright-core";
import type {
  ControlRequest,
  ControlStep,
  ControlTarget,
  StepResult,
} from "./protocol";
import { validateRequest } from "./protocol";
import { DevConnection } from "./connection";
import {
  acquireWindowLock,
  CONTROL_ROOT,
  getInstance,
  type DevInstance,
} from "./discovery";
import { ControlError, errorResult, withinTimeout } from "./errors";

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
  return root.evaluate((root, limit) => {
    const visible = (el: Element) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none" &&
        !el.closest('[aria-hidden="true"]')
      );
    };
    const nameOf = (el: Element) => {
      const labelledBy = el.getAttribute("aria-labelledby");
      const labels = "labels" in el ? (el as HTMLInputElement).labels : null;
      return (
        el.getAttribute("aria-label") ||
        (labelledBy
          ? labelledBy
              .split(/\s+/)
              .map((id) => document.getElementById(id)?.textContent ?? "")
              .join(" ")
          : "") ||
        (labels
          ? Array.from(labels)
              .map((label) => label.textContent)
              .join(" ")
          : "") ||
        el.getAttribute("title") ||
        el.getAttribute("placeholder") ||
        (el.matches("input,textarea")
          ? ""
          : (el as HTMLElement).innerText || el.textContent) ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 160);
    };
    const roleOf = (el: Element) => {
      const role = el.getAttribute("role");
      if (role) return role;
      if (el.matches('button,input[type="button"],input[type="submit"]'))
        return "button";
      if (el.matches("a[href]")) return "link";
      if (el.matches('input[type="checkbox"]')) return "checkbox";
      if (el.matches('input[type="radio"]')) return "radio";
      if (el.matches('input[type="range"]')) return "slider";
      if (el.matches("select"))
        return (el as HTMLSelectElement).multiple ? "listbox" : "combobox";
      if (el.matches("input,textarea,[contenteditable='true']"))
        return "textbox";
      return "element";
    };
    const cssPath = (el: Element) => {
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && node !== document.documentElement) {
        if (node.id) {
          parts.unshift(`#${CSS.escape(node.id)}`);
          break;
        }
        const tag = node.tagName.toLowerCase();
        const siblings: Element[] = node.parentElement
          ? Array.from(node.parentElement.children).filter(
              (item) => item.tagName === node!.tagName
            )
          : [node];
        parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(node) + 1})`);
        node = node.parentElement;
      }
      return parts.join(" > ");
    };
    const selector =
      'button,a[href],input:not([type="hidden"]),textarea,select,[role],[data-testid],[contenteditable="true"]';
    const all = [root, ...Array.from(root.querySelectorAll(selector))].filter(
      (el) => el.matches(selector) && visible(el)
    );
    const elements = all.slice(0, limit).map((el) => {
      const role = roleOf(el);
      const name = nameOf(el);
      const testid = el.getAttribute("data-testid");
      // DOM labels are descriptive; only return a locator we can deterministically resolve.
      const locator = testid ? { testid } : { css: cssPath(el) };
      const rect = el.getBoundingClientRect();
      return {
        role,
        name,
        locator,
        disabled:
          el.matches(":disabled") ||
          el.getAttribute("aria-disabled") === "true",
        checked: el.matches('input[type="checkbox"],input[type="radio"]')
          ? (el as HTMLInputElement).checked
          : el.getAttribute("aria-checked"),
        selected: el.getAttribute("aria-selected"),
        expanded: el.getAttribute("aria-expanded"),
        pressed: el.getAttribute("aria-pressed"),
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };
    });
    const regions = Array.from(
      root.querySelectorAll(
        'h1,h2,h3,[role="heading"],[role="dialog"],nav,[role="toolbar"]'
      )
    )
      .filter(visible)
      .slice(0, 20)
      .map((el) => ({
        role: el.getAttribute("role") || el.tagName.toLowerCase(),
        name: nameOf(el),
      }));
    return {
      observedAt: new Date().toISOString(),
      title: document.title,
      route:
        window.__AIO_DEV_CONTROL__?.describe().route ??
        location.pathname + location.search,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
      },
      visibilityState: document.visibilityState,
      regions,
      elements,
      total: all.length,
      truncated: all.length > limit,
    };
  }, limit ?? 60);
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

async function executeStep(
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

/** Stop at the first failure; completed interactions retain their actual side effects. */
export async function runBatch(
  request: ControlRequest,
  execute: (step: ControlStep, index: number) => Promise<unknown>
) {
  const steps: StepResult[] = [];
  for (const [index, step] of request.steps.entries()) {
    try {
      const result = await execute(step, index);
      try {
        JSON.stringify(result);
      } catch {
        throw new ControlError(
          "NON_JSON_RESULT",
          "操作返回值无法表达为 JSON。",
          "将返回值整理为简单对象、数组或字符串后重试。此前的业务副作用保留。"
        );
      }
      steps.push({
        index,
        op: step.op,
        mode: ["navigate", "state", "action"].includes(step.op)
          ? "appAction"
          : step.op === "eval"
            ? "eval"
            : "ui",
        result,
      });
    } catch (error) {
      return {
        ok: false,
        steps,
        failedStep: { index, op: step.op },
        error: errorResult(error),
      };
    }
  }
  return { ok: true, steps };
}

export async function executeRequest(input: unknown) {
  const request = validateRequest(input);
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const timeoutMs = request.timeoutMs ?? 15000;
  const deadline = started + timeoutMs;
  const instance = getInstance(request.instance);
  const label = request.window ?? "main";
  const mutating = request.steps.some((step) =>
    [
      "navigate",
      "click",
      "dblclick",
      "fill",
      "press",
      "select",
      "scroll",
      "action",
      "eval",
      "screenshot",
      "observe",
    ].includes(step.op)
  );
  let release: (() => void) | undefined;
  let connection: DevConnection | undefined;
  let lastRoute: string | undefined;
  const remaining = () => {
    const time = deadline - Date.now();
    if (time <= 0)
      throw new ControlError(
        "COMMAND_TIMEOUT",
        "指令执行超时。",
        "先 observe 确认当前状态。"
      );
    return time;
  };
  try {
    if (mutating) release = await acquireWindowLock(instance, label);
    connection = await DevConnection.attach(instance, remaining());
    const page = await connection.window(label, remaining());
    const result = await runBatch(request, async (step) => {
      const description = await connection!.verify(page, label);
      lastRoute = description.route;
      if (
        ["navigate", "state", "action"].includes(step.op) &&
        !description.bridgeAvailable
      ) {
        await page.waitForFunction(
          () => Boolean(window.__AIO_DEV_CONTROL__),
          undefined,
          { timeout: remaining() }
        );
      }
      const stepTimeout = remaining();
      // Give native actionability errors time to settle before the hard cutoff.
      const actionTimeout = Math.max(
        1,
        stepTimeout - Math.min(100, Math.floor(stepTimeout / 10))
      );
      return withinTimeout(
        executeStep(page, instance, step, actionTimeout),
        stepTimeout
      );
    });
    // On failure, disconnect immediately in finally to cancel outstanding SDK work.
    const description = result.ok
      ? await connection.description(page)
      : undefined;
    return {
      ...result,
      instance: instance.instanceId,
      window: label,
      route: description?.route ?? lastRoute,
      startedAt,
      elapsedMs: Date.now() - started,
    };
  } finally {
    try {
      await connection?.close();
    } finally {
      release?.();
    }
  }
}
