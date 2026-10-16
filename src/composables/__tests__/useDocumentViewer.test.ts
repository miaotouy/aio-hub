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
import { effectScope, reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";
import JSZip from "jszip";
import { useDocumentViewer } from "../useDocumentViewer";
import { FODT_MIME, ODT_MIME } from "@/utils/openDocumentParser";

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

const source = `<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:h text:outline-level="1">阅读样例</text:h><text:p>中文正文</text:p></office:text></office:body></office:document>`;
const scopes: ReturnType<typeof effectScope>[] = [];
function viewer(options: Parameters<typeof useDocumentViewer>[0]) {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(() => useDocumentViewer(options))!;
}
async function packageDocument() {
  const zip = new JSZip();
  zip.file("content.xml", source);
  return zip.generateAsync({ type: "uint8array" });
}

afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.clearAllMocks();
});

describe("useDocumentViewer OpenDocument routing", () => {
  it("loads a ZIP-backed ODT from a filename hint into the rich-document preview", async () => {
    const bytes = await packageDocument();
    const state = viewer({
      content: bytes,
      fileName: "sample.ODT",
      fileTypeHint: "application/zip",
    });
    await vi.waitFor(() => expect(state.isLoading.value).toBe(false));
    expect(state.error.value).toBeNull();
    expect(state.mimeType.value).toBe(ODT_MIME);
    expect(state.isRichDocument.value).toBe(true);
    expect(state.language.value).toBe("html");
    expect(state.decodedContent.value).toContain("<h1>阅读样例</h1>");
    expect(state.rawContent.value).toEqual(bytes);
  });

  it("re-routes flat XML when only its filename changes", async () => {
    const options = reactive({ content: source, fileName: "sample.xml" });
    const state = viewer(options);
    await vi.waitFor(() => expect(state.isLoading.value).toBe(false));
    expect(state.isRichDocument.value).toBe(false);
    options.fileName = "sample.fodt";
    await vi.waitFor(() => expect(state.mimeType.value).toBe(FODT_MIME));
    await vi.waitFor(() => expect(state.isLoading.value).toBe(false));
    expect(state.decodedContent.value).toContain("<p>中文正文</p>");
    expect(state.isRichDocument.value).toBe(true);
  });

  it("reads an absolute ODT path through IPC and a stored asset through the asset manager", async () => {
    const bytes = await packageDocument();
    vi.mocked(invoke).mockResolvedValue(Array.from(bytes));
    const local = viewer({ filePath: "C:/Documents/sample.odt" });
    await vi.waitFor(() => expect(local.isLoading.value).toBe(false));
    expect(invoke).toHaveBeenCalledWith("read_file_binary", {
      path: "C:/Documents/sample.odt",
    });
    expect(local.mimeType.value).toBe(ODT_MIME);
    expect(local.decodedContent.value).toContain("中文正文");
    getAssetBinary.mockResolvedValue(bytes.buffer);
    const stored = viewer({ filePath: "documents/sample.odt" });
    await vi.waitFor(() => expect(stored.isLoading.value).toBe(false));
    expect(getAssetBinary).toHaveBeenCalledWith("documents/sample.odt");
    expect(stored.decodedContent.value).toContain("中文正文");
  });

  it("exposes a parsing error instead of passing corrupt ODT bytes to a text editor", async () => {
    const state = viewer({
      content: new Uint8Array([80, 75, 3, 4]),
      fileName: "broken.odt",
    });
    await vi.waitFor(() => expect(state.isLoading.value).toBe(false));
    expect(state.error.value).toContain("压缩包已损坏");
    expect(state.decodedContent.value).toBeNull();
  });
});
