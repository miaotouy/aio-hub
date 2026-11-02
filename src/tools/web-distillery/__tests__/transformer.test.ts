import { afterEach, describe, expect, it, vi } from "vitest";
import Defuddle from "defuddle";
import { Readability } from "@mozilla/readability";
import MarkdownIt from "markdown-it";
import { Transformer } from "../core/transformer";
import { extractLocalContent } from "../core/engines/local";
import { recipeStore } from "../core/recipe-store";
import { Extractor } from "../core/stages/extractor";
import { Converter } from "../core/stages/converter";
import type { SiteRecipe } from "../types";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const parse = (html: string) =>
  new DOMParser().parseFromString(html, "text/html");
const normalize = (text: string | null) => (text || "").replace(/\s+/g, "");
const recipe: SiteRecipe = {
  id: "document",
  name: "Document",
  domain: "example.com",
  createdAt: "2026-10-18",
  updatedAt: "2026-10-18",
  useCount: 0,
};

afterEach(() => vi.restoreAllMocks());

describe("local document extraction", () => {
  // 本地输入应以文件扩展名分流，Markdown/纯文本中的标记与换行须完整保留。
  it.each([
    [
      "clipboard.md",
      "# 标题\n\n含有 <示例>、**强调** 和 [链接](https://example.com)",
      "markdown",
    ],
    ["clipboard.txt", "第一行\n第二行 <保留文本>\n第三行", "text"],
  ])(
    "preserves pasted local content from %s",
    async (fileName, content, format) => {
      vi.spyOn(recipeStore, "findBestMatch").mockResolvedValue(null);
      const result = await extractLocalContent(content, fileName, {
        format: format as "markdown" | "text",
      });
      expect(new URL(result.url).pathname).toBe(`/${fileName}`);
      expect(result.content).toBe(content);
      expect(result.format).toBe(format);
    }
  );

  it("preserves Office document sections, merged cells, footnotes and split title through Markdown rendering", async () => {
    const sections = ["一、人工智能", "二、生物医药", "三、光伏"];
    const html = `<html><head><title></title><meta name="generator" content="LibreOffice 7.6"></head><body>
      <p>附件1</p><p align="center"><font style="font-size:18pt">技术范围</font></p>
      <p align="center"><font style="font-size:18pt">（征求意见稿）</font></p>
      ${sections
        .map(
          (section, i) => `<p align="center">${section}</p>
        <table><tr><th>类别</th><th>要求</th></tr>
        <tr><td rowspan="2">${section}</td><td><p>第一项要求：${"保留完整技术描述。".repeat(12)}</p></td></tr>
        <tr><td><p>第二项要求${i}</p><p>独立的说明段落</p></td></tr></table>`
        )
        .join("")}
      <p>脚注引用<a name="note-ref" href="#note-text">1</a></p>
      <div id="footnote"><p><a name="note-text" href="#note-ref">1</a> 技术术语解释。</p></div>
    </body></html>`;
    const result = await new Transformer().transform(html, {
      url: "https://example.com/document.html",
      format: "markdown",
    });
    const rendered = parse(
      new MarkdownIt({ html: true }).render(result.content)
    );
    const original = parse(html);
    expect(result.title).toBe("技术范围（征求意见稿）");
    expect(normalize(rendered.body.textContent)).toBe(
      normalize(original.body.textContent)
    );
    expect(rendered.querySelectorAll("table")).toHaveLength(3);
    expect(rendered.querySelectorAll('td[rowspan="2"]')).toHaveLength(3);
    expect(
      Array.from(rendered.querySelectorAll("td, th"), (cell) =>
        normalize(cell.textContent)
      )
    ).toEqual(
      Array.from(original.querySelectorAll("td, th"), (cell) =>
        normalize(cell.textContent)
      )
    );
    expect(rendered.querySelector('a[href="#note-text"]')).not.toBeNull();
    expect(rendered.getElementById("note-text")).not.toBeNull();
    expect(rendered.getElementById("note-ref")).not.toBeNull();
  });

  it("keeps explicit selectors and programmatic recipes ahead of generic extraction", () => {
    const doc = parse(
      '<h1>文档标题</h1><article id="chosen"><p>选定正文</p></article><p>其他内容</p>'
    );
    const selected = new Extractor().process(doc, ["#chosen"]);
    expect(selected.title).toBe("文档标题");
    expect(selected.mainElement.textContent).toBe("选定正文");
    const markdown = "## 配方正文\n\n" + "配方返回的完整内容。".repeat(10);
    const evaluated = new Extractor().process(
      doc,
      ["#chosen"],
      { title: "脚本标题" },
      {
        ...recipe,
        evaluatorFn: () => markdown,
      }
    );
    expect(evaluated.title).toBe("脚本标题");
    expect(new Converter().process(evaluated.mainElement, "markdown")).toBe(
      markdown
    );
  });

  it.each(["empty", "error"])(
    "falls back to Readability when Defuddle returns %s",
    (failure) => {
      const doc = parse(
        `<title>文章</title><article><h1>文章</h1><p>${"有标点的正文内容。".repeat(80)}</p></article>`
      );
      const expected = new Readability(doc.cloneNode(true) as Document).parse();
      expect(expected?.content).toBeTruthy();
      vi.spyOn(Defuddle.prototype, "parse").mockImplementation(() => {
        if (failure === "error") throw new Error("Extraction failed");
        return { content: "<p> </p>" } as ReturnType<Defuddle["parse"]>;
      });
      const result = new Extractor().process(doc);
      expect(result.mainElement.innerHTML).toBe(expected?.content);
    }
  );

  it("uses the original body if both generic extractors fail", () => {
    vi.spyOn(Defuddle.prototype, "parse").mockImplementation(() => {
      throw new Error("Defuddle failed");
    });
    vi.spyOn(Readability.prototype, "parse").mockImplementation(() => {
      throw new Error("Readability failed");
    });
    const result = new Extractor().process(
      parse("<h1>短文</h1><p>应保留的内容</p>")
    );
    expect(result.title).toBe("短文");
    expect(result.mainElement.textContent).toBe("短文应保留的内容");
  });
});

