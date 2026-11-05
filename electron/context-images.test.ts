// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { createNodeLlmTransport } from "./llm-transport";
import { executeOpenAiChat } from "../src/llm-apis/adapters/openai/chat-executor";
import { NodeContextImages, type RasterImageRuntime } from "./context-images";
import { NodeContextAttachments } from "./context-attachments";
import { NodeTokenCalculator } from "./token-calculator";
import {
  longImageFixture,
  pngFixture,
  installRasterRuntimeFixture,
} from "./fixtures/raster-image";
import {
  calculateRowVariance,
  effectiveImageSlicingConfig,
  planImageSlicesFromVariances,
} from "../src/tools/smart-ocr/utils/imageSlicePlan";
import { createAssetResolver } from "../src/tools/llm-chat/core/pipeline/processors/asset-resolver";
import { createTokenLimiter } from "../src/tools/llm-chat/core/pipeline/processors/token-limiter";
import { executeContextPipeline } from "../src/tools/llm-chat/core/pipeline/executeContextPipeline";
import type { PipelineContext } from "../src/tools/llm-chat/types/pipeline";
import type { PipelineAttachment } from "../src/tools/llm-chat/types/pipeline-attachment";
import type { AssetResolverPorts } from "../src/tools/llm-chat/core/pipeline/service-ports";
import type { AgentFileSecurity } from "./file-security";

const require = createRequire(import.meta.url);
const config = { enabled: true, aspectRatioThreshold: 3, minCutHeight: 120 };
const logger = { debug() {}, info() {}, warn: vi.fn(), error() {} };
const bytes = (data: ArrayBuffer) => Buffer.from(data);
let app: string, root: string, images: NodeContextImages;
let security: AgentFileSecurity;
const asset = (file = "long.png"): PipelineAttachment => ({
  id: file,
  name: file,
  type: "image",
  mimeType: "image/png",
  source: { kind: "local-file", path: path.join(root, file) },
});
const attachments = () =>
  new NodeContextAttachments({
    root,
    getAssetRoot: async () => path.join(root, "assets"),
    getLocalSecurity: async () => security,
  });
let Raster: new () => RasterImageRuntime;
beforeAll(async () => {
  app = await installRasterRuntimeFixture();
  const target = path.join(app, "native-runtime/knowledge-addon.node");
  Raster = require(target).RasterImageRuntime;
  if (!Raster)
    throw new Error(
      "Build the current native addon before testing production image codecs"
    );
});
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "aio-context-image-"));
  images = new NodeContextImages(app);
  security = {
    allowedDirectories: [root],
    blackListRules: [],
    sandboxMode: "whitelist",
    maxFileSize: 64 * 1024 * 1024,
  };
  logger.warn.mockClear();
});
afterEach(async () => {
  await images.shutdown();
  if (
    path.dirname(root) !== os.tmpdir() ||
    !path.basename(root).startsWith("aio-context-image-")
  )
    throw new Error("Unexpected fixture cleanup path");
  await fs.rm(root, { force: true, recursive: true });
});
// Native DLLs stay loaded until this test process exits on Windows; retain the tiny isolated addon copy.

