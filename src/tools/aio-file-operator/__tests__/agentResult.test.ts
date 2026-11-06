// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { presentFileOperationResult } from "../utils/agentResult";

// Protect the Agent result contract: readable values, literal file content and media retention.
describe("file operation Agent output", () => {
  it("lists every directory entry with readable sizes and dates while retaining domain data", () => {
    const entries = [
      {
        name: "资料",
        path: "C:\\work/资料",
        size: 4096,
        isDirectory: true,
        modified: null,
        created: null,
      },
      {
        name: "a|b.md",
        path: "C:\\work/a|b.md",
        size: 2048,
        isDirectory: false,
        modified: 1793923200,
        created: null,
      },
    ];
    const result = presentFileOperationResult({
      success: true,
      message: "目录 C:\\work（2 项）",
      data: { entries },
    });
    expect(result.data.entries).toBe(entries);
    const text = result.content![0].text;
    expect(text).toContain("| 资料 | 目录 | — | 未知 |");
    expect(text).toMatch(
      /\| a\\\|b\.md \| 文件 \| 2 KB \| 2026-11-06 \d{2}:\d{2}:\d{2} \|/
    );
  });

  it("keeps read content byte-for-byte after a line-range header", () => {
    const content = '  # 标题\r\n{"path":"C:\\work"}\r\n\t末行\r\n';
    const result = presentFileOperationResult({
      success: true,
      message: "读取 C:\\work/笔记.md",
      data: {
        content,
        size: 1024,
        lineRange: {
          startLine: 2,
          endLine: 4,
          totalLines: 8,
          returnedLines: 3,
        },
      },
    });
    const [header, ...body] = result.content![0].text.split("\n\n");
    expect(header).toContain("1 KB");
    expect(header).toContain("2–4 / 共 8 行");
    expect(body.join("\n\n")).toBe(content);
  });

  it("includes the search root and complete relative paths, with empty results remaining readable", () => {
    const hit = {
      name: "notes.md",
      relativePath: "子目录/notes.md",
      absolutePath: "C:/work/子目录/notes.md",
      isDir: false,
      size: 0,
    };
    const result = presentFileOperationResult(
      {
        success: true,
        message: '搜索 "*.md" 命中 1 项',
        data: { hits: [hit] },
      },
      { directoryPath: "C:/work" }
    );
    expect(result.content![0].text).toContain("C:/work");
    expect(result.content![0].text).toContain(
      "| 子目录/notes.md | 文件 | 0 B |"
    );
    const empty = presentFileOperationResult(
      { success: true, message: "搜索命中 0 项", data: { hits: [] } },
      { directoryPath: "C:/work" }
    );
    expect(empty.content![0].text).toContain("C:/work");
    expect(empty.data.hits).toEqual([]);
  });

  it("presents metadata, working paths and actionable Diff warnings", () => {
    const metadata = presentFileOperationResult({
      success: true,
      message: "文件信息 C:/work/a.md",
      data: {
        metadata: { isDir: false, size: 1024, modified: 0, created: null },
      },
    });
    expect(metadata.content![0].text).toContain("1 KB");
    expect(metadata.content![0].text).toMatch(/1970-01-01 \d{2}:\d{2}:\d{2}/);
    const workspace = presentFileOperationResult({
      success: true,
      message: "已获取任务工作目录",
      data: { path: "C:/work" },
    });
    expect(workspace.content![0].text).toContain("C:/work");
    const diff = presentFileOperationResult({
      success: true,
      message: "已修改",
      data: { warnings: ["匹配内容存在空白差异，请检查修改位置"] },
    });
    expect(diff.content![0].text).toContain(
      "匹配内容存在空白差异，请检查修改位置"
    );
  });

  it("retains media references and describes failure messages", () => {
    const localMedia = [
      {
        id: "image-1",
        name: "a.png",
        path: "C:/work/a.png",
        type: "image" as const,
        mimeType: "image/png",
        size: 2048,
      },
    ];
    const result = presentFileOperationResult({
      success: true,
      message: "已读取 C:/work/a.png",
      data: { mimeType: "image/png", size: 2048 },
      localMedia,
    });
    expect(result.localMedia).toBe(localMedia);
    expect(result.content![0].text).toContain("image/png");
    expect(result.content![0].text).toContain("2 KB");
    const failed = presentFileOperationResult({
      success: false,
      message: "文件不存在：C:/work/missing.md",
    });
    expect(failed.success).toBe(false);
    expect(failed.content![0].text).toContain("C:/work/missing.md");
  });
});
