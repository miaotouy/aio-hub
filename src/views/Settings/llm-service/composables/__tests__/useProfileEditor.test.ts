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

import { effectScope, nextTick, ref, type EffectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmProfile } from "@/types/llm-profiles";
const mocks = vi.hoisted(() => ({ profiles: undefined as any, save: vi.fn(), delete: vi.fn() }));
vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({
    profiles: mocks.profiles,
    saveProfile: mocks.save,
    deleteProfile: mocks.delete,
    toggleProfileEnabled: vi.fn(async () => {}),
    generateId: () => "fixture-new",
    createFromPreset: vi.fn(),
    updateProfilesOrder: vi.fn(),
  }),
}));
vi.mock("element-plus", () => ({
  ElMessageBox: { confirm: vi.fn(async () => {}) },
}));
vi.mock("@/utils/customMessage", () => ({
  customMessage: { error: vi.fn(), success: vi.fn() },
}));
import { useProfileEditor } from "../useProfileEditor";
const scopes: EffectScope[] = [];
function editor() {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(useProfileEditor)!;
}
beforeEach(() => {
  vi.useFakeTimers();
  mocks.save.mockReset();
  mocks.delete.mockReset();
  mocks.delete.mockImplementation(async (id: string) => {
    mocks.profiles.value = mocks.profiles.value.filter(
      (profile: LlmProfile) => profile.id !== id
    );
  });
  mocks.profiles = ref<LlmProfile[]>([
    {
      id: "fixture",
      name: "Local fixture",
      enabled: true,
      type: "openai-compatible",
      baseUrl: "http://127.0.0.1:9/v1",
      apiKeys: [],
      models: [],
    },
  ]);
  mocks.save.mockImplementation(async (profile: LlmProfile) => {
    const index = mocks.profiles.value.findIndex(
      (item: LlmProfile) => item.id === profile.id
    );
    mocks.profiles.value[index] = JSON.parse(JSON.stringify(profile));
  });
});
afterEach(() => {
  for (const scope of scopes.splice(0)) scope.stop();
  vi.useRealTimers();
});
describe("profile autosave behavior", () => {
  it("loads an existing channel without writing or starting an autosave loop", async () => {
    const value = editor();
    value.selectProfile("fixture");
    await nextTick();
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("debounces a real edit once and remains idle after the store accepts it", async () => {
    const value = editor();
    value.selectProfile("fixture");
    await nextTick();
    value.editForm.value.name = "Renamed fixture";
    await nextTick();
    await vi.advanceTimersByTimeAsync(500);
    value.editForm.value.name = "Final fixture";
    await nextTick();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.profiles.value[0].name).toBe("Final fixture");
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.save).toHaveBeenCalledOnce();
  });
  it("cancels a pending autosave when the selected channel is deleted", async () => {
    const value = editor();
    value.selectProfile("fixture");
    await nextTick();
    value.editForm.value.name = "Pending deleted edit";
    await nextTick();
    await value.handleDelete();
    expect(mocks.profiles.value).toEqual([]);
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("flushes an actual pending edit when its view scope closes", async () => {
    const value = editor();
    value.selectProfile("fixture");
    await nextTick();
    value.editForm.value.name = "Saved on close";
    await nextTick();
    scopes[0].stop();
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(mocks.profiles.value[0].name).toBe("Saved on close");
    await vi.advanceTimersByTimeAsync(5000);
    expect(mocks.save).toHaveBeenCalledOnce();
  });
});
