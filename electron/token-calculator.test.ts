// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NodeTokenCalculator } from "./token-calculator";
import { createTokenLimiter } from "../src/tools/llm-chat/core/pipeline/processors/token-limiter";
import type { PipelineContext } from "../src/tools/llm-chat/types/pipeline";
import { installBundledTokenizerFixture } from "./fixtures/tokenizer-assets";
import type { LlmModelInfo } from "../src/types/llm-profiles";

let root: string, assets: string, service: NodeTokenCalculator;
const model = {
  id: "custom-model",
  tokenizerProfileId: "gpt4o",
  capabilities: {
    visionTokenCost: {
      calculationMethod: "openai_tile",
      parameters: { baseCost: 85, tileCost: 170, tileSize: 512 },
    },
  },
} as Pick<LlmModelInfo, "id" | "tokenizerProfileId" | "capabilities">;
const localProfile = (id: string, file: string) => ({
  id,
  name: id,
  version: "1",
  modelPatterns: [],
  source: {
    type: "local",
    tokenizerJsonPath: file,
    tokenizerConfigPath: path.join(path.dirname(file), "tokenizer_config.json"),
  },
  confidence: "exact",
});
async function save(
  profiles: unknown[] = [],
  builtinOverrides = {},
  rules: unknown[] = []
) {
  const dir = path.join(root, "tokenizer-registry");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "profiles.json"),
    JSON.stringify({ version: "1.0.0", profiles, builtinOverrides })
  );
  await fs.writeFile(
    path.join(dir, "rules.json"),
    JSON.stringify({ version: "1.0.0", rules })
  );
}
async function wordLevel(id: string) {
  const dir = path.join(root, "tokenizer-assets", id);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, "tokenizer.json");
  await fs.writeFile(
    file,
    JSON.stringify({
      version: "1.0",
      truncation: null,
      padding: null,
      added_tokens: [],
      normalizer: null,
      pre_tokenizer: { type: "Whitespace" },
      post_processor: null,
      decoder: null,
      model: {
        type: "WordLevel",
        vocab: { "[UNK]": 0, hello: 1, world: 2 },
        unk_token: "[UNK]",
      },
    })
  );
  await fs.writeFile(
    path.join(dir, "tokenizer_config.json"),
    JSON.stringify({
      tokenizer_class: "PreTrainedTokenizer",
      unk_token: "[UNK]",
      model_max_length: 1000000000,
    })
  );
  return file;
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-node-token-"));
  assets = path.join(root, "bundled");
  service = new NodeTokenCalculator({ root, bundledAssetsDir: assets });
});
afterEach(async () => {
  vi.restoreAllMocks();
  if (
    path.dirname(root) !== os.tmpdir() ||
    !path.basename(root).startsWith("aio-node-token-")
  )
    throw new Error("Unexpected fixture cleanup path");
  await fs.rm(root, { recursive: true, force: true });
});

