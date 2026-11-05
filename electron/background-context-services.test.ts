// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { ContextFilePolicyReader } from "./context-file-policy";
import { BackgroundHostClient } from "./background-host-client";
import { createBackgroundHostServices } from "./background-host-services";
import { BackgroundContextServices } from "./background-context-services";
import { AssetManager } from "./asset-manager";
import {
  longImageFixture,
  installRasterRuntimeFixture,
} from "./fixtures/raster-image";
import { installBundledTokenizerFixture } from "./fixtures/tokenizer-assets";
import type { LlmModelInfo } from "../src/types/llm-profiles";
import type { PipelineAttachment } from "../src/tools/llm-chat/types/pipeline-attachment";

let root: string, app: string;
let runtime: BackgroundContextServices | undefined;
let client: BackgroundHostClient | undefined;
const models: Pick<
  LlmModelInfo,
  "id" | "tokenizerProfileId" | "capabilities"
>[] = [
  {
    id: "fixture-gpt4o",
    tokenizerProfileId: "gpt4o",
    capabilities: {
      vision: true,
      visionTokenCost: {
        calculationMethod: "openai_tile",
        parameters: { baseCost: 85, tileCost: 170, tileSize: 512 },
      },
    },
  },
];
const logger = { warn: vi.fn() };
beforeAll(async () => {
  app = await installRasterRuntimeFixture();
  await installBundledTokenizerFixture(path.join(app, "renderer/tokenizers"));
});
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-background-context-"));
  logger.warn.mockClear();
});
afterEach(async () => {
  await runtime?.shutdown();
  runtime = undefined;
  client?.close();
  client = undefined;
  if (
    path.dirname(root) !== os.tmpdir() ||
    !path.basename(root).startsWith("aio-background-context-")
  )
    throw new Error("Unexpected fixture cleanup");
  await fs.rm(root, { recursive: true, force: true });
});
async function savePolicy(value: unknown) {
  const target = path.join(root, "aio-file-operator/config.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(value), "utf8");
}
const local = (file: string): PipelineAttachment => ({
  id: file,
  name: file,
  type: "image",
  mimeType: "image/png",
  source: { kind: "local-file", path: file },
});
async function contextRuntime() {
  const assets = new AssetManager({
    root,
    trashItem: async () => {},
    emit() {},
    inspectMedia: async () => ({ metadata: {} }),
  });
  const files = new ContextFilePolicyReader(root, async () => [root]);
  const handler = createBackgroundHostServices({
    environment: { root, runtimeRoot: app },
    files,
    assets: {
      getRoot: async () => String(await assets.run("get_asset_base_path")),
    },
    configuration: {
      load: async () => {
        throw new Error("unexpected credential read");
      },
    },
    keys: {
      run: async () => {
        throw new Error("unexpected key operation");
      },
    },
  });
  client = new BackgroundHostClient((request) => {
    void handler(request).then(
      (result) =>
        client!.receive({
          type: "host-response",
          id: request.id,
          ok: true,
          result,
        }),
      () =>
        client!.receive({
          type: "host-response",
          id: request.id,
          ok: false,
          error: { code: "HOST_SERVICE_FAILED", message: "policy failed" },
        })
    );
  });
  const environment = await client.call("host.initialize", undefined);
  runtime = new BackgroundContextServices(client, environment);
  return runtime;
}

describe("current application file policy", () => {
  it("uses redirected default directories and the mandatory workspace, while leaving a missing policy untouched", async () => {
    const redirected = path.join(root, "redirected-desktop");
    const reader = new ContextFilePolicyReader(root, async () => [
      redirected,
      redirected,
    ]);
    expect(await reader.load()).toEqual({
      allowedDirectories: [redirected, path.join(root, "workspace")],
      blackListRules: [],
      sandboxMode: "whitelist",
      maxFileSize: 10 * 1024 * 1024,
    });
    expect((await fs.stat(path.join(root, "workspace"))).isDirectory()).toBe(
      true
    );
    await expect(
      fs.stat(path.join(root, "aio-file-operator/config.json"))
    ).rejects.toMatchObject({ code: "ENOENT" });
    await savePolicy({
      allowedDirectories: [],
      blackListRules: [],
      sandboxMode: "blacklist",
      approvalGranted: true,
    });
    const custom = await reader.load();
    expect(custom.allowedDirectories).toEqual([path.join(root, "workspace")]);
    expect(custom.sandboxMode).toBe("blacklist");
    expect(custom).not.toHaveProperty("approvalGranted");
  });
  it("preserves and rejects corrupt, malformed, oversized or redirected storage instead of broadening access", async () => {
    await savePolicy({});
    const target = path.join(root, "aio-file-operator/config.json");
    const reader = new ContextFilePolicyReader(root, async () => [root]);
    for (const value of [
      "{broken",
      "null",
      JSON.stringify({ allowedDirectories: null }),
      JSON.stringify({ blackListRules: [{ path: "", type: "block" }] }),
      JSON.stringify({ maxFileSize: -1 }),
      " ".repeat(1024 * 1024 + 1),
    ]) {
      await fs.writeFile(target, value, "utf8");
      await expect(reader.load(), value.slice(0, 80)).rejects.toThrow();
      expect(await fs.readFile(target, "utf8")).toBe(value);
    }
    const outside = path.join(root, "redirected.json");
    await fs.writeFile(outside, "{}");
    await fs.unlink(target);
    await fs.symlink(outside, target, "file");
    await expect(reader.load()).rejects.toThrow("重定向");
  });
});

describe("assembled Worker context resources", () => {
  it("uses Main's latest policy for cached local bytes, including tighter size limits, approvals and blocked paths", async () => {
    await savePolicy({
      allowedDirectories: [root],
      blackListRules: [],
      maxFileSize: 100,
    });
    const file = path.join(root, "local.png");
    await fs.writeFile(file, "original-content");
    const runtime = await contextRuntime(),
      scope = await runtime.createScope({ models, logger });
    const attachment = local(file);
    expect(
      Buffer.from(await scope.getAttachmentBuffer(attachment)).toString()
    ).toBe("original-content");
    await fs.writeFile(file, "replacement");
    expect(
      Buffer.from(await scope.getAttachmentBuffer(attachment)).toString()
    ).toBe("original-content");
    await savePolicy({ allowedDirectories: [root], maxFileSize: 2 });
    await expect(scope.getAttachmentBuffer(attachment)).rejects.toThrow("大小");
    await savePolicy({
      allowedDirectories: [root],
      blackListRules: [{ path: root, type: "approve" }],
    });
    await expect(scope.getAttachmentBuffer(attachment)).rejects.toThrow("审批");
    await savePolicy({
      allowedDirectories: [root],
      blackListRules: [{ path: root, type: "block" }],
    });
    await expect(
      scope.getAttachmentBuffer({
        ...attachment,
        source: { kind: "local-file", path: file, approvalGranted: true },
      })
    ).rejects.toThrow("死区");
    await savePolicy({ allowedDirectories: [] });
    await expect(scope.getAttachmentBuffer(attachment)).rejects.toThrow(
      "白名单"
    );
    await savePolicy({ allowedDirectories: [root] });
    expect(
      Buffer.from(await scope.getAttachmentBuffer(attachment)).toString()
    ).toBe("original-content");
  });
  it("resolves the current asset root through the existing owner, while scopes retain their byte snapshots", async () => {
    const custom = path.join(root, "custom-assets");
    await fs.mkdir(path.join(root, "assets/images"), { recursive: true });
    await fs.mkdir(path.join(custom, "images"), { recursive: true });
    await fs.writeFile(path.join(root, "assets/images/fixture.png"), "default");
    await fs.writeFile(path.join(custom, "images/fixture.png"), "custom");
    const attachment: PipelineAttachment = {
      ...local("fixture"),
      source: { kind: "asset-library", path: "images/fixture.png" },
    };
    const runtime = await contextRuntime(),
      first = await runtime.createScope({ models, logger });
    expect(
      Buffer.from(await first.getAttachmentBuffer(attachment)).toString()
    ).toBe("default");
    await fs.mkdir(path.join(root, "app-settings"), { recursive: true });
    await fs.writeFile(
      path.join(root, "app-settings/settings.json"),
      JSON.stringify({ customAssetPath: custom })
    );
    const second = await runtime.createScope({ models, logger });
    expect(
      Buffer.from(await second.getAttachmentBuffer(attachment)).toString()
    ).toBe("custom");
    expect(
      Buffer.from(await first.getAttachmentBuffer(attachment)).toString()
    ).toBe("default");
    await expect(
      second.getAttachmentBuffer({
        ...attachment,
        source: { kind: "asset-library", path: "../outside.png" },
      })
    ).rejects.toThrow();
  });
  it("pins real tokenizer/model and slicing snapshots, and disposes scopes independently before application shutdown", async () => {
    await savePolicy({ allowedDirectories: [root] });
    const image = longImageFixture(),
      file = path.join(root, "long.png");
    await fs.writeFile(file, Buffer.from(image.buffer));
    const runtime = await contextRuntime();
    const slicing = {
      enabled: true,
      aspectRatioThreshold: 3,
      minCutHeight: 120,
    };
    const pending = runtime.createScope({ models, slicing, logger });
    slicing.enabled = false;
    const first = await pending,
      second = await runtime.createScope({ models, logger });
    expect(
      (await first.tokens.calculateTokens("hello world", "fixture-gpt4o")).count
    ).toBe(2);
    const attachment = local(file),
      buffer = await first.getAttachmentBuffer(attachment);
    expect(await first.getImageDimensions(buffer)).toMatchObject({
      width: 80,
      height: 800,
    });
    const parts = await first.processImageSlices(
      attachment,
      buffer,
      {},
      async (data) => [await first.getImageDimensions(data)]
    );
    expect(parts.length).toBe(4);
    const budget = await first.tokens.calculateMessageTokens(
      "hello world",
      "fixture-gpt4o",
      [attachment]
    );
    expect(budget).toMatchObject({
      imageTokenCount: 1020,
      textTokenCount: 2,
      count: 1022,
      isEstimated: false,
    });
    first.dispose();
    await expect(first.getAttachmentBuffer(attachment)).rejects.toThrow();
    expect(
      (await second.tokens.calculateTokens("hello world", "fixture-gpt4o"))
        .count
    ).toBe(2);
    await runtime.shutdown();
    await expect(
      second.tokens.calculateTokens("hello world", "fixture-gpt4o")
    ).rejects.toThrow();
    await expect(runtime.createScope({ models, logger })).rejects.toThrow(
      "关闭"
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });
  it("rejects a canceled scope and cancels scope preparation when the owner shuts down", async () => {
    const runtime = await contextRuntime();
    const abort = new AbortController();
    abort.abort(new Error("fixture cancel"));
    await expect(
      runtime.createScope({ models, logger, signal: abort.signal })
    ).rejects.toThrow("fixture cancel");
    const pending = runtime.createScope({ models, logger });
    const check = expect(pending).rejects.toThrow();
    await runtime.shutdown();
    await check;
  });
});
