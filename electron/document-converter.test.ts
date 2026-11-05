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

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import JSZip from "jszip";
import * as CFB from "cfb";
import { DocumentConverter } from "./document-converter";
import { AssetManager } from "./asset-manager";
import { detectAssetMime } from "./asset-mime";
import type { DocumentProcess } from "./document-process";
import type { AssetImportResult } from "../src/types/asset-management";

let directory: string,
  root: string,
  base: string,
  run: ReturnType<typeof vi.fn<DocumentProcess>>,
  service: DocumentConverter;
const emit = vi.fn();
async function zipDocument(filename: string, format = "docx") {
  const zip = new JSZip();
  const entry =
    format === "docx"
      ? "word/document.xml"
      : format === "pptx"
        ? "ppt/presentation.xml"
        : "xl/workbook.xml";
  const contentType =
    format === "docx"
      ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
      : format === "pptx"
        ? "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml";
  const options = {
    date: new Date("2000-01-01T00:00:00Z"),
    createFolders: false,
  };
  zip.file(
    "[Content_Types].xml",
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/' +
      entry +
      '" ContentType="' +
      contentType +
      '"/></Types>',
    options
  );
  zip.file(entry, "<document>converted</document>", options);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, await zip.generateAsync({ type: "nodebuffer" }));
}
async function configure(settings: Record<string, unknown> = {}) {
  await fs.mkdir(path.join(root, "asset-manager"), { recursive: true });
  await fs.writeFile(
    path.join(root, "asset-manager/config.json"),
    JSON.stringify({
      documentConversion: {
        autoConvertLegacyDoc: true,
        preferredProvider: "libreOffice",
        libreOfficePath: "libre-fake",
        timeoutSeconds: 30,
        isolatedProfile: true,
        ...settings,
      },
    })
  );
}
async function source(
  name = "文件 & sample.doc",
  content: Uint8Array = Buffer.from("legacy input")
) {
  const file = path.join(directory, name);
  await fs.writeFile(file, content);
  return file;
}
const fakeProcess: DocumentProcess = async (executable, args, options) => {
  if (args[0] === "--version") {
    if (!["libre-fake", "abi-fake", "soffice"].includes(executable))
      throw new Error("converter missing");
    return {
      stdout:
        executable === "abi-fake"
          ? "AbiWord 3.0"
          : "LibreOffice 7.6.2.1 60b1f7bfc0a42b4c35f236d34564e5e365df4790",
      stderr: "",
    };
  }
  if (executable === "/usr/bin/textutil" && args[0] === "-help")
    return { stdout: "help", stderr: "" };
  let target: string,
    format = "docx";
  if (args.includes("--convert-to")) {
    format = args[args.indexOf("--convert-to") + 1];
    target = path.join(
      args[args.indexOf("--outdir") + 1],
      path.parse(args.at(-1)!).name + "." + format
    );
  } else if (args[0] === "--to=docx")
    target = args[1].slice("--to-name=".length);
  else if (args[0] === "-convert") target = args[args.indexOf("-output") + 1];
  else if (options.env?.AIO_DOCUMENT_CHECK === "1")
    return { stdout: "Office 16", stderr: "" };
  else if (options.env?.AIO_DOCUMENT_TARGET) {
    target = options.env.AIO_DOCUMENT_TARGET;
    format = options.env.AIO_DOCUMENT_KIND;
  } else throw new Error("unexpected command");
  await zipDocument(target, format);
  return { stdout: "converted", stderr: "" };
};
beforeEach(async () => {
  directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "aiohub-document-tests-")
  );
  root = path.join(directory, "app");
  base = path.join(root, "assets");
  await fs.mkdir(base, { recursive: true });
  emit.mockClear();
  run = vi.fn(fakeProcess);
  service = new DocumentConverter({ root, emit, run, platform: "linux" });
});
afterEach(async () => {
  await fs.rm(directory, { recursive: true, force: true });
});

