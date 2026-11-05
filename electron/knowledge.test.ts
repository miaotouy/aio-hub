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

import { expect, it } from "vitest";
import { Knowledge } from "./knowledge";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

it("loads the named addon export lazily and shares initialization across commands", async () => {
  const calls: string[] = [];
  const service = new Knowledge("data", "app", (file) => {
    calls.push(file);
    return {
      KnowledgeRuntime: class {
        async initialize() {
          calls.push("initialize");
        }
        async execute(command: string, args: string) {
          calls.push(command + ":" + args);
          return '{"ok":true}';
        }
      },
    };
  });

  expect(calls).toEqual([]);
  expect(await service.run("knowledge_list_libraries", {})).toEqual({
    ok: true,
  });
  expect(
    await service.run("knowledge_search", { request: { query: "x" } })
  ).toEqual({
    ok: true,
  });
  expect(calls[0]).toContain("native-runtime");
  expect(calls.filter((value) => value === "initialize")).toHaveLength(1);
  await service.shutdown();
});

it("drains initialization and in-flight commands, then rejects new work", async () => {
  const init = deferred();
  const execute = deferred();
  const service = new Knowledge("data", "app", () => ({
    KnowledgeRuntime: class {
      async initialize() {
        await init.promise;
      }
      async execute() {
        await execute.promise;
        return "null";
      }
    },
  }));

  const operation = service.run("knowledge_list_libraries", {});
  expect(service.hasPendingOperations).toBe(true);
  let stopped = false;
  const shutdown = service.shutdown().then(() => (stopped = true));
  await Promise.resolve();
  expect(stopped).toBe(false);
  init.resolve();
  await Promise.resolve();
  await Promise.resolve();
  expect(stopped).toBe(false);
  execute.resolve();
  await operation;
  await shutdown;
  expect(service.hasPendingOperations).toBe(false);
  await expect(service.run("knowledge_list_libraries", {})).rejects.toThrow(
    "shutting down"
  );
});

it("retries initialization after an addon initialization failure", async () => {
  let attempts = 0;
  const service = new Knowledge("data", "app", () => ({
    KnowledgeRuntime: class {
      async initialize() {
        attempts += 1;
        if (attempts === 1) throw new Error("initialization failed");
      }
      async execute() {
        return "null";
      }
    },
  }));

  await expect(service.initialize()).rejects.toThrow("initialization failed");
  await service.initialize();
  expect(attempts).toBe(2);
  await service.shutdown();
});
