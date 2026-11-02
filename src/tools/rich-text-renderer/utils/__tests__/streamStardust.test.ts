// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h, nextTick, ref } from "vue";
import { createStreamStardust, type StreamEffect } from "../streamStardust";
import { STREAM_EFFECT_OPTIONS } from "../streamEffectStyles";
import { createStreamTextTint } from "../streamTextTint";
import { useStreamStardust } from "../../composables/useStreamStardust";

let highlights: Map<string, Set<Range>>;
let root: HTMLDivElement;
let queue: Map<number, FrameRequestCallback>;
let id = 0;
let dispose: (() => void) | undefined;
const box = (x = 100, y = 100, width = 400, height = 120) =>
  new DOMRect(x, y, width, height);
const flush = async () => {
  await Promise.resolve();
  await nextTick();
  await Promise.resolve();
};
function frame(now: number) {
  const callbacks = [...queue.values()];
  queue.clear();
  for (const callback of callbacks) callback(now);
}
function paragraph(text: string) {
  const p = document.createElement("p");
  p.className = "markdown-paragraph";
  p.append(document.createTextNode(text));
  root.append(p);
  return p.firstChild as Text;
}
beforeEach(() => {
  queue = new Map();
  highlights = new Map();
  vi.stubGlobal("CSS", { highlights, supports: () => true });
  vi.stubGlobal("Highlight", class extends Set<Range> {});
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
    queue.set(++id, cb);
    return id;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
    queue.delete(id);
  });
  const context = {
    setTransform() {},
    clearRect() {},
    fillRect() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    closePath() {},
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    fill() {},
    strokeRect() {},
    bezierCurveTo() {},
    quadraticCurveTo() {},
    ellipse() {},
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
  if (!Range.prototype.getClientRects) {
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () => [],
    });
  }
  vi.spyOn(Range.prototype, "getClientRects").mockReturnValue([
    box(110, 110, 100, 22),
  ] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    () => box()
  );
  root = document.createElement("div");
  document.body.append(root);
});
afterEach(() => {
  dispose?.();
  dispose = undefined;
  root?.remove();
  document.getSelection()?.removeAllRanges();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Every supported painter must preserve native selection and complete its resource lifecycle.
it.each(
  STREAM_EFFECT_OPTIONS.filter((option) => option.value !== "none").map(
    (option) => option.value
  )
)(
  "%s decorates appended prose while preserving selection and draining on finish",
  async (mode) => {
    const text = paragraph("已经存在的文字");
    const selection = document.getSelection()!;
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 4);
    selection.addRange(range);
    const effect = createStreamStardust(root, mode);
    dispose = effect.destroy;
    text.appendData("，新增的一句回答。");
    await flush();
    frame(100);
    expect(effect.stats.emissions).toBeGreaterThan(0);
    expect(effect.stats.tintedRanges).toBeGreaterThan(0);
    const colored = [...highlights.values()].flatMap((ranges) => [...ranges]);
    expect(colored.length).toBeGreaterThan(0);
    for (const coloredRange of colored) {
      expect(coloredRange.startContainer).toBe(text);
      expect(coloredRange.startOffset).toBeGreaterThanOrEqual(
        "已经存在的文字".length
      );
    }
    expect(document.querySelector("canvas")).not.toBeNull();
    expect(root.textContent).toBe("已经存在的文字，新增的一句回答。");
    expect(selection.toString()).toBe("已经存在");
    expect(root.querySelectorAll("span, canvas")).toHaveLength(0);
    effect.finish();
    const emissions = effect.stats.emissions;
    text.appendData("最终整理");
    await flush();
    frame(200);
    frame(1400);
    expect(effect.stats.emissions).toBe(emissions);
    expect(effect.stats.canvasPixels).toBe(0);
    expect(queue.size).toBe(0);
    expect(highlights.size).toBe(0);
    expect(document.querySelector("style[data-stream-text-tint]")).toBeNull();
  }
);

it("bounds decoration work during repeated large chunks and releases all scheduled work on destroy", async () => {
  const effect = createStreamStardust(root, "stardust-vivid");
  dispose = effect.destroy;
  for (let batch = 0; batch < 12; batch++) {
    for (let i = 0; i < 100; i++) {
      const text = paragraph(`突发文本 ${batch} ${i}`);
      text.parentElement!.style.color = `rgb(${(i % 12) * 20}, 100, 180)`;
    }
    await flush();
    expect(effect.stats.pendingTexts).toBeLessThanOrEqual(32);
    frame(100 + batch * 80);
    expect(effect.stats.tintedRanges).toBeLessThanOrEqual(48);
    expect(highlights.size).toBeLessThanOrEqual(128);
  }
  expect(effect.stats.peakParticles).toBeGreaterThan(0);
  expect(effect.stats.peakParticles).toBeLessThanOrEqual(160);
  effect.destroy();
  paragraph("销毁后继续更新正文");
  await flush();
  expect(effect.stats.canvasPixels).toBe(0);
  expect(queue.size).toBe(0);
  expect(highlights.size).toBe(0);
  expect(document.querySelector("style[data-stream-text-tint]")).toBeNull();
});

it("honors live motion preferences and feature toggles without replaying static history", async () => {
  let reduce = true;
  let onChange = () => {};
  vi.stubGlobal(
    "matchMedia",
    () =>
      ({
        get matches() {
          return reduce;
        },
        addEventListener: (_event: string, callback: () => void) => {
          onChange = callback;
        },
        removeEventListener() {},
      }) as unknown as MediaQueryList
  );
  const mode = ref<StreamEffect>("stardust");
  const active = ref(true),
    streaming = ref(true);
  const component = mount(
    defineComponent({
      setup() {
        useStreamStardust(
          ref(root),
          () => mode.value,
          () => active.value,
          () => streaming.value
        );
        return () => h("div");
      },
    })
  );
  dispose = () => component.unmount();
  paragraph("减少动态效果时收到的文字");
  await flush();
  frame(100);
  expect(queue.size).toBe(0);
  reduce = false;
  onChange();
  await flush();
  const text = paragraph("开启后的新文字");
  await flush();
  frame(200);
  expect(document.querySelector("canvas")).not.toBeNull();
  const previousCanvas = document.querySelector("canvas")!;
  mode.value = "petals";
  await flush();
  text.appendData("切换为花瓣，继续输出");
  await flush();
  frame(250);
  expect(previousCanvas.isConnected).toBe(false);
  expect(document.querySelector("canvas")).not.toBeNull();
  active.value = false;
  await flush();
  expect(queue.size).toBe(0);
  expect(document.querySelector("canvas")).toBeNull();
  expect(highlights.size).toBe(0);
  active.value = true;
  streaming.value = false;
  await flush();
  text.appendData("静态更新");
  await flush();
  frame(300);
  expect(queue.size).toBe(0);
  streaming.value = true;
  await flush();
  text.appendData("继续生成");
  await flush();
  frame(400);
  expect(document.querySelector("canvas")).not.toBeNull();
  mode.value = "none";
  await flush();
  expect(queue.size).toBe(0);
  expect(document.querySelector("canvas")).toBeNull();
  expect(highlights.size).toBe(0);
});

it("keeps simultaneous renderers independent when one text tint is destroyed", async () => {
  const other = document.createElement("div");
  document.body.append(other);
  const first = createStreamStardust(root, "petals");
  const second = createStreamStardust(other, "scan");
  dispose = () => {
    first.destroy();
    second.destroy();
    other.remove();
  };
  paragraph("花瓣里的文字");
  other.innerHTML = '<p class="markdown-paragraph">扫描中的文字</p>';
  await flush();
  frame(100);
  expect(highlights.size).toBe(32);
  first.destroy();
  expect(highlights.size).toBe(16);
  expect(
    [...highlights.values()]
      .flatMap((ranges) => [...ranges])
      .every((range) => other.contains(range.startContainer))
  ).toBe(true);
  second.finish();
  frame(1600);
  expect(highlights.size).toBe(0);
  expect(document.querySelector("style[data-stream-text-tint]")).toBeNull();
});

it("retains particle effects when native text highlighting is unavailable", async () => {
  vi.stubGlobal("Highlight", undefined);
  const effect = createStreamStardust(root, "scan");
  dispose = effect.destroy;
  paragraph("兼容环境中的新增文字");
  await flush();
  frame(100);
  expect(effect.stats.emissions).toBeGreaterThan(0);
  expect(effect.stats.tintedRanges).toBe(0);
  expect(root.textContent).toBe("兼容环境中的新增文字");
  expect(highlights.size).toBe(0);
});

it("keeps glyph coverage through Vue-style text updates and drops rewritten glyphs", () => {
  const text = paragraph("已有文字，新内容✨");
  const tint = createStreamTextTint(root, "petals");
  dispose = tint.clear;
  tint.add(text, 5, text.length, 100);
  tint.paint(240);
  const coloredText = () =>
    [...highlights.values()]
      .flatMap((ranges) => [...ranges])
      .sort((a, b) => a.startOffset - b.startOffset)
      .map((range) => range.toString())
      .join("");
  expect(coloredText()).toBe("新内容✨");
  text.data += "后续流式文字";
  tint.paint(280);
  expect(coloredText()).toBe("新内容✨");
  const next = document.createTextNode(text.data + "继续生成");
  text.replaceWith(next);
  tint.replaceText(text, next);
  tint.paint(300);
  expect(coloredText()).toBe("新内容✨");
  next.data = "完全重新解析后的正文";
  tint.paint(340);
  expect(tint.size).toBe(0);
  expect(highlights.size).toBe(0);
});

// HTML can replace its complete subtree while only appending visible prose.
it.each([
  "markdown-html-block",
  "markdown-html-inline",
  "generic-node-wrapper",
  "pure-markdown-renderer",
])(
  "%s decorates only new HTML prose across whole-subtree replacements",
  async (className) => {
    const container = document.createElement("div");
    container.className = className;
    const content = (suffix: string) =>
      `<section data-node-id="html-test"><h3>已有标题</h3><p><span>已有正文${suffix}</span></p><style>.sample { color: red }</style><script>const sample = 1</script><pre>源码${suffix}</pre><button>按钮${suffix}</button><form><label>表单${suffix}</label><input value="保留输入"></form><div contenteditable="true">编辑区${suffix}</div></section>`;
    container.innerHTML = content("");
    root.append(container);
    const effect = createStreamStardust(root, "scan");
    dispose = effect.destroy;
    container.innerHTML = content("新增文字");
    await flush();
    frame(100);
    frame(230);
    const ranges = [...highlights.values()].flatMap((set) => [...set]);
    expect(ranges.length).toBeGreaterThan(0);
    for (const range of ranges) {
      expect(range.startContainer).toBe(
        container.querySelector("p span")!.firstChild
      );
      expect(range.startOffset).toBeGreaterThanOrEqual("已有正文".length);
    }
    expect(container.querySelector("input")!.value).toBe("保留输入");
    effect.finish();
    frame(1600);
    expect(highlights.size).toBe(0);
    expect(queue.size).toBe(0);
  }
);

it("seeds an HTML document from previous prose and survives auto-height resizing", async () => {
  root.innerHTML =
    "<h2>已有标题</h2><p>已有正文新增内容</p><button>操作按钮</button>";
  const effect = createStreamStardust(root, "petals", {
    html: true,
    previousText: ["已有标题", "已有正文"],
  });
  dispose = effect.destroy;
  frame(100);
  frame(250);
  const ranges = [...highlights.values()].flatMap((set) => [...set]);
  expect(ranges.length).toBeGreaterThan(0);
  for (const range of ranges) {
    expect(range.startContainer).toBe(root.querySelector("p")!.firstChild);
    expect(range.startOffset).toBeGreaterThanOrEqual("已有正文".length);
  }
  window.dispatchEvent(new Event("resize"));
  expect(effect.stats.tintedRanges).toBeGreaterThan(0);
  frame(350);
  vi.stubGlobal("innerWidth", window.innerWidth + 40);
  window.dispatchEvent(new Event("resize"));
  expect(effect.stats.tintedRanges).toBe(0);
  effect.destroy();
  expect(highlights.size).toBe(0);
  expect(queue.size).toBe(0);
});
