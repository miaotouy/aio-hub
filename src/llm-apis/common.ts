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

import { invoke } from "@/platform/native/core";
import {
  fetchElectronLlm,
  isElectronRuntime,
} from "@/platform/modules/llm-http";
import { createModuleLogger } from "@/utils/logger";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { inspectorHookRegistry } from "@/tools/llm-inspector/core/hookRegistry";
import type { InspectorContextMetadata } from "@/tools/llm-inspector/types/hooks";
import { inspectNativeToolRequestBody } from "./tool-diagnostics";

export {
  TimeoutError,
  isAbortError,
  isTimeoutError,
  LlmApiError,
  LlmProxyError,
  AIO_PROXY_ORIGIN_HEADER,
  AIO_PROXY_ORIGIN_VALUE,
  isProxyGeneratedResponse,
  ensureResponseOk,
} from "./errors";
import { TimeoutError } from "./errors";

const logger = createModuleLogger("llm-apis/common");

export * from "./types";
import { DEFAULT_TIMEOUT } from "./types";

/**
 * 代理服务器端口缓存
 * 由 ensureProxyServer() 维护：首次调用启动后端并缓存真实端口；后续直接复用。
 * Windows 上常因 Hyper-V/WinNAT 动态保留端口段导致默认端口绑定失败 (os error 10013)，
 * 后端会自动 fallback 到可用端口并通过返回值告知前端实际使用的端口。
 */
interface ProxyServerInfo {
  port: number;
  token: string;
}

let cachedProxyServer: ProxyServerInfo | null = null;
let proxyServerPromise: Promise<ProxyServerInfo> | null = null;

/**
 * 确保 LLM 代理服务已启动，返回实际端口与本次运行的 capability token。
 * 单例模式：并发调用共享同一个启动 Promise，避免重复 invoke
 */
async function ensureProxyServer(): Promise<ProxyServerInfo> {
  if (cachedProxyServer !== null) {
    return cachedProxyServer;
  }
  if (proxyServerPromise) {
    return proxyServerPromise;
  }

  const preferredPort = parseInt(
    import.meta.env.VITE_AIO_PROXY_PORT || "21655"
  );

  proxyServerPromise = (async () => {
    try {
      const info = await invoke<ProxyServerInfo>("start_llm_proxy_server", {
        port: preferredPort,
      });
      cachedProxyServer = info;
      if (info.port !== preferredPort) {
        logger.warn("LLM 代理服务端口已自动 fallback", {
          preferredPort,
          actualPort: info.port,
        });
      } else {
        logger.info("LLM 代理服务已启动", { port: info.port });
      }
      return info;
    } catch (e) {
      // 启动失败：清理 Promise 以允许下次重试
      proxyServerPromise = null;
      logger.error("启动 LLM 代理服务失败", e as Error, { preferredPort });
      throw e;
    }
  })();

  return proxyServerPromise;
}

