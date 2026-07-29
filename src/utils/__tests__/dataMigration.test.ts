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
import {
  mergeMissingDirectoryTree,
  repairInvalidEntityConfigs,
  resetDataMigrationStateForTesting,
  restoreAtomicWriteBackup,
  runVersionedDataMigration,
} from "../dataMigration";

const memoryFs = vi.hoisted(() => {
  const files = new Map<string, string>();
  const directories = new Set<string>(["/"]);
  const normalize = (value: string) =>
    value.replace(/\\/g, "/").replace(/\/+$/, "") || "/";
  const parent = (value: string) => {
    const normalized = normalize(value);
    const index = normalized.lastIndexOf("/");
    return index <= 0 ? "/" : normalized.slice(0, index);
  };
  const ensureParents = (value: string) => {
    let current = parent(value);
    const pending: string[] = [];
    while (!directories.has(current)) {
      pending.push(current);
      current = parent(current);
    }
    pending.reverse().forEach((directory) => directories.add(directory));
  };
  return { files, directories, normalize, parent, ensureParents };
});

vi.mock("@tauri-apps/api/path", () => ({
  join: (...parts: string[]) =>
    memoryFs.normalize(parts.join("/").replace(/\/+/g, "/")),
}));

vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: vi.fn(async () => "/app"),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
  exists: vi.fn(async (path: string) => {
    const normalized = memoryFs.normalize(path);
    return (
      memoryFs.files.has(normalized) || memoryFs.directories.has(normalized)
    );
  }),
  mkdir: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    const normalized = memoryFs.normalize(path);
    if (memoryFs.directories.has(normalized)) {
      if (options?.recursive) return;
      throw new Error("already exists");
    }
    if (
      !options?.recursive &&
      !memoryFs.directories.has(memoryFs.parent(path))
    ) {
      throw new Error("parent missing");
    }
    memoryFs.ensureParents(normalized);
    memoryFs.directories.add(normalized);
  }),
  readTextFile: vi.fn(async (path: string) => {
    const value = memoryFs.files.get(memoryFs.normalize(path));
    if (value === undefined) throw new Error("missing file");
    return value;
  }),
  writeTextFile: vi.fn(async (path: string, value: string) => {
    const normalized = memoryFs.normalize(path);
    memoryFs.ensureParents(normalized);
    memoryFs.files.set(normalized, value);
  }),
  remove: vi.fn(async (path: string, options?: { recursive?: boolean }) => {
    const normalized = memoryFs.normalize(path);
    memoryFs.files.delete(normalized);
    if (options?.recursive) {
      for (const file of memoryFs.files.keys()) {
        if (file.startsWith(`${normalized}/`)) memoryFs.files.delete(file);
      }
      for (const directory of memoryFs.directories) {
        if (
          directory === normalized ||
          directory.startsWith(`${normalized}/`)
        ) {
          memoryFs.directories.delete(directory);
        }
      }
    } else {
      memoryFs.directories.delete(normalized);
    }
  }),
  rename: vi.fn(async (source: string, target: string) => {
    const sourcePath = memoryFs.normalize(source);
    const targetPath = memoryFs.normalize(target);
    const value = memoryFs.files.get(sourcePath);
    if (value === undefined) throw new Error("missing source");
    memoryFs.ensureParents(targetPath);
    memoryFs.files.set(targetPath, value);
    memoryFs.files.delete(sourcePath);
  }),
  copyFile: vi.fn(async (source: string, target: string) => {
    const value = memoryFs.files.get(memoryFs.normalize(source));
    if (value === undefined) throw new Error("missing source");
    const targetPath = memoryFs.normalize(target);
    memoryFs.ensureParents(targetPath);
    memoryFs.files.set(targetPath, value);
  }),
  readDir: vi.fn(async (path: string) => {
    const normalized = memoryFs.normalize(path);
    const prefix = normalized === "/" ? "/" : `${normalized}/`;
    const names = new Map<string, "file" | "directory">();
    for (const directory of memoryFs.directories) {
      if (!directory.startsWith(prefix) || directory === normalized) continue;
      const relative = directory.slice(prefix.length);
      if (!relative.includes("/")) names.set(relative, "directory");
    }
    for (const file of memoryFs.files.keys()) {
      if (!file.startsWith(prefix)) continue;
      const relative = file.slice(prefix.length);
      if (!relative.includes("/")) names.set(relative, "file");
    }
    return [...names].map(([name, type]) => ({
      name,
      isDirectory: type === "directory",
      isFile: type === "file",
      isSymlink: false,
    }));
  }),
  stat: vi.fn(async (path: string) => {
    const normalized = memoryFs.normalize(path);
    return {
      isDirectory: memoryFs.directories.has(normalized),
      isFile: memoryFs.files.has(normalized),
      isSymlink: false,
      size: memoryFs.files.get(normalized)?.length ?? 0,
      mtime: null,
      atime: null,
      birthtime: null,
      readonly: false,
    };
  }),
}));

