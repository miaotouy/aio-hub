// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createMacroRegistryRuntime } from "../src/tools/llm-chat/macro-engine/runtime/registry";
import { createMacroProcessorClass } from "../src/tools/llm-chat/macro-engine/runtime/processor";
import { createMacroProcessingFunctions } from "../src/tools/llm-chat/macro-engine/runtime/processing";
import {
  MacroPhase,
  MacroType,
} from "../src/tools/llm-chat/macro-engine/runtime/definitions";
import { registerCoreMacros } from "../src/tools/llm-chat/macro-engine/macros/core";
import { registerVariableMacros } from "../src/tools/llm-chat/macro-engine/macros/variables";
import { registerFunctionMacros } from "../src/tools/llm-chat/macro-engine/macros/functions";
import {
  registerDateTimeMacros,
  freezeDatetimeDisplay,
} from "../src/tools/llm-chat/macro-engine/macros/datetime";
import {
  createContextProcessors,
  type ContextProcessorServices,
} from "../src/tools/llm-chat/core/pipeline/createContextProcessors";
import { executeContextPipeline } from "../src/tools/llm-chat/core/pipeline/executeContextPipeline";
import { createPresetAttachmentResolver } from "../src/tools/llm-chat/core/pipeline/preset-attachments";
import { createRecallProcessors } from "../src/tools/llm-chat/core/pipeline/processors/recall-processor";
import { createTranscriptionProcessor } from "../src/tools/llm-chat/core/pipeline/processors/transcription-processor";
import { createAssetResolver } from "../src/tools/llm-chat/core/pipeline/processors/asset-resolver";
import { createAsyncTaskProcessor } from "../src/tools/llm-chat/core/pipeline/processors/async-task-processor";
import { createNodeLlmTransport, type NodeLlmTransport } from "./llm-transport";
import { executeOpenAiChat } from "../src/llm-apis/adapters/openai/chat-executor";
import { NodeTokenCalculator } from "./token-calculator";
import { installBundledTokenizerFixture } from "./fixtures/tokenizer-assets";
import { NodeContextImages } from "./context-images";
import { NodeContextAttachments } from "./context-attachments";
import {
  longImageFixture,
  installRasterRuntimeFixture,
} from "./fixtures/raster-image";
import type {
  PipelineContext,
  ContextProcessor,
} from "../src/tools/llm-chat/types/pipeline";
import type { PipelineAttachment } from "../src/tools/llm-chat/types/pipeline-attachment";
import type { ChatMessageNode } from "../src/tools/llm-chat/types/message";

