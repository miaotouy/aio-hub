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

import { basename, join } from "@tauri-apps/api/path";
import { gunzipSync } from "fflate";
import JSZip from "jszip";
import { readDir, readFile, readTextFile, stat } from "@tauri-apps/plugin-fs";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type {
  TokenizerAssetFormat,
  TokenizerConfidence,
  TokenizerImportScanResult,
} from "../types/tokenizer-profile";

const errorHandler = createModuleErrorHandler("token-calculator/asset-scanner");

const MAX_JSON_BYTES = 50 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const ARCHIVE_FILE_NAMES = new Set([
  "tokenizer.json",
  "tokenizer_config.json",
  "special_tokens_map.json",
  "added_tokens.json",
  "vocab.json",
  "merges.txt",
  "vocab.txt",
  "tekken.json",
  "tokenizer.model",
  "spiece.model",
  "chat_template.jinja",
]);

type NamedPath = {
  path: string;
  name: string;
};

type ArchiveFormat = "zip" | "tar" | "tar.gz";

interface ArchiveEntry {
  name: string;
  dir: boolean;
  uncompressedSize?: number;
  readBytes: () => Promise<Uint8Array>;
}

function isArchivePath(path: string): boolean {
  return /\.(zip|tar|tar\.gz|tgz)$/i.test(path);
}

function isZipMagic(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function isGzipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function isTarHeader(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 512 &&
    bytes[257] === 0x75 &&
    bytes[258] === 0x73 &&
    bytes[259] === 0x74 &&
    bytes[260] === 0x61 &&
    bytes[261] === 0x72
  );
}

function resolveArchiveFormat(bytes: Uint8Array, path: string): ArchiveFormat {
  if (isZipMagic(bytes)) return "zip";
  if (isGzipMagic(bytes)) return "tar.gz";
  if (isTarHeader(bytes)) return "tar";

  const lower = path.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".tar")) return "tar";

  throw new Error("无法识别的压缩包格式，目前支持 ZIP / TAR / TAR.GZ");
}

function normalizeFileName(name: string): string {
  return name.trim().toLowerCase();
}

