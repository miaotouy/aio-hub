// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

const mocks = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  dirs: new Set<string>(),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(
    async (path: string) => mocks.files.has(path) || mocks.dirs.has(path)
  ),
  mkdir: vi.fn(async (path: string) => {
    mocks.dirs.add(path);
  }),
  readFile: vi.fn(async (path: string) => {
    const data = mocks.files.get(path);
    if (!data) throw new Error("ENOENT");
    return data;
  }),
  writeFile: vi.fn(async (path: string, data: Uint8Array) => {
    mocks.files.set(path, data);
  }),
  readTextFile: vi.fn(async (path: string) =>
    new TextDecoder().decode(mocks.files.get(path) ?? new Uint8Array())
  ),
  writeTextFile: vi.fn(async (path: string, data: string) => {
    mocks.files.set(path, new TextEncoder().encode(data));
  }),
  remove: vi.fn(async (path: string) => {
    mocks.files.delete(path);
    mocks.dirs.delete(path);
  }),
  readDir: vi.fn(async (path: string) => {
    const resolved = String(path);
    if (!resolved.endsWith("/a")) return [] as never;
    const entries: Array<{
      name: string;
      isFile: boolean;
      isDirectory: boolean;
      isSymlink: boolean;
    }> = [];
    for (const key of mocks.files.keys()) {
      const relative = key.slice(resolved.length + 1);
      if (relative && !relative.includes("/")) {
        entries.push({
          name: relative,
          isFile: true,
          isDirectory: false,
          isSymlink: false,
        });
      }
    }
    return entries as never;
  }),
}));
vi.mock("@tauri-apps/api/path", () => ({
  join: (...parts: string[]) => Promise.resolve(parts.join("/")),
}));
vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: () => Promise.resolve("/app"),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

import {
  isAgentIconFilename,
  useAgentAvatar,
  useAgentAvatarUrls,
} from "../useAgentAvatar";

const AGENT_ROOT = "/app/agent-manager/agents/a";

describe("isAgentIconFilename", () => {
  it("与桌面端 isLikelyFilename 判定一致", () => {
    expect(isAgentIconFilename("avatar-123.png")).toBe(true);
    expect(isAgentIconFilename("卡.png")).toBe(true);
    expect(isAgentIconFilename("assets/pic.png")).toBe(false);
    expect(isAgentIconFilename("C:\\pic.png")).toBe(false);
    expect(isAgentIconFilename("data:image/png;base64,xx")).toBe(false);
    expect(isAgentIconFilename("appdata://x/y.png")).toBe(false);
    expect(isAgentIconFilename("温柔")).toBe(false);
    expect(isAgentIconFilename("")).toBe(false);
    expect(isAgentIconFilename(undefined)).toBe(false);
  });
});

