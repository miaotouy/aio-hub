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

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFs = vi.hoisted(() => ({
  exists: vi.fn(),
  mkdir: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-fs", () => mockFs);
vi.mock("@tauri-apps/api/path", () => ({
  join: async (...parts: string[]) => parts.join("/"),
}));
vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: vi.fn(async () => "app"),
}));

import {
  isValidSessionPayload,
  SessionPersistenceRepository,
} from "../sessionPersistenceRepository";

const index = (revision: number) =>
  JSON.stringify({
    version: "1.1.2",
    currentSessionId: null,
    sessions: [],
    favoriteFolders: [],
    _persistence: {
      schema: 1,
      revision,
      committedAt: "2026-07-25T00:00:00.000Z",
    },
  });

describe("SessionPersistenceRepository", () => {
  const files = new Map<string, string>();
  const directories = new Map<
    string,
    Array<{ name: string; isFile: boolean }>
  >();

  beforeEach(() => {
    files.clear();
    directories.clear();
    mockFs.exists.mockReset();
    mockFs.readTextFile.mockReset();
    mockFs.readDir.mockReset();
    mockFs.remove.mockReset();
    mockFs.exists.mockImplementation(
      async (path: string) => files.has(path) || directories.has(path)
    );
    mockFs.readTextFile.mockImplementation(async (path: string) => {
      const content = files.get(path);
      if (content === undefined) throw new Error(`missing ${path}`);
      return content;
    });
    mockFs.readDir.mockImplementation(
      async (path: string) => directories.get(path) || []
    );
  });

  it("uses a valid backup rather than a corrupt primary index", async () => {
    files.set("app/llm-chat/sessions-index.json", "\0broken");
    files.set("app/llm-chat/sessions-index.json.bak", index(7));

    const result = await new SessionPersistenceRepository().loadIndex();

    expect(result).toMatchObject({ status: "recovered", source: "backup" });
    if (result.status === "recovered") {
      expect(result.index._persistence?.revision).toBe(7);
    }
  });

  it("uses the highest valid temporary index only as an explicit recovery candidate", async () => {
    files.set("app/llm-chat/sessions-index.json", "bad");
    files.set("app/llm-chat/sessions-index.json.bak", "bad");
    directories.set("app/llm-chat", [
      { name: ".sessions-index.json.one.tmp", isFile: true },
      { name: ".sessions-index.json.two.tmp", isFile: true },
    ]);
    files.set("app/llm-chat/.sessions-index.json.one.tmp", index(2));
    files.set("app/llm-chat/.sessions-index.json.two.tmp", index(9));

    const result = await new SessionPersistenceRepository().loadIndex();

    expect(result).toMatchObject({ status: "recovered", source: "temp" });
    if (result.status === "recovered") {
      expect(result.index._persistence?.revision).toBe(9);
    }
  });

  it("returns corrupt instead of an empty default when session files still exist", async () => {
    files.set("app/llm-chat/sessions-index.json", "bad");
    files.set("app/llm-chat/sessions-index.json.bak", "bad");
    directories.set("app/llm-chat/sessions", [
      { name: "session-a.json", isFile: true },
    ]);

    const result = await new SessionPersistenceRepository().loadIndex();

    expect(result.status).toBe("corrupt");
  });

  it("only clears quarantined session files and retains the corruption manifest", async () => {
    directories.set("app/llm-chat/sessions-corrupt", [
      { name: "corruption-manifest.json", isFile: true },
      { name: "session-a.2026.json", isFile: true },
      { name: "session-b.2026.json", isFile: true },
    ]);

    const count =
      await new SessionPersistenceRepository().clearQuarantinedSessionFiles();

    expect(count).toBe(2);
    expect(mockFs.remove).toHaveBeenCalledWith(
      "app/llm-chat/sessions-corrupt/session-a.2026.json"
    );
    expect(mockFs.remove).toHaveBeenCalledWith(
      "app/llm-chat/sessions-corrupt/session-b.2026.json"
    );
  });

  it("requires a structurally valid session payload before accepting it", () => {
    const valid = {
      id: "session-a",
      name: "Session",
      createdAt: "2026-07-25T00:00:00.000Z",
      updatedAt: "2026-07-25T00:00:00.000Z",
      nodes: {
        root: { id: "root" },
      },
      rootNodeId: "root",
      activeLeafId: "root",
    };
    expect(isValidSessionPayload(valid, "session-a")).toBe(true);
    expect(
      isValidSessionPayload({ ...valid, activeLeafId: "missing" }, "session-a")
    ).toBe(false);
  });
});