function normalizeArchiveEntryName(name: string): string {
  return name.replace(/\\/g, "/").replace(/^\.\//, "");
}

function archiveEntryBaseName(name: string): string {
  const normalized = normalizeArchiveEntryName(name);
  return normalizeFileName(normalized.slice(normalized.lastIndexOf("/") + 1));
}

function archiveEntryDirectory(name: string): string {
  const normalized = normalizeArchiveEntryName(name);
  const separatorIndex = normalized.lastIndexOf("/");
  return separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : "";
}

function getArchiveEntrySize(entry: unknown): number | undefined {
  const internalData = (entry as { _data?: { uncompressedSize?: number } })
    ?._data;
  return typeof internalData?.uncompressedSize === "number"
    ? internalData.uncompressedSize
    : undefined;
}

async function loadZipEntries(bytes: Uint8Array): Promise<ArchiveEntry[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  } catch (error) {
    throw new Error(
      `读取 ZIP 压缩包失败：${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return Object.values(zip.files).map((entry) => ({
    name: entry.name,
    dir: entry.dir,
    uncompressedSize: getArchiveEntrySize(entry),
    readBytes: () => entry.async("uint8array"),
  }));
}

function readTarText(bytes: Uint8Array, start: number, length: number): string {
  const slice = bytes.subarray(start, start + length);
  const nullIndex = slice.indexOf(0);
  const trimmed = nullIndex === -1 ? slice : slice.subarray(0, nullIndex);
  return new TextDecoder().decode(trimmed).trim();
}

function readTarSize(header: Uint8Array): number {
  if (header[124]! & 0x80) {
    let value = 0;
    for (let index = 124; index < 136; index += 1) {
      value =
        value * 256 + (index === 124 ? header[index]! & 0x7f : header[index]!);
    }
    return value;
  }

  const parsed = Number.parseInt(readTarText(header, 124, 12), 8);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePaxPath(record: string): string | null {
  let value: string | null = null;
  let rest = record;
  while (rest.length > 0) {
    const spaceIndex = rest.indexOf(" ");
    if (spaceIndex === -1) break;
    const length = Number.parseInt(rest.slice(0, spaceIndex), 10);
    if (!Number.isFinite(length) || length <= 0 || length > rest.length) break;

    const entry = rest.slice(spaceIndex + 1, length).replace(/\n$/, "");
    rest = rest.slice(length);

    const equalsIndex = entry.indexOf("=");
    if (equalsIndex === -1) continue;
    if (entry.slice(0, equalsIndex) === "path") {
      value = entry.slice(equalsIndex + 1);
    }
  }
  return value;
}

function parseTarEntries(bytes: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  const decoder = new TextDecoder();
  let offset = 0;
  let pendingName: string | null = null;
  let pendingPaxPath: string | null = null;

  while (offset + 512 <= bytes.length) {
    const header = bytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    const size = readTarSize(header);
    const typeFlag = String.fromCharCode(header[156]! || 0x30);
    const dataStart = offset + 512;
    const dataEnd = Math.min(dataStart + size, bytes.length);

    if (typeFlag === "L") {
      pendingName = decoder
        .decode(bytes.subarray(dataStart, dataEnd))
        .replace(/\0+$/, "");
    } else if (typeFlag === "x") {
      pendingPaxPath = parsePaxPath(
        decoder.decode(bytes.subarray(dataStart, dataEnd))
      );
    } else if (typeFlag === "0" || typeFlag === "\0") {
      const name = pendingPaxPath || pendingName || readTarText(header, 0, 100);
      const content = bytes.slice(dataStart, dataEnd);
      entries.push({
        name,
        dir: false,
        uncompressedSize: size,
        readBytes: async () => content,
      });
      pendingName = null;
      pendingPaxPath = null;
    } else {
      pendingName = null;
      pendingPaxPath = null;
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  return entries;
}

function gunzipArchive(bytes: Uint8Array): Uint8Array {
  try {
    return gunzipSync(bytes);
  } catch (error) {
    throw new Error(
      `解压 gzip 压缩包失败：${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

async function loadArchiveEntries(
  archivePath: string,
  bytes: Uint8Array
): Promise<ArchiveEntry[]> {
  const format = resolveArchiveFormat(bytes, archivePath);
  if (format === "zip") {
    return loadZipEntries(bytes);
  }

  const tarBytes = format === "tar.gz" ? gunzipArchive(bytes) : bytes;
  if (!isTarHeader(tarBytes)) {
    throw new Error(
      format === "tar.gz"
        ? "GZIP 压缩包解压后不是有效的 TAR 归档"
        : "压缩包不是有效的 TAR 归档"
    );
  }
  return parseTarEntries(tarBytes);
}

function readObjectValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const content = (value as Record<string, unknown>).content;
    if (typeof content === "string") return content;
  }
  return undefined;
}

async function safeReadJson(path: string): Promise<any | null> {
  try {
    const info = await stat(path);
    if (info.size > MAX_JSON_BYTES) {
      throw new Error("JSON 文件超过 50 MB 限制");
    }
    return JSON.parse(await readTextFile(path));
  } catch (error) {
    errorHandler.handle(error as Error, {
      userMessage: "读取 tokenizer JSON 失败",
      context: { path },
      showToUser: false,
    });
    return null;
  }
}

async function collectPaths(paths: string[]): Promise<{
  files: NamedPath[];
  sourceKind: "file" | "directory";
  rootPath?: string;
}> {
  if (paths.length === 1) {
    const first = paths[0]!;
    const info = await stat(first);
    if (info.isDirectory) {
      const entries = await readDir(first);
      const files: NamedPath[] = [];
      for (const entry of entries) {
        if (!entry.isFile) continue;
        files.push({
          name: entry.name,
          path: await join(first, entry.name),
        });
      }
      return { files, sourceKind: "directory", rootPath: first };
    }
  }

  const files = await Promise.all(
    paths.map(async (path) => ({ path, name: await basename(path) }))
  );
  return { files, sourceKind: "file", rootPath: paths[0] };
}

function mapKnownFiles(files: NamedPath[]): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const file of files) {
    const name = normalizeFileName(file.name);
    if (name === "tokenizer.json") mapped.tokenizerJson = file.path;
    else if (name === "tokenizer_config.json")
      mapped.tokenizerConfig = file.path;
    else if (name === "special_tokens_map.json")
      mapped.specialTokensMap = file.path;
    else if (name === "added_tokens.json") mapped.addedTokens = file.path;
    else if (name === "vocab.json") mapped.vocabJson = file.path;
    else if (name === "merges.txt") mapped.merges = file.path;
    else if (name === "vocab.txt") mapped.vocabTxt = file.path;
    else if (name === "tekken.json") mapped.tekkenJson = file.path;
    else if (name.endsWith(".tiktoken")) mapped.tiktoken = file.path;
    else if (
      name === "tokenizer.model" ||
      name === "spiece.model" ||
      name.endsWith(".model")
    )
      mapped.sentencePieceModel = file.path;
    else if (name.endsWith(".vocab")) mapped.sentencePieceVocab = file.path;
    else if (name.endsWith(".gguf")) mapped.gguf = file.path;
    else if (name === "chat_template.jinja") mapped.chatTemplate = file.path;
  }
  return mapped;
}

