import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it } from "vitest";
import { prepareExternalRecallCorpus } from "./external-recall-corpus";

const tempDirs: string[] = [];

function tempDir(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), "aio-recall-external-"));
  tempDirs.push(value);
  return value;
}

async function writeBackup(entries: Record<string, string>): Promise<string> {
  const directory = tempDir();
  const filePath = path.join(directory, "fixture.aio-kb");
  const zip = new JSZip();
  for (const [name, value] of Object.entries(entries)) zip.file(name, value);
  fs.writeFileSync(filePath, await zip.generateAsync({ type: "nodebuffer" }));
  return filePath;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("external Recall corpus preflight", () => {
  it("returns null when the opt-in source is absent", async () => {
    await expect(prepareExternalRecallCorpus(undefined)).resolves.toBeNull();
  });

  it("validates the ZIP envelope without exposing the source path", async () => {
    const sourcePath = await writeBackup({
      "manifest.json": "{}",
      "library.json": "{}",
      "assets/example.bin": "asset",
    });
    const result = await prepareExternalRecallCorpus(sourcePath);

    expect(result?.sourcePath).toBe(path.resolve(sourcePath));
    expect(result?.metadata).toMatchObject({
      schemaVersion: 1,
      extension: ".aio-kb",
      zipEntryCount: 4,
      reviewedSource: false,
      probeEntryIds: [],
    });
    expect(JSON.stringify(result?.metadata)).not.toContain(
      path.dirname(sourcePath)
    );
  });

  it("rejects unexpected ZIP entries", async () => {
    const sourcePath = await writeBackup({
      "manifest.json": "{}",
      "library.json": "{}",
      "private.txt": "unexpected",
    });
    await expect(prepareExternalRecallCorpus(sourcePath)).rejects.toThrow(
      "disallowed ZIP entry"
    );
  });

  it("requires the legacy backup extension and required entries", async () => {
    const sourcePath = await writeBackup({ "manifest.json": "{}" });
    await expect(prepareExternalRecallCorpus(sourcePath)).rejects.toThrow(
      "missing library.json"
    );

    const wrongExtension = path.join(tempDir(), "fixture.zip");
    fs.copyFileSync(sourcePath, wrongExtension);
    await expect(prepareExternalRecallCorpus(wrongExtension)).rejects.toThrow(
      "must be a .aio-kb backup"
    );
  });
});