describe("Markdown conversion", () => {
  it.each([0, 2])(
    "preserves rowspan=%s, including spans to the end of a row group",
    (rowspan) => {
      const source = parse(
        `<table><tr><td rowspan="${rowspan}">类别</td><td>要求一</td></tr><tr><td>要求二</td></tr></table>`
      ).body;
      const rendered = parse(
        new MarkdownIt({ html: true }).render(
          new Converter().process(source, "markdown")
        )
      );
      expect(rendered.querySelector("td")?.getAttribute("rowspan")).toBe(
        String(rowspan)
      );
      expect(
        Array.from(rendered.querySelectorAll("td"), (cell) => cell.textContent)
      ).toEqual(["类别", "要求一", "要求二"]);
    }
  );

  it("preserves paragraph boundaries and ordinary links", () => {
    const source = parse(
      '<div><p>第一段 <a href="https://example.com/">来源</a></p><p>第二段</p></div>'
    ).body;
    const result = new Converter().process(source, "markdown");
    expect(result).toBe("第一段 [来源](https://example.com/)\n\n第二段");
  });

  it("keeps simple tables as Markdown with literal pipes inside cells", () => {
    const source = parse(
      "<table><tr><th>类型</th><th>说明</th></tr><tr><td>A|B</td><td><p>段一</p><p>段二</p></td></tr></table>"
    ).body;
    const result = new Converter().process(source, "markdown");
    const rendered = parse(new MarkdownIt({ html: true }).render(result));
    expect(rendered.querySelectorAll("td")).toHaveLength(2);
    expect(rendered.querySelector("td")?.textContent).toBe("A|B");
    expect(rendered.querySelector("td + td")?.innerHTML).toBe("段一<br>段二");
  });

  it("keeps spanning table structure, strips active HTML and applies clean mode inside tables", () => {
    const source =
      parse(`<table onclick="alert(1)"><tr><th colspan="2">要求</th></tr>
      <tr><td><a href="https://example.com/">来源</a></td><td><img src="https://example.com/image.png" onerror="alert(1)"><script>alert(1)</script></td></tr></table>`).body;
    const converter = new Converter();
    const ordinary = parse(converter.process(source, "markdown"));
    expect(ordinary.querySelector("th")?.getAttribute("colspan")).toBe("2");
    expect(ordinary.querySelector("a")?.getAttribute("href")).toBe(
      "https://example.com/"
    );
    expect(ordinary.querySelector("script, [onclick], [onerror]")).toBeNull();
    converter.setCleanMode(true);
    const clean = parse(converter.process(source, "markdown"));
    expect(clean.querySelector("th")?.getAttribute("colspan")).toBe("2");
    expect(clean.body.textContent).toContain("来源");
    expect(clean.body.textContent).toContain("[图片]");
    expect(clean.querySelector("a, img")).toBeNull();
    expect(source.querySelector("a")).not.toBeNull();
  });
});
