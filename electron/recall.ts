// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import path from "node:path";
import { createRequire } from "node:module";
import { monitorHeartbeat, pipelineMonitor } from "./recall-monitor";
import type { RecallPipelineRunResponse } from "../src/tools/recall/types/pipeline";

interface RecallRuntimeBinding {
  new (dataDirectory: string): {
    initialize(): Promise<void>;
    drainEvents(): string[];
    execute(command: string, argumentsJson: string): Promise<string>;
  };
}

interface RecallAddon {
  RecallRuntime: RecallRuntimeBinding;
}

type Runtime = InstanceType<RecallRuntimeBinding>;

export class Recall {
  private runtime?: Runtime;
  private initialization?: Promise<void>;
  private readonly pending = new Set<Promise<unknown>>();
  private closing = false;
  private eventReaders = 0;
  private eventTimer?: ReturnType<typeof setInterval>;

  private drainEvents() {
    for (const message of this.getRuntime().drainEvents()) {
      const { event, payload } = JSON.parse(message) as {
        event: string;
        payload: unknown;
      };
      this.emit(event, payload);
    }
  }

  private startEvents() {
    this.eventReaders++;
    if (!this.eventTimer) {
      this.eventTimer = setInterval(() => this.drainEvents(), 50);
      this.eventTimer.unref();
    }
    return () => {
      try {
        this.drainEvents();
      } finally {
        if (--this.eventReaders === 0 && this.eventTimer) {
          clearInterval(this.eventTimer);
          this.eventTimer = undefined;
        }
      }
    };
  }

  constructor(
    private readonly userData: string,
    private readonly appPath: string,
    private readonly loadAddon: (file: string) => RecallAddon = (file) =>
      createRequire(import.meta.url)(file) as RecallAddon,
    private readonly emit: (event: string, payload: unknown) => void = () => {}
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
      this.runtime = new addon.RecallRuntime(this.userData);
    }
    return this.runtime;
  }

  initialize() {
    if (this.closing)
      return Promise.reject(new Error("Recall runtime is shutting down"));
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
      return Promise.reject(new Error("Recall runtime is shutting down"));
    if (command === "recall_monitor_heartbeat")
      return this.track(
        Promise.resolve().then(() => {
          this.emit("recall-monitor", monitorHeartbeat());
          return null;
        })
      );
    if (command === "recall_initialize")
      return this.track(this.initialize().then(() => null));
    return this.track(
      (async () => {
        await this.initialize();
        const started = performance.now();
        const stopEvents =
          command === "recall_run_legacy_migration" ||
          command === "recall_batch_import_files"
            ? this.startEvents()
            : undefined;
        let result: string;
        try {
          result = await this.getRuntime().execute(
            command,
            JSON.stringify(args)
          );
        } finally {
          stopEvents?.();
        }
        const response: unknown = JSON.parse(result);
        if (
          command === "recall_run_retrieval_pipeline" ||
          command === "recall_run_custom_retrieval_pipeline"
        ) {
          this.emit(
            "recall-monitor",
            pipelineMonitor(
              args.request as Record<string, unknown>,
              response as RecallPipelineRunResponse,
              Math.max(0, Math.round(performance.now() - started))
            )
          );
        }
        return response;
      })()
    );
  }

  async shutdown() {
    this.closing = true;
    while (this.pending.size > 0) await Promise.allSettled([...this.pending]);
  }
}
