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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, nextTick, ref, type EffectScope } from "vue";
import type { AgentAsset } from "../../../types/agent";
const mocks = vi.hoisted(() => ({ create: vi.fn(), describe: vi.fn() }));
vi.mock("../../../services/agentAssetDescriptionService", () => ({
  createAssetDescriber: mocks.create,
}));
import { useAssetDescriptionGeneration } from "../useAssetDescriptionGeneration";

let scope: EffectScope;
const asset = (id: string, description?: string): AgentAsset => ({
  id,
  path: `assets/${id}.png`,
  filename: `${id}.png`,
  type: "image",
  description,
});
function setup() {
  const agentId = ref("first-agent");
  const active = ref(true);
  const apply = vi.fn((_snapshot: AgentAsset, _description: string) => true);
  scope = effectScope();
  const state = scope.run(() =>
    useAssetDescriptionGeneration({
      agentId: () => agentId.value,
      active: () => active.value,
      groups: () => [],
      apply,
    })
  )!;
  return { state, agentId, active, apply };
}
function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue(mocks.describe);
  mocks.describe.mockResolvedValue("生成描述");
});
afterEach(() => scope?.stop());

describe("asset description batches", () => {
  it("preserves existing descriptions by default and isolates a failed asset", async () => {
    mocks.describe.mockImplementation(async (item: AgentAsset) => {
      if (item.id === "bad") throw new Error("读取失败");
      return "生成描述";
    });
    const { state, apply } = setup();
    await state.run(
      [asset("existing", "人工描述"), asset("good"), asset("bad")],
      "短描述"
    );
    expect(
      apply.mock.calls.map(([item]) => (item as unknown as AgentAsset).id)
    ).toEqual(["good"]);
    expect(state.skipped.value).toBe(1);
    expect(state.failed.value.map((job) => [job.asset.id, job.error])).toEqual([
      ["bad", "读取失败"],
    ]);
    expect(state.running.value).toBe(false);
  });

  it("passes the original metadata snapshot to the write guard", async () => {
    const pending = deferred();
    mocks.describe.mockReturnValue(pending.promise);
    const { state, apply } = setup();
    const original = asset("changed");
    const task = state.run([original], "短描述");
    await nextTick();
    original.description = "处理中手动修改";
    apply.mockImplementation(
      (snapshot: unknown) =>
        (snapshot as AgentAsset).description === original.description
    );
    pending.resolve("生成描述");
    await task;
    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({ description: undefined }),
      "生成描述"
    );
    expect(state.skipped.value).toBe(1);
    expect(state.succeeded.value).toBe(0);
  });

  it.each(["cancel", "switch", "close"] as const)(
    "prevents writes and further dispatch after %s",
    async (action) => {
      const pending = deferred();
      mocks.describe.mockReturnValue(pending.promise);
      const { state, agentId, active, apply } = setup();
      const task = state.run(
        [asset("one"), asset("two"), asset("three")],
        "短描述"
      );
      await nextTick();
      expect(mocks.describe).toHaveBeenCalledTimes(2);
      if (action === "cancel") state.cancel();
      if (action === "switch") agentId.value = "another-agent";
      if (action === "close") active.value = false;
      await nextTick();
      pending.resolve("迟到的描述");
      await task;
      expect(apply).not.toHaveBeenCalled();
      expect(mocks.describe).toHaveBeenCalledTimes(2);
      expect(state.running.value).toBe(false);
    }
  );
});