function classifyMappedFiles(mapped: Record<string, string>): {
  format: TokenizerAssetFormat;
  loadability: TokenizerImportScanResult["loadability"];
  suggestedConfidence: TokenizerConfidence;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (mapped.tokenizerJson) {
    if (!mapped.tokenizerConfig) {
      warnings.push(
        "未找到 tokenizer_config.json，将生成最小配置并标记为近似。"
      );
    }
    return {
      format:
        mapped.specialTokensMap || mapped.addedTokens
          ? "hf-directory"
          : "hf-tokenizer-json",
      loadability: "direct",
      suggestedConfidence: mapped.tokenizerConfig ? "exact" : "close",
      warnings,
    };
  }

  if (mapped.vocabJson && mapped.merges) {
    warnings.push("已识别 GPT-2 / RoBERTa BPE 资产，当前版本还不能转换。");
    return {
      format: "legacy-bpe",
      loadability: "convertible",
      suggestedConfidence: "close",
      warnings,
    };
  }

  if (mapped.vocabTxt) {
    warnings.push("已识别 WordPiece vocab.txt，当前版本还不能转换。");
    return {
      format: "wordpiece-vocab",
      loadability: "convertible",
      suggestedConfidence: "close",
      warnings,
    };
  }

  if (mapped.tiktoken) {
    warnings.push("已识别 .tiktoken BPE 表，仍需要 encoding 元数据适配器。");
    return {
      format: "tiktoken-bpe",
      loadability: "unsupported",
      suggestedConfidence: "estimated",
      warnings,
    };
  }

  if (mapped.sentencePieceModel) {
    warnings.push("已识别 SentencePiece .model，当前版本还不能直接加载。");
    return {
      format: "sentencepiece-model",
      loadability: "unsupported",
      suggestedConfidence: "estimated",
      warnings,
    };
  }

  if (mapped.tekkenJson) {
    warnings.push("已识别 tekken.json，当前版本还需要 Tekken adapter。");
    return {
      format: "tekken-json",
      loadability: "unsupported",
      suggestedConfidence: "estimated",
      warnings,
    };
  }

  if (mapped.gguf) {
    warnings.push("已识别 GGUF 文件，当前版本不会复制整模型或精确计数。");
    return {
      format: "gguf-metadata",
      loadability: "unsupported",
      suggestedConfidence: "estimated",
      warnings,
    };
  }

  warnings.push("未识别到可导入的 tokenizer 资产。");
  return {
    format: "unknown",
    loadability: "unsupported",
    suggestedConfidence: "estimated",
    warnings,
  };
}