describe("useAgentAvatar", () => {
  beforeEach(() => {
    mocks.files.clear();
    mocks.dirs.clear();
    vi.clearAllMocks();
  });

  it("icon 文件名优先解析为 dataURL，读取失败回退 avatarDataUrl", async () => {
    const { useAgentStorage } = await import("../useAgentStorage");
    await useAgentStorage().saveAgentAvatar(
      "a",
      "avatar-1.png",
      new Uint8Array([137, 80, 78, 71])
    );

    const { resolveAgentAvatarUrl } = useAgentAvatar();
    const resolved = await resolveAgentAvatarUrl({
      id: "a",
      icon: "avatar-1.png",
    });
    expect(resolved).toBe("data:image/png;base64,iVBORw==");

    // 二次解析命中缓存（readFile 只在首次调用）
    const again = await resolveAgentAvatarUrl({
      id: "a",
      icon: "avatar-1.png",
    });
    expect(again).toBe(resolved);

    const fallback = await resolveAgentAvatarUrl({
      id: "a",
      icon: "missing.png",
      avatarDataUrl: "data:image/png;base64,AAAA",
    });
    expect(fallback).toBe("data:image/png;base64,AAAA");

    // emoji/空 icon 返回 null
    expect(await resolveAgentAvatarUrl({ id: "a", icon: "温柔" })).toBeNull();
    expect(await resolveAgentAvatarUrl({ id: "a" })).toBeNull();
  });

  it("历史头像合并目录文件与 avatarHistory 并按时间戳倒序", async () => {
    const { useAgentStorage } = await import("../useAgentStorage");
    const storage = useAgentStorage();
    await storage.saveAgent({
      id: "a",
      name: "agent",
      profileId: "p",
      modelId: "m",
      createdAt: "2026-01-01T00:00:00Z",
      icon: "avatar-200.png",
      avatarHistory: ["avatar-100.png"],
    } as never);
    await storage.saveAgentAvatar("a", "avatar-200.png", new Uint8Array([1]));
    await storage.saveAgentAvatar("a", "avatar-300.jpg", new Uint8Array([2]));

    const { listAvatarHistory } = useAgentAvatar();
    const history = await listAvatarHistory({
      id: "a",
      avatarHistory: ["avatar-100.png", "avatar-300.jpg"],
    });
    expect(history).toEqual(["avatar-300.jpg", "avatar-200.png", "avatar-100.png"]);
  });

  it("保存上传头像生成 avatar-{ts} 文件名并回写", async () => {
    const { saveAvatarFile, resolveAgentAvatarUrl } = useAgentAvatar();

    const filename = await saveAvatarFile(
      "a",
      "photo.jpeg",
      new Uint8Array([9, 9])
    );
    expect(filename).toMatch(/^avatar-\d+\.jpeg$/);
    expect(mocks.files.has(`${AGENT_ROOT}/${filename}`)).toBe(true);
    expect(
      await resolveAgentAvatarUrl({ id: "a", icon: filename })
    ).toBe("data:image/jpeg;base64,CQk=");
  });

  it("删除历史头像仅允许图片文件并清除缓存", async () => {
    const { useAgentStorage } = await import("../useAgentStorage");
    const storage = useAgentStorage();
    await storage.saveAgentAvatar("a", "avatar-5.png", new Uint8Array([1]));
    mocks.files.set(`${AGENT_ROOT}/agent.json`, new TextEncoder().encode("{}"));

    const { deleteAvatarFile } = useAgentAvatar();
    await expect(deleteAvatarFile("a", "agent.json")).rejects.toThrow(
      "INVALID_AVATAR_FILENAME"
    );
    expect(mocks.files.has(`${AGENT_ROOT}/agent.json`)).toBe(true);

    await deleteAvatarFile("a", "avatar-5.png");
    expect(mocks.files.has(`${AGENT_ROOT}/avatar-5.png`)).toBe(false);
  });
});

describe("useAgentAvatarUrls", () => {
  beforeEach(() => {
    mocks.files.clear();
    mocks.dirs.clear();
    vi.clearAllMocks();
  });

  it("按 agent 列表解析头像，icon 变化后重新解析（修复陈旧缓存）", async () => {
    const { useAgentStorage } = await import("../useAgentStorage");
    const storage = useAgentStorage();
    await storage.saveAgentAvatar("a", "avatar-1.png", new Uint8Array([137, 80, 78, 71]));
    await storage.saveAgentAvatar("a", "avatar-2.png", new Uint8Array([137, 80, 78, 71]));

    const agents = ref<Array<{ id: string; icon?: string }>>([
      { id: "a", icon: "avatar-1.png" },
    ]);
    const avatarUrls = useAgentAvatarUrls(() => agents.value);
    await nextTick();
    await vi.waitFor(() =>
      expect(avatarUrls["a"]).toBe("data:image/png;base64,iVBORw==")
    );

    // 换新头像：签名变化必须重新解析，而不是命中旧显示条目
    agents.value = [{ id: "a", icon: "avatar-2.png" }];
    await vi.waitFor(() => expect(avatarUrls["a"]).toBe("data:image/png;base64,iVBORw=="));

    // emoji icon：条目移除，由调用方回退文本
    agents.value = [{ id: "a", icon: "温柔" }];
    await vi.waitFor(() => expect(avatarUrls["a"]).toBeUndefined());
  });

  it("Agent 被删除后清理显示条目并失效模块级缓存", async () => {
    const { useAgentStorage } = await import("../useAgentStorage");
    const storage = useAgentStorage();
    await storage.saveAgentAvatar("a", "avatar-1.png", new Uint8Array([137, 80, 78, 71]));

    const agents = ref<Array<{ id: string; icon?: string }>>([
      { id: "a", icon: "avatar-1.png" },
    ]);
    const avatarUrls = useAgentAvatarUrls(() => agents.value);
    await nextTick();
    await vi.waitFor(() => expect(avatarUrls["a"]).toBeTruthy());

    agents.value = [];
    await vi.waitFor(() => expect(avatarUrls["a"]).toBeUndefined());

    // 重建同名 Agent（测试场景）：缓存已被 invalidate，重新读文件而非沿用旧 dataURL
    await storage.saveAgentAvatar("a", "avatar-1.png", new Uint8Array([1]));
    agents.value = [{ id: "a", icon: "avatar-1.png" }];
    await vi.waitFor(() => expect(avatarUrls["a"]).toBe("data:image/png;base64,AQ=="));
  });
});