const logger = { debug() {}, info() {}, warn() {}, error() {} };
const diagnosticPorts = () => ({ logger, errorHandler: { handle: vi.fn() } });
function macroRuntime() {
  const diagnostics = diagnosticPorts();
  const { getMacroRegistry } = createMacroRegistryRuntime({
    logger,
    wrapRegistryMap: (map) => map,
  });
  const registry = getMacroRegistry();
  registerCoreMacros(registry);
  registerVariableMacros(registry);
  registerFunctionMacros(registry);
  registerDateTimeMacros(registry);
  const Processor = createMacroProcessorClass({
    ...diagnostics,
    getRegistry: getMacroRegistry,
  });
  return {
    ...diagnostics,
    registry,
    Processor,
    ...createMacroProcessingFunctions(diagnostics),
  };
}
function context(): PipelineContext {
  return {
    messages: [],
    index: { id: "session", name: "Owner pipeline" },
    detail: {
      id: "session",
      nodes: {},
      rootNodeId: "root",
      activeLeafId: "root",
    },
    agentConfig: {
      id: "agent",
      name: "Worker",
      profileId: "local",
      modelId: "model",
      parameters: {},
    },
    settings: { requestSettings: { imageOnlyMessagePlaceholder: true } },
    timestamp: Date.parse("2026-11-05T12:00:00Z"),
    logs: [],
    sharedData: new Map(),
  } as unknown as PipelineContext;
}
function fixture() {
  const macros = macroRuntime();
  const diagnostics = diagnosticPorts();
  const fail = async () => {
    throw new Error("Unexpected host service dispatch");
  };
  const textTokens = {
    calculateTokens: async (text: string) => ({ count: text.length }),
    calculateMessageTokens: async (text: string) => ({ count: text.length }),
  };
  const tasks = new Map<string, any>();
  const services = {
    sessionLoader: { logger },
    regexProcessor: { logger },
    worldbookProcessor: { logger },
    variableProcessor: { logger },
    injectionAssembler: {
      logger,
      createMacroProcessor: () => new macros.Processor(),
      buildMacroContext: macros.buildMacroContext,
      processMacros: macros.processMacros,
      freezeDatetimeDisplay,
      resolvePresetAttachments: createPresetAttachmentResolver({ logger }),
    },
    asyncTaskProcessor: {
      logger,
      getTasks: () => ({ getTask: (id: string) => tasks.get(id) }),
    },
    recallProcessor: {
      resolvePlaceholderRetrieval: vi.fn(async () => ({
        activated: true,
        content: "RECALL-EVIDENCE",
        resultCount: 1,
      })),
    },
    transcriptionProcessor: {
      ...diagnostics,
      getTranscriptionManager: () => null,
      getTranscriptionAsset: fail,
      splitZipDocumentIntoImageAssets: fail,
      isDocxAssetLike: () => false,
      isPptxAssetLike: () => false,
      isXlsxAssetLike: () => false,
      resolveAttachmentsBatch: vi.fn(async (assets: PipelineAttachment[]) =>
        assets.map((asset) => ({
          asset,
          type: "text",
          content: "TEXT-EVIDENCE",
        }))
      ),
    },
    tokenLimiter: { logger, getContextTokenCalculator: () => textTokens },
    messageFormatter: { logger, getContextTokenCalculator: () => textTokens },
    assetResolver: {
      ...diagnostics,
      convertArrayBufferToBase64: async (data: ArrayBuffer) =>
        Buffer.from(data).toString("base64"),
      getAttachmentBuffer: async (asset: PipelineAttachment) => {
        if (asset.source.kind !== "local-file")
          throw new Error("Unexpected fixture source");
        const data = await fs.readFile(asset.source.path);
        return data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength
        );
      },
      convertPdfToImages: fail,
      getImageDimensions: fail,
      resizeImage: fail,
      processImageSlices: async (
        _asset: unknown,
        data: ArrayBuffer,
        _context: unknown,
        process: (buffer: ArrayBuffer) => Promise<unknown>
      ) => process(data),
    },
  } as unknown as ContextProcessorServices;
  return { services, macros, tasks, diagnostics };
}
const pipelinePorts = () => ({
  logger,
  reportProcessorError: vi.fn(async () => {}),
});
function gate<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
let imageService: NodeContextImages | undefined;
let imageScope: ReturnType<NodeContextImages["createScope"]> | undefined;
let temp: string | undefined,
  server: Server | undefined,
  transport: NodeLlmTransport | undefined;
afterEach(async () => {
  imageScope?.dispose();
  imageScope = undefined;
  await imageService?.shutdown();
  imageService = undefined;
  transport?.dispose();
  transport = undefined;
  if (server) {
    const current = server;
    server = undefined;
    current.closeAllConnections();
    await new Promise<void>((done) => current.close(() => done()));
  }
  if (temp) {
    if (
      path.dirname(temp) !== os.tmpdir() ||
      !path.basename(temp).startsWith("aio-context-services-")
    )
      throw new Error("Unexpected context fixture cleanup path");
    await fs.rm(temp, { recursive: true, force: true });
    temp = undefined;
  }
});

