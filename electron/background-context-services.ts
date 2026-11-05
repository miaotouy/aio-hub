// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { BackgroundHostClient } from "./background-host-client";
import { NodeContextAttachments } from "./context-attachments";
import { NodeContextImages } from "./context-images";
import { NodeTokenCalculator } from "./token-calculator";
import type { BackgroundHostServices } from "./background-host-protocol";
import type { LlmModelInfo } from "../src/types/llm-profiles";
import type { LongImageSlicingConfig } from "../src/tools/smart-ocr/utils/imageSlicePlan";

type ScopeOptions = {
  models: readonly Pick<
    LlmModelInfo,
    "id" | "tokenizerProfileId" | "capabilities"
  >[];
  signal?: AbortSignal;
  slicing?: LongImageSlicingConfig;
  statistics?: boolean;
  logger: Pick<Console, "warn">;
};
/** Application-owned resources; scopes own cancellation, snapshots, plans and the pinned token registry. */
export class BackgroundContextServices {
  private images: NodeContextImages;
  private tokens: NodeTokenCalculator;
  private scopes = new Set<() => void>();
  private preparing = new Set<Promise<unknown>>();
  private closing = false;
  private stopping?: Promise<void>;
  constructor(
    private host: BackgroundHostClient,
    private environment: BackgroundHostServices["host.initialize"]["result"]
  ) {
    this.images = new NodeContextImages(environment.runtimeRoot);
    this.tokens = new NodeTokenCalculator({
      root: environment.root,
      bundledAssetsDir: path.join(
        environment.runtimeRoot,
        "renderer/tokenizers"
      ),
    });
  }
  createScope(options: ScopeOptions) {
    if (this.closing) return Promise.reject(new Error("后台上下文服务已关闭"));
    options = {
      ...options,
      models: structuredClone(options.models),
      slicing: options.slicing ? { ...options.slicing } : undefined,
    };
    const lifetime = new AbortController();
    const signal = options.signal
      ? AbortSignal.any([options.signal, lifetime.signal])
      : lifetime.signal;
    const attachments = new NodeContextAttachments(
      {
        root: this.environment.root,
        getAssetRoot: () =>
          this.host.call("context.assets.root", undefined, signal),
        getLocalSecurity: () =>
          this.host.call("context.files.policy", undefined, signal),
      },
      signal
    );
    let imageScope: ReturnType<NodeContextImages["createScope"]> | undefined;
    const dispose = () => {
      lifetime.abort();
      imageScope?.dispose();
      attachments.dispose();
      this.scopes.delete(dispose);
    };
    this.scopes.add(dispose);
    const operation = (async () => {
      try {
        const tokens = await this.tokens.createScope(options.models, signal);
        signal.throwIfAborted();
        imageScope = this.images.createScope(attachments, {
          ...options,
          signal,
        });
        const calculator = imageScope.wrapTokenCalculator(tokens);
        return { ...imageScope, tokens: calculator, dispose };
      } catch (error) {
        dispose();
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
    for (const dispose of [...this.scopes]) dispose();
    this.stopping = Promise.allSettled([
      ...this.preparing,
      this.images.shutdown(),
    ]).then(() => {});
    return this.stopping;
  }
}
