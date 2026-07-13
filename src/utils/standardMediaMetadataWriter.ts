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

import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("utils/standardMediaMetadataWriter");

export interface StandardMediaMetadata {
  title?: string;
  artist?: string;
  album?: string;
  genre?: string;
  comment?: string;
  software?: string;
  date?: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export async function writeStandardMediaMetadata(
  buffer: ArrayBuffer,
  mimeType: string,
  metadata: StandardMediaMetadata
): Promise<ArrayBuffer> {
  const normalizedMime = mimeType.toLowerCase();
  const normalizedMetadata = compactMetadata(metadata);

  if (Object.keys(normalizedMetadata).length === 0) return buffer;

  if (
    normalizedMime === "audio/mpeg" ||
    normalizedMime === "audio/mp3" ||
    normalizedMime === "audio/mpeg3"
  ) {
    return writeId3v23Metadata(buffer, normalizedMetadata);
  }

  if (
    normalizedMime === "audio/wav" ||
    normalizedMime === "audio/wave" ||
    normalizedMime === "audio/x-wav"
  ) {
    return writeWavInfoMetadata(buffer, normalizedMetadata);
  }

  logger.debug("standard metadata write skipped for unsupported audio format", {
    mimeType,
  });
  return buffer;
}

function compactMetadata(
  metadata: StandardMediaMetadata
): StandardMediaMetadata {
  const result: StandardMediaMetadata = {};
  for (const [key, value] of Object.entries(metadata)) {
    const normalized = String(value ?? "").trim();
    if (normalized) {
      result[key as keyof StandardMediaMetadata] = normalized;
    }
  }
  return result;
}

function writeId3v23Metadata(
  buffer: ArrayBuffer,
  metadata: StandardMediaMetadata
): ArrayBuffer {
  const frames = [
    createTextFrame("TIT2", metadata.title),
    createTextFrame("TPE1", metadata.artist),
    createTextFrame("TALB", metadata.album),
    createTextFrame("TCON", metadata.genre),
    createTextFrame("TYER", metadata.date?.slice(0, 4)),
    createTextFrame("TSSE", metadata.software),
    createCommentFrame(metadata.comment),
  ].filter(Boolean) as Uint8Array[];

  if (frames.length === 0) return buffer;

  const frameBytes = concatBytes(frames);
  const header = new Uint8Array(10);
  header.set(asciiBytes("ID3"), 0);
  header[3] = 3;
  header[4] = 0;
  header[5] = 0;
  header.set(encodeSynchsafe(frameBytes.length), 6);

  const original = stripExistingId3v2(new Uint8Array(buffer));
  const result = new Uint8Array(
    header.length + frameBytes.length + original.length
  );
  result.set(header, 0);
  result.set(frameBytes, header.length);
  result.set(original, header.length + frameBytes.length);

  logger.info("wrote MP3 ID3 standard metadata", {
    frameCount: frames.length,
  });
  return result.buffer;
}

function createTextFrame(
  frameId: string,
  value: string | undefined
): Uint8Array | null {
  if (!value) return null;
  return createId3Frame(
    frameId,
    concatBytes([new Uint8Array([1]), utf16Le(value)])
  );
}

function createCommentFrame(value: string | undefined): Uint8Array | null {
  if (!value) return null;
  const descriptor = utf16Le("AIO Hub");
  const comment = utf16Le(value);
  const terminator = new Uint8Array([0, 0]);
  const payload = concatBytes([
    new Uint8Array([1]),
    asciiBytes("eng"),
    descriptor,
    terminator,
    comment,
  ]);
  return createId3Frame("COMM", payload);
}

function createId3Frame(frameId: string, payload: Uint8Array): Uint8Array {
  const frame = new Uint8Array(10 + payload.length);
  frame.set(asciiBytes(frameId), 0);
  writeUint32BE(frame, 4, payload.length);
  frame[8] = 0;
  frame[9] = 0;
  frame.set(payload, 10);
  return frame;
}

function stripExistingId3v2(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 10 || textDecoder.decode(bytes.subarray(0, 3)) !== "ID3") {
    return bytes;
  }

  const size = decodeSynchsafe(bytes.subarray(6, 10));
  const hasFooter = (bytes[5] & 0x10) !== 0;
  const totalSize = 10 + size + (hasFooter ? 10 : 0);
  if (totalSize <= bytes.length) return bytes.subarray(totalSize);
  return bytes;
}

function writeWavInfoMetadata(
  buffer: ArrayBuffer,
  metadata: StandardMediaMetadata
): ArrayBuffer {
  const original = new Uint8Array(buffer);
  if (
    original.length < 12 ||
    textDecoder.decode(original.subarray(0, 4)) !== "RIFF" ||
    textDecoder.decode(original.subarray(8, 12)) !== "WAVE"
  ) {
    logger.debug("WAV INFO write skipped because file is not RIFF/WAVE");
    return buffer;
  }

  const infoChunks = [
    createWavInfoChunk("INAM", metadata.title),
    createWavInfoChunk("IART", metadata.artist),
    createWavInfoChunk("IPRD", metadata.album),
    createWavInfoChunk("IGNR", metadata.genre),
    createWavInfoChunk("ICMT", metadata.comment),
    createWavInfoChunk("ISFT", metadata.software),
    createWavInfoChunk("ICRD", metadata.date),
  ].filter(Boolean) as Uint8Array[];

  if (infoChunks.length === 0) return buffer;

  const infoData = concatBytes([asciiBytes("INFO"), ...infoChunks]);
  const listChunk = new Uint8Array(8 + infoData.length + (infoData.length % 2));
  listChunk.set(asciiBytes("LIST"), 0);
  writeUint32LE(listChunk, 4, infoData.length);
  listChunk.set(infoData, 8);

  const result = new Uint8Array(original.length + listChunk.length);
  result.set(original, 0);
  result.set(listChunk, original.length);
  writeUint32LE(result, 4, result.length - 8);

  logger.info("wrote WAV INFO standard metadata", {
    chunkCount: infoChunks.length,
  });
  return result.buffer;
}

function createWavInfoChunk(
  chunkId: string,
  value: string | undefined
): Uint8Array | null {
  if (!value) return null;
  const text = textEncoder.encode(`${value}\0`);
  const chunk = new Uint8Array(8 + text.length + (text.length % 2));
  chunk.set(asciiBytes(chunkId), 0);
  writeUint32LE(chunk, 4, text.length);
  chunk.set(text, 8);
  return chunk;
}

function asciiBytes(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function utf16Le(value: string): Uint8Array {
  const bytes = new Uint8Array(2 + value.length * 2);
  bytes[0] = 0xff;
  bytes[1] = 0xfe;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    bytes[2 + i * 2] = code & 0xff;
    bytes[3 + i * 2] = code >> 8;
  }
  return bytes;
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function writeUint32BE(target: Uint8Array, offset: number, value: number) {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function writeUint32LE(target: Uint8Array, offset: number, value: number) {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function encodeSynchsafe(value: number): Uint8Array {
  return new Uint8Array([
    (value >> 21) & 0x7f,
    (value >> 14) & 0x7f,
    (value >> 7) & 0x7f,
    value & 0x7f,
  ]);
}

function decodeSynchsafe(bytes: Uint8Array): number {
  return (
    ((bytes[0] & 0x7f) << 21) |
    ((bytes[1] & 0x7f) << 14) |
    ((bytes[2] & 0x7f) << 7) |
    (bytes[3] & 0x7f)
  );
}
