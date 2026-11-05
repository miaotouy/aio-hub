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

import fs from "node:fs/promises";
import path from "node:path";
import { lookup } from "mime-types";
import { read as readCompound, find as findCompound } from "cfb";
import { fileTypeFromFile } from "file-type";
import type { AssetType } from "./asset-store";
const textExtensions = new Set([
  "txt",
  "text",
  "log",
  "cfg",
  "conf",
  "ini",
  "env",
  "md",
  "markdown",
  "rst",
  "adoc",
  "asciidoc",
  "xml",
  "html",
  "htm",
  "xhtml",
  "svg",
  "json",
  "yaml",
  "yml",
  "toml",
  "csv",
  "tsv",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "py",
  "pyw",
  "pyi",
  "rb",
  "php",
  "java",
  "kt",
  "kts",
  "c",
  "cpp",
  "cc",
  "cxx",
  "h",
  "hpp",
  "hxx",
  "cs",
  "go",
  "rs",
  "swift",
  "m",
  "mm",
  "scala",
  "lua",
  "perl",
  "pl",
  "r",
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  "bat",
  "cmd",
  "css",
  "scss",
  "sass",
  "less",
  "styl",
  "vue",
  "svelte",
  "astro",
  "gitignore",
  "dockerignore",
  "editorconfig",
  "makefile",
  "cmake",
  "gradle",
  "sql",
  "graphql",
  "proto",
  "thrift",
]);
const office = new Set(["docx", "xlsx", "pptx", "odt", "ott", "fodt"]);
export async function detectAssetMime(
  filename: string,
  name = filename
): Promise<string> {
  const extension = path.extname(name).slice(1).toLowerCase();
  const guessed =
    extension === "wps"
      ? "application/kswps"
      : lookup(name) || "application/octet-stream";
  if (["odt", "ott", "fodt"].includes(extension))
    return "application/vnd.oasis.opendocument.text";
  if (office.has(extension)) return guessed;
  if (extension === "doc") return "application/msword";
  if (extension === "wps") {
    const handle = await fs.open(filename, "r");
    try {
      const header = Buffer.alloc(8);
      await handle.read(header, 0, 8, 0);
      if (header.subarray(0, 5).toString() === "{\\rtf")
        return "application/rtf";
    } finally {
      await handle.close();
    }
  }
  const detected = await fileTypeFromFile(filename).catch(() => undefined);
  if (extension === "wps") {
    if (detected?.mime.includes("wordprocessingml")) return detected.mime;
    if (
      detected?.mime === "application/x-cfb" &&
      (await fs.stat(filename)).size <= 256 * 1024 ** 2
    ) {
      try {
        const compound = readCompound(await fs.readFile(filename), {
          type: "buffer",
        });
        const word = findCompound(compound, "WordDocument");
        const fib = word ? Buffer.from(word.content as Uint8Array) : undefined;
        if (
          fib &&
          fib.length >= 12 &&
          fib.readUInt16LE(0) === 0xa5ec &&
          !(fib.readUInt16LE(10) & 0x8100) &&
          (findCompound(compound, "0Table") || findCompound(compound, "1Table"))
        )
          return "application/msword";
      } catch {
        /* Keep unsupported or encrypted WPS containers in their original format. */
      }
    }
    return guessed;
  }
  if (detected?.mime && detected.mime !== "application/x-cfb")
    return detected.mime;
  if (textExtensions.has(extension)) return "text/" + extension;
  return guessed;
}
export async function assetTypeFor(
  mime: string,
  filename: string,
  sniffText = true
): Promise<AssetType> {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("video/")) return "video";
  if (
    mime.startsWith("text/") ||
    /^(application\/(pdf|msword|kswps|rtf|vnd\.ms-(excel|powerpoint)|vnd\.oasis\.opendocument\.text|vnd\.openxmlformats-officedocument))/.test(
      mime
    )
  )
    return "document";
  if (sniffText && mime === "application/octet-stream") {
    const handle = await fs.open(filename, "r");
    try {
      const sample = Buffer.alloc(8192);
      const { bytesRead } = await handle.read(sample);
      if (!sample.subarray(0, bytesRead).includes(0)) {
        try {
          new TextDecoder("utf-8", { fatal: true }).decode(
            sample.subarray(0, bytesRead),
            { stream: true }
          );
          return "document";
        } catch {
          /* Binary bytes. */
        }
      }
    } finally {
      await handle.close();
    }
  }
  return "other";
}
