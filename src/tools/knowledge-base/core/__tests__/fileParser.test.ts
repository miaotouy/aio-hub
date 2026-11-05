import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFile } from "@/platform/native/fs";
import {
  KnowledgeFileParseError,
  isProbablyText,
  parseKnowledgeFile,
} from "../fileParser";

vi.mock("@/platform/native/fs", () => ({ readFile: vi.fn() }));
vi.mock("@/utils/docxParser", () => ({ parseDocx: vi.fn() }));

const pdfjs = vi.hoisted(() => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));
vi.mock("pdfjs-dist", () => pdfjs);
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({
  default: "/assets/pdf.worker.min.mjs",
}));

const readFileMock = vi.mocked(readFile);

describe("Knowledge file parser", () => {
  beforeEach(() => {
    readFileMock.mockReset();
    pdfjs.GlobalWorkerOptions.workerSrc = "";
    pdfjs.getDocument.mockReset();
  });

  it("rejects a known unsupported binary format before reading it", async () => {
    await expect(
      parseKnowledgeFile("C:\\docs\\sheet.xlsx")
    ).rejects.toMatchObject({
      stage: "validation",
      sourcePath: "C:\\docs\\sheet.xlsx",
    });
    expect(readFileMock).not.toHaveBeenCalled();
  });

  it("accepts an unknown extension when its content is text", async () => {
    readFileMock.mockResolvedValue(new TextEncoder().encode("custom notes"));

    await expect(parseKnowledgeFile("C:\\docs\\notes.custom")).resolves.toEqual(
      {
        sourcePath: "C:\\docs\\notes.custom",
        title: "notes",
        mimeType: "text/plain",
        content: "custom notes",
        sourceChecksum:
          "54dbd79fbc99cba50089d8c0939e354017de5f950add29d7a228fc4c3665a928",
        parserVersion: "knowledge-parser-v1",
      }
    );
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

  it("imports a PDF on cold start and hashes the original bytes after worker transfer", async () => {
    const bytes = new TextEncoder().encode("%PDF-fixture");
    const expectedHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
      (value) => value.toString(16).padStart(2, "0")
    ).join("");
    readFileMock.mockResolvedValue(bytes);
    const destroy = vi.fn().mockResolvedValue(undefined);
    pdfjs.getDocument.mockImplementation(({ data }: { data: Uint8Array }) => {
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        throw new Error('No "GlobalWorkerOptions.workerSrc" specified.');
      }
      structuredClone(data, { transfer: [data.buffer] });
      return {
        promise: Promise.resolve({
          numPages: 2,
          getPage: async (pageNumber: number) => ({
            getTextContent: async () => ({
              items: [
                { str: `正文 ${pageNumber}` },
                { type: "beginMarkedContent" },
              ],
            }),
          }),
        }),
        destroy,
      };
    });

    await expect(parseKnowledgeFile("archive.pdf")).resolves.toMatchObject({
      content: "# 第 1 页\n\n正文 1\n\n# 第 2 页\n\n正文 2",
      mimeType: "application/pdf",
      sourceChecksum: expectedHash,
    });
    expect(bytes.byteLength).toBeGreaterThan(0);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it.each(["load", "page", "empty"])(
    "reports PDF %s failures as parse errors and releases the import resources",
    async (failure) => {
      readFileMock.mockResolvedValue(new TextEncoder().encode("%PDF-fixture"));
      const destroy = vi.fn().mockResolvedValue(undefined);
      pdfjs.getDocument.mockReturnValue({
        promise:
          failure === "load"
            ? Promise.reject(new Error("Invalid PDF"))
            : Promise.resolve({
                numPages: 1,
                getPage: async () => {
                  if (failure === "page") throw new Error("Damaged page");
                  return { getTextContent: async () => ({ items: [] }) };
                },
              }),
        destroy,
      });

      await expect(parseKnowledgeFile("archive.pdf")).rejects.toMatchObject({
        stage: "parse",
        sourcePath: "archive.pdf",
        message: expect.stringContaining(
          failure === "load"
            ? "Invalid PDF"
            : failure === "page"
              ? "Damaged page"
              : "PDF 没有可提取文本"
        ),
      });
      expect(destroy).toHaveBeenCalledOnce();
    }
  );

  it("recognizes UTF-16 BOM text while rejecting NUL-heavy binary data", () => {
    expect(isProbablyText(new Uint8Array([0xff, 0xfe, 65, 0]))).toBe(true);
    expect(isProbablyText(new Uint8Array([65, 0, 66, 0]))).toBe(false);
  });
});