describe("owner-injected full context services in Node", () => {
  it("executes the production three-phase macros with isolated registries and static validation", async () => {
    const first = macroRuntime(),
      second = macroRuntime();
    const ctx = first.buildMacroContext({
      userName: "Lin",
      charName: "Worker",
      timestamp: Date.parse("2026-11-05T12:00:00Z"),
    });
    const output = await first.processMacros(
      new first.Processor(),
      "{{setvar::n::2}}{{incvar::n}}{{user}}/{{char}}/{{getvar::n}}/{{date_ymd}} \\{{char}}",
      ctx
    );
    expect(output).toBe("Lin/Worker/3/2026-11-05 {{char}}");
    first.registry.unregister("user");
    expect(first.Processor.validateMacro("user").valid).toBe(false);
    expect(second.Processor.validateMacro("user").valid).toBe(true);
    expect(
      (
        await new second.Processor().process(
          "{{getvar::n}}",
          second.buildMacroContext({})
        )
      ).output
    ).toBe("");
    expect(first.errorHandler.handle).not.toHaveBeenCalled();
  });

  it("runs all eleven processors and sends the resulting presets, Recall, task state, text and actual media bytes over Node HTTP", async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), "aio-context-services-"));
    const audioPath = path.join(temp, "语音.wav"),
      bytes = Buffer.from([82, 73, 70, 70, 0, 1, 2, 255]);
    await fs.writeFile(audioPath, bytes);
    const f = fixture(),
      ctx = context();
    const n = (
      id: string,
      parentId: string | null,
      role: ChatMessageNode["role"],
      content: string
    ): ChatMessageNode => ({
      id,
      parentId,
      childrenIds: [],
      role,
      content,
      status: "complete",
    });
    ctx.detail.nodes = {
      root: n("root", null, "system", "root"),
      user: n("user", "root", "user", "seed 【file::note】"),
      task: n("task", "user", "tool", '{"type":"async_task","taskId":"job"}'),
    };
    ctx.detail.activeLeafId = "task";
    ctx.detail.nodes.user.attachments = [
      {
        id: "note",
        type: "text",
        name: "note.md",
        path: "fixture/note.md",
        mimeType: "text/markdown",
      },
    ] as any;
    ctx.detail.nodes.user.localMedia = [
      {
        id: "audio",
        type: "audio",
        name: "语音.wav",
        path: audioPath,
        mimeType: "audio/wav",
        size: bytes.length,
        approvalGranted: true,
      },
    ];
    const imagePath = path.join(temp, "long.png"),
      imageFixture = longImageFixture();
    await fs.writeFile(imagePath, Buffer.from(imageFixture.buffer));
    ctx.detail.nodes.user.localMedia.push({
      id: "long",
      type: "image",
      name: "long.png",
      path: imagePath,
      mimeType: "image/png",
      size: imageFixture.buffer.byteLength,
      approvalGranted: true,
    });
    ctx.settings.requestSettings.longImageSlicing = {
      enabled: true,
      aspectRatioThreshold: 3,
      minCutHeight: 120,
    };
    ctx.detail.nodes.user.virtualAttachments = [
      { id: "draft", kind: "text", title: "材料", text: "VIRTUAL-EVIDENCE" },
    ];
    ctx.agentConfig.presetMessages = [
      n(
        "preset",
        null,
        "system",
        "Hello {{user}}/{{char}} 【recall::collection=allowed】 <svar name=hp op=+ value=2 /> hp=$[hp]"
      ),
    ];
    Object.assign(ctx, { userProfile: { id: "user", name: "Lin" } });
    ctx.agentConfig.toolCallConfig = {
      enabled: false,
      convertToolRoleToUser: false,
    } as any;
    ctx.agentConfig.recallConfig = {
      enabled: true,
      bindings: [{ recallId: "allowed", recallName: "Allowed", enabled: true }],
    } as any;
    ctx.agentConfig.variableConfig = {
      enabled: true,
      definitions: [{ key: "hp", type: "variable", initialValue: 3 }],
    } as any;
    ctx.agentConfig.parameters!.contextManagement = {
      enabled: true,
      maxContextTokens: 10000,
    } as any;
    ctx.settings.regexConfig = {
      presets: [
        {
          id: "r",
          enabled: true,
          rules: [
            {
              id: "r",
              enabled: true,
              regex: "seed",
              replacement: "QUERY",
              targetRoles: ["user"],
              applyTo: { request: true },
            },
          ],
        },
      ],
    } as any;
    ctx.sharedData.set("loadedWorldbooks", [
      {
        metadata: { name: "book" },
        entries: {
          1: {
            uid: 1,
            key: ["QUERY"],
            keysecondary: [],
            content: "WORLD-EVIDENCE",
            constant: false,
            selective: false,
            order: 1,
            position: 0,
            disable: false,
            probability: 100,
            preventRecursion: true,
          },
        },
      },
    ]);
    ctx.sharedData.set("anchorDefinitions", []);
    ctx.sharedData.set("transcriptionConfig", { enabled: true });
    f.tasks.set("job", {
      status: "completed",
      result: "TASK-EVIDENCE",
      resultAssetIds: ["result-asset"],
    });
    // Real production Node token service replaces the deterministic budget fixture in this end-to-end chain.
    const tokenAssets = path.join(temp, "tokenizers");
    await installBundledTokenizerFixture(tokenAssets);
    const tokenScope = await new NodeTokenCalculator({
      root: temp,
      bundledAssetsDir: tokenAssets,
    }).createScope([
      { id: ctx.agentConfig.modelId, tokenizerProfileId: "gpt4o" },
    ]);
    imageService = new NodeContextImages(await installRasterRuntimeFixture());
    imageScope = imageService.createScope(
      new NodeContextAttachments({
        root: temp,
        getAssetRoot: async () => path.join(temp!, "assets"),
        getLocalSecurity: async () => ({
          allowedDirectories: [temp!],
          sandboxMode: "whitelist",
          blackListRules: [],
          maxFileSize: 64 * 1024 * 1024,
        }),
      }),
      { slicing: ctx.settings.requestSettings.longImageSlicing, logger }
    );
    const mediaTokens = imageScope.wrapTokenCalculator(tokenScope);
    f.services.assetResolver = { ...f.services.assetResolver, ...imageScope };
    const tokenPorts = { logger, getContextTokenCalculator: () => mediaTokens };
    f.services.tokenLimiter = tokenPorts;
    f.services.messageFormatter = tokenPorts;
    expect(
      await tokenScope.calculateTokens("hello world", ctx.agentConfig.modelId)
    ).toMatchObject({ count: 2, isEstimated: false });
    const p = pipelinePorts();
    const processors = createContextProcessors(f.services).sort(
      (a, b) => a.priority - b.priority
    );
    await executeContextPipeline(ctx, processors, p);
    expect(p.reportProcessorError).not.toHaveBeenCalled();
    const all = JSON.stringify(ctx.messages);
    for (const text of [
      "Hello Lin/Worker",
      "WORLD-EVIDENCE",
      "RECALL-EVIDENCE",
      "hp=5",
      "QUERY",
      "TEXT-EVIDENCE",
      "VIRTUAL-EVIDENCE",
      "TASK-EVIDENCE",
      bytes.toString("base64"),
    ])
      expect(all).toContain(text);
    expect(ctx.sharedData.get("asyncTaskAssetIds")).toEqual(["result-asset"]);
    expect(
      f.services.recallProcessor.resolvePlaceholderRetrieval
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        recallId: "allowed",
        enabledBindings: [{ recallId: "allowed", recallName: "Allowed" }],
        userText: expect.stringContaining("QUERY"),
      })
    );
    let seen: any;
    server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      seen = JSON.parse(Buffer.concat(chunks).toString());
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          choices: [
            {
              message: { role: "assistant", content: "context accepted" },
              finish_reason: "stop",
            },
          ],
        })
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    transport = createNodeLlmTransport({
      getProxy: () => ({ mode: "none" }),
      resolveProxy: async () => "DIRECT",
    });
    const response = await executeOpenAiChat(
      {
        id: "local",
        name: "local",
        type: "openai-compatible",
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}/v1`,
        models: [{ id: "model", name: "model" }],
        apiKeys: [],
      } as any,
      {
        profileId: "local",
        modelId: "model",
        requestId: "context-owner",
        messages: ctx.messages as any,
        timeout: 2000,
      },
      { transport, buildHeaders: () => ({}) }
    );
    expect(response.content).toBe("context accepted");
    const sent = JSON.stringify(seen.messages);
    for (const text of [
      "Hello Lin/Worker",
      "RECALL-EVIDENCE",
      "TASK-EVIDENCE",
      "TEXT-EVIDENCE",
      bytes.toString("base64"),
    ])
      expect(sent).toContain(text);
    const nativeImages = seen.messages.flatMap((message: any) =>
      Array.isArray(message.content)
        ? message.content.filter((part: any) => part.type === "image_url")
        : []
    );
    const plan = await imageService.plan(
      imageFixture.buffer,
      ctx.settings.requestSettings.longImageSlicing
    );
    expect(nativeImages).toHaveLength(plan.regions.length);
    expect(
      nativeImages.every((image: any) =>
        image.image_url.url.startsWith("data:image/png;base64,")
      )
    ).toBe(true);
    expect(seen.model).toBe("model");
  });

  it("projects completed assets and live task progress from the owner without a UI store", async () => {
    const f = fixture(),
      ctx = context();
    f.tasks.set("done", {
      status: "completed",
      result: "actual result",
      resultAssetIds: ["asset"],
    });
    f.tasks.set("live", {
      status: "running",
      progress: 42,
      progressMessage: "working",
    });
    ctx.messages = ["done", "live", "missing"].map((id) => ({
      role: "tool",
      content: JSON.stringify({ type: "async_task", taskId: id }),
    }));
    await createAsyncTaskProcessor(f.services.asyncTaskProcessor).execute(ctx);
    expect(ctx.messages[0].content).toBe("任务已完成。结果：\nactual result");
    expect(JSON.parse(ctx.messages[1].content as string)).toMatchObject({
      taskId: "live",
      status: "running",
      progress: 42,
      progressMessage: "working",
    });
    expect(JSON.parse(ctx.messages[2].content as string).taskId).toBe(
      "missing"
    );
    expect(ctx.sharedData.get("asyncTaskAssetIds")).toEqual(["asset"]);
  });

  it("keeps the original Office text/image split and replaces the file placeholder while retaining image assets", async () => {
    const f = fixture(),
      ctx = context();
    const doc = {
      id: "doc",
      type: "document",
      name: "slides.pptx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      source: { kind: "asset-library", path: "doc.pptx" },
    } as PipelineAttachment;
    const image = {
      id: "slide",
      type: "image",
      name: "slide.png",
      source: { kind: "inline", base64: "c2xpZGU=", mimeType: "image/png" },
      mimeType: "image/png",
    };
    ctx.messages = [
      { role: "user", content: "see 【file::doc】", _attachments: [doc] },
    ];
    Object.assign(ctx, { capabilities: { vision: true } });
    f.services.transcriptionProcessor.isPptxAssetLike = () => true;
    f.services.transcriptionProcessor.getTranscriptionAsset = async () =>
      ({ ...doc, metadata: {} }) as any;
    f.services.transcriptionProcessor.splitZipDocumentIntoImageAssets = vi.fn(
      async () => ({ success: true, text: "SLIDE-TEXT", imageAssets: [image] })
    ) as any;
    await createTranscriptionProcessor(
      f.services.transcriptionProcessor
    ).transcriptionProcessor.execute(ctx);
    expect(ctx.messages[0].content).toContain("SLIDE-TEXT");
    expect(ctx.messages[0]._attachments).toEqual([
      expect.objectContaining({
        id: "slide",
        type: "image",
        source: { kind: "inline", base64: "c2xpZGU=", mimeType: "image/png" },
      }),
    ]);
  });

  it.each(["recall", "transcription", "asset"] as const)(
    "discards late %s service results and exits without invoking the next processor",
    async (kind) => {
      const f = fixture(),
        controller = new AbortController();
      const ctx = Object.assign(context(), { signal: controller.signal });
      const entered = gate<void>(),
        done = gate<any>();
      const wait = async () => {
        entered.resolve();
        return done.promise;
      };
      let processor: ContextProcessor, lateResult: any;
      if (kind === "recall") {
        ctx.messages = [
          { role: "system", content: "【recall::collection=allowed】" },
        ];
        ctx.agentConfig.recallConfig = {
          enabled: true,
          bindings: [{ recallId: "allowed", enabled: true }],
        } as any;
        processor = createRecallProcessors({
          resolvePlaceholderRetrieval: wait,
        }).recallProcessor;
        lateResult = { activated: true, content: "LATE", resultCount: 1 };
      } else if (kind === "transcription") {
        ctx.messages = [
          {
            role: "user",
            content: "【file::note】",
            _attachments: [
              {
                id: "note",
                type: "text",
                name: "note",
                mimeType: "text/plain",
                source: { kind: "asset-library", path: "note" },
              },
            ],
          },
        ];
        f.services.transcriptionProcessor.resolveAttachmentsBatch = wait;
        processor = createTranscriptionProcessor(
          f.services.transcriptionProcessor
        ).transcriptionProcessor;
        lateResult = [{ type: "text", asset: { id: "note" }, content: "LATE" }];
      } else {
        ctx.messages = [
          {
            role: "user",
            content: "original",
            _attachments: [
              {
                id: "audio",
                type: "audio",
                name: "audio",
                mimeType: "audio/wav",
                source: { kind: "local-file", path: "audio.wav" },
              },
            ],
          },
        ];
        f.services.assetResolver.getAttachmentBuffer = wait;
        f.services.assetResolver.convertArrayBufferToBase64 = vi.fn(
          async () => "LATE"
        );
        processor = createAssetResolver(f.services.assetResolver);
        lateResult = new ArrayBuffer(1);
      }
      const initial = ctx.messages[0].content,
        next = vi.fn(async () => {}),
        ports = pipelinePorts();
      const running = executeContextPipeline(
        ctx,
        [
          processor,
          {
            id: "next",
            name: "next",
            description: "next",
            priority: 10001,
            execute: next,
          },
        ],
        ports
      );
      await entered.promise;
      controller.abort();
      done.resolve(lateResult);
      await expect(running).rejects.toMatchObject({ name: "AbortError" });
      expect(ctx.messages[0].content).toBe(initial);
      expect(next).not.toHaveBeenCalled();
      expect(ports.reportProcessorError).not.toHaveBeenCalled();
      expect(f.diagnostics.errorHandler.handle).not.toHaveBeenCalled();
      if (kind === "asset")
        expect(
          f.services.assetResolver.convertArrayBufferToBase64
        ).not.toHaveBeenCalled();
    }
  );

  it("stops the actual macro phase after cancellation and suppresses late trace callbacks and subsequent macros", async () => {
    const f = macroRuntime(),
      entered = gate<void>(),
      done = gate<string>(),
      next = vi.fn(() => "next"),
      trace = vi.fn();
    const define = (name: string, execute: () => string | Promise<string>) => ({
      name,
      execute,
      type: MacroType.FUNCTION,
      phase: MacroPhase.SUBSTITUTE,
      description: name,
      acceptsArgs: false,
    });
    f.registry.register(
      define("wait", async () => {
        entered.resolve();
        return done.promise;
      })
    );
    f.registry.register(define("next", next));
    const controller = new AbortController(),
      ctx = f.buildMacroContext({ signal: controller.signal });
    const running = f.processMacros(
      new f.Processor(),
      "{{wait}} {{next}}",
      ctx,
      { onExecution: trace }
    );
    await entered.promise;
    controller.abort();
    done.resolve("late");
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    expect(next).not.toHaveBeenCalled();
    expect(trace).not.toHaveBeenCalled();
    expect(f.errorHandler.handle).not.toHaveBeenCalled();
  });
});