function extractSpecialTokens(
  tokenizerJson: any | null,
  tokenizerConfig: any | null,
  specialTokensMap: any | null
): string[] {
  const tokens = new Set<string>();
  for (const source of [tokenizerConfig, specialTokensMap]) {
    if (!source || typeof source !== "object") continue;
    for (const key of [
      "bos_token",
      "eos_token",
      "unk_token",
      "sep_token",
      "pad_token",
      "cls_token",
      "mask_token",
    ]) {
      const value = readObjectValue(source[key]);
      if (value) tokens.add(value);
    }
    const additional = source.additional_special_tokens;
    if (Array.isArray(additional)) {
      for (const item of additional) {
        const value = readObjectValue(item);
        if (value) tokens.add(value);
      }
    }
  }

  const addedTokens = tokenizerJson?.added_tokens;
  if (Array.isArray(addedTokens)) {
    for (const item of addedTokens) {
      const value = readObjectValue(item);
      if (value) tokens.add(value);
    }
  }
  return Array.from(tokens);
}

async function scanTokenizerArchive(
  archivePath: string
): Promise<TokenizerImportScanResult> {
  const archiveInfo = await stat(archivePath);
  if (archiveInfo.size > MAX_ARCHIVE_BYTES) {
    throw new Error("Tokenizer 压缩包超过 100 MB 限制");
  }

  const entries = await loadArchiveEntries(
    archivePath,
    await readFile(archivePath)
  );
  const fileEntries = entries.filter((entry) => !entry.dir);
  const tokenizerEntries = fileEntries.filter(
    (entry) => archiveEntryBaseName(entry.name) === "tokenizer.json"
  );
  if (tokenizerEntries.length === 0) {
    throw new Error("压缩包中未找到 tokenizer.json");
  }

  const candidateRoots = tokenizerEntries
    .map((entry) => archiveEntryDirectory(entry.name))
    .filter((root, index, roots) => roots.indexOf(root) === index)
    .sort((left, right) => {
      const leftHasConfig = fileEntries.some(
        (entry) =>
          archiveEntryDirectory(entry.name) === left &&
          archiveEntryBaseName(entry.name) === "tokenizer_config.json"
      );
      const rightHasConfig = fileEntries.some(
        (entry) =>
          archiveEntryDirectory(entry.name) === right &&
          archiveEntryBaseName(entry.name) === "tokenizer_config.json"
      );
      if (leftHasConfig !== rightHasConfig) return leftHasConfig ? -1 : 1;
      return left.length - right.length;
    });
  const selectedRoot = candidateRoots[0]!;
  const selectedEntries = fileEntries.filter(
    (entry) => archiveEntryDirectory(entry.name) === selectedRoot
  );

  const files: Record<string, string> = {};
  const inlineFiles: Record<string, string> = {};
  let extractedBytes = 0;
  for (const entry of selectedEntries) {
    const baseName = archiveEntryBaseName(entry.name);
    if (!ARCHIVE_FILE_NAMES.has(baseName)) continue;

    const declaredSize = entry.uncompressedSize;
    if (declaredSize !== undefined && declaredSize > MAX_JSON_BYTES) {
      throw new Error(`压缩包内文件超过 50 MB 限制：${baseName}`);
    }

    const content = await entry.readBytes();
    extractedBytes += content.byteLength;
    if (extractedBytes > MAX_ARCHIVE_BYTES) {
      throw new Error("压缩包展开内容超过 100 MB 限制");
    }

    const text = new TextDecoder().decode(content);
    const key = mapKnownFiles([{ name: baseName, path: entry.name }]);
    for (const [mappedKey, mappedPath] of Object.entries(key)) {
      if (files[mappedKey]) continue;
      files[mappedKey] = mappedPath;
      inlineFiles[mappedKey] = text;
    }
  }

  const mapped = files;
  const classified = classifyMappedFiles(mapped);
  if (!mapped.tokenizerJson) {
    throw new Error("压缩包中未找到可用的 tokenizer.json");
  }

  let tokenizerJson: any;
  let tokenizerConfig: any | null = null;
  let specialTokensMap: any | null = null;
  try {
    tokenizerJson = JSON.parse(inlineFiles.tokenizerJson!);
    if (inlineFiles.tokenizerConfig) {
      tokenizerConfig = JSON.parse(inlineFiles.tokenizerConfig);
    }
    if (inlineFiles.specialTokensMap) {
      specialTokensMap = JSON.parse(inlineFiles.specialTokensMap);
    }
  } catch (error) {
    throw new Error(
      `压缩包中的 tokenizer JSON 格式无效：${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return {
    format:
      mapped.specialTokensMap || mapped.addedTokens
        ? "hf-directory"
        : classified.format,
    files: mapped,
    inlineFiles,
    warnings: classified.warnings,
    loadability: classified.loadability,
    suggestedConfidence: classified.suggestedConfidence,
    detectedTokenizerClass: tokenizerConfig?.tokenizer_class,
    detectedModelType: tokenizerJson?.model?.type,
    detectedSpecialTokens: extractSpecialTokens(
      tokenizerJson,
      tokenizerConfig,
      specialTokensMap
    ),
    sourceKind: "archive",
    rootPath: archivePath,
    tokenizerConfigGenerated: Boolean(
      mapped.tokenizerJson && !mapped.tokenizerConfig
    ),
  };
}

export async function scanTokenizerAssetPaths(
  paths: string[]
): Promise<TokenizerImportScanResult> {
  if (paths.length === 0) {
    throw new Error("未选择任何文件或目录");
  }
  if (paths.length === 1 && isArchivePath(paths[0]!)) {
    return scanTokenizerArchive(paths[0]!);
  }
  if (paths.some((path) => isArchivePath(path))) {
    throw new Error("压缩包请单独选择");
  }

  const { files, sourceKind, rootPath } = await collectPaths(paths);
  const mapped = mapKnownFiles(files);
  const classified = classifyMappedFiles(mapped);

  const tokenizerJson = mapped.tokenizerJson
    ? await safeReadJson(mapped.tokenizerJson)
    : null;
  const tokenizerConfig = mapped.tokenizerConfig
    ? await safeReadJson(mapped.tokenizerConfig)
    : null;
  const specialTokensMap = mapped.specialTokensMap
    ? await safeReadJson(mapped.specialTokensMap)
    : null;

  return {
    format:
      sourceKind === "directory" && mapped.tokenizerJson
        ? "hf-directory"
        : classified.format,
    files: mapped,
    warnings: classified.warnings,
    loadability: classified.loadability,
    suggestedConfidence: classified.suggestedConfidence,
    detectedTokenizerClass: tokenizerConfig?.tokenizer_class,
    detectedModelType: tokenizerJson?.model?.type,
    detectedSpecialTokens: extractSpecialTokens(
      tokenizerJson,
      tokenizerConfig,
      specialTokensMap
    ),
    sourceKind,
    rootPath,
    tokenizerConfigGenerated: Boolean(
      mapped.tokenizerJson && !mapped.tokenizerConfig
    ),
  };
}

export function scanRemoteTokenizerUrls(
  tokenizerJsonUrl: string,
  tokenizerConfigUrl?: string
): TokenizerImportScanResult {
  const warnings = tokenizerConfigUrl
    ? []
    : ["未提供 tokenizer_config.json URL，将生成最小配置并标记为近似。"];

  return {
    format: "hf-tokenizer-json",
    files: {
      tokenizerJsonUrl,
      ...(tokenizerConfigUrl ? { tokenizerConfigUrl } : {}),
    },
    warnings,
    loadability: "direct",
    suggestedConfidence: tokenizerConfigUrl ? "exact" : "close",
    sourceKind: "remote",
    tokenizerConfigGenerated: !tokenizerConfigUrl,
  };
}
