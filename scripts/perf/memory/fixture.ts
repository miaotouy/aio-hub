// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import {
  buildPerfFixture,
  PERF_AGENT_ID,
  PERF_SESSION_ID,
  PERF_FIXTURE_TIMESTAMP,
} from "../fixture";
import { appearanceSettings, type AppearanceCase } from "./matrix";
import type { MemoryCorpus } from "./corpus";

export const EMPTY_SESSION_ID = "memory-empty";
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
/** Distinct deterministic pixel planes: same dimensions do not imply a shared URL/cache entry. */
export function imagePng(width: number, height: number, seed: number): Buffer {
  const row = width * 3 + 1;
  const pixels = Buffer.alloc(row * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * row + 1 + x * 3;
      pixels[i] = (x + seed * 31) & 255;
      pixels[i + 1] = (y + seed * 47) & 255;
      pixels[i + 2] = ((x ^ y) + seed * 17) & 255;
    }
  function chunk(type: string, data: Buffer) {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
    return Buffer.concat([length, name, data, crc]);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function writeMemoryFixture(
  dataDir: string,
  corpus: MemoryCorpus,
  appearance: AppearanceCase,
  libraryCount = corpus.libraryCount
) {
  const base = buildPerfFixture({ messageCount: 2 });
  const files: Record<string, any> = base.files;
  delete files[`llm-chat/sessions/${PERF_SESSION_ID}.json`];
  const empty = {
    id: EMPTY_SESSION_ID,
    rootNodeId: `${EMPTY_SESSION_ID}-root`,
    activeLeafId: `${EMPTY_SESSION_ID}-root`,
    nodes: {
      [`${EMPTY_SESSION_ID}-root`]: {
        id: `${EMPTY_SESSION_ID}-root`,
        parentId: null,
        childrenIds: [],
        role: "system",
        content: "",
        status: "complete",
        isEnabled: true,
        timestamp: PERF_FIXTURE_TIMESTAMP,
      },
    },
    updatedAt: PERF_FIXTURE_TIMESTAMP,
    history: [],
    historyIndex: -1,
  };
  const details = [
    empty,
    ...corpus.sessions.map((s) => structuredClone(s.detail)),
  ];
  const assetsDir = path.join(dataDir, "assets", "memory");
  fs.mkdirSync(assetsDir, { recursive: true });
  let imageIndex = 0;
  let documentIndex = 0;
  let reconstructedPixelBytes = 0;
  const imageDimensions = { embedded: 0, "html-hint": 0, fallback: 0 };
  function image(width: number, height: number) {
    const file = `image-${imageIndex++}.png`;
    const bytes = imagePng(width, height, imageIndex);
    fs.writeFileSync(path.join(assetsDir, file), bytes);
    reconstructedPixelBytes += width * height * 4;
    return {
      relative: `memory/${file}`,
      absolute: path.join(assetsDir, file),
      size: bytes.length,
    };
  }
  const inlineCache = new Map<string, string>();
  function inlineImages(body: string) {
    return body.replace(/memory-image-\d+/g, (reference) => {
      if (inlineCache.has(reference)) return inlineCache.get(reference)!;
      const spec = corpus.images?.[reference] ?? {
        width: 640,
        height: 480,
        source: "fallback" as const,
      };
      imageDimensions[spec.source]++;
      const asset = image(spec.width, spec.height);
      const url = `http://asset.localhost/${encodeURIComponent(asset.absolute)}`;
      inlineCache.set(reference, url);
      return url;
    });
  }
  for (const detail of details) {
    for (const node of Object.values(detail.nodes) as any[]) {
      node.content = inlineImages(node.content);
      if (node.metadata?.reasoningContent)
        node.metadata.reasoningContent = inlineImages(
          node.metadata.reasoningContent
        );
      if (node.metadata?.translation?.content)
        node.metadata.translation.content = inlineImages(
          node.metadata.translation.content
        );
      for (const asset of node.attachments ?? []) {
        if (asset.type === "image") {
          const generated = image(asset.metadata.width, asset.metadata.height);
          asset.path = generated.relative;
          asset.size = generated.size;
        } else {
          const file = `document-${documentIndex++}.txt`;
          fs.writeFileSync(
            path.join(assetsDir, file),
            "Memory replay document\n",
            "utf8"
          );
          asset.path = `memory/${file}`;
          asset.size = 23;
        }
      }
    }
    files[`llm-chat/sessions/${detail.id}.json`] = {
      ...detail,
      name:
        detail.id === EMPTY_SESSION_ID
          ? "Memory empty"
          : `Memory ${corpus.sessions.find((s) => s.id === detail.id)!.profile}`,
      createdAt: PERF_FIXTURE_TIMESTAMP,
      displayAgentId: PERF_AGENT_ID,
      messageCount: Object.keys(detail.nodes).length - 1,
    };
  }
  const indexes = details.map((detail, i) => ({
    id: detail.id,
    name: i ? `Memory ${corpus.sessions[i - 1].profile}` : "Memory empty",
    displayAgentId: PERF_AGENT_ID,
    messageCount: Object.keys(detail.nodes).length - 1,
    createdAt: PERF_FIXTURE_TIMESTAMP,
    updatedAt: PERF_FIXTURE_TIMESTAMP,
    isFavorite: false,
  }));
  // Padding keeps large real libraries in memory without copying titles, identities or bodies.
  for (let i = indexes.length; i < libraryCount; i++)
    indexes.push({
      id: `memory-library-${i}`,
      name: `Archived conversation ${i}`,
      displayAgentId: PERF_AGENT_ID,
      messageCount: 0,
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
      isFavorite: false,
    });
  files["llm-chat/sessions-index.json"] = {
    version: "1.1.2",
    currentSessionId: EMPTY_SESSION_ID,
    sessions: indexes,
    favoriteFolders: [],
  };
  const settings = files["app-settings/settings.json"];
  settings.theme = appearance.theme;
  settings.appearance = appearanceSettings(appearance);
  // Display replay never sends messages or explicitly starts transcription. Keep the
  // default transcription settings so passive-preview regressions remain observable.
  // The synthetic agent binding alone does not prevent attachment preprocessing.
  const agent = files[`agent-manager/agents/${PERF_AGENT_ID}/agent.json`];
  agent.profileId = "perf-glass-profile";
  agent.modelId = "perf-glass-model";
  for (const [relative, value] of Object.entries(files)) {
    const target = path.join(dataDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(value), "utf8");
  }
  return {
    libraryCount: indexes.length,
    images: imageIndex,
    documents: documentIndex,
    reconstructedPixelBytes,
    imageDimensions,
  };
}
