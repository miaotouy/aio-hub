import { createSSRApp, h, type Component } from "vue";
import { renderToString } from "vue/server-renderer";
import { describe, expect, it } from "vitest";
import * as toolIcons from "../src";
import { LlmChatIcon } from "../src";

async function render(icon: Component, props: Record<string, unknown> = {}) {
  return renderToString(createSSRApp({ render: () => h(icon, props) }));
}

function attr(markup: string, name: string): string | undefined {
  return markup.match(new RegExp(`<svg[^>]*\\s${name}="([^"]*)"`))?.[1];
}

// 图标组件均为大驼峰命名，排除 createToolIcon 等工具函数
const iconEntries = Object.entries(toolIcons).filter(
  ([name, value]) => /^[A-Z]\w*Icon$/.test(name) && typeof value === "function"
) as Array<[string, Component]>;

describe("工具图标组件参数与 Lucide 一致", () => {
  it("默认渲染为 24 网格的线性装饰图标", async () => {
    const markup = await render(LlmChatIcon);

    expect(attr(markup, "viewBox")).toBe("0 0 24 24");
    expect(attr(markup, "width")).toBe("24");
    expect(attr(markup, "height")).toBe("24");
    expect(attr(markup, "fill")).toBe("none");
    expect(attr(markup, "stroke")).toBe("currentColor");
    expect(attr(markup, "stroke-width")).toBe("2");
    expect(attr(markup, "aria-hidden")).toBe("true");
  });

  it("响应调用处传入的 size、color 和两种写法的线宽", async () => {
    const camel = await render(LlmChatIcon, {
      size: 16,
      color: "red",
      strokeWidth: 1.5,
    });
    // 模板里写 :stroke-width 时以短横线形式传入
    const kebab = await render(LlmChatIcon, { "stroke-width": 2.5 });

    expect(attr(camel, "width")).toBe("16");
    expect(attr(camel, "height")).toBe("16");
    expect(attr(camel, "stroke")).toBe("red");
    expect(attr(camel, "stroke-width")).toBe("1.5");
    expect(attr(kebab, "stroke-width")).toBe("2.5");
  });

  it("absoluteStrokeWidth 按尺寸换算，保持屏幕上的线宽", async () => {
    const markup = await render(LlmChatIcon, {
      size: 48,
      absoluteStrokeWidth: true,
    });

    expect(attr(markup, "stroke-width")).toBe("1");
  });

  it("保留调用处的 class 与 style，带 aria 标签时不再标记为装饰", async () => {
    const markup = await render(LlmChatIcon, {
      class: "title-icon",
      style: { verticalAlign: "middle" },
      "aria-label": "LLM 对话",
    });
    const classes = attr(markup, "class")?.split(/\s+/) ?? [];

    expect(classes.filter((name) => name === "title-icon")).toHaveLength(1);
    expect(classes).toContain("aiohub-icon-llm-chat");
    expect(attr(markup, "style")).toContain("vertical-align:middle");
    expect(attr(markup, "aria-label")).toBe("LLM 对话");
    expect(markup).not.toContain('aria-hidden="true"');
  });
});

describe("共享图标集符合绘制规范", () => {
  const allowedElements = new Set([
    "path",
    "rect",
    "circle",
    "ellipse",
    "line",
    "polyline",
    "polygon",
  ]);

  it("导出了全部图标", () => {
    expect(iconEntries.length).toBeGreaterThan(0);
  });

  it.each(iconEntries)(
    "%s 只使用单色线性基本图形",
    async (_name, icon) => {
      const markup = await render(icon);
      const inner = markup.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
      const elements = [...inner.matchAll(/<([a-z]+)\b/g)].map((m) => m[1]);
      const colors = [...inner.matchAll(/\s(?:fill|stroke)="([^"]*)"/g)].map(
        (m) => m[1]
      );

      expect(attr(markup, "viewBox")).toBe("0 0 24 24");
      expect(elements.length).toBeGreaterThan(0);
      expect(elements.every((element) => allowedElements.has(element))).toBe(
        true
      );
      expect(
        colors.every((color) => color === "none" || color === "currentColor")
      ).toBe(true);
    }
  );

  it("没有两个图标画成同一个图形", async () => {
    const shapes = new Map<string, string>();
    for (const [name, icon] of iconEntries) {
      const inner = (await render(icon)).replace(/^<svg[^>]*>/, "");
      const duplicate = shapes.get(inner);
      expect(duplicate, `${name} 与 ${duplicate} 图形相同`).toBeUndefined();
      shapes.set(inner, name);
    }
  });
});
