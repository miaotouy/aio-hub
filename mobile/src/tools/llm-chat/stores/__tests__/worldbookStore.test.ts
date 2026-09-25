import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { MobileWorldbookConfig } from "../../types";

const state = vi.hoisted(() => ({
  config: { worldbooks: [] } as MobileWorldbookConfig,
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({ load: state.load, save: state.save }),
}));

import { useWorldbookStore } from "../worldbookStore";

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  state.config = { worldbooks: [] };
  state.load.mockImplementation(async () => structuredClone(state.config));
  state.save.mockImplementation(async (config) => {
    state.config = JSON.parse(JSON.stringify(config));
  });
});

describe("worldbookStore", () => {
  it("preserves agent-selected ordering while excluding disabled or missing Worldbooks", async () => {
    const store = useWorldbookStore();
    await store.init();
    const first = await store.createWorldbook({ name: "First" });
    const second = await store.createWorldbook({
      name: "Second",
      enabled: false,
    });
    const third = await store.createWorldbook({ name: "Third" });

    expect(
      store
        .getWorldbooksByIds([third.id, "missing", second.id, first.id])
        .map((item) => item.id)
    ).toEqual([third.id, first.id]);
  });

  it("normalizes entries on save and persists the updated Worldbook", async () => {
    const store = useWorldbookStore();
    await store.init();
    const worldbook = await store.createWorldbook({ name: "Lore" });

    const entry = await store.upsertEntry(worldbook.id, {
      content: "  A stable fact.  ",
      keys: [" starport ", "", "dock"],
      depth: -2,
      scanDepth: 0,
    });

    expect(entry).toMatchObject({
      keys: ["starport", "dock"],
      depth: 0,
      scanDepth: 1,
      position: "before_history",
    });
    expect(state.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        worldbooks: [
          expect.objectContaining({
            entries: [expect.objectContaining({ id: entry?.id })],
          }),
        ],
      })
    );
  });

  it("uses SillyTavern depth 4 when a new entry omits depth", async () => {
    const store = useWorldbookStore();
    await store.init();
    const worldbook = await store.createWorldbook({ name: "Default depth" });

    const entry = await store.upsertEntry(worldbook.id, {
      content: "A default-depth fact.",
      position: "depth",
    });

    expect(entry?.depth).toBe(4);
  });

  it("rejects names that only differ by surrounding whitespace or casing", async () => {
    const store = useWorldbookStore();
    await store.init();
    await store.createWorldbook({ name: " Starport " });

    await expect(store.createWorldbook({ name: "starport" })).rejects.toThrow(
      "WORLDBOOK_NAME_DUPLICATE"
    );
  });

  it("imports SillyTavern entries and downgrades advanced positions with warnings", async () => {
    const store = useWorldbookStore();
    await store.init();

    const { worldbook, warnings } = await store.importFromSillyTavern({
      name: "Starport",
      book: {
        entries: [
          {
            keys: ["starport", "dock"],
            content: "A busy port.",
            position: "before_char",
            order: 10,
          },
          {
            key: "harbor",
            content: "Ships anchor here.",
            position: "after_an",
          },
        ],
      },
    });

    expect(worldbook.name).toBe("Starport");
    expect(worldbook.entries).toHaveLength(2);
    expect(worldbook.entries[0]).toMatchObject({
      keys: ["starport", "dock"],
      position: "before_history",
      order: 10,
    });
    expect(worldbook.entries[1]).toMatchObject({
      keys: ["harbor"],
      position: "after_character",
    });
    expect(warnings.join(" ")).toContain("降级");
  });

  it("accepts dictionary entries and deduplicates the imported Worldbook name", async () => {
    const store = useWorldbookStore();
    await store.init();
    await store.createWorldbook({ name: "Lore" });

    const { worldbook } = await store.importFromSillyTavern({
      name: "Lore",
      book: { entries: { 0: { key: ["starport"], content: "A fact." } } },
    });

    expect(worldbook.name).toBe("Lore (2)");
    expect(worldbook.entries).toHaveLength(1);
    expect(state.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        worldbooks: expect.arrayContaining([
          expect.objectContaining({ id: worldbook.id }),
        ]),
      })
    );
  });

  it("rejects invalid or empty SillyTavern worldbooks", async () => {
    const store = useWorldbookStore();
    await store.init();

    await expect(
      store.importFromSillyTavern({ book: { notEntries: true } })
    ).rejects.toThrow("INVALID_WORLDBOOK");
    await expect(
      store.importFromSillyTavern({ book: { entries: [] } })
    ).rejects.toThrow("EMPTY_WORLDBOOK");
  });
});
