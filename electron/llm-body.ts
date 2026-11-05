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
import { createReadStream } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LlmHttpOptions } from "./shared";

type UploadChunk = Uint8Array | string;
export interface UploadBody {
  headers: Headers;
  chunks: AsyncIterable<UploadChunk>;
}
interface FileRef {
  kind: "local-file-ref";
  path: string;
  contentType?: string;
}
const MANIFEST_LIMIT = 16 * 1024 * 1024;
const JSON_LIMIT = 100 * 1024 * 1024;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("上传描述格式无效");
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 4096): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > max ||
    /[\r\n\0]/.test(value)
  )
    throw new TypeError(label + "无效");
  return value;
}
function mime(value: unknown): string {
  const result = text(value, "媒体类型", 255);
  if (!/^[\w!#$&^_.+-]+\/[\w!#$&^_.+-]+(?:;[^\r\n]*)?$/.test(result))
    throw new TypeError("媒体类型无效");
  return result;
}
function fileRef(value: unknown): FileRef {
  const ref = object(value);
  if (
    ref.kind !== "local-file-ref" ||
    Object.keys(ref).some(
      (key) => !["kind", "path", "contentType"].includes(key)
    )
  )
    throw new TypeError("本地文件引用无效");
  const filename = text(ref.path, "本地文件路径");
  if (!path.isAbsolute(filename))
    throw new TypeError("本地文件路径需为绝对路径");
  return {
    kind: "local-file-ref",
    path: filename,
    ...(ref.contentType == null ? {} : { contentType: mime(ref.contentType) }),
  };
}
async function fileSize(filename: string): Promise<number> {
  const stat = await fs.stat(filename);
  if (!stat.isFile()) throw new TypeError("上传内容需为普通文件");
  return stat.size;
}
function parse(body: Uint8Array, limit: number): unknown {
  if (body.byteLength > limit) throw new TypeError("上传描述超过大小限制");
  return JSON.parse(Buffer.from(body).toString("utf8"));
}
async function expand(value: unknown, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  if (value && typeof value === "object") {
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++)
        value[i] = await expand(value[i], signal);
    } else {
      const record = object(value);
      if (record.kind === "local-file-ref") {
        const ref = fileRef(record);
        await fileSize(ref.path);
        const bytes = await fs.readFile(ref.path, { signal });
        return (
          "data:" +
          (ref.contentType ?? "application/octet-stream") +
          ";base64," +
          bytes.toString("base64")
        );
      }
      for (const key of Object.keys(record))
        record[key] = await expand(record[key], signal);
    }
  } else if (typeof value === "string") {
    const match =
      /^(data:(?:image\/|audio\/|video\/|application\/pdf)[^,]*,)local-file:\/\/(.+)$/.exec(
        value
      );
    if (match) {
      const ref = fileRef({
        kind: "local-file-ref",
        path: decodeURIComponent(match[2]),
      });
      await fileSize(ref.path);
      return (
        match[1] + (await fs.readFile(ref.path, { signal })).toString("base64")
      );
    }
  }
  return value;
}
const quoted = (value: string) => value.replaceAll('"', "%22");
interface Part {
  prefix: Buffer;
  bytes?: Buffer;
  file?: string;
  size: number;
}

/** Resolve desktop payloads in the host. File and multipart uploads retain bounded streams. */
export async function prepareLlmBody(
  body: Uint8Array | undefined,
  headers: Headers,
  options: LlmHttpOptions,
  signal: AbortSignal
): Promise<UploadBody> {
  signal.throwIfAborted();
  const output = new Headers(headers);
  // Length and transfer framing are owned by the final encoded upload, never its descriptor.
  output.delete("content-length");
  output.delete("transfer-encoding");
  let bytes = body;
  if (body && options.bodyKind === "file-ref") {
    const ref = fileRef(parse(body, MANIFEST_LIMIT));
    output.set("content-type", ref.contentType ?? "application/octet-stream");
    output.set("content-length", String(await fileSize(ref.path)));
    return {
      headers: output,
      chunks: (async function* () {
        yield* createReadStream(ref.path, { signal });
      })(),
    };
  }
  if (body && options.bodyKind === "multipart-manifest") {
    const manifest = object(parse(body, MANIFEST_LIMIT));
    if (
      Object.keys(manifest).some((key) => key !== "parts") ||
      !Array.isArray(manifest.parts)
    )
      throw new TypeError("multipart 描述无效");
    const boundary = "aiohub-" + randomUUID();
    const parts: Part[] = [];
    for (const entry of manifest.parts) {
      const part = object(entry);
      if (
        Object.keys(part).some(
          (key) =>
            !["name", "body", "filename", "contentType", "headers"].includes(
              key
            )
        )
      )
        throw new TypeError("multipart 字段无效");
      let disposition =
        'form-data; name="' + quoted(text(part.name, "字段名称", 1024)) + '"';
      if (part.filename != null)
        disposition +=
          '; filename="' + quoted(text(part.filename, "文件名")) + '"';
      const partHeaders = new Headers();
      if (part.headers != null) {
        for (const [key, value] of Object.entries(object(part.headers))) {
          if (typeof value !== "string")
            throw new TypeError("multipart 请求头无效");
          partHeaders.set(key, value);
        }
      }
      partHeaders.set("content-disposition", disposition);
      const value = object(part.body);
      let data: Buffer | undefined;
      let file: string | undefined;
      let size: number;
      if (value.kind === "text" && typeof value.value === "string") {
        data = Buffer.from(value.value);
        size = data.length;
      } else if (
        value.kind === "bytes" &&
        typeof value.base64 === "string" &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
          value.base64
        )
      ) {
        data = Buffer.from(value.base64, "base64");
        size = data.length;
      } else if (value.kind === "file-ref") {
        const ref = fileRef(value.ref);
        file = ref.path;
        size = await fileSize(file);
        if (ref.contentType) partHeaders.set("content-type", ref.contentType);
      } else throw new TypeError("multipart 内容无效");
      if (part.contentType != null)
        partHeaders.set("content-type", mime(part.contentType));
      const prefix = Buffer.from(
        "--" +
          boundary +
          "\r\n" +
          [...partHeaders]
            .map(([key, value]) => key + ": " + value)
            .join("\r\n") +
          "\r\n\r\n"
      );
      parts.push({ prefix, bytes: data, file, size });
    }
    const suffix = Buffer.from("--" + boundary + "--\r\n");
    output.set("content-type", "multipart/form-data; boundary=" + boundary);
    output.set(
      "content-length",
      String(
        parts.reduce(
          (sum, part) => sum + part.prefix.length + part.size + 2,
          suffix.length
        )
      )
    );
    return {
      headers: output,
      chunks: (async function* () {
        for (const part of parts) {
          signal.throwIfAborted();
          yield part.prefix;
          if (part.file) yield* createReadStream(part.file, { signal });
          else yield part.bytes!;
          yield "\r\n";
        }
        yield suffix;
      })(),
    };
  }
  if (body && options.expandJson) {
    const value = await expand(parse(body, JSON_LIMIT), signal);
    bytes = Buffer.from(JSON.stringify(value));
  }
  if (bytes) output.set("content-length", String(bytes.byteLength));
  return {
    headers: output,
    chunks: (async function* () {
      if (bytes) yield bytes;
    })(),
  };
}
