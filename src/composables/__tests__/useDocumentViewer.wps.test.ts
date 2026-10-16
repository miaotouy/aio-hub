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

import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { flushPromises } from "@vue/test-utils";
import JSZip from "jszip";
import { useDocumentViewer } from "../useDocumentViewer";
import { DOCX_MIME, isWordDocumentAssetLike } from "@/utils/docxParser";
import { WPS_MIME, isWpsDocxContainer } from "@/utils/wps";
import {
  determineAssetType,
  inferMimeTypeFromHint,
} from "@/utils/fileTypeDetector";

// 与 Vite 中的文档查看器保持一致，使用接收 ArrayBuffer 的浏览器入口。
vi.mock(
  "mammoth",
  async () => await vi.importActual("mammoth/mammoth.browser.js")
);

const { getAssetBinary } = vi.hoisted(() => ({ getAssetBinary: vi.fn() }));
vi.mock("@/composables/useAssetManager", () => ({
  useAssetManager: () => ({ getAssetBinary }),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ debug: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

const scopes: ReturnType<typeof effectScope>[] = [];
function viewer(options: Parameters<typeof useDocumentViewer>[0]) {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() => useDocumentViewer(options))!;
}
const binaryWps = new Uint8Array([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);
async function docx() {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    "_rels/.rels",
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file(
    "word/document.xml",
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>WPS 中文正文</w:t></w:r></w:p></w:body></w:document>`
  );
  return zip.generateAsync({ type: "uint8array" });
}

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.resetAllMocks();
});

describe("WPS document preview", () => {
  it("renders an OOXML-backed WPS directly and keeps the original download bytes", async () => {
    const bytes = await docx();
    const state = viewer({
      content: bytes,
      fileName: "报告.WPS",
      fileTypeHint: "application/zip",
    });
    await vi.waitFor(() => expect(state.isLoading.value).toBe(false));
    expect(state.error.value).toBeNull();
    expect(state.mimeType.value).toBe(DOCX_MIME);
    expect(state.decodedContent.value).toContain("<p>WPS 中文正文</p>");
    expect(state.isRichDocument.value).toBe(true);
    expect(state.rawContent.value).toEqual(bytes);
    expect(invoke).not.toHaveBeenCalled();
    expect(isWordDocumentAssetLike({ name: "报告.WPS", type: "other" })).toBe(
      true
    );
    expect(inferMimeTypeFromHint("报告.wps")).toBe(WPS_MIME);
    expect(determineAssetType(WPS_MIME)).toBe("document");
  });

  it("converts an existing WPS asset by relative path while retaining its source bytes", async () => {
    const converted = await docx();
    getAssetBinary.mockResolvedValue(binaryWps.buffer);
    vi.mocked(invoke).mockImplementation(async (command) => {
      if (command === "convert_legacy_document") return "C:/temp/报告.docx";
      if (command === "read_file_binary") return Array.from(converted);
      throw new Error(`Unexpected command: ${command}`);
    });
    const state = viewer({
      filePath: "documents/报告.wps",
      fileName: "报告.docx",
      fileTypeHint: DOCX_MIME,
    });
    await vi.waitFor(() => expect(state.isLoading.value).toBe(false));
    expect(state.error.value).toBeNull();
    expect(invoke).toHaveBeenCalledWith("convert_legacy_document", {
      path: "documents/报告.wps",
    });
    expect(state.decodedContent.value).toContain("WPS 中文正文");
    expect(state.isRichDocument.value).toBe(true);
    expect(state.language.value).toBe("html");
    expect(state.rawContent.value).toEqual(binaryWps);
  });

  it("surfaces converter configuration errors without trying to render binary data", async () => {
    getAssetBinary.mockResolvedValue(binaryWps.buffer);
    vi.mocked(invoke).mockRejectedValue(
      new Error("请在文档转换设置中配置 LibreOffice")
    );
    const state = viewer({ filePath: "documents/report.wps" });
    await vi.waitFor(() => expect(state.isLoading.value).toBe(false));
    expect(state.error.value).toContain("文档转换设置");
    expect(state.decodedContent.value).toBeNull();
  });

  it("explains the local-file requirement for binary content without a path", async () => {
    const state = viewer({ content: binaryWps, fileName: "report.wps" });
    await vi.waitFor(() => expect(state.isLoading.value).toBe(false));
    expect(state.error.value).toContain("本地文件导入");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("does not send a different ZIP document to the DOCX parser", async () => {
    const zip = new JSZip();
    zip.file("xl/workbook.xml", "<workbook/>");
    zip.file("[Content_Types].xml", "<Types/>");
    expect(
      await isWpsDocxContainer(await zip.generateAsync({ type: "uint8array" }))
    ).toBe(false);
  });

  it("keeps the newly selected document when an earlier WPS conversion fails late", async () => {
    let rejectConversion!: (reason: Error) => void;
    vi.mocked(invoke).mockImplementation(
      async () =>
        await new Promise((_, reject) => {
          rejectConversion = reject;
        })
    );
    const options = reactive({
      content: binaryWps,
      filePath: "C:/report.wps",
      fileName: "report.wps",
    });
    const state = viewer(options);
    await vi.waitFor(() => expect(rejectConversion).toBeTypeOf("function"));
    options.content = Uint8Array.from(new TextEncoder().encode("new text"));
    options.filePath = "";
    options.fileName = "new.txt";
    await nextTick();
    await vi.waitFor(() => expect(state.decodedContent.value).toBe("new text"));
    rejectConversion(new Error("earlier conversion failed"));
    await flushPromises();
    expect(state.decodedContent.value).toBe("new text");
    expect(state.error.value).toBeNull();
    expect(state.isLoading.value).toBe(false);
    expect(state.isRichDocument.value).toBe(false);
  });
});
