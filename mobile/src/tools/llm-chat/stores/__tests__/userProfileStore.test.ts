import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { MobileUserProfileConfig } from "../../types";

const state = vi.hoisted(() => ({
  config: {
    profiles: [],
    globalProfileId: null,
  } as MobileUserProfileConfig,
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/utils/configManager", () => ({
  createConfigManager: () => ({
    load: state.load,
    save: state.save,
  }),
}));

import { useUserProfileStore } from "../userProfileStore";

const profile = (id: string, name: string, enabled = true) => ({
  id,
  name,
  content: `${name} profile content`,
  enabled,
  createdAt: "2026-07-26T10:00:00.000Z",
});

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  state.config = { profiles: [], globalProfileId: null };
  state.load.mockImplementation(async () => structuredClone(state.config));
  state.save.mockImplementation(async (config) => {
    state.config = JSON.parse(JSON.stringify(config));
  });
});

describe("userProfileStore", () => {
  it("prefers an enabled agent binding over the enabled global profile", async () => {
    state.config = {
      profiles: [profile("global", "Global"), profile("agent", "Agent")],
      globalProfileId: "global",
    };
    const store = useUserProfileStore();
    await store.init();

    expect(store.getEffectiveProfile("agent")?.id).toBe("agent");
  });

  it("falls back to the global profile when the agent binding is disabled", async () => {
    state.config = {
      profiles: [profile("global", "Global"), profile("agent", "Agent", false)],
      globalProfileId: "global",
    };
    const store = useUserProfileStore();
    await store.init();

    expect(store.getEffectiveProfile("agent")?.id).toBe("global");
  });

  it("moves the default selection to the next profile when the global profile is removed", async () => {
    state.config = {
      profiles: [profile("global", "Global"), profile("other", "Other")],
      globalProfileId: "global",
    };
    const store = useUserProfileStore();
    await store.init();

    await store.removeProfile("global");

    expect(store.globalProfileId).toBe("other");
    expect(state.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ globalProfileId: "other" })
    );
  });

  it("rejects duplicate profile names after normalization", async () => {
    state.config = {
      profiles: [profile("existing", "Ada")],
      globalProfileId: "existing",
    };
    const store = useUserProfileStore();
    await store.init();

    await expect(
      store.createProfile({ name: " Ada ", content: "Duplicate" })
    ).rejects.toThrow("USER_PROFILE_NAME_DUPLICATE");
  });
});
