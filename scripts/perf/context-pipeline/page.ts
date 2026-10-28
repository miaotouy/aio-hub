// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import type { PipelineContext } from "../../../src/tools/llm-chat/types/pipeline";

export interface ContextProbeOptions {
  id: string;
  count: number;
  chars: number;
  model: string;
  samples: number;
  budget?: number;
  html?: boolean;
  regexRules?: number;
  variant?: "request-cache" | "no-formatter-delta" | "uninstrumented";
  worldbookDepth?: number;
  mode?: "send";
  cpuOnly?: boolean;
}

/** Self-contained function evaluated in a verified, isolated native WebView. */
export async function runContextProbe(options: ContextProbeOptions) {
  const base = "/src/tools/llm-chat/";
  const [
    { getInitialProcessors },
    { PipelineEngine },
    { buildPreviewDataFromContext },
    { tokenCalculatorService },
    { calculatorProxy },
    { DEFAULT_SETTINGS },
  ] = await Promise.all([
    import(base + "core/pipeline/defaultProcessors.ts"),
    import(base + "core/pipeline/PipelineEngine.ts"),
    import(base + "core/context-utils/preview-builder.ts"),
    import("/src/" + "tools/token-calculator/token-calculator.registry.ts"),
    import("/src/" + "tools/token-calculator/worker/calculator.proxy.ts"),
    import(base + "config/defaultSettings.ts"),
  ]);
  const vue = (window as unknown as { Vue: typeof import("vue") }).Vue;
  const allProcessors = getInitialProcessors()
    .filter((p: { defaultEnabled?: boolean }) => p.defaultEnabled !== false)
    .sort(
      (a: { priority: number }, b: { priority: number }) =>
        a.priority - b.priority
    );
  const textOf = (content: PipelineContext["messages"][number]["content"]) =>
    typeof content === "string"
      ? content
      : content
          .filter((p) => p.type === "text")
          .map((p) => p.text || "")
          .join("\n");
  const fixture = () => {
    const nodes: Record<string, any> = {};
    nodes.root = {
      id: "root",
      parentId: null,
      childrenIds: ["m0"],
      role: "system",
      content: "",
      timestamp: 1,
    };
    for (let i = 0; i < options.count; i++) {
      const prefix = `Message ${i}: 上下文性能 sample-0. `;
      const content =
        prefix +
        "中文 mixed English, code `value = 42`; sample-0. ".repeat(
          Math.ceil(options.chars / 43)
        );
      nodes[`m${i}`] = {
        id: `m${i}`,
        parentId: i ? `m${i - 1}` : "root",
        childrenIds: i + 1 < options.count ? [`m${i + 1}`] : [],
        role: i % 2 ? "assistant" : "user",
        isEnabled: true,
        timestamp: i + 2,
        content: options.html
          ? `<div><p>${content.slice(0, options.chars)}</p><strong>sample</strong></div>`
          : content.slice(0, options.chars),
      };
    }
    const settings = structuredClone(DEFAULT_SETTINGS);
    if (options.worldbookDepth)
      settings.worldbook = {
        ...settings.worldbook,
        defaultScanDepth: options.worldbookDepth,
        disableRecursion: true,
      };
    settings.contextOptimization = {
      ...settings.contextOptimization,
      convertHtmlToMd: !!options.html,
      htmlToMdLastMessages: 5,
    };
    const agentConfig = {
      id: "context-perf-agent",
      name: "Context performance fixture",
      modelId: options.model,
      profileId: "context-perf-profile",
      presetMessages: [],
      parameters: {
        contextManagement: {
          enabled: true,
          maxContextTokens: options.budget ?? 100000000,
          retainedCharacters: 0,
        },
      },
      ...(options.regexRules
        ? {
            regexConfig: {
              presets: [
                {
                  id: "probe",
                  enabled: true,
                  rules: Array.from({ length: options.regexRules }, (_, i) => ({
                    id: `rule-${i}`,
                    name: `Rule ${i}`,
                    enabled: true,
                    applyTo: { request: true },
                    targetRoles: ["user", "assistant"],
                    regex: `sample-${i}`,
                    flags: "g",
                    replacement: `sample-${i + 1}`,
                  })),
                },
              ],
            },
          }
        : {}),
    };
    return {
      messages: [],
      previewPurpose: options.mode === "send" ? undefined : "statistics",
      index: {
        id: "context-perf-session",
        name: "Synthetic",
        messageCount: options.count,
        createdAt: "2026-10-28T00:00:00Z",
        updatedAt: "2026-10-28T00:00:00Z",
      },
      detail: vue.reactive({
        id: "context-perf-session",
        rootNodeId: "root",
        activeLeafId: `m${options.count - 1}`,
        nodes,
      }),
      agentConfig,
      settings,
      timestamp: 1793145600000,
      logs: [],
      sharedData: new Map<string, unknown>([
        ["isPreviewMode", options.mode !== "send"],
        ["contextPreviewTargetNodeId", `m${options.count - 1}`],
        ["transcriptionConfig", { enabled: false }],
        [
          "loadedWorldbooks",
          options.worldbookDepth
            ? [
                {
                  metadata: { name: "Synthetic worldbook" },
                  entries: Array.from({ length: 500 }, (_, uid) => ({
                    uid,
                    disable: false,
                    key: Array.from(
                      { length: 4 },
                      (_, j) => `missing-key-${uid}-${j}`
                    ),
                    content: "Synthetic entry",
                    selective: false,
                    constant: false,
                    useProbability: false,
                  })),
                },
              ]
            : [],
        ],
        [
          "profile",
          {
            id: "context-perf-profile",
            name: "Synthetic",
            models: [{ id: options.model, name: options.model }],
          },
        ],
      ]),
    } as unknown as PipelineContext;
  };
  const warmupStart = performance.now();
  const warmupToken = options.cpuOnly
    ? { tokenizerName: "cpu-control" }
    : await tokenCalculatorService.calculateTokens(
        "Tokenizer warmup",
        options.model
      );
  const tokenizerWarmupMs = performance.now() - warmupStart;
  const originalProxy = calculatorProxy.calculateTokens;
  const originalMessageTokens = tokenCalculatorService.calculateMessageTokens;
  const rows = [];
  // Discard first complete replay; model loading and initial Worker setup are outside warm samples.
  for (let round = -1; round < options.samples; round++) {
    const context = fixture();
    let stage = "setup",
      inFlight = 0,
      maxInFlight = 0;
    const stages: Record<
      string,
      {
        ms: number;
        requests: number;
        chars: number;
        duplicateRequests: number;
        cacheHits: number;
      }
    > = {};
    const seen = new Set<string>();
    const cache = new Map<string, Promise<any>>();
    const tokenizers = new Set<string>();
    const metric = () =>
      (stages[stage] ??= {
        ms: 0,
        requests: 0,
        chars: 0,
        duplicateRequests: 0,
        cacheHits: 0,
      });
    const estimated = { value: !!options.cpuOnly };
    const processorErrors: Array<{ processor: string; message: string }> = [];
    const proxy = async (text: string, model: string, tokenizer?: string) => {
      const m = metric();
      const key = JSON.stringify([model, tokenizer, text]);
      if (options.variant === "request-cache" && cache.has(key)) {
        m.cacheHits++;
        return cache.get(key)!;
      }
      m.requests++;
      m.chars += text.length;
      if (seen.has(key)) m.duplicateRequests++;
      seen.add(key);
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const promise = originalProxy.call(
        calculatorProxy,
        text,
        model,
        tokenizer
      );
      if (options.variant === "request-cache") cache.set(key, promise);
      try {
        const result = await promise;
        tokenizers.add(result.tokenizerName);
        estimated.value ||= result.isEstimated;
        return result;
      } finally {
        inFlight--;
      }
    };
    if (options.cpuOnly) {
      // Explicit synthetic control: removes Worker/tokenization so array algorithm scaling is visible.
      tokenCalculatorService.calculateMessageTokens = async (text: string) => ({
        count: text.length,
        isEstimated: true,
        tokenizerName: "cpu-control",
      });
    } else if (options.variant !== "uninstrumented") {
      calculatorProxy.calculateTokens = proxy;
    }
    let maxTimerLagMs = 0;
    let lastTick = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      maxTimerLagMs = Math.max(maxTimerLagMs, now - lastTick - 10);
      lastTick = now;
    }, 10);
    const timed = async (name: string, work: () => Promise<unknown>) => {
      stage = name;
      const start = performance.now();
      try {
        return await work();
      } finally {
        metric().ms += performance.now() - start;
      }
    };
    const start = performance.now();
    try {
      const processors = options.cpuOnly
        ? allProcessors.filter((p: { id: string }) =>
            ["primary:session-loader", "primary:token-limiter"].includes(p.id)
          )
        : allProcessors;
      await PipelineEngine.execute(
        context,
        processors.map((p: any) => ({
          ...p,
          execute: async (ctx: PipelineContext) =>
            timed(p.id, async () => {
              const isPreview = ctx.sharedData.get("isPreviewMode");
              if (
                options.variant === "no-formatter-delta" &&
                p.id === "message-formatter"
              )
                ctx.sharedData.set("isPreviewMode", false);
              try {
                await p.execute(ctx);
              } catch (error) {
                processorErrors.push({
                  processor: p.id,
                  message: String(error),
                });
                throw error;
              } finally {
                ctx.sharedData.set("isPreviewMode", isPreview);
              }
            }),
        }))
      );
      let finalTotalTokenCount: number | null = null;
      if (!options.cpuOnly && options.mode !== "send") {
        await timed("preview-builder", () =>
          buildPreviewDataFromContext(context)
        );
        // Same final-count loop as useChatExecutor.getContextForPreview; fixtures are text-only.
        const counts = (await timed("final-token-count", () =>
          Promise.all(
            context.messages.map(async (msg) => {
              const result =
                await tokenCalculatorService.calculateMessageTokens(
                  textOf(msg.content),
                  options.model,
                  msg._attachments || []
                );
              return result.count;
            })
          )
        )) as number[];
        finalTotalTokenCount = counts.reduce((a, b) => a + b, 0);
      }
      const wallMs = performance.now() - start;
      await new Promise((r) => setTimeout(r, 20));
      // Digest outside the timed region, for output comparison across diagnostic variants.
      let digest = 2166136261;
      const output = JSON.stringify(context.messages);
      for (let i = 0; i < output.length; i++)
        digest = Math.imul(digest ^ output.charCodeAt(i), 16777619) >>> 0;
      const errors = context.logs.filter((log) => log.level === "error");
      const kept = context.messages.filter(
        (m) => m.sourceType === "session_history"
      );
      const ordered = kept.every(
        (m, i) =>
          !i ||
          Number(String(kept[i - 1].sourceId).slice(1)) <
            Number(String(m.sourceId).slice(1))
      );
      const row = {
        wallMs,
        maxTimerLagMs,
        maxInFlight,
        stages,
        tokenizers: [...tokenizers],
        isEstimated: estimated.value,
        output: {
          messages: context.messages.length,
          chars: context.messages.reduce(
            (n, m) => n + textOf(m.content).length,
            0
          ),
          finalTotalTokenCount,
          digest,
          postProcessingTokenDelta:
            context.sharedData.get("postProcessingTokenDelta") ?? 0,
        },
        valid:
          errors.length === 0 &&
          processorErrors.length === 0 &&
          kept.length > 0 &&
          ordered &&
          (options.budget !== undefined || kept.length === options.count),
        errors,
        processorErrors,
      };
      if (round >= 0) rows.push(row);
    } finally {
      clearInterval(timer);
      calculatorProxy.calculateTokens = originalProxy;
      tokenCalculatorService.calculateMessageTokens = originalMessageTokens;
    }
  }
  return {
    options,
    userAgent: navigator.userAgent,
    tokenizerWarmupMs,
    warmupTokenizer: warmupToken.tokenizerName,
    rows,
  };
}
