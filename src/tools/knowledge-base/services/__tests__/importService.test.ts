import { beforeEach, describe, expect, it, vi } from "vitest";
import { open } from "@tauri-apps/plugin-dialog";
import { KnowledgeFileParseError } from "../../core/fileParser";
import {
  KNOWLEDGE_FILE_DIALOG_FILTERS,
  getKnowledgeFileName,
} from "../../core/formats";
import { importPaths, selectImportPaths } from "../importService";
import type { KnowledgeImportFailure } from "../../types";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const openMock = vi.mocked(open);

function parsed(sourcePath: string) {
  return {
    sourcePath,
    title: getKnowledgeFileName(sourcePath),
    mimeType: "text/plain",
    content: sourcePath,
    sourceChecksum: `checksum:${sourcePath}`,
    parserVersion: "test-parser-v1",
  };
}

describe("Knowledge import service", () => {
  beforeEach(() => {
    openMock.mockReset();
  });

  it("uses capability-derived filters for file selection", async () => {
    openMock.mockResolvedValue(["C:\\docs\\a.md", "C:\\docs\\b.pdf"]);

    await expect(selectImportPaths()).resolves.toEqual([
      "C:\\docs\\a.md",
      "C:\\docs\\b.pdf",
    ]);
    expect(openMock).toHaveBeenCalledWith(
      expect.objectContaining({
        directory: false,
        multiple: true,
        filters: KNOWLEDGE_FILE_DIALOG_FILTERS.map((filter) => ({
          name: filter.name,
          extensions: [...filter.extensions],
        })),
      })
    );
  });

  it("isolates parse and ingest failures in a mixed deduplicated batch", async () => {
    const parseFile = vi.fn(async (path: string) => {
      if (path.endsWith("bad.bin")) {
        throw new KnowledgeFileParseError(path, "validation", "binary content");
      }
      return parsed(path);
    });
    const ingestFailure: KnowledgeImportFailure = {
      sourcePath: "C:\\docs\\ingest.md",
      fileName: "ingest.md",
      stage: "ingest",
      message: "database busy",
    };
    const ingestFiles = vi.fn(async () => ({
      imported: 1,
      failures: [ingestFailure],
    }));
    const onProgress = vi.fn();

    const result = await importPaths(
      [
        "C:\\docs\\ok.md",
        "c:/docs/OK.md",
        "C:\\docs\\bad.bin",
        "C:\\docs\\ingest.md",
      ],
      { parseFile, ingestFiles, onProgress }
    );

    expect(parseFile).toHaveBeenCalledTimes(3);
    expect(ingestFiles).toHaveBeenCalledWith([
      parsed("C:\\docs\\ok.md"),
      parsed("C:\\docs\\ingest.md"),
    ]);
    expect(result).toEqual({
      imported: 1,
      parsed: 2,
      skippedDuplicates: 1,
      failures: [
        expect.objectContaining({
          fileName: "bad.bin",
          stage: "validation",
          message: "binary content",
        }),
        ingestFailure,
      ],
    });
    expect(onProgress).toHaveBeenLastCalledWith({
      phase: "ingest",
      processed: 0,
      total: 2,
    });
  });

  it("does not invoke ingestion when every file fails parsing", async () => {
    const ingestFiles = vi.fn();
    const parseFile = vi.fn(async (path: string) => {
      throw new KnowledgeFileParseError(path, "parse", "empty file");
    });

    const result = await importPaths(["empty.txt"], {
      parseFile,
      ingestFiles,
    });

    expect(ingestFiles).not.toHaveBeenCalled();
    expect(result.imported).toBe(0);
    expect(result.failures[0]).toMatchObject({
      fileName: "empty.txt",
      stage: "parse",
    });
  });

  it("routes deduplicated paths through the persistent queue processor", async () => {
    const parseFile = vi.fn();
    const processPaths = vi.fn(async () => ({
      imported: 1,
      parsed: 1,
      skippedDuplicates: 1,
      failures: [],
    }));

    const result = await importPaths(
      ["C:\\docs\\queued.md", "c:/docs/QUEUED.md"],
      { parseFile, processPaths }
    );

    expect(parseFile).not.toHaveBeenCalled();
    expect(processPaths).toHaveBeenCalledWith(["C:\\docs\\queued.md"]);
    expect(result).toMatchObject({
      imported: 1,
      parsed: 1,
      skippedDuplicates: 2,
      failures: [],
    });
  });
});
