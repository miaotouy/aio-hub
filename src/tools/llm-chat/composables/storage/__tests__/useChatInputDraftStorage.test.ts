import { beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    value: {},
    configurable: true,
  });
});
vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: async () => "C:/test-config",
}));
vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts: string[]) => parts.join("/"),
}));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ handle: vi.fn() }),
}));

import { invoke } from "@tauri-apps/api/core";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { createConfigManager } from "@/utils/configManager";
import { loadChatInputDrafts } from "../useChatInputDraftStorage";

const invokeMock = vi.mocked(invoke);
const writeMock = vi.mocked(writeTextFile);

describe("chat input draft recovery", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    writeMock.mockReset();
    writeMock.mockResolvedValue(undefined);
  });

  it.each(["read", "parse"])(
    "rejects a %s failure without overwriting the draft file",
    async (failure) => {
      invokeMock.mockImplementation(async (command) => {
        if (command === "path_exists") return true;
        if (command === "read_text_file_force") {
          if (failure === "read") throw new Error("temporary read failure");
          return "{ damaged JSON";
        }
        throw new Error(`Unexpected command: ${command}`);
      });
      await expect(loadChatInputDrafts()).rejects.toThrow();
      expect(writeMock).not.toHaveBeenCalled();
    }
  );

  it("initializes defaults only when the draft file is missing", async () => {
    invokeMock.mockImplementation(async (command, args) => {
      if (command === "path_exists") {
        return !(args as { path: string }).path.endsWith("input-drafts.json");
      }
      throw new Error(`Unexpected command: ${command}`);
    });
    await expect(loadChatInputDrafts()).resolves.toBeNull();
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeMock.mock.calls[0][1] as string)).toEqual({
      version: "1.0.0",
      state: null,
    });
  });

  it("keeps the default fallback for existing ConfigManager callers", async () => {
    invokeMock.mockImplementation(async (command) => {
      if (command === "path_exists") return true;
      throw new Error("read failed");
    });
    const config = createConfigManager({
      moduleName: "test",
      createDefault: () => ({ enabled: true }),
    });
    await expect(config.load()).resolves.toEqual({ enabled: true });
    expect(writeMock).not.toHaveBeenCalled();
  });
});