// These integrations protect the host/asset/registry boundary; existing engine tests cover formula details.
describe("Node production token services", () => {
  it("loads the real bundled gzip tokenizer and shares concurrent cold loads without renderer globals", async () => {
    await installBundledTokenizerFixture(assets);
    const scope = await service.createScope([model]);
    const result = await Promise.all(
      Array.from({ length: 12 }, () =>
        scope.calculateTokens("hello world", model.id)
      )
    );
    expect(
      result.every(
        (r) =>
          r.count === 2 &&
          r.rawCount === 2 &&
          !r.isEstimated &&
          r.tokenizerProfileId === "gpt4o"
      )
    ).toBe(true);
    expect(await scope.calculateTokens("", model.id)).toMatchObject({
      count: 0,
      tokenizerName: "none",
    });
    expect(
      await scope.calculateTokens("hello world", "unknown-provider")
    ).toMatchObject({
      count: 3,
      isEstimated: true,
      tokenizerName: "estimator",
    });
  });

  it("uses installed local and cached remote data offline, with user rules before model metadata", async () => {
    const file = await wordLevel("word"),
      local = localProfile("user.word", file);
    const remote = {
      ...localProfile("remote.word", file),
      source: {
        type: "remote",
        tokenizerJsonUrl: "https://invalid.example/tokenizer.json",
        cachedTokenizerJsonPath: file,
        cachedTokenizerConfigPath: path.join(
          path.dirname(file),
          "tokenizer_config.json"
        ),
      },
      calibration: { multiplier: 2, fixedOverhead: 1 },
    };
    await save([local, remote], {}, [
      { id: "rule", pattern: "custom", profileId: remote.id, priority: 9 },
    ]);
    const scope = await service.createScope([
      { ...model, tokenizerProfileId: local.id },
    ]);
    expect(await scope.calculateTokens("hello world", model.id)).toMatchObject({
      count: 5,
      rawCount: 2,
      isEstimated: false,
      tokenizerProfileId: remote.id,
    });
    await save([local, remote], {}, [
      { id: "rule", pattern: "custom", profileId: remote.id, enabled: false },
    ]);
    const next = await service.createScope([
      { ...model, tokenizerProfileId: local.id },
    ]);
    expect(await next.calculateTokens("hello world", model.id)).toMatchObject({
      count: 2,
      tokenizerProfileId: local.id,
    });
    expect(await scope.calculateTokens("hello", model.id)).toMatchObject({
      count: 3,
      tokenizerProfileId: remote.id,
    });
  });

  it("pins registry and model snapshots per build while new scopes observe disabled profiles and calibration", async () => {
    await installBundledTokenizerFixture(assets);
    const input = structuredClone(model);
    const first = await service.createScope([input]);
    input.tokenizerProfileId = "missing";
    input.capabilities!.visionTokenCost = {
      calculationMethod: "fixed",
      parameters: { fixedCost: 7 },
    } as any;
    await save([], {
      gpt4o: { calibration: { multiplier: 3, fixedOverhead: 2 } },
    });
    const calibrated = await service.createScope([model]);
    expect(
      await calibrated.calculateTokens("hello world", model.id)
    ).toMatchObject({ count: 8, rawCount: 2 });
    await save([], { gpt4o: { enabled: false } });
    expect(
      await (
        await service.createScope([model])
      ).calculateTokens("hello world", model.id)
    ).toMatchObject({ count: 3, isEstimated: true });
    expect(await first.calculateTokens("hello world", model.id)).toMatchObject({
      count: 2,
      isEstimated: false,
    });
    expect(
      await first.calculateMessageTokens("", model.id, [
        { type: "image", metadata: { width: 512, height: 512 } },
      ])
    ).toMatchObject({ imageTokenCount: 255 });
  });

  it("uses the shared resized-image and duration accounting while retaining estimation flags", async () => {
    await installBundledTokenizerFixture(assets);
    const scope = await service.createScope([model]);
    const attachments = [
      { type: "image", metadata: { width: 1024, height: 1024 } },
      { type: "video", metadata: { duration: 1.2 } },
      { type: "audio", metadata: { duration: 2.1 } },
    ] as const;
    const options = { maxImageDimension: 512 };
    const result = await scope.calculateMessageTokens(
      "hello world",
      model.id,
      structuredClone([...attachments]),
      options
    );
    expect(result).toMatchObject({
      count: 879,
      textTokenCount: 2,
      imageTokenCount: 255,
      videoTokenCount: 526,
      audioTokenCount: 96,
      mediaTokenCount: 877,
      isEstimated: false,
    });
    expect(attachments[0].metadata.width).toBe(1024);
    expect(
      await scope.calculateMessageTokens("hello world", model.id, [
        { type: "image" },
      ])
    ).toMatchObject({ count: 767, isEstimated: true });
  });

  it("applies real text and image token costs to the shared history budget", async () => {
    await installBundledTokenizerFixture(assets);
    const scope = await service.createScope([model]);
    const logger = { debug() {}, info() {}, warn() {}, error() {} };
    const limiter = createTokenLimiter({
      logger,
      getContextTokenCalculator: () => scope,
    });
    const context = {
      messages: [
        {
          sourceId: "preset",
          role: "system",
          content: "hello world",
          sourceType: "preset",
        },
        {
          sourceId: "old",
          role: "assistant",
          content: "hello world",
          sourceType: "session_history",
        },
        {
          sourceId: "latest",
          role: "user",
          content: "hello world",
          sourceType: "session_history",
          _attachments: [
            { type: "image", metadata: { width: 512, height: 512 } },
          ],
        },
      ],
      agentConfig: {
        modelId: model.id,
        parameters: {
          contextManagement: { enabled: true, maxContextTokens: 260 },
        },
      },
      logs: [],
      sharedData: new Map(),
    } as unknown as PipelineContext;
    await limiter.execute(context);
    expect(context.messages.map((message) => message.sourceId)).toEqual([
      "preset",
      "latest",
    ]);
  });

  it("preserves malformed registry data and allows repair and retry instead of resetting user choices", async () => {
    await save();
    const file = path.join(root, "tokenizer-registry/profiles.json");
    await fs.writeFile(file, "{broken");
    await expect(service.createScope([model])).rejects.toThrow();
    expect(await fs.readFile(file, "utf8")).toBe("{broken");
    await save([], { gpt4o: { enabled: false } });
    expect(
      await (
        await service.createScope([model])
      ).calculateTokens("hello world", model.id)
    ).toMatchObject({ isEstimated: true });
  });

  it("refuses registry redirects and asset paths outside tokenizer-assets, retaining the documented estimator fallback for unavailable assets", async () => {
    const outside = path.join(root, "unrelated.json");
    await fs.writeFile(outside, "private fixture");
    await save([localProfile("user.outside", outside)]);
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    const scope = await service.createScope([
      { ...model, tokenizerProfileId: "user.outside" },
    ]);
    expect(await scope.calculateTokens("hello world", model.id)).toMatchObject({
      count: 3,
      isEstimated: true,
    });
    expect(
      warn.mock.calls
        .flat()
        .some((value) => String(value).includes("tokenizer-assets"))
    ).toBe(true);
    const redirected = path.join(root, "tokenizer-registry");
    const moved = path.join(root, "registry-target");
    await fs.rename(redirected, moved);
    await fs.symlink(moved, redirected, "junction");
    await expect(service.createScope([model])).rejects.toThrow("重定向");
  });

  it("releases a cancelled caller while a shared cold asset load can still serve another scope", async () => {
    await installBundledTokenizerFixture(assets);
    const controller = new AbortController();
    const first = await service.createScope([model], controller.signal);
    const second = await service.createScope([model]);
    const open = fs.open.bind(fs);
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.spyOn(fs, "readFile").mockImplementation(async (...args: any[]) => {
      if (String(args[0]).endsWith("tokenizer.json.gz")) {
        enter();
        await blocked;
      }
      const file = await open(args[0], "r");
      try {
        return await file.readFile(args[1]);
      } finally {
        await file.close();
      }
    });
    const pending = first.calculateTokens("hello world", model.id);
    await entered;
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    const survivor = second.calculateTokens("hello world", model.id);
    release();
    expect(await survivor).toMatchObject({ count: 2, isEstimated: false });
    await expect(
      first.calculateTokens("hello", model.id)
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
