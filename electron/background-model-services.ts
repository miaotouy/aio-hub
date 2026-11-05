// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { BackgroundHostClient } from "./background-host-client";
import { createNodeLlmTransport } from "./llm-transport";
import type { LlmHttpOptions } from "./shared";
import {
  createModelRequestExecutor,
  type ModelRequestPorts,
} from "../src/llm-apis/execution/modelRequestExecutor";
import { createChatAdapters } from "../src/llm-apis/execution/chatAdapters";
import { createEmbeddingAdapters } from "../src/llm-apis/execution/embeddingAdapters";
import {
  resolveHeaderTemplates,
  type HeaderTemplateContext,
} from "../src/llm-apis/execution/headerTemplates";
import type { LlmRequestOptions } from "../src/llm-apis/types";
import type { EmbeddingRequestOptions } from "../src/llm-apis/embedding-types";

type ScopeOptions = {
  signal?: AbortSignal;
  headers: HeaderTemplateContext;
  proxy: LlmHttpOptions["proxy"];
  vcpWsUrl: string;
};
type Diagnostics = Pick<ModelRequestPorts, "logger" | "errors">;
/** Task-scoped channel/header/network snapshots over the shared production model middleware. */
export class BackgroundModelServices {
  private scopes = new Set<() => Promise<void>>();
  private preparing = new Set<Promise<unknown>>();
  private closing = false;
  private stopping?: Promise<void>;
  constructor(
    private host: BackgroundHostClient,
    private diagnostics: Diagnostics
  ) {}
  createScope(options: ScopeOptions) {
    if (this.closing) return Promise.reject(new Error("后台模型服务已关闭"));
    const input = {
      ...options,
      headers: { ...options.headers },
      proxy: { ...options.proxy },
    };
    const lifetime = new AbortController();
    const signal = input.signal
      ? AbortSignal.any([input.signal, lifetime.signal])
      : lifetime.signal;
    const requests = new Set<Promise<unknown>>();
    let transport: ReturnType<typeof createNodeLlmTransport> | undefined;
    let disposed = false;
    let disposedTask: Promise<void> | undefined;
    const dispose = (): Promise<void> => {
      if (disposedTask) return disposedTask;
      disposed = true;
      lifetime.abort(new DOMException("后台任务已释放", "AbortError"));
      transport?.dispose();
      disposedTask = Promise.allSettled([...requests]).then(() => {
        this.scopes.delete(dispose);
      });
      return disposedTask;
    };
    this.scopes.add(dispose);
    const operation = (async () => {
      try {
        const snapshot = await this.host.call(
          "llm.configuration.load",
          undefined,
          signal
        );
        signal.throwIfAborted();
        const profiles = structuredClone(snapshot.profiles);
        const contexts = new Map<
          string,
          ReturnType<ModelRequestPorts["inspector"]["getContext"]>
        >();
        const native = (transport = createNodeLlmTransport({
          getProxy: () => input.proxy,
          resolveProxy: (url) =>
            this.host.call("llm.proxy.resolve", { url }, lifetime.signal),
        }));
        const track = <T>(task: Promise<T>): Promise<T> => {
          requests.add(task);
          void task.then(
            () => requests.delete(task),
            () => requests.delete(task)
          );
          return task;
        };
        const executor = createModelRequestExecutor({
          ...this.diagnostics,
          getProfiles: () => profiles,
          getVcpWsUrl: () => input.vcpWsUrl,
          keys: this.host.keys,
          adapters: createChatAdapters({
            transport: native,
            resolveCustomHeaders: (headers) =>
              resolveHeaderTemplates(headers, input.headers),
          }),
          inspector: {
            shouldCaptureInternal: () => false,
            setContext: (id, value) => contexts.set(id, value),
            getContext: (id) => contexts.get(id),
            deleteContext: (id) => {
              contexts.delete(id);
            },
          },
          makeToolDiagnostics: (value) => value,
          // Shared middleware uses this for the upstream VCP stop request only.
          interruptFetch: (url, init, timeout = 5000) =>
            track(
              (async () => {
                if (disposed)
                  throw new DOMException("后台任务已释放", "AbortError");
                const response = await native.send(
                  {
                    url,
                    method: "POST",
                    streaming: false,
                    headers: Object.fromEntries(
                      new Headers(init.headers).entries()
                    ),
                    body:
                      typeof init.body === "string"
                        ? { kind: "text", value: init.body }
                        : undefined,
                  },
                  {
                    requestId: crypto.randomUUID(),
                    timeoutMs: timeout,
                    network: {
                      strategy: init.forceProxy
                        ? "proxy"
                        : init.networkStrategy,
                      relaxInvalidCerts: init.relaxIdCerts,
                      http1Only: init.http1Only,
                    },
                  }
                );
                // The request is fire-and-forget at the middleware boundary, but its body is owned here.
                for await (const _chunk of response.body) {
                  /* drain */
                }
                return new Response(null, {
                  status: response.status,
                  headers: response.headers,
                });
              })()
            ),
        });
        const embeddingAdapters = createEmbeddingAdapters({
          transport: native,
          resolveCustomHeaders: (headers) =>
            resolveHeaderTemplates(headers, input.headers),
        });
        return {
          revision: snapshot.revision,
          getProfiles: () => structuredClone(profiles),
          sendRequest: (request: LlmRequestOptions) => {
            if (disposed)
              return Promise.reject(
                new DOMException("后台任务已释放", "AbortError")
              );
            const combined = request.signal
              ? AbortSignal.any([signal, request.signal])
              : signal;
            return track(
              executor.sendRequest({ ...request, signal: combined })
            );
          },
          sendEmbedding: (
            profileId: string,
            request: EmbeddingRequestOptions
          ) => {
            if (disposed)
              return Promise.reject(
                new DOMException("后台任务已释放", "AbortError")
              );
            const profile = profiles.find((item) => item.id === profileId);
            if (!profile)
              return Promise.reject(Error(`模型渠道不存在: ${profileId}`));
            const adapter = (
              embeddingAdapters as Record<
                string,
                typeof embeddingAdapters.openai | undefined
              >
            )[profile.type];
            if (!adapter)
              return Promise.reject(
                Error(`渠道不支持后台 Embedding: ${profile.type}`)
              );
            const combined = request.signal
              ? AbortSignal.any([signal, request.signal])
              : signal;
            return track(adapter(profile, { ...request, signal: combined }));
          },
          dispose,
        };
      } catch (error) {
        await dispose();
        throw error;
      }
    })();
    this.preparing.add(operation);
    void operation.then(
      () => this.preparing.delete(operation),
      () => this.preparing.delete(operation)
    );
    return operation;
  }
  shutdown(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.closing = true;
    this.stopping = Promise.allSettled([
      ...this.preparing,
      ...[...this.scopes].map((dispose) => dispose()),
    ]).then(() => {});
    return this.stopping;
  }
}