// Protects real media bytes, task ownership and budget/send alignment. Native codecs are not mocked here.
describe("Node production context images", () => {
  it("uses the same real-pixel variance and contiguous cuts as the browser planner", async () => {
    const fixture = longImageFixture();
    const reference = planImageSlicesFromVariances(
      fixture.width,
      fixture.height,
      calculateRowVariance({ ...fixture, data: fixture.rgba }),
      effectiveImageSlicingConfig(config)
    );
    expect(reference.regions.length).toBeGreaterThan(2);
    expect(await images.plan(fixture.buffer, config)).toEqual(reference);
    const parts = await images.slices(
      fixture.buffer,
      reference,
      undefined,
      async (data) => [await images.getImageDimensions(data)]
    );
    expect(parts.map((part) => part.height)).toEqual(
      reference.regions.map((region) => region.endY - region.startY)
    );
    expect(parts.reduce((sum, part) => sum + part.height, 0)).toBe(
      fixture.height
    );
    expect(parts.every((part) => part.width === fixture.width)).toBe(true);
  });

  it("reencodes PNG, JPEG and quality-controlled WebP, composites transparent JPEG pixels, and reads oriented JPEG dimensions", async () => {
    const fixture = pngFixture(100, 50, (x) =>
      x < 50 ? [0, 0, 0, 0] : [255, 255, 255, 255]
    );
    expect(
      await images.resizeImage(fixture.buffer, {
        maxWidth: 200,
        maxHeight: 200,
      })
    ).toBe(fixture.buffer);
    for (const format of ["png", "jpeg", "webp"] as const) {
      const output = await images.resizeImage(fixture.buffer, {
        maxWidth: 40,
        maxHeight: 40,
        format,
        quality: 0.9,
      });
      expect(await images.getImageDimensions(output)).toMatchObject({
        width: 40,
        height: 20,
      });
      if (format === "png")
        expect(bytes(output).subarray(0, 8)).toEqual(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
        );
      if (format === "webp")
        expect(bytes(output).toString("ascii", 8, 12)).toBe("WEBP");
      if (format === "jpeg") {
        expect(bytes(output).subarray(0, 2)).toEqual(Buffer.from([255, 216]));
        const runtime = new Raster();
        try {
          await runtime.load(bytes(output));
          expect(
            (await runtime.rowVariances()).every((value) => value < 1)
          ).toBe(true);
        } finally {
          runtime.close();
        }
      }
    }
    const resizedTransparent = await images.resizeImage(fixture.buffer, {
      maxWidth: 40,
      maxHeight: 40,
      format: "png",
    });
    const composited = await images.resizeImage(resizedTransparent, {
      maxWidth: 40,
      maxHeight: 40,
      format: "jpeg",
    });
    const pixels = new Raster();
    try {
      await pixels.load(bytes(composited));
      expect((await pixels.rowVariances()).every((value) => value < 1)).toBe(
        true
      );
    } finally {
      pixels.close();
    }
    const detailed = pngFixture(100, 100, (x, y) => [
      (x * 13 + y * 17) % 256,
      (x * 23 + y * 5) % 256,
      (x * y * 3) % 256,
      255,
    ]);
    const low = await images.resizeImage(detailed.buffer, {
      maxWidth: 100,
      maxHeight: 100,
      format: "webp",
      quality: 0.1,
    });
    const high = await images.resizeImage(detailed.buffer, {
      maxWidth: 100,
      maxHeight: 100,
      format: "webp",
      quality: 1,
    });
    expect(high.byteLength).toBeGreaterThan(low.byteLength);
    const jpeg = bytes(
      await images.resizeImage(fixture.buffer, {
        maxWidth: 100,
        maxHeight: 100,
        format: "jpeg",
      })
    );
    // A valid little-endian EXIF IFD containing orientation=6 (90 degrees clockwise).
    const exif = Buffer.from(
      "45786966000049492a0008000000010012010300010000000600000000000000",
      "hex"
    );
    const segment = Buffer.alloc(4);
    segment[0] = 255;
    segment[1] = 225;
    segment.writeUInt16BE(exif.length + 2, 2);
    const oriented = Buffer.concat([
      jpeg.subarray(0, 2),
      segment,
      exif,
      jpeg.subarray(2),
    ]);
    const array = new ArrayBuffer(oriented.length);
    new Uint8Array(array).set(oriented);
    expect(await images.getImageDimensions(array)).toMatchObject({
      width: 50,
      height: 100,
    });
  });

  it("pins authorized bytes across budget and actual asset materialization and uses per-slice image costs", async () => {
    const fixture = longImageFixture();
    await fs.writeFile(path.join(root, "long.png"), bytes(fixture.buffer));
    const attachment = asset();
    const scope = images.createScope(attachments(), {
      slicing: config,
      logger,
    });
    const base = await new NodeTokenCalculator({
      root,
      bundledAssetsDir: path.join(root, "unused"),
    }).createScope([
      {
        id: "local",
        capabilities: {
          visionTokenCost: {
            calculationMethod: "claude_3",
            parameters: { costPerImage: 100 },
          },
        },
      },
    ]);
    const tokens = scope.wrapTokenCalculator(base);
    const plan = await images.plan(fixture.buffer, config);
    expect(
      await tokens.calculateMessageTokens("", "local", [attachment])
    ).toMatchObject({
      imageTokenCount: plan.regions.length * 100,
      isEstimated: false,
    });
    // Rewriting a mutable path cannot change the bytes already selected for this build.
    await fs.writeFile(
      path.join(root, "long.png"),
      bytes(pngFixture(30, 30, () => [1, 2, 3, 255]).buffer)
    );
    const ctx = {
      messages: [
        {
          role: "user",
          content: "",
          sourceType: "session_history",
          _attachments: [attachment],
        },
      ],
      agentConfig: {
        modelId: "local",
        parameters: {
          contextManagement: { enabled: true, maxContextTokens: 10000 },
        },
      },
      settings: {
        requestSettings: {
          longImageSlicing: config,
          imageOnlyMessagePlaceholder: true,
        },
      },
      capabilities: { maxImageDimension: 70 },
      sharedData: new Map(),
      logs: [],
    } as unknown as PipelineContext;
    const ports: AssetResolverPorts = {
      ...scope,
      logger,
      errorHandler: { handle: vi.fn() },
      convertPdfToImages: async () => {
        throw new Error("PDF conversion is outside this image test");
      },
    };
    await executeContextPipeline(
      ctx,
      [
        createTokenLimiter({ logger, getContextTokenCalculator: () => tokens }),
        createAssetResolver(ports),
      ],
      {
        logger,
        reportProcessorError: async (error) => {
          throw error;
        },
      }
    );
    const content = ctx.messages[0].content as any[];
    expect(content[0]).toMatchObject({ type: "text", text: "[图片]" });
    const parts = content.filter((part) => part.type === "image");
    expect(parts).toHaveLength(plan.regions.length);
    for (const part of parts) {
      const value = Buffer.from(part.imageBase64, "base64"),
        buffer = new ArrayBuffer(value.length);
      new Uint8Array(buffer).set(value);
      const dimensions = await images.getImageDimensions(buffer);
      expect(dimensions.width).toBeLessThanOrEqual(70);
      expect(dimensions.height).toBeLessThanOrEqual(70);
    }
    let received: any;
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      received = JSON.parse(Buffer.concat(chunks).toString());
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: "images accepted" },
              finish_reason: "stop",
            },
          ],
        })
      );
    });
    const transport = createNodeLlmTransport({
      getProxy: () => ({ mode: "none" }),
      resolveProxy: async () => "DIRECT",
    });
    try {
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const profile = {
        id: "local",
        name: "local",
        type: "openai-compatible",
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
        apiKeys: [],
        models: [{ id: "local", name: "local" }],
      } as any;
      expect(
        (
          await executeOpenAiChat(
            profile,
            {
              requestId: "native-image-context",
              profileId: "local",
              modelId: "local",
              messages: ctx.messages as any,
              timeout: 2000,
            },
            { transport, buildHeaders: () => ({}) }
          )
        ).content
      ).toBe("images accepted");
      const sent = received.messages[0].content.filter(
        (part: any) => part.type === "image_url"
      );
      expect(sent).toHaveLength(parts.length);
      for (let i = 0; i < sent.length; i++)
        expect(sent[i].image_url.url).toContain(parts[i].imageBase64);
    } finally {
      transport.dispose();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      scope.dispose();
    }
    await expect(scope.getAttachmentBuffer(attachment)).rejects.toThrow();
  });

  it("keeps passive statistics lazy and marks unprepared long images as estimated", async () => {
    const scope = images.createScope(attachments(), {
      slicing: config,
      statistics: true,
      logger,
    });
    const base = await new NodeTokenCalculator({
      root,
      bundledAssetsDir: "unused",
    }).createScope([]);
    expect(
      await scope
        .wrapTokenCalculator(base)
        .calculateMessageTokens("", "unknown", [asset("missing.png")])
    ).toMatchObject({ isEstimated: true });
    expect(await fs.readdir(root)).toEqual([]);
    scope.dispose();
  });

  it("rejects corrupt images, excessive dimensions and invalid outputs while leaving subsequent native work usable", async () => {
    await expect(
      images.getImageDimensions(new ArrayBuffer(8))
    ).rejects.toThrow();
    const huge = pngFixture(1, 1, () => [0, 0, 0, 255], {
      width: 40000,
      height: 40000,
    });
    await expect(images.getImageDimensions(huge.buffer)).rejects.toThrow(
      "像素"
    );
    const fixture = pngFixture(20, 10, () => [1, 2, 3, 255]);
    await expect(
      images.resizeImage(fixture.buffer, {
        maxWidth: 5,
        maxHeight: 5,
        format: "webp",
        quality: 7,
      })
    ).rejects.toThrow("质量");
    expect(await images.getImageDimensions(fixture.buffer)).toMatchObject({
      width: 20,
      height: 10,
    });
  });

  it("rechecks current local policy for cached bytes and rejects approval bypass, dead zones, escapes and junctions", async () => {
    await fs.writeFile(
      path.join(root, "long.png"),
      bytes(longImageFixture().buffer)
    );
    const reader = attachments(),
      attachment = asset();
    await reader.read(attachment);
    security.blackListRules = [{ path: root, type: "approve" }];
    await expect(reader.read(attachment)).rejects.toThrow("审批");
    const approved = {
      ...attachment,
      source: { ...attachment.source, approvalGranted: true },
    } as PipelineAttachment;
    await reader.read(approved);
    security.blackListRules = [{ path: root, type: "block" }];
    await expect(reader.read(approved)).rejects.toThrow("死区");
    const lib = path.join(root, "assets");
    await fs.mkdir(lib);
    const privateDir = path.join(root, "agent-manager/agents/agent");
    await fs.mkdir(privateDir, { recursive: true });
    const libraryAsset = {
      ...attachment,
      source: { kind: "asset-library", path: "../long.png" },
    } as PipelineAttachment;
    await expect(reader.read(libraryAsset)).rejects.toThrow();
    await fs.symlink(root, path.join(lib, "redirect"), "junction");
    await expect(
      reader.read({
        ...attachment,
        source: { kind: "asset-library", path: "redirect/long.png" },
      })
    ).rejects.toThrow();
    await expect(
      reader.read({
        ...attachment,
        source: {
          kind: "agent-private",
          agentId: "agent",
          relativePath: "../../../long.png",
        },
      })
    ).rejects.toThrow();
    reader.dispose();
  });

  it("reads inline, message, library and agent-private attachment bytes with size and disposal boundaries", async () => {
    const lib = path.join(root, "assets/images");
    await fs.mkdir(lib, { recursive: true });
    const dir = path.join(root, "agent-manager/agents/agent/attachments");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(lib, "asset.bin"), "library");
    await fs.writeFile(path.join(dir, "note.txt"), "agent");
    const reader = attachments(),
      a = asset();
    for (const [source, expected] of [
      [{ kind: "message-text", text: "正文" }, "正文"],
      [
        {
          kind: "inline",
          base64: Buffer.from("inline").toString("base64"),
          mimeType: "text/plain",
        },
        "inline",
      ],
      [{ kind: "asset-library", path: "images/asset.bin" }, "library"],
      [
        {
          kind: "agent-private",
          agentId: "agent",
          relativePath: "attachments/note.txt",
        },
        "agent",
      ],
    ] as const)
      expect(bytes(await reader.read({ ...a, source })).toString()).toBe(
        expected
      );
    await expect(
      reader.read({
        ...a,
        source: { kind: "inline", base64: "bad%%%", mimeType: "text/plain" },
      })
    ).rejects.toThrow("Base64");
    reader.dispose();
    await expect(reader.read(a)).rejects.toThrow("释放");
  });
});