/**
 * 带超时控制的请求包装器
 */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit & {
    hasLocalFile?: boolean;
    forceProxy?: boolean;
    relaxIdCerts?: boolean;
    http1Only?: boolean;
    networkStrategy?: "auto" | "proxy" | "native";
    isStreaming?: boolean;
    proxyBodyKind?: "raw" | "file-ref" | "multipart-manifest";
    /** 工具 API 复用传输时，独立于模型请求诊断。 */
    requestKind?: "llm" | "tool";
    /**
     * LLM Inspector 内部监控上下文。由上游 `useLlmRequest` / adapter 透传。
     * 当 `inspectorHookRegistry.shouldCaptureInternal()` 为 true 时，
     * 会作为 `InspectorRequestEvent.metadata` 一并广播。
     */
    inspectorContext?: InspectorContextMetadata;
  },
  timeout: number = DEFAULT_TIMEOUT,
  externalSignal?: AbortSignal
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new TimeoutError(`Request timed out after ${timeout}ms`));
  }, timeout);

  // 如果外部信号已经中止，立即抛出错误
  if (externalSignal?.aborted) {
    clearTimeout(timeoutId);
    throw externalSignal.reason || new DOMException("Aborted", "AbortError");
  }

  // 监听外部中止信号
  const externalAbortHandler = () => {
    // 传递外部信号的原因
    controller.abort(externalSignal?.reason);
  };
  externalSignal?.addEventListener("abort", externalAbortHandler);

  // ============ LLM Inspector 内部监控埋点（B2）============
  // 开关 OFF 时整个 inspector 流程零开销（不生成 requestId、不读取 body、不广播）。
  // 在统一入口生成 requestId，确保流式 chunk 能正确关联。
  const captureInspector =
    options.requestKind !== "tool" &&
    inspectorHookRegistry.shouldCaptureInternal();
  let inspectorRequestId: string | null = null;
  let inspectorStartTimestamp = 0;
  // 优先级：options.inspectorContext > contextStore[X-Request-ID]
  // 后者由 useLlmRequest 通过 X-Request-ID header 关联（B3），避免修改所有 adapter。
  let resolvedInspectorContext = options.inspectorContext;
  if (captureInspector) {
    // 优先复用调用方已生成的 requestId（来自 headers["X-Request-ID"] 等），
    // 否则生成新的 UUID。
    const headerRequestId =
      typeof options.headers === "object" && options.headers !== null
        ? (options.headers as Record<string, string>)["X-Request-ID"] ||
          (options.headers as Record<string, string>)["x-request-id"]
        : undefined;
    inspectorRequestId =
      headerRequestId ||
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    inspectorStartTimestamp = Date.now();

    // 若 options 未显式传入 inspectorContext，尝试从 contextStore 反查（B3 透传机制）
    if (!resolvedInspectorContext && headerRequestId) {
      resolvedInspectorContext =
        inspectorHookRegistry.getContext(headerRequestId);
    }

    // 收集请求头快照（注册器不做加工，原样广播）
    const headersSnapshot: Record<string, string> = {};
    if (options.headers && typeof options.headers === "object") {
      for (const [k, v] of Object.entries(
        options.headers as Record<string, string>
      )) {
        headersSnapshot[k] = String(v);
      }
    }

    // 收集请求体快照
    // - string：直接采集
    // - Uint8Array：解码为字符串（OpenAI/Gemini adapter 在大 body 时会用此类型，
    //   见 src/llm-apis/adapters/openai/chat.ts 的 asyncJsonStringify 路径）
    // - FormData / 其他：跳过避免性能开销，仅记录占位说明
    let bodySnapshot: string | undefined;
    if (typeof options.body === "string") {
      bodySnapshot = options.body;
    } else if (options.body instanceof Uint8Array) {
      try {
        bodySnapshot = new TextDecoder().decode(options.body);
      } catch {
        bodySnapshot = `[Uint8Array, ${options.body.byteLength} bytes]`;
      }
    } else if (options.body instanceof FormData) {
      bodySnapshot = "[FormData body, 跳过采集]";
    }

    // 以实际编码后的请求 JSON 为准，避免仅根据调用方 options 推断工具是否真的上行。
    const nativeToolSummary = inspectNativeToolRequestBody(bodySnapshot);
    if (nativeToolSummary && resolvedInspectorContext?.toolDiagnostics) {
      Object.assign(
        resolvedInspectorContext.toolDiagnostics,
        nativeToolSummary
      );
    }

    inspectorHookRegistry.triggerRequest({
      requestId: inspectorRequestId,
      timestamp: inspectorStartTimestamp,
      method: options.method || "GET",
      url,
      headers: headersSnapshot,
      body: bodySnapshot,
      metadata: resolvedInspectorContext,
    });
  }

  /**
   * 触发 Inspector 响应事件（开关 ON 且 requestId 存在时）
   *
   * 处理策略：
   * - **流式响应**（SSE / `text/event-stream` / `options.isStreaming === true`）：
   *   clone 响应后启动独立 reader 循环，每读到 chunk 立即通过
   *   `triggerStream({ isComplete: false })` 实时推送给 Inspector，
   *   reader done 后再触发一次 `triggerStream({ isComplete: true })` +
   *   带累积完整 body 的 `triggerResponse`。
   * - **非流式响应**：clone 后异步 `.text()` 一次性 fire `triggerResponse`。
   *
   * 关键点：`clone()` 是 O(1)，独立 reader 与 adapter 主消费链互不干扰，
   * 背压由浏览器/Tauri 自动协调。
   */
  const triggerInspectorResponse = (response: Response): void => {
    if (!captureInspector || !inspectorRequestId) return;
    const headersObj: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      headersObj[k] = v;
    });
    const requestId = inspectorRequestId;
    const startTs = inspectorStartTimestamp;
    const metadata = resolvedInspectorContext;

    const fireResponseEvent = (body: string | undefined) => {
      inspectorHookRegistry.triggerResponse({
        requestId,
        timestamp: Date.now(),
        status: response.status,
        headers: headersObj,
        body,
        durationMs: Date.now() - startTs,
        metadata,
      });
    };

    // 判断是否流式响应：优先看 content-type，其次看 options.isStreaming
    const contentType = (
      response.headers.get("content-type") || ""
    ).toLowerCase();
    const isStreamResponse =
      contentType.includes("text/event-stream") ||
      contentType.includes("application/stream+json") ||
      options.isStreaming === true;

    let cloned: Response;
    try {
      cloned = response.clone();
    } catch {
      // clone 异常时仅广播头部信息，确保不阻塞主流程
      fireResponseEvent(undefined);
      return;
    }

    if (!isStreamResponse) {
      // 非流式：一次性读取完整 body
      cloned
        .text()
        .then((body) => fireResponseEvent(body))
        .catch(() => fireResponseEvent(undefined));
      return;
    }

    // 流式：启动独立 reader 循环逐 chunk 推送
    const body = cloned.body;
    if (!body) {
      // 没有 body 流：直接结束
      inspectorHookRegistry.triggerStream({
        requestId,
        timestamp: Date.now(),
        chunk: "",
        isComplete: true,
        metadata,
      });
      fireResponseEvent(undefined);
      return;
    }

    void (async () => {
      const reader = body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulated = "";
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          // stream: true 用于跨多块的字符边界拼接（UTF-8 多字节安全）
          const chunkStr = decoder.decode(value, { stream: true });
          if (chunkStr) {
            accumulated += chunkStr;
            inspectorHookRegistry.triggerStream({
              requestId,
              timestamp: Date.now(),
              chunk: chunkStr,
              isComplete: false,
              metadata,
            });
          }
        }
        // 冲刷 decoder 残留字节
        const tail = decoder.decode();
        if (tail) {
          accumulated += tail;
          inspectorHookRegistry.triggerStream({
            requestId,
            timestamp: Date.now(),
            chunk: tail,
            isComplete: false,
            metadata,
          });
        }
        // 终结流式标记
        inspectorHookRegistry.triggerStream({
          requestId,
          timestamp: Date.now(),
          chunk: "",
          isComplete: true,
          metadata,
        });
        // 触发一次完整 response，带累积 body（供非流式 raw 视图使用）
        fireResponseEvent(accumulated);
      } catch (err) {
        // 读流异常：发一个 complete 标记 + 错误事件
        inspectorHookRegistry.triggerStream({
          requestId,
          timestamp: Date.now(),
          chunk: "",
          isComplete: true,
          metadata,
        });
        inspectorHookRegistry.triggerError({
          requestId,
          timestamp: Date.now(),
          errorName: (err as Error)?.name || "StreamReadError",
          errorMessage: (err as Error)?.message || String(err),
          metadata,
        });
        fireResponseEvent(accumulated || undefined);
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // 释放锁失败可忽略
        }
      }
    })();
  };

  try {
    if (isElectronRuntime()) {
      const { settings } = useAppSettingsStore();
      const method = (options.method || "POST").toUpperCase();
      const headers = new Headers(options.headers);
      if (options.body instanceof FormData) headers.delete("content-type");
      const signals = [
        controller.signal,
        externalSignal,
        options.signal,
      ].filter((signal): signal is AbortSignal => !!signal);
      const response = await fetchElectronLlm(
        url,
        {
          ...options,
          method,
          headers,
          body:
            method === "GET" || method === "HEAD" ? undefined : options.body,
          signal: AbortSignal.any(signals),
        },
        {
          bodyKind: options.proxyBodyKind ?? "raw",
          expandJson:
            options.proxyBodyKind === undefined &&
            typeof options.body === "string" &&
            headers.get("content-type")?.includes("application/json") === true,
          proxy: {
            mode: settings.proxy?.mode ?? "system",
            customUrl: settings.proxy?.customUrl,
          },
          relaxIdCerts: options.relaxIdCerts ?? true,
        }
      );
      triggerInspectorResponse(response);
      return response;
    }

    // Tauri 默认全面转向 Rust 代理。显式 native 可直连，但需要原生文件读取的请求
    // 必须走代理，避免把 LocalFileRef 对象或本地路径直接发给 Provider。
    const isNative = options.networkStrategy === "native";
    const requiresNativeFileAccess =
      options.hasLocalFile ||
      options.proxyBodyKind === "file-ref" ||
      options.proxyBodyKind === "multipart-manifest";
    const useProxy = !isNative || requiresNativeFileAccess;

    // 仅用于日志记录
    const bodyString = typeof options.body === "string" ? options.body : "";
    const hasLocalFileInBody = bodyString.includes("local-file://");

    if (useProxy) {
      logger.debug("触发代理模式", {
        hasLocalFile: options.hasLocalFile,
        hasLocalFileInBody,
        forceProxy: options.forceProxy,
        relaxIdCerts: options.relaxIdCerts,
        http1Only: options.http1Only,
        isStreaming: options.isStreaming,
        networkStrategy: options.networkStrategy,
      });
      const proxyServer = await ensureProxyServer();
      const appSettingsStore = useAppSettingsStore();
      const settings = appSettingsStore.settings;
      const proxyHeaders = new Headers(options.headers);
      if (options.body instanceof FormData) {
        proxyHeaders.delete("content-type");
      }
      proxyHeaders.set("X-Proxy-Token", proxyServer.token);
      proxyHeaders.set("X-AIO-Target-URL", url);
      proxyHeaders.set("X-AIO-Proxy-Mode", settings.proxy?.mode || "system");
      proxyHeaders.set("X-AIO-Proxy-URL", settings.proxy?.customUrl || "");
      proxyHeaders.set(
        "X-AIO-Relax-Certs",
        String(options.relaxIdCerts ?? true)
      );
      proxyHeaders.set("X-AIO-HTTP1-Only", String(options.http1Only ?? true));
      proxyHeaders.set("X-AIO-Streaming", String(options.isStreaming ?? false));
      proxyHeaders.set("X-AIO-Body-Kind", options.proxyBodyKind || "raw");

      const needsJsonExpansion =
        options.proxyBodyKind === undefined &&
        (options.hasLocalFile || hasLocalFileInBody);
      if (needsJsonExpansion) {
        proxyHeaders.set("X-AIO-JSON-Expand", "true");
      }
      const proxyPath = needsJsonExpansion
        ? "/proxy/json-expand"
        : "/proxy/raw";
      const method = (options.method || "POST").toUpperCase();
      const proxyResponse = await window.fetch(
        `http://127.0.0.1:${proxyServer.port}${proxyPath}`,
        {
          method,
          headers: proxyHeaders,
          body:
            method === "GET" || method === "HEAD" ? undefined : options.body,
          signal: controller.signal,
        }
      );
      triggerInspectorResponse(proxyResponse);
      return proxyResponse;
    }

    const response = await window.fetch(url, {
      ...options,
      signal: controller.signal,
    });
    triggerInspectorResponse(response);
    return response;
  } catch (error) {
    // 关键修复：如果底层 fetch 抛出了通用的 "canceled" 错误，
    // 但我们的 controller 确实是因为超时才 abort 的，
    // 那么我们要把错误包装回 TimeoutError 抛出。
    if (
      controller.signal.aborted &&
      controller.signal.reason instanceof TimeoutError
    ) {
      // Inspector 错误事件
      if (captureInspector && inspectorRequestId) {
        const wrapped = controller.signal.reason as TimeoutError;
        inspectorHookRegistry.triggerError({
          requestId: inspectorRequestId,
          timestamp: Date.now(),
          errorName: wrapped.name,
          errorMessage: wrapped.message,
          metadata: resolvedInspectorContext,
        });
      }
      throw controller.signal.reason;
    }
    // Inspector 错误事件（其他错误）
    if (captureInspector && inspectorRequestId) {
      const err = error as Error;
      inspectorHookRegistry.triggerError({
        requestId: inspectorRequestId,
        timestamp: Date.now(),
        errorName: err?.name || "Error",
        errorMessage: err?.message || String(error),
        metadata: resolvedInspectorContext,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", externalAbortHandler);
  }
};
