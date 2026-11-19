// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0
import { effectScope } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { useDraftAutoSave } from "../useDraftAutoSave";
const scopes: ReturnType<typeof effectScope>[] = [];
afterEach(() => {
  scopes.splice(0).forEach((scope) => scope.stop());
  vi.useRealTimers();
});
function setup(
  save: (
    value: { id: string; name: string },
    options: { expectedRevision: number }
  ) => Promise<{ value: { id: string; name: string }; revision: number }>
) {
  vi.useFakeTimers();
  const scope = effectScope();
  scopes.push(scope);
  const session = scope.run(() =>
    useDraftAutoSave({
      initial: { id: "", name: "" },
      save,
      validate: (value) => !!value.name,
      delay: 100,
    })
  )!;
  session.open({ id: "channel", name: "Saved" }, 1);
  return session;
}
it("retains newer typing while advancing only the submitted watermark and chains its own receipt", async () => {
  let resolve!: (receipt: {
    value: { id: string; name: string };
    revision: number;
  }) => void;
  const save = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    )
    .mockImplementation(async (value) => ({
      value: { ...value, name: value.name.trim() },
      revision: 3,
    }));
  const session = setup(save);
  session.draft.value.name = "A";
  const pending = session.flush();
  session.draft.value.name = "B ";
  resolve({ value: { id: "channel", name: "Normalized A" }, revision: 2 });
  await pending;
  expect(session.draft.value.name).toBe("B ");
  expect(session.isDirty.value).toBe(true);
  await vi.advanceTimersByTimeAsync(100);
  expect(
    save.mock.calls.map(([value, options]) => [
      value.name,
      options.expectedRevision,
    ])
  ).toEqual([
    ["A", 1],
    ["B ", 2],
  ]);
  expect(session.draft.value.name).toBe("B");
  expect(session.isDirty.value).toBe(false);
});
it("keeps failed input dirty and retries the same unchanged draft only on demand", async () => {
  const save = vi
    .fn()
    .mockRejectedValueOnce(new Error("disk full"))
    .mockImplementation(async (value) => ({ value, revision: 2 }));
  const session = setup(save);
  session.draft.value.name = "Retry me";
  expect(await session.flush()).toBe(false);
  await vi.advanceTimersByTimeAsync(5000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(session.draft.value.name).toBe("Retry me");
  expect(session.isDirty.value).toBe(true);
  expect(await session.flush()).toBe(true);
  expect(save).toHaveBeenCalledTimes(2);
  expect(session.isDirty.value).toBe(false);
});
it("refreshes clean forms but retains dirty baselines on external updates", async () => {
  const save = vi.fn().mockRejectedValue(new Error("revision conflict"));
  const session = setup(save);
  session.sync({ id: "channel", name: "External" }, 2);
  expect(session.draft.value.name).toBe("External");
  session.draft.value.name = "Local";
  session.sync({ id: "channel", name: "New external" }, 3);
  expect(session.draft.value.name).toBe("Local");
  expect(session.lastError.value).toBeTruthy();
  await session.flush();
  expect(save).toHaveBeenCalledWith(
    { id: "channel", name: "Local" },
    { expectedRevision: 2 }
  );
});

it("discards pending edits when explicitly reloading the confirmed form", async () => {
  const save = vi.fn();
  const session = setup(save);
  session.draft.value.name = "Discarded";
  session.open({ id: "channel", name: "Confirmed" }, 2, false, true);
  await vi.advanceTimersByTimeAsync(1000);
  expect(save).not.toHaveBeenCalled();
  expect(session.draft.value.name).toBe("Confirmed");
  expect(session.isDirty.value).toBe(false);
});

it("carries a dirty form across unrelated collection changes with the unchanged confirmed baseline", async () => {
  const save = vi.fn(async (value) => ({ value, revision: 3 }));
  const session = setup(save);
  session.draft.value.name = "Local rename";
  session.sync({ id: "channel", name: "Saved" }, 2);
  expect(session.lastError.value).toBeNull();
  await session.flush();
  expect(save).toHaveBeenCalledWith(
    { id: "channel", name: "Local rename" },
    { expectedRevision: 2 }
  );
});