// Bounded deterministic lifetime tests exercise states that real codecs cannot hold open predictably.
describe("Node bitmap lifetime", () => {
  it("keeps a failing native slice group private and falls back once to the original byte snapshot", async () => {
    await images.shutdown();
    const fixture = longImageFixture();
    const variances = calculateRowVariance({ ...fixture, data: fixture.rgba });
    let encoded = 0;
    class Runtime {
      async load() {
        return { width: fixture.width, height: fixture.height };
      }
      async rowVariances() {
        return variances;
      }
      async encode() {
        if (++encoded === 2) throw new Error("fixture slice encoder failed");
        return Buffer.from("slice");
      }
      close() {}
    }
    images = new NodeContextImages(app, () => ({
      RasterImageRuntime: Runtime,
    }));
    await fs.writeFile(path.join(root, "long.png"), bytes(fixture.buffer));
    const scope = images.createScope(attachments(), {
      slicing: config,
      logger,
    });
    const process = vi.fn(async (data: ArrayBuffer) => {
      expect(bytes(data)).toEqual(bytes(fixture.buffer));
      return ["whole original"];
    });
    expect(
      await scope.processImageSlices(asset(), fixture.buffer, {}, process)
    ).toEqual(["whole original"]);
    expect(process).toHaveBeenCalledTimes(1);
    expect(encoded).toBe(2);
    expect(
      await scope.processImageSlices(asset(), fixture.buffer, {}, process)
    ).toEqual(["whole original"]);
    expect(encoded).toBe(2);
    expect(process).toHaveBeenCalledTimes(2);
    scope.dispose();
  });

  it("releases a stopped caller promptly, keeps queued operations ordered and drains native work on shutdown", async () => {
    await images.shutdown();
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      started = new Promise<void>((resolve) => {
        entered = resolve;
      });
    const created: { closed: boolean }[] = [];
    class Runtime {
      closed = false;
      constructor() {
        created.push(this);
      }
      async load() {
        entered();
        await gate;
        return { width: 1, height: 1 };
      }
      async rowVariances() {
        return [];
      }
      async encode() {
        return Buffer.alloc(0);
      }
      close() {
        this.closed = true;
      }
    }
    images = new NodeContextImages(app, () => ({
      RasterImageRuntime: Runtime,
    }));
    const controller = new AbortController();
    const first = images.getImageDimensions(
      new ArrayBuffer(1),
      controller.signal
    );
    await started;
    const middleController = new AbortController();
    const middle = images.getImageDimensions(
      new ArrayBuffer(1),
      middleController.signal
    );
    const last = images.getImageDimensions(new ArrayBuffer(1));
    controller.abort();
    middleController.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(middle).rejects.toMatchObject({ name: "AbortError" });
    expect(created).toHaveLength(1);
    expect(created[0].closed).toBe(true);
    release();
    expect(await last).toMatchObject({ width: 1, height: 1 });
    expect(created).toHaveLength(2);
    await images.shutdown();
    await expect(images.getImageDimensions(new ArrayBuffer(1))).rejects.toThrow(
      "关闭"
    );
  });
});