function addFile(path: string, value: string): void {
  const normalized = memoryFs.normalize(path);
  memoryFs.ensureParents(normalized);
  memoryFs.files.set(normalized, value);
}

describe("dataMigration", () => {
  beforeEach(() => {
    memoryFs.files.clear();
    memoryFs.directories.clear();
    memoryFs.directories.add("/");
    resetDataMigrationStateForTesting();
  });

  it("runs a versioned migration once and uses the completion marker afterwards", async () => {
    const migrate = vi.fn(async () => undefined);

    await runVersionedDataMigration({ id: "agent", version: "v1", migrate });
    resetDataMigrationStateForTesting();
    await runVersionedDataMigration({ id: "agent", version: "v1", migrate });

    expect(migrate).toHaveBeenCalledTimes(1);
    expect(memoryFs.files.has("/app/migrations/agent/v1.completed.json")).toBe(
      true
    );
  });

  it("serializes independent callers through the filesystem lock", async () => {
    let releaseFirst!: () => void;
    const firstMigrate = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        })
    );
    const secondMigrate = vi.fn(async () => undefined);

    const first = runVersionedDataMigration({
      id: "agent",
      version: "v2",
      migrate: firstMigrate,
    });
    await vi.waitFor(() => expect(firstMigrate).toHaveBeenCalledTimes(1));

    // A separate WebView has its own in-memory map but observes the same lock.
    resetDataMigrationStateForTesting();
    const second = runVersionedDataMigration({
      id: "agent",
      version: "v2",
      migrate: secondMigrate,
    });
    releaseFirst();

    await Promise.all([first, second]);
    expect(secondMigrate).not.toHaveBeenCalled();
  });

  it("does not write completion and permits retry after a failed migration", async () => {
    const migrate = vi
      .fn()
      .mockRejectedValueOnce(new Error("copy failed"))
      .mockResolvedValueOnce(undefined);

    await expect(
      runVersionedDataMigration({ id: "profile", version: "v1", migrate })
    ).rejects.toThrow("copy failed");
    await expect(
      runVersionedDataMigration({ id: "profile", version: "v1", migrate })
    ).resolves.toBeUndefined();

    expect(migrate).toHaveBeenCalledTimes(2);
  });

  it("fills missing nested files without overwriting target conflicts", async () => {
    addFile("/legacy/a/agent.json", "legacy-config");
    addFile("/legacy/a/assets/icon.png", "legacy-icon");
    addFile("/target/a/agent.json", "current-config");

    await mergeMissingDirectoryTree("/legacy", "/target");

    expect(memoryFs.files.get("/target/a/agent.json")).toBe("current-config");
    expect(memoryFs.files.get("/target/a/assets/icon.png")).toBe("legacy-icon");
  });

  it("restores a fixed atomic-write backup before readers load the index", async () => {
    addFile("/target/index.json.migration-write.bak", "previous-index");

    await restoreAtomicWriteBackup("/target/index.json");

    expect(memoryFs.files.get("/target/index.json")).toBe("previous-index");
    expect(memoryFs.files.has("/target/index.json.migration-write.bak")).toBe(
      false
    );
  });

  it("rejects an invalid legacy config instead of committing corrupt data", async () => {
    addFile("/legacy/a/agent.json", "broken-source");

    await expect(
      repairInvalidEntityConfigs("/legacy", "/target", "agent.json")
    ).rejects.toThrow("历史实体配置无效");
    expect(memoryFs.files.has("/target/a/agent.json")).toBe(false);
  });

  it("repairs an invalid entity config while preserving a backup", async () => {
    addFile("/legacy/a/agent.json", JSON.stringify({ id: "a", name: "old" }));
    addFile("/target/a/agent.json", "broken");

    await repairInvalidEntityConfigs("/legacy", "/target", "agent.json");

    expect(memoryFs.files.get("/target/a/agent.json")).toContain('"id":"a"');
    expect(
      memoryFs.files.get("/target/a/agent.json.migration-invalid.bak")
    ).toBe("broken");
  });
});
