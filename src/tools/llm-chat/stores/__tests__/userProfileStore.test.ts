import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import type { UserProfile } from "../../types";
import { useUserProfileStore } from "../userProfileStore";

const storageMocks = vi.hoisted(() => ({
  loadProfiles: vi.fn(),
  loadSettings: vi.fn(),
  loadProfile: vi.fn(),
  saveProfiles: vi.fn(),
  persistProfile: vi.fn(),
  deleteProfile: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("../../composables/storage/useUserProfileStorage", () => ({
  useUserProfileStorage: () => storageMocks,
}));

vi.mock("../composables/storage/useUserProfileStorage", () => ({
  useUserProfileStorage: () => storageMocks,
}));

vi.mock("@utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    handle: vi.fn(),
    error: vi.fn(),
  }),
}));

const createProfile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  id: "profile-1",
  name: "tester",
  displayName: "Tester",
  icon: "",
  avatarHistory: [],
  content: "完整档案内容",
  enabled: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastUsedAt: undefined,
  richTextStyleOptions: {},
  richTextStyleBehavior: "follow_agent",
  regexConfig: { presets: [] },
  worldbookIds: [],
  quickActionSetIds: [],
  ...overrides,
});

describe("userProfileStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    storageMocks.loadProfiles.mockResolvedValue([createProfile()]);
    storageMocks.loadSettings.mockResolvedValue({ globalProfileId: "profile-1" });
  });

  it("loads complete profiles with a single in-flight storage read", async () => {
    const store = useUserProfileStore();

    await Promise.all([store.loadProfiles(), store.loadProfiles()]);

    expect(storageMocks.loadProfiles).toHaveBeenCalledTimes(1);
    expect(store.profiles).toHaveLength(1);
    expect(store.profiles[0].content).toBe("完整档案内容");
    expect(store.profiles[0].regexConfig).toEqual({ presets: [] });
    expect(store.profiles[0].worldbookIds).toEqual([]);
    expect(store.globalProfileId).toBe("profile-1");
  });

  it("drops a saved global profile id that is not present after full load", async () => {
    storageMocks.loadSettings.mockResolvedValue({
      globalProfileId: "missing-profile",
    });

    const store = useUserProfileStore();

    await store.loadProfiles();

    expect(store.globalProfileId).toBeNull();
  });

  it("keeps ensureProfileLoaded as an in-memory compatibility lookup", async () => {
    const store = useUserProfileStore();
    const profile = createProfile();
    store.profiles = [profile];

    expect(store.ensureProfileLoaded("profile-1")).toEqual(profile);
    expect(store.ensureProfileLoaded("missing-profile")).toBeNull();
    expect(storageMocks.loadProfile).not.toHaveBeenCalled();
  });
});