describe("Electron document conversion contracts", () => {
  it("detects candidates with existing provider fields and reports unsupported host providers without executing them", async () => {
    const candidates = (await service.command(
      "detect_asset_manager_document_converters"
    )) as {
      provider: string;
      available: boolean;
      path: string | null;
      requiresPath: boolean;
    }[];
    expect(candidates.map((item) => item.provider)).toEqual([
      "libreOffice",
      "microsoftWord",
      "abiWord",
      "textutil",
    ]);
    expect(candidates[0]).toMatchObject({
      available: true,
      path: "soffice",
      requiresPath: true,
      version: "LibreOffice 7.6.2.1",
    });
    expect(candidates[1]).toMatchObject({
      available: false,
      path: null,
      requiresPath: false,
    });
    expect(candidates[3].available).toBe(false);
    expect(
      await service.command("check_asset_manager_document_converter", {
        provider: "libreOffice",
        path: "missing",
      })
    ).toMatchObject({ available: false });
    expect(
      await service.command("check_asset_manager_document_converter", {
        provider: "auto",
      })
    ).toMatchObject({ available: true });
  });
  it("imports converted documents with both hashes, deduplicates before conversion and preserves metadata across restarts", async () => {
    await configure();
    const originalPath = await source();
    const host = {
      root,
      emit,
      documents: service,
      trashItem: async () => {},
      inspectMedia: async () => ({ metadata: {} }),
    };
    let assets = new AssetManager(host);
    const first = (await assets.run("import_asset_from_path", {
      originalPath,
      options: { sourceModule: "llm-chat" },
    })) as AssetImportResult;
    expect(first.warnings).toEqual([]);
    expect(first.asset).toMatchObject({
      name: "文件 & sample.docx",
      type: "document",
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    expect(first.asset.path).toMatch(/\.docx$/);
    expect(first.asset.metadata?.originalSha256).toBe(
      createHash("sha256").update("legacy input").digest("hex")
    );
    expect(first.asset.metadata?.sha256).not.toBe(
      first.asset.metadata?.originalSha256
    );
    const conversions = run.mock.calls.filter(([, args]) =>
      args.includes("--convert-to")
    ).length;
    const duplicate = (await assets.run("import_asset_from_path", {
      originalPath,
      options: { sourceModule: "agent-manager" },
    })) as AssetImportResult;
    expect(duplicate.asset.id).toBe(first.asset.id);
    expect(duplicate.asset.origins.map((item) => item.sourceModule)).toEqual([
      "llm-chat",
      "agent-manager",
    ]);
    expect(
      run.mock.calls.filter(([, args]) => args.includes("--convert-to"))
    ).toHaveLength(conversions);
    expect(await fs.readFile(originalPath, "utf8")).toBe("legacy input");
    expect(await fs.readdir(path.join(base, ".conversion-cache"))).toEqual([]);
    expect(
      emit.mock.calls.some(
        ([event, value]) =>
          event === "asset-import-progress" && value.phase === "converting"
      )
    ).toBe(true);
    expect(
      emit.mock.calls.some(
        ([, value]) =>
          value.phase === "copying" &&
          value.convertedName === "文件 & sample.docx"
      )
    ).toBe(true);
    assets = new AssetManager(host);
    expect(
      await assets.run("get_asset_by_id", { assetId: first.asset.id })
    ).toMatchObject({
      metadata: { originalSha256: first.asset.metadata?.originalSha256 },
    });
  });
  it("converts a previously retained original after enabling a converter and reuses the completed conversion on later imports", async () => {
    const originalPath = await source();
    const assets = new AssetManager({
      root,
      emit,
      documents: service,
      trashItem: async () => {},
      inspectMedia: async () => ({ metadata: {} }),
    });
    await configure({ autoConvertLegacyDoc: false });
    const original = (await assets.run("import_asset_from_path", {
      originalPath,
    })) as AssetImportResult;
    expect(original.asset.name).toMatch(/\.doc$/);
    await configure();
    const converted = (await assets.run("import_asset_from_path", {
      originalPath,
    })) as AssetImportResult;
    expect(converted.asset.name).toMatch(/\.docx$/);
    expect(converted.asset.id).not.toBe(original.asset.id);
    const calls = run.mock.calls.length;
    const repeat = (await assets.run("import_asset_from_path", {
      originalPath,
    })) as AssetImportResult;
    expect(repeat.asset.id).toBe(converted.asset.id);
    expect(run.mock.calls).toHaveLength(calls);
  });
  it("keeps disabled/unavailable/unsupported imports in their original format with actionable warnings", async () => {
    const original = await source();
    await configure({ autoConvertLegacyDoc: false });
    let prepared = await service.prepare(original, base, original);
    expect(prepared.path).toBe(original);
    expect(prepared.warnings[0].code).toBe("legacyDocConverterNotConfigured");
    expect(run).not.toHaveBeenCalled();
    await configure({ libreOfficePath: "missing" });
    prepared = await service.prepare(original, base, original);
    expect(prepared.path).toBe(original);
    expect(prepared.warnings[0].sourcePath).toBe(original);
    await configure({ preferredProvider: "abiWord", abiWordPath: "abi-fake" });
    const slide = await source("slides.ppt");
    prepared = await service.prepare(slide, base, slide);
    expect(prepared.path).toBe(slide);
    expect(prepared.warnings[0].code).toBe("legacyPptConverterNotSupported");
  });
  it("executes AbiWord, macOS textutil and Office using their configured contracts", async () => {
    const original = await source();
    for (const id of ["abiWord", "textutil", "microsoftWord"] as const) {
      await configure({ preferredProvider: id, abiWordPath: "abi-fake" });
      const platform =
        id === "textutil"
          ? "darwin"
          : id === "microsoftWord"
            ? "win32"
            : "linux";
      const converter = new DocumentConverter({ root, emit, run, platform });
      const result = await converter.prepare(original, base, original);
      expect(path.extname(result.path)).toBe(".docx");
      expect(result.warnings).toEqual([]);
      await result.cleanup();
    }
  });
  it("cleans failed conversions and keeps catalog/source unchanged for process, missing-output and wrong-format failures", async () => {
    await configure();
    const originalPath = await source();
    const assets = new AssetManager({
      root,
      emit,
      documents: service,
      trashItem: async () => {},
      inspectMedia: async () => ({ metadata: {} }),
    });
    for (const failure of ["process", "missing", "format"]) {
      run.mockImplementation(async (executable, args, options) => {
        if (args[0] === "--version")
          return fakeProcess(executable, args, options);
        if (failure === "process") throw new Error("conversion failed");
        if (failure === "format") {
          const target = path.join(
            args[args.indexOf("--outdir") + 1],
            path.parse(args.at(-1)!).name + ".docx"
          );
          await fs.writeFile(target, "legacy payload");
        }
        return { stdout: "", stderr: "" };
      });
      await expect(
        assets.run("import_asset_from_path", { originalPath })
      ).rejects.toThrow();
      expect(await assets.run("list_all_assets")).toEqual([]);
      expect(await fs.readdir(path.join(base, ".conversion-cache"))).toEqual(
        []
      );
      expect(await fs.readdir(path.join(base, ".incoming"))).toEqual([]);
      expect(await fs.readFile(originalPath, "utf8")).toBe("legacy input");
    }
  });
  it("identifies supported WPS containers and leaves encrypted/unknown containers out of conversion", async () => {
    await configure();
    const makeCompound = async (name: string, flags: number) => {
      const compound = CFB.utils.cfb_new();
      const fib = Buffer.alloc(12);
      fib.writeUInt16LE(0xa5ec);
      fib.writeUInt16LE(flags, 10);
      CFB.utils.cfb_add(compound, "WordDocument", fib);
      CFB.utils.cfb_add(compound, "1Table", Buffer.from([1]));
      return source(name, CFB.write(compound, { type: "buffer" }) as Buffer);
    };
    const binary = await makeCompound("word.wps", 0);
    expect(await detectAssetMime(binary)).toBe("application/msword");
    const rtf = await source("rtf.wps", Buffer.from("{\\rtf1 sample}"));
    expect(await detectAssetMime(rtf)).toBe("application/rtf");
    for (const filename of [binary, rtf]) {
      const prepared = await service.prepare(filename, base, filename);
      expect(prepared.path).toMatch(/\.docx$/);
      await prepared.cleanup();
    }
    const encrypted = await makeCompound("encrypted.wps", 0x0100);
    expect(await detectAssetMime(encrypted)).toBe("application/kswps");
    await expect(service.preview(encrypted, base)).rejects.toThrow("加密");
    expect((await service.prepare(encrypted, base, encrypted)).path).toBe(
      encrypted
    );
    const unknown = await source("unknown.wps");
    await expect(service.preview(unknown, base)).rejects.toThrow("另存为 DOCX");
  });
  it("previews modern WPS without a converter and isolates legacy preview outputs while checking relative paths", async () => {
    const modern = path.join(directory, "modern.wps");
    await zipDocument(modern);
    const copy = await service.preview(modern, base);
    expect(copy).toMatch(/\.docx$/);
    expect(await fs.readFile(copy!)).toEqual(await fs.readFile(modern));
    expect(run).not.toHaveBeenCalled();
    await configure();
    const original = await source();
    const one = await service.preview(original, base),
      two = await service.preview(original, base);
    expect(one).not.toBe(two);
    expect(await fs.readFile(one!)).toEqual(await fs.readFile(two!));
    await expect(service.preview("../escape.doc", base)).rejects.toThrow();
    expect(await service.preview(await source("notes.txt"), base)).toBeNull();
  });
});
