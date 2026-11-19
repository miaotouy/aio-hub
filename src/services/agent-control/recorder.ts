/** Bounded layout flight recorder. Stores geometry and event types, never page text. */
const STORAGE_KEY = "aiohub-control-layout-v1";
const MAX_ENTRIES = 600;
interface LayoutEntry {
  at: number;
  kind: string;
  data: unknown;
}
export class LayoutRecorder {
  private entries: LayoutEntry[] = [];
  private timers: ReturnType<typeof setInterval>[] = [];
  private cleanups: (() => void)[] = [];
  private previous = "";
  private ids = new WeakMap<Element, number>();
  private nextId = 0;
  private dropped = 0;
  private running = false;
  private startedAt = Date.now();
  private add(kind: string, data: unknown) {
    this.entries.push({ at: Date.now(), kind, data });
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.shift();
      this.dropped++;
    }
  }
  private persist = () => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.read()));
    } catch {
      /* storage can be full or disabled */
    }
  };
  private id(el: Element) {
    let id = this.ids.get(el);
    if (!id) {
      id = ++this.nextId;
      this.ids.set(el, id);
    }
    return id;
  }
  sample = () => {
    const selectors = [
      ".sessions-list",
      ".message-list",
      ".chat-message-rows",
      ".sessions-sidebar",
    ];
    const containers = selectors.flatMap((selector) =>
      Array.from(document.querySelectorAll(selector))
        .slice(0, 8)
        .map((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          const rowElements =
            selector === ".sessions-list" && el.querySelector("[data-index]")
              ? Array.from(el.querySelectorAll("[data-index]"))
              : Array.from(el.children);
          const children = rowElements.slice(0, 24).map((child) => {
            const c = child.getBoundingClientRect();
            return {
              id: this.id(child),
              index: child.hasAttribute("data-index")
                ? Number(child.getAttribute("data-index"))
                : undefined,
              y: Math.round(c.y * 10) / 10,
              height: Math.round(c.height * 10) / 10,
            };
          });
          return {
            selector,
            id: this.id(el),
            top: el.scrollTop,
            left: el.scrollLeft,
            scrollHeight: el.scrollHeight,
            clientHeight: el.clientHeight,
            clientWidth: el.clientWidth,
            width: Math.round(r.width),
            height: Math.round(r.height),
            y: Math.round(r.y),
            childCount: el.childElementCount,
            transform: s.transform,
            overflowY: s.overflowY,
            overflowAnchor: s.overflowAnchor,
            children,
          };
        })
    );
    const serialized = JSON.stringify(containers);
    if (serialized !== this.previous) {
      this.previous = serialized;
      this.add("layout", containers);
    }
  };
  start() {
    if (this.running) return;
    this.running = true;
    try {
      const old = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null");
      if (old?.version === 1 && Array.isArray(old.entries)) {
        this.entries = old.entries.slice(-MAX_ENTRIES);
        this.dropped = Number(old.dropped) || 0;
      }
    } catch {
      /* a damaged previous recording can be replaced */
    }
    this.add("document-start", { documentId: crypto.randomUUID() });
    this.sample();
    this.timers.push(
      setInterval(this.sample, 125),
      setInterval(this.persist, 2000)
    );
    const on = (
      target: Window | Document,
      event: string,
      callback: EventListener
    ) => {
      target.addEventListener(event, callback, {
        capture: true,
        passive: true,
      });
      this.cleanups.push(() =>
        target.removeEventListener(event, callback, true)
      );
    };
    let lastInput = 0;
    for (const type of ["wheel", "scroll", "pointerdown", "keydown"])
      on(document, type, (event) => {
        if (Date.now() - lastInput < 100) return;
        lastInput = Date.now();
        // Only record that input happened; key values and target labels can contain secrets.
        this.add("input", {
          type: event.type,
          targetId:
            event.target instanceof Element ? this.id(event.target) : null,
        });
      });
    on(window, "error", () => this.add("error", { type: "window-error" }));
    on(window, "unhandledrejection", () =>
      this.add("error", { type: "unhandledrejection" })
    );
    on(window, "pagehide", this.persist);
    on(document, "visibilitychange", () => {
      this.add("visibility", { state: document.visibilityState });
      this.persist();
    });
  }
  mark() {
    this.sample();
    this.add("mark", {});
    this.persist();
    return this.read();
  }
  read() {
    return {
      version: 1,
      running: this.running,
      startedAt: this.startedAt,
      capturedAt: Date.now(),
      dropped: this.dropped,
      entries: this.entries.slice(),
    };
  }
  stop(clear = true) {
    this.running = false;
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.cleanups.forEach((fn) => fn());
    this.cleanups = [];
    if (clear) {
      this.entries = [];
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* optional storage */
      }
    } else this.persist();
  }
}
