/** Pure page function shared by CDP and embedded WebDriver. Values are omitted. */
export function inspectElement(root: Element, limit = 60) {
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
    if (el.matches("input,textarea,[contenteditable='true']")) return "textbox";
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
        el.matches(":disabled") || el.getAttribute("aria-disabled") === "true",
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
}
