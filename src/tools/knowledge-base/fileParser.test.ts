import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "@tauri-apps/plugin-fs";
import {
  KnowledgeFileParseError,
  isProbablyText,
  parseKnowledgeFile,
} from "./fileParser";

vi.mock("@tauri-apps/plugin-fs", () => ({ readFile: vi.fn() }));
vi.mock("@/utils/docxParser", () => ({ parseDocx: vi.fn() }));

const readFileMock = vi.mocked(readFile);

describe("Knowledge file parser", () => {
  beforeEach(() => {
    readFileMock.mockReset();
  });

  it("rejects a known unsupported binary format before reading it", async () => {
    await expect(parseKnowledgeFile("C:\\docs\\sheet.xlsx")).rejects.toMatchObject({
      stage: "validation",
      sourcePath: "C:\\docs\\sheet.xlsx",
    });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("accepts an unknown extension when its content is text", async () => {
    readFileMock.mockResolvedValue(new TextEncoder().encode("custom notes"));

    await expect(parseKnowledgeFile("C:\\docs\\notes.custom")).resolves.toEqual({
      sourcePath: "C:\\docs\\notes.custom",
      title: "notes",
      mimeType: "text/plain",
      content: "custom notes",
      sourceChecksum:
        "54dbd79fbc99cba50089d8c0939e354017de5f950add29d7a228fc4c3665a928",
      parserVersion: "knowledge-parser-v1",
    });
  });

  it("rejects unknown binary content and a binary file disguised as text", async () => {
    readFileMock.mockResolvedValue(new Uint8Array([0, 1, 2, 3, 255]));

    await expect(parseKnowledgeFile("unknown.payload")).rejects.toMatchObject({
      stage: "validation",
    });
    await expect(parseKnowledgeFile("spoofed.txt")).rejects.toMatchObject({
      stage: "validation",
    });
  });

  it("reports read failures separately from parser failures", async () => {
    readFileMock.mockRejectedValue(new Error("permission denied"));

    const error = await parseKnowledgeFile("notes.md").catch((value) => value);
    expect(error).toBeInstanceOf(KnowledgeFileParseError);
    expect(error).toMatchObject({ stage: "read" });
    expect(error.message).toContain("permission denied");
  });

  it("recognizes UTF-16 BOM text while rejecting NUL-heavy binary data", () => {
    expect(isProbablyText(new Uint8Array([0xff, 0xfe, 65, 0]))).toBe(true);
    expect(isProbablyText(new Uint8Array([65, 0, 66, 0]))).toBe(false);
  });
});
