// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  openDocumentToHtml,
  isOpenDocumentTextAssetLike,
  ODT_MIME,
  OTT_MIME,
  FODT_MIME,
} from "../openDocumentParser";
import {
  detectMimeTypeFromBuffer,
  determineAssetType,
  inferMimeTypeFromHint,
} from "../fileTypeDetector";

function xml(body: string, styles = ""): string {
  return `<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
    xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
    xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
    xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
    xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
    xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
    xmlns:xlink="http://www.w3.org/1999/xlink">
    <office:automatic-styles>${styles}</office:automatic-styles>
    <office:body><office:text>${body}</office:text></office:body></office:document>`;
}

async function odt(
  content: string,
  mime: string = ODT_MIME
): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file("mimetype", mime);
  zip.file("content.xml", content);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function readHtml(html: string): HTMLDivElement {
  const result = document.createElement("div");
  result.innerHTML = html;
  return result;
}

describe("OpenDocument text preview", () => {
  it("renders packaged text, inherited formatting, lists, merged and repeated table cells, and embedded images", async () => {
    const zip = new JSZip();
    zip.file(
      "content.xml",
      xml(
        `
      <text:h text:outline-level="2">项目说明</text:h>
      <text:p>A &amp; B<text:s text:c="2"/>C<text:tab/>D<text:line-break/>
        <text:span text:style-name="Emphasis">重点</text:span></text:p>
      <text:list text:style-name="Numbered"><text:list-item><text:p>步骤一</text:p></text:list-item></text:list>
      <table:table><table:table-row table:number-rows-repeated="2">
        <table:table-cell table:number-columns-spanned="2"><text:p>合并</text:p></table:table-cell>
        <table:covered-table-cell/>
        <table:table-cell table:number-columns-repeated="2"><text:p>数据</text:p></table:table-cell>
      </table:table-row></table:table>
      <draw:frame draw:name="示意图"><draw:image xlink:href="./Pictures/sample.png"/></draw:frame>
    `,
        `<style:style style:name="Emphasis" style:family="text" style:parent-style-name="Base">
      <style:text-properties fo:font-style="italic"/></style:style>
      <text:list-style style:name="Numbered"><text:list-level-style-number text:level="1"/></text:list-style>`
      )
    );
    zip.file(
      "styles.xml",
      xml(
        "",
        `<style:style style:name="Base" style:family="text">
      <style:text-properties fo:font-weight="bold"/></style:style>`
      )
    );
    zip.file("Pictures/sample.png", new Uint8Array([137, 80, 78, 71]));
    const html = readHtml(
      await openDocumentToHtml(await zip.generateAsync({ type: "uint8array" }))
    );
    expect(html.querySelector("h2")?.textContent).toBe("项目说明");
    expect(html.querySelector("p")?.textContent).toContain(
      "A & B\u00a0\u00a0C\u00a0\u00a0\u00a0\u00a0D"
    );
    expect(html.querySelector("p br")).not.toBeNull();
    expect(html.querySelector("span")?.style.fontWeight).toBe("bold");
    expect(html.querySelector("span")?.style.fontStyle).toBe("italic");
    expect(html.querySelector("ol li")?.textContent).toBe("步骤一");
    expect(html.querySelectorAll("tr")).toHaveLength(2);
    expect(html.querySelectorAll("tr:first-child td")).toHaveLength(3);
    expect(html.querySelector("td")?.colSpan).toBe(2);
    expect(html.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,iVBORw=="
    );
    expect(html.querySelector("img")?.alt).toBe("示意图");
  });

  it("renders flat XML documents and inline raster images", async () => {
    const content =
      xml(`<text:p>平面文档</text:p><draw:frame><draw:image draw:mime-type="image/png">
      <office:binary-data>iVBORw==</office:binary-data></draw:image></draw:frame>`);
    const html = readHtml(
      await openDocumentToHtml(new TextEncoder().encode(content))
    );
    expect(html.querySelector("p")?.textContent).toBe("平面文档");
    expect(html.querySelector("img")?.getAttribute("src")).toBe(
      "data:image/png;base64,iVBORw=="
    );
  });

  it("retains safe links and escapes document text while keeping external resources inert", async () => {
    const content = xml(`<text:p>&lt;img src=x onerror=alert(1)&gt;
      <text:a xlink:href="https://example.com">资料</text:a>
      <text:a xlink:href="javascript:alert(1)">危险链接</text:a></text:p>
      <draw:frame><draw:image xlink:href="https://example.com/tracker.png"/></draw:frame>
      <office:scripts><text:p>脚本内容</text:p></office:scripts>`);
    const html = readHtml(await openDocumentToHtml(await odt(content)));
    expect(html.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(
      Array.from(html.querySelectorAll("a")).map((a) => a.getAttribute("href"))
    ).toEqual(["https://example.com", null]);
    expect(html.querySelector("a")?.rel).toBe("noopener noreferrer");
    expect(html.querySelectorAll("img, script")).toHaveLength(0);
    expect(html.textContent).not.toContain("脚本内容");
  });

  it("reports encrypted packages, missing bodies, and corrupt XML", async () => {
    const zip = new JSZip();
    zip.file(
      "META-INF/manifest.xml",
      `<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0"><manifest:encryption-data/></manifest:manifest>`
    );
    await expect(
      openDocumentToHtml(await zip.generateAsync({ type: "uint8array" }))
    ).rejects.toThrow("已加密");
    await expect(
      openDocumentToHtml(
        await new JSZip().generateAsync({ type: "uint8array" })
      )
    ).rejects.toThrow("content.xml");
    await expect(
      openDocumentToHtml(new TextEncoder().encode("<broken>"))
    ).rejects.toThrow("XML 已损坏");
    await expect(
      openDocumentToHtml(new TextEncoder().encode("<document/>"))
    ).rejects.toThrow("正文");
  });

  it("bounds compressed repetition before creating a huge preview", async () => {
    await expect(
      openDocumentToHtml(
        await odt(xml('<text:p><text:s text:c="999999999"/></text:p>'))
      )
    ).rejects.toThrow("数量过大");
  });

  it.each([
    ["odt", ODT_MIME],
    ["ott", OTT_MIME],
    ["fodt", FODT_MIME],
  ])("classifies %s as a previewable document", async (extension, mime) => {
    expect(inferMimeTypeFromHint(`sample.${extension}`)).toBe(mime);
    expect(determineAssetType(mime)).toBe("document");
    expect(
      isOpenDocumentTextAssetLike({
        name: `sample.${extension}`,
        mimeType: "application/zip",
      })
    ).toBe(true);
    const bytes =
      extension === "fodt"
        ? new TextEncoder().encode(xml("<text:p>内容</text:p>"))
        : await odt(xml("<text:p>内容</text:p>"), mime);
    expect(await detectMimeTypeFromBuffer(bytes, `sample.${extension}`)).toBe(
      mime
    );
    if (extension !== "fodt") {
      const genericZip = new JSZip();
      genericZip.file("content.xml", xml("<text:p>内容</text:p>"));
      expect(
        await detectMimeTypeFromBuffer(
          await genericZip.generateAsync({ type: "uint8array" }),
          `sample.${extension}`
        )
      ).toBe(mime);
    }
  });
});
