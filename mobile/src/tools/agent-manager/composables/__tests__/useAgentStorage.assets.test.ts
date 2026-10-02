// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  readDir: vi.fn(async () => []),
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

import { readDir } from "@tauri-apps/plugin-fs";
import { useAgentStorage } from "../useAgentStorage";

const AGENT_ROOT = "/app/agent-manager/agents/a";

describe("useAgentStorage 私有资产目录", () => {
  beforeEach(() => {
    mocks.files.clear();
    mocks.dirs.clear();
    vi.clearAllMocks();
  });

  it("保存与读取头像和任意相对路径资产", async () => {
    const storage = useAgentStorage();

    const filename = await storage.saveAgentAvatar(
      "a",
      "avatar.png",
      new Uint8Array([1, 2])
    );
    expect(filename).toBe("avatar.png");
    expect(mocks.files.has(`${AGENT_ROOT}/avatar.png`)).toBe(true);

    const avatar = await storage.readAgentAsset("a", "avatar.png");
    expect(avatar && [...avatar]).toEqual([1, 2]);

    const saved = await storage.saveAgentAsset(
      "a",
      "assets/sub/pic.bin",
      new Uint8Array([3, 4, 5])
    );
    expect(saved).toBe("assets/sub/pic.bin");
    expect(mocks.files.has(`${AGENT_ROOT}/assets/sub/pic.bin`)).toBe(true);

    expect(await storage.readAgentAsset("a", "assets/missing.bin")).toBeNull();
  });

  it("归一化相对路径并阻止目录逃逸", async () => {
    const storage = useAgentStorage();

    const saved = await storage.saveAgentAsset(
      "a",
      "../evil.bin",
      new Uint8Array([1])
    );

    expect(saved).toBe("__/evil.bin");
    expect(mocks.files.has(`${AGENT_ROOT}/__/evil.bin`)).toBe(true);
    expect(mocks.files.has("/app/agent-manager/evil.bin")).toBe(false);
  });

  it("删除资产仅允许 assets/ 前缀内的文件", async () => {
    const storage = useAgentStorage();
    await storage.saveAgentAsset("a", "assets/x.png", new Uint8Array([1]));
    await storage.saveAgentAvatar("a", "avatar.png", new Uint8Array([2]));

    await storage.deleteAgentAsset("a", "assets/x.png");
    expect(mocks.files.has(`${AGENT_ROOT}/assets/x.png`)).toBe(false);
    // 头像位于 Agent 根目录，必须拒绝删除
    await expect(storage.deleteAgentAsset("a", "avatar.png")).rejects.toThrow(
      "INVALID_ASSET_PATH"
    );
    expect(mocks.files.has(`${AGENT_ROOT}/avatar.png`)).toBe(true);
    // 不存在的路径静默成功（幂等）
    await expect(
      storage.deleteAgentAsset("a", "assets/missing.bin")
    ).resolves.toBeUndefined();
  });

  it("递归列出 assets 目录下的文件（相对 Agent 目录）", async () => {
    mocks.dirs.add(`${AGENT_ROOT}/assets`);
    mocks.dirs.add(`${AGENT_ROOT}/assets/sub`);
    mocks.files.set(`${AGENT_ROOT}/assets/x.png`, new Uint8Array([1]));
    mocks.files.set(`${AGENT_ROOT}/assets/sub/y.bin`, new Uint8Array([2]));
    vi.mocked(readDir).mockImplementation(async (path: string | URL) => {
      const resolved = String(path);
      if (resolved === `${AGENT_ROOT}/assets`) {
        return [
          { name: "x.png", isDirectory: false, isFile: true, isSymlink: false },
          { name: "sub", isDirectory: true, isFile: false, isSymlink: false },
        ] as never;
      }
      if (resolved === `${AGENT_ROOT}/assets/sub`) {
        return [
          { name: "y.bin", isDirectory: false, isFile: true, isSymlink: false },
        ] as never;
      }
      return [] as never;
    });

    const storage = useAgentStorage();
    expect((await storage.listAgentAssets("a")).sort()).toEqual([
      "assets/sub/y.bin",
      "assets/x.png",
    ]);
  });
});
