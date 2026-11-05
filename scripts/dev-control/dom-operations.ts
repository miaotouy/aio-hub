import type { ControlStep, ControlTarget } from "./protocol";

/** Serialized into the selected WebView. Intentionally uses DOM input semantics. */
export async function runDomOperation(
  step: ControlStep,
  expiresAt = Date.now() + 15000
): Promise<unknown> {
  const fail = (code: string, message: string): never => {
    throw Object.assign(new Error(message), { code });
  };
  const checkTime = () => {
    if (Date.now() >= expiresAt)
      fail("COMMAND_TIMEOUT", "输入操作已超时，已停止后续动作。");
  };
  checkTime();
  const visible = (el: Element) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    let ancestor: Element | null = el;
    while (ancestor) {
      if (getComputedStyle(ancestor).opacity === "0") return false;
      ancestor = ancestor.parentElement;
    }
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility === "visible" &&
      !el.closest('[hidden],[inert],[aria-hidden="true"]')
    );
  };
  const targets = (target: ControlTarget): Element[] => {
    if (target.role || target.label)
      fail(
        "UNSUPPORTED_CAPABILITY",
        "当前 Linux 定位支持 css、testid 和 placeholder；请使用 inspect 返回的定位信息。"
      );
    let scope: Document | Element = document;
    if (target.scope) {
      const scopes = document.querySelectorAll(target.scope);
      if (scopes.length !== 1)
        fail(
          scopes.length ? "TARGET_AMBIGUOUS" : "TARGET_NOT_FOUND",
          "scope 需要唯一匹配。"
        );
      scope = scopes[0];
    }
    if (target.testid)
      return Array.from(scope.querySelectorAll("[data-testid]")).filter(
        (el) => el.getAttribute("data-testid") === target.testid
      );
    if (target.placeholder)
      return Array.from(scope.querySelectorAll("input,textarea")).filter(
        (el) => {
          const value = el.getAttribute("placeholder") || "";
          return target.exact === false
            ? value.includes(target.placeholder!)
            : value === target.placeholder;
        }
      );
    return Array.from(scope.querySelectorAll(target.css!));
  };
  const unique = (target: ControlTarget) => {
    const elements = targets(target);
    if (elements.length !== 1)
      fail(
        elements.length ? "TARGET_AMBIGUOUS" : "TARGET_NOT_FOUND",
        "目标需要唯一匹配；请先 inspect 确认控件。"
      );
    return elements[0] as HTMLElement;
  };
  const actionable = async (target: ControlTarget) => {
    const element = unique(target);
    element.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
    const frame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await frame();
    const before = element.getBoundingClientRect();
    await frame();
    if (!element.isConnected || unique(target) !== element)
      fail("TARGET_CHANGED", "目标在定位后发生变化，请重新观察。");
    if (!visible(element)) fail("TARGET_HIDDEN", "目标控件当前不可见。");
    if (
      element.matches(":disabled") ||
      element.closest('[aria-disabled="true"]')
    )
      fail("TARGET_DISABLED", "目标控件处于禁用状态。");
    const rect = element.getBoundingClientRect();
    if (
      [
        rect.x - before.x,
        rect.y - before.y,
        rect.width - before.width,
        rect.height - before.height,
      ].some((x) => Math.abs(x) > 1)
    )
      fail("TARGET_UNSTABLE", "目标控件仍在移动，请稍后操作。");
    const x = (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2;
    const y = (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2;
    const hit = document.elementFromPoint(x, y);
    if (!hit || (hit !== element && !element.contains(hit)))
      fail("TARGET_OBSCURED", "目标控件被其他元素遮挡。");
    checkTime();
    return element;
  };
  if (step.op === "wait") {
    if (!step.target) {
      const description = window.__AIO_DEV_CONTROL__?.describe();
      return (
        !!description?.ready &&
        (!step.route || description.route === step.route)
      );
    }
    const elements = targets(step.target);
    if (elements.length > 1)
      fail("TARGET_AMBIGUOUS", "等待目标匹配到多个控件。");
    const state = step.state ?? "visible";
    if (state === "detached") return !elements.length;
    if (state === "hidden") return !elements.length || !visible(elements[0]);
    return (
      elements.length === 1 && (state === "attached" || visible(elements[0]))
    );
  }
  if (step.op === "click" || step.op === "dblclick") {
    if (step.op === "dblclick" || step.modifiers?.length)
      fail(
        "UNSUPPORTED_CAPABILITY",
        "当前 Linux DOM 输入暂未提供双击和修饰键语义。"
      );
    const element = await actionable(step.target);
    element.focus({ preventScroll: true });
    element.click();
    return { inputBackend: "dom" };
  }
  if (step.op === "fill") {
    const element = await actionable(step.target);
    if (
      !(
        element instanceof HTMLInputElement ||
        element instanceof HTMLTextAreaElement
      ) ||
      (element instanceof HTMLInputElement &&
        ![
          "text",
          "search",
          "email",
          "url",
          "tel",
          "password",
          "number",
        ].includes(element.type))
    )
      fail("UNSUPPORTED_CAPABILITY", "fill 当前支持文本输入框和 textarea。");
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    if (input.readOnly) fail("TARGET_READONLY", "目标输入框为只读。");
    input.focus({ preventScroll: true });
    const prototype =
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      input,
      step.text
    );
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: step.text,
      })
    );
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return { inputBackend: "dom" };
  }
  if (step.op === "select") {
    const element = await actionable(step.target);
    if (!(element instanceof HTMLSelectElement))
      fail("UNSUPPORTED_CAPABILITY", "select 需要原生 select 控件。");
    const select = element as HTMLSelectElement;
    const values = Array.isArray(step.value) ? step.value : [step.value];
    if (
      (!select.multiple && values.length !== 1) ||
      values.some(
        (v) =>
          !Array.from(select.options).some(
            (o) =>
              o.value === v &&
              !o.disabled &&
              !(
                o.parentElement instanceof HTMLOptGroupElement &&
                o.parentElement.disabled
              )
          )
      )
    )
      fail("OPTION_NOT_FOUND", "选项不可用。");
    for (const option of Array.from(select.options))
      option.selected = values.includes(option.value);
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { inputBackend: "dom" };
  }
  if (step.op === "scroll") {
    let element: Element | null = step.target
      ? await actionable(step.target)
      : document.scrollingElement;
    if (step.target)
      while (element && element !== document.scrollingElement) {
        const style = getComputedStyle(element);
        if (
          (/(auto|scroll)/.test(style.overflowY) &&
            element.scrollHeight > element.clientHeight) ||
          (/(auto|scroll)/.test(style.overflowX) &&
            element.scrollWidth > element.clientWidth)
        )
          break;
        element = element.parentElement;
      }
    if (!element) fail("TARGET_NOT_SCROLLABLE", "目标没有可滚动容器。");
    const scrollable = element!;
    scrollable.scrollBy({
      left: step.deltaX ?? 0,
      top: step.deltaY ?? 600,
      behavior: "instant",
    });
    return {
      inputBackend: "dom",
      left: scrollable.scrollLeft,
      top: scrollable.scrollTop,
    };
  }
  return fail("UNSUPPORTED_CAPABILITY", "当前 Linux 通道尚未提供此输入操作。");
}
