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

import { describe, it, expect } from "vitest";
import {
  showOpenDialog,
  showOpenFile,
  showOpenDirectory,
  showSaveDialog,
  writeClipboardText,
  readClipboardText,
  openExternalUrl,
  revealInFileManager,
  openPathWithDefaultApp,
  isCurrentWindowMaximized,
} from "./index";

describe("Platform Modules (Node / Test Fallback)", () => {
  it("showOpenDialog 在无 GUI 测试环境下返回 null", async () => {
    const result = await showOpenDialog();
    expect(result).toBeNull();
  });

  it("showOpenFile 在无 GUI 测试环境下返回 null", async () => {
    const result = await showOpenFile();
    expect(result).toBeNull();
  });

  it("showOpenDirectory 在无 GUI 测试环境下返回 null", async () => {
    const result = await showOpenDirectory();
    expect(result).toBeNull();
  });

  it("showSaveDialog 在无 GUI 测试环境下返回 null", async () => {
    const result = await showSaveDialog();
    expect(result).toBeNull();
  });

  it("readClipboardText 在无 window/navigator 环境下返回空字符串", async () => {
    const text = await readClipboardText();
    expect(text).toBe("");
  });

  it("writeClipboardText 在无环境时不抛出致命异常", async () => {
    await expect(writeClipboardText("hello")).resolves.toBeUndefined();
  });

  it("openExternalUrl 在 node 环境下优雅降级", async () => {
    await expect(openExternalUrl("https://example.com")).resolves.toBeUndefined();
  });

  it("revealInFileManager 与 openPathWithDefaultApp 在非 Tauri 环境下无操作", async () => {
    await expect(revealInFileManager("/tmp/test.txt")).resolves.toBeUndefined();
    await expect(openPathWithDefaultApp("/tmp/test.txt")).resolves.toBeUndefined();
  });

  it("isCurrentWindowMaximized 在非 Tauri 环境下返回 false", async () => {
    const max = await isCurrentWindowMaximized();
    expect(max).toBe(false);
  });

  it("joinPath 支持多段拼接并在无 Tauri 下正常 fallback", async () => {
    const p = await (await import("./index")).joinPath("a", "b", "c.txt");
    expect(p).toBe("a/b/c.txt");
  });

  it("getExtname 提取文件扩展名", async () => {
    const ext = await (await import("./index")).getExtname("folder/image.png");
    expect(ext).toBe("png");
  });

  it("getBasename 提取文件名", async () => {
    const base = await (await import("./index")).getBasename("folder/image.png", ".png");
    expect(base).toBe("image");
  });

  it("getDirname 提取父目录路径", async () => {
    const dir = await (await import("./index")).getDirname("folder/subfolder/image.png");
    expect(dir).toBe("folder/subfolder");
  });
});
