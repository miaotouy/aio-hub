// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import path from "node:path";
import { createRequire } from "node:module";

interface KnowledgeRuntimeBinding {
  new (dataDirectory: string): {
    initialize(): Promise<void>;
    execute(command: string, argumentsJson: string): Promise<string>;
  };
}

interface KnowledgeAddon {
  KnowledgeRuntime: KnowledgeRuntimeBinding;
}

type Runtime = InstanceType<KnowledgeRuntimeBinding>;

export class Knowledge {
  private runtime?: Runtime;
  private initialization?: Promise<void>;
  private readonly pending = new Set<Promise<unknown>>();
  private closing = false;

  constructor(
    private readonly userData: string,
    private readonly appPath: string,
    private readonly loadAddon: (file: string) => KnowledgeAddon = (file) =>
      createRequire(import.meta.url)(file) as KnowledgeAddon
  ) {}

  get hasPendingOperations() {
    return this.pending.size > 0;
  }

  private track<T>(operation: Promise<T>) {
    this.pending.add(operation);
    void operation
      .finally(() => this.pending.delete(operation))
      .catch(() => {});
    return operation;
  }

  private getRuntime() {
    if (!this.runtime) {
      const addon = this.loadAddon(
        path.join(this.appPath, "native-runtime/knowledge-addon.node")
      );
      this.runtime = new addon.KnowledgeRuntime(this.userData);
    }
    return this.runtime;
  }

  initialize() {
    if (this.closing)
      return Promise.reject(new Error("Knowledge runtime is shutting down"));
    if (!this.initialization) {
      const task = this.track(
        Promise.resolve().then(() => this.getRuntime().initialize())
      );
      const initialization = task.catch((error) => {
        if (this.initialization === initialization)
          this.initialization = undefined;
        throw error;
      });
      this.initialization = initialization;
    }
    return this.initialization;
  }

  run(command: string, args: Record<string, unknown>) {
    if (this.closing)
      return Promise.reject(new Error("Knowledge runtime is shutting down"));
    if (command === "knowledge_initialize")
      return this.track(this.initialize().then(() => null));
    return this.track(
      (async () => {
        await this.initialize();
        const result = await this.getRuntime().execute(
          command,
          JSON.stringify(args)
        );
        return JSON.parse(result) as unknown;
      })()
    );
  }

  async shutdown() {
    this.closing = true;
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}
