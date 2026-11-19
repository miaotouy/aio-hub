import type { ControlCommand } from "./protocol";
import { safeText, sensitiveSelector, redactText } from "./redact";

const fail = (code: string, message: string): never => {
  throw Object.assign(new Error(message), { code });
};
const visible = (el: Element) => {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility === "visible" &&
    style.display !== "none" &&
    !el.closest('[hidden],[inert],[aria-hidden="true"]')
  );
};
const role = (el: Element) =>
  el.getAttribute("role") ||
  (el.matches(".el-switch")
    ? "switch"
    : el.matches('.el-checkbox,input[type="checkbox"]')
      ? "checkbox"
      : el.matches('.el-radio,input[type="radio"]')
        ? "radio"
        : el.matches("button")
          ? "button"
          : el.matches("a[href]")
            ? "link"
            : el.matches("select,.el-select")
              ? "combobox"
              : el.matches("input,textarea")
                ? "textbox"
                : "element");
const checked = (el: Element) => {
  const input = el.matches("input")
    ? el
    : el.querySelector(
        'input[type="checkbox"],input[type="radio"],[role="switch"]'
      );
  return input instanceof HTMLInputElement
    ? input.checked
    : el.getAttribute("aria-checked");
};
const name = (el: Element) => {
  if (el.closest(sensitiveSelector)) return "[sensitive]";
  const labelled = (el.getAttribute("aria-labelledby") || "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => {
      const label = document.getElementById(id);
      return label ? safeText(label) : "";
    })
    .join(" ");
  const labels =
    "labels" in el
      ? Array.from((el as HTMLInputElement).labels || [])
          .map(safeText)
          .join(" ")
      : "";
  // Form values and placeholders stay private; icon-button titles provide an accessible fallback.
  return redactText(
    el.getAttribute("aria-label") ||
      (el.matches(".el-switch,.el-checkbox,.el-radio,.el-select")
        ? el.querySelector("input")?.getAttribute("aria-label")
        : "") ||
      labelled ||
      labels ||
      (el.matches("button,a[href]") ? el.getAttribute("title") : "") ||
      safeText(el)
  ).slice(0, 160);
};
export class ControlDom {
  private snapshotId = "";
  private refs = new Map<
    string,
    { element: Element; name: string; role: string }
  >();
  private observedAt = 0;
  reset() {
    this.refs.clear();
    this.snapshotId = "";
  }
  observe(limit = 100) {
    this.snapshotId = crypto.randomUUID();
    this.observedAt = Date.now();
    this.refs.clear();
    const selector =
      'button,a[href],input:not([type="hidden"]),textarea,select,[role],[data-testid],[tabindex],[contenteditable="true"],.el-switch,.el-checkbox,.el-radio,.el-select';
    const all = Array.from(document.querySelectorAll(selector)).filter(
      (el) =>
        visible(el) &&
        !el.closest("[data-control-ignore]") &&
        !(
          el.closest(".el-select") &&
          !el.matches(".el-select") &&
          el.matches('input,[role="combobox"]')
        )
    );
    const elements = all
      .slice(0, Math.max(1, Math.min(500, limit)))
      .map((el, index) => {
        const ref = `e${index + 1}`;
        this.refs.set(ref, { element: el, name: name(el), role: role(el) });
        const r = el.getBoundingClientRect();
        return {
          ref,
          role: role(el),
          name: name(el),
          sensitive: Boolean(el.closest(sensitiveSelector)),
          disabled: el.matches(':disabled,[aria-disabled="true"],.is-disabled'),
          checked: checked(el),
          expanded:
            el.getAttribute("aria-expanded") ||
            (el.matches(".el-select")
              ? el
                  .querySelector('[role="combobox"]')
                  ?.getAttribute("aria-expanded")
              : null),
          selected: el.getAttribute("aria-selected"),
          bounds: {
            x: Math.round(r.x),
            y: Math.round(r.y),
            width: Math.round(r.width),
            height: Math.round(r.height),
          },
        };
      });
    return {
      snapshotId: this.snapshotId,
      elements,
      total: all.length,
      truncated: all.length > elements.length,
      viewport: { width: innerWidth, height: innerHeight },
      dialogs: Array.from(document.querySelectorAll('[role="dialog"]'))
        .filter(visible)
        .map((el) => ({ name: name(el) })),
    };
  }
  resolve(command: ControlCommand): HTMLElement {
    let el: Element | undefined;
    if (command.ref) {
      if (
        command.snapshotId !== this.snapshotId ||
        Date.now() - this.observedAt > 60000
      )
        fail("STALE_SNAPSHOT", "界面引用已过期，请重新 observe。");
      const stored = this.refs.get(command.ref);
      el = stored?.element;
      if (
        stored &&
        (stored.name !== name(stored.element) ||
          stored.role !== role(stored.element))
      )
        fail("TARGET_CHANGED", "目标语义发生变化，请重新 observe。");
      if (!el?.isConnected)
        fail("TARGET_CHANGED", "目标已离开当前界面，请重新 observe。");
    } else if (command.css) {
      let matches: NodeListOf<Element>;
      try {
        matches = document.querySelectorAll(command.css);
      } catch {
        return fail("INVALID_SELECTOR", "CSS 选择器无效。");
      }
      if (matches.length !== 1)
        fail("TARGET_AMBIGUOUS", "目标需要唯一匹配，请先 observe 或细化 css。");
      el = matches[0];
    } else fail("TARGET_REQUIRED", "请提供 ref 与 snapshotId，或唯一 css。");
    if (el!.closest("[data-control-ignore]"))
      fail("TARGET_PROTECTED", "该区域已排除界面控制。");
    return el as HTMLElement;
  }
  async operate(
    command: ControlCommand,
    expiresAt: number,
    signal?: AbortSignal
  ) {
    if (signal?.aborted) fail("CONTROL_DISABLED", "调试接管已关闭。");
    const el = this.resolve(command);
    if (command.op === "inspect") {
      if (el.closest(sensitiveSelector)) return { sensitive: true };
      const r = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        role: role(el),
        name: name(el),
        checked: checked(el),
        text: safeText(el),
        bounds: { x: r.x, y: r.y, width: r.width, height: r.height },
        scroll: {
          top: el.scrollTop,
          left: el.scrollLeft,
          height: el.scrollHeight,
          width: el.scrollWidth,
          clientHeight: el.clientHeight,
          clientWidth: el.clientWidth,
        },
        style: {
          overflowY: style.overflowY,
          overflowX: style.overflowX,
          position: style.position,
          scrollBehavior: style.scrollBehavior,
          overflowAnchor: style.overflowAnchor,
        },
      };
    }
    if (!visible(el)) fail("TARGET_HIDDEN", "目标当前不可见。");
    if (el.matches(':disabled,[aria-disabled="true"],.is-disabled'))
      fail("TARGET_DISABLED", "目标处于禁用状态。");
    // Scrolling/inspection must preserve the failing scroll position.
    if (command.op === "scroll") {
      el.scrollBy({
        left: Number(command.deltaX || 0),
        top: Number(command.deltaY || 0),
        behavior: "instant",
      });
      return { top: el.scrollTop, left: el.scrollLeft };
    }
    el.scrollIntoView({
      block: "nearest",
      inline: "nearest",
      behavior: "instant",
    });
    await new Promise((resolve) => setTimeout(resolve, 32));
    if (signal?.aborted) fail("CONTROL_DISABLED", "调试接管已关闭。");
    if (Date.now() >= expiresAt)
      fail("COMMAND_TIMEOUT", "操作超时，后续动作已停止。");
    if (!el.isConnected || this.resolve(command) !== el)
      fail("TARGET_CHANGED", "目标发生变化，请重新 observe。");
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.max(0, Math.min(innerWidth - 1, r.x + r.width / 2)),
      Math.max(0, Math.min(innerHeight - 1, r.y + r.height / 2))
    );
    if (!hit || !(el === hit || el.contains(hit)))
      fail("TARGET_OBSCURED", "目标被弹层遮挡，请重新 observe。");
    if (command.op === "click") {
      const clickable = el.matches(".el-select")
        ? el.querySelector<HTMLElement>(".el-select__wrapper") || el
        : el;
      clickable.focus({ preventScroll: true });
      clickable.click();
      return { clicked: true };
    }
    if (command.op === "fill") {
      if (!(
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
      ))
        fail("UNSUPPORTED_TARGET", "fill 支持 input 与 textarea。");
      const input = el as HTMLInputElement | HTMLTextAreaElement;
      if (input.readOnly) fail("TARGET_READONLY", "输入框为只读。");
      input.focus();
      const prototype =
        input instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
        input,
        String(command.text ?? "")
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return { filled: true };
    }
    if (command.op === "select") {
      if (!(el instanceof HTMLSelectElement))
        fail(
          "UNSUPPORTED_TARGET",
          "Element Plus 下拉框请 click 打开，再 observe 并 click 选项。"
        );
      const select = el as HTMLSelectElement;
      if (
        !Array.from(select.options).some(
          (o) => o.value === command.value && !o.disabled
        )
      )
        fail("UNKNOWN_OPTION", "选项无效或已禁用。");
      select.value = command.value!;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { selected: true };
    }
    if (command.op === "press") {
      const key = command.key || "";
      if (
        ![
          "Enter",
          "Escape",
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
          " ",
        ].includes(key)
      )
        fail("UNSUPPORTED_KEY", "该按键暂未支持。");
      el.focus();
      el.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })
      );
      el.dispatchEvent(
        new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true })
      );
      return { dispatched: true };
    }
    return fail("UNKNOWN_COMMAND", "未知界面操作。");
  }
}
