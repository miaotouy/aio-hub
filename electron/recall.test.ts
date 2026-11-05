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

import { expect, it, vi } from "vitest";
import { Recall } from "./recall";

it("loads the addon once and initializes Recall before dispatch", async () => {
  const calls: string[] = [];
  const service = new Recall("data", "app", (file) => {
    calls.push(file);
    return {
      RecallRuntime: class {
        drainEvents() {
          return [];
        }
        async initialize() {
          calls.push("initialize");
        }
        async execute(command: string, args: string) {
          calls.push(command + args);
          return "[]";
        }
      },
    };
  });

  await expect(service.run("recall_list_bases", {})).resolves.toEqual([]);
  expect(calls.filter((item) => item === "initialize")).toHaveLength(1);
  await service.shutdown();
});

it("waits for accepted operations and rejects calls after shutdown begins", async () => {
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  const service = new Recall("data", "app", () => ({
    RecallRuntime: class {
      drainEvents() {
        return [];
      }
      async initialize() {}
      async execute() {
        await hold;
        return "null";
      }
    },
  }));

  const operation = service.run("recall_list_bases", {});
  const shutdown = service.shutdown();
  expect(service.hasPendingOperations).toBe(true);
  await expect(service.run("recall_list_bases", {})).rejects.toThrow(
    "shutting down"
  );
  release();
  await operation;
  await shutdown;
  expect(service.hasPendingOperations).toBe(false);
});

it("publishes pipeline results, structured failures and monitor heartbeats", async () => {
  const events: Array<{ event: string; payload: any }> = [];
  const response: Record<string, any> = {
    runId: "run",
    outcome: "success",
    requestedPresetId: "algorithmic",
    actualPresetId: "algorithmic",
    configHash: "hash",
    results: [
      {
        entry: { id: "entry", content: "document" },
        score: 1.4,
        recallName: "Library",
        matchType: "keyword",
        signals: [{ signalType: "keyword", score: 0.7 }],
      },
    ],
    trace: {
      steps: [
        {
          phase: "retrieve",
          moduleId: "keyword-recall",
          status: "completed",
          durationMs: 2,
          outputCount: 1,
        },
      ],
    },
  };
  const service = new Recall(
    "data",
    "app",
    () => ({
      RecallRuntime: class {
        drainEvents() {
          return [];
        }
        async initialize() {}
        async execute() {
          return JSON.stringify(response);
        }
      },
    }),
    (event, payload) => events.push({ event, payload })
  );
  const args = {
    request: { query: "query", filters: { recallIds: ["library"] } },
  };
  await expect(
    service.run("recall_run_retrieval_pipeline", args)
  ).resolves.toEqual(response);
  const success = events[0];
  expect(success.event).toBe("recall-monitor");
  expect(success.payload.payload.results[0]).toMatchObject({
    score: 1.4,
    metadata: { scoreSemantics: "ranking-score", relevanceScore: 0.7 },
  });
  expect(success.payload.payload.pipelineTrace).toEqual(response.trace);
  expect(success.payload.payload.metadata).toMatchObject({
    query: "query",
    recallIds: ["library"],
    executionPath: "retrieval-pipeline",
    runId: "run",
  });
  response.outcome = "failed";
  response.results = [];
  response.error = { code: "config-hash-mismatch", message: "stale" };
  await service.run("recall_run_custom_retrieval_pipeline", args);
  expect(events[1].payload).toMatchObject({
    level: "error",
    type: "RAG",
    payload: { pipelineError: response.error },
  });
  await expect(service.run("recall_monitor_heartbeat", {})).resolves.toBeNull();
  expect(events[2].payload).toMatchObject({
    type: "System",
    payload: { metadata: { heartbeat: true } },
  });
  await service.shutdown();
});

it.each(["recall_run_legacy_migration", "recall_batch_import_files"])(
  "forwards long-running %s progress and drains events on success and failure",
  async (command) => {
    vi.useFakeTimers();
    try {
      for (const fail of [false, true]) {
        const messages: string[] = [];
        const received: unknown[] = [];
        let release!: () => void;
        let started!: () => void;
        const executing = new Promise<void>((resolve) => {
          started = resolve;
        });
        const hold = new Promise<void>((resolve) => {
          release = resolve;
        });
        const service = new Recall(
          "data",
          "app",
          () => ({
            RecallRuntime: class {
              async initialize() {}
              drainEvents() {
                return messages.splice(0);
              }
              async execute() {
                messages.push(
                  JSON.stringify({
                    event: "recall://legacy-migration-progress",
                    payload: { phase: "main", current: 1 },
                  })
                );
                started();
                await hold;
                messages.push(
                  JSON.stringify({
                    event: "recall://legacy-migration-progress",
                    payload: {
                      phase: fail ? "verify" : "completed",
                      current: 2,
                    },
                  })
                );
                if (fail) throw new Error("migration failed");
                return JSON.stringify({ mainStatus: "completed" });
              }
            },
          }),
          (event, payload) => received.push({ event, payload })
        );
        const operation = service.run(command, {});
        await executing;
        await vi.advanceTimersByTimeAsync(50);
        expect(received).toEqual([
          {
            event: "recall://legacy-migration-progress",
            payload: { phase: "main", current: 1 },
          },
        ]);
        const completion = fail
          ? expect(operation).rejects.toThrow("migration failed")
          : expect(operation).resolves.toEqual({ mainStatus: "completed" });
        const shutdown = service.shutdown();
        expect(service.hasPendingOperations).toBe(true);
        release();
        await completion;
        await shutdown;
        expect(received).toHaveLength(2);
        expect(received[1]).toMatchObject({
          payload: { phase: fail ? "verify" : "completed", current: 2 },
        });
        expect(vi.getTimerCount()).toBe(0);
        expect(service.hasPendingOperations).toBe(false);
      }
    } finally {
      vi.useRealTimers();
    }
  }
);
