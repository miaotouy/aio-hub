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

import {
  copyFile,
  exists,
  mkdir,
  readDir,
  readTextFile,
  remove,
  rename,
  stat,
  writeTextFile,
} from "@tauri-apps/plugin-fs";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("data-migration");
const activeMigrations = new Map<string, Promise<void>>();
const LOCK_STALE_MS = 60_000;
const LOCK_HEARTBEAT_MS = 5_000;
const INVALID_LOCK_GRACE_MS = 15_000;
const LOCK_POLL_MS = 100;

interface MigrationMarker {
  version: string;
  completedAt: string;
}

interface MigrationLockOwner {
  token: string;
  startedAt: number;
  heartbeatAt?: number;
}

export interface VersionedMigrationContext {
  appDir: string;
}

export interface VersionedMigrationOptions {
  id: string;
  version: string;
  migrate: (context: VersionedMigrationContext) => Promise<void>;
}

function createToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sleep(duration: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, duration));
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readTextFile(path)) as T;
  } catch {
    return null;
  }
}

async function isCompleted(path: string, version: string): Promise<boolean> {
  if (!(await exists(path))) return false;
  const marker = await readJson<MigrationMarker>(path);
  return marker?.version === version && typeof marker.completedAt === "string";
}

async function readMigrationLockOwner(
  path: string
): Promise<MigrationLockOwner | null> {
  const owner = await readJson<MigrationLockOwner>(path);
  return owner &&
    typeof owner.token === "string" &&
    typeof owner.startedAt === "number" &&
    (owner.heartbeatAt === undefined || typeof owner.heartbeatAt === "number")
    ? owner
    : null;
}

export async function restoreAtomicWriteBackup(path: string): Promise<void> {
  const backupPath = `${path}.migration-write.bak`;
  if (!(await exists(path)) && (await exists(backupPath))) {
    await rename(backupPath, path);
  }
}

async function writeJsonAtomically(
  path: string,
  value: unknown,
  token = createToken()
): Promise<void> {
  const tempPath = `${path}.${token}.tmp`;
  const backupPath = `${path}.migration-write.bak`;

  await restoreAtomicWriteBackup(path);

  await writeTextFile(tempPath, JSON.stringify(value, null, 2));
  if (await exists(path)) {
    if (await exists(backupPath)) await remove(backupPath);
    await rename(path, backupPath);
  }
  try {
    await rename(tempPath, path);
  } catch (error) {
    if (!(await exists(path)) && (await exists(backupPath))) {
      await rename(backupPath, path);
    }
    if (await exists(tempPath)) await remove(tempPath);
    throw error;
  }
}

async function acquireMigrationLock(
  lockDir: string,
  markerPath: string,
  version: string
): Promise<(() => Promise<void>) | null> {
  const token = createToken();
  const ownerPath = await join(lockDir, "owner.json");
  let invalidLockObservedAt: number | null = null;

  while (true) {
    try {
      await mkdir(lockDir);
      const startedAt = Date.now();
      const writeOwner = async () => {
        await writeTextFile(
          ownerPath,
          JSON.stringify({ token, startedAt, heartbeatAt: Date.now() })
        );
      };
      try {
        await writeOwner();
      } catch (error) {
        await remove(lockDir, { recursive: true });
        throw error;
      }

      let released = false;
      let pendingHeartbeat: Promise<void> = Promise.resolve();
      const heartbeat = setInterval(() => {
        pendingHeartbeat = pendingHeartbeat
          .then(async () => {
            if (!released) await writeOwner();
          })
          .catch((error) => {
            logger.warn("刷新数据迁移锁心跳失败", { lockDir, error });
          });
      }, LOCK_HEARTBEAT_MS);

      return async () => {
        released = true;
        clearInterval(heartbeat);
        await pendingHeartbeat;
        const owner = await readMigrationLockOwner(ownerPath);
        if (owner?.token === token && (await exists(lockDir))) {
          await remove(lockDir, { recursive: true });
        }
      };
    } catch (error) {
      if (!(await exists(lockDir))) {
        throw error;
      }
    }

    if (await isCompleted(markerPath, version)) {
      return null;
    }

    const owner = await readMigrationLockOwner(ownerPath);
    const now = Date.now();
    const isStale = owner
      ? now - (owner.heartbeatAt ?? owner.startedAt) >= LOCK_STALE_MS
      : invalidLockObservedAt !== null &&
        now - invalidLockObservedAt >= INVALID_LOCK_GRACE_MS;

    if (!owner && invalidLockObservedAt === null) {
      invalidLockObservedAt = now;
    } else if (owner) {
      invalidLockObservedAt = null;
    }

    if (isStale) {
      logger.warn("清理失效的数据迁移锁", { lockDir, owner });
      try {
        await remove(lockDir, { recursive: true });
      } catch {
        // 其他窗口可能已先完成清理，继续重试即可。
      }
      invalidLockObservedAt = null;
      continue;
    }

    await sleep(LOCK_POLL_MS);
  }
}

export function runVersionedDataMigration(
  options: VersionedMigrationOptions
): Promise<void> {
  const key = `${options.id}:${options.version}`;
  const active = activeMigrations.get(key);
  if (active) return active;

  const migration = (async () => {
    const appDir = await getAppConfigDir();
    const migrationDir = await join(appDir, "migrations", options.id);
    const markerPath = await join(
      migrationDir,
      `${options.version}.completed.json`
    );
    if (await isCompleted(markerPath, options.version)) return;

    await mkdir(migrationDir, { recursive: true });
    const lockDir = await join(migrationDir, `${options.version}.lock`);
    const release = await acquireMigrationLock(
      lockDir,
      markerPath,
      options.version
    );
    if (!release) return;

    try {
      if (await isCompleted(markerPath, options.version)) return;
      await options.migrate({ appDir });
      await writeJsonAtomically(markerPath, {
        version: options.version,
        completedAt: new Date().toISOString(),
      } satisfies MigrationMarker);
    } finally {
      await release();
    }
  })().catch((error) => {
    activeMigrations.delete(key);
    throw error;
  });

  activeMigrations.set(key, migration);
  return migration;
}

export async function mergeMissingDirectoryTree(
  source: string,
  target: string,
  ignoredNames: ReadonlySet<string> = new Set()
): Promise<number> {
  if (!(await exists(source))) return 0;
  await mkdir(target, { recursive: true });
  let copiedFiles = 0;

  for (const entry of await readDir(source)) {
    if (ignoredNames.has(entry.name)) continue;
    const sourcePath = await join(source, entry.name);
    const targetPath = await join(target, entry.name);

    if (entry.isDirectory) {
      if (await exists(targetPath)) {
        const targetInfo = await stat(targetPath);
        if (!targetInfo.isDirectory) {
          throw new Error(`迁移目标类型冲突: ${targetPath}`);
        }
      }
      copiedFiles += await mergeMissingDirectoryTree(
        sourcePath,
        targetPath,
        ignoredNames
      );
    } else if (entry.isFile && !(await exists(targetPath))) {
      await copyFile(sourcePath, targetPath);
      copiedFiles += 1;
    }
  }

  return copiedFiles;
}

export async function verifyDirectorySubset(
  source: string,
  target: string,
  ignoredNames: ReadonlySet<string> = new Set()
): Promise<void> {
  if (!(await exists(source))) return;
  for (const entry of await readDir(source)) {
    if (ignoredNames.has(entry.name)) continue;
    const sourcePath = await join(source, entry.name);
    const targetPath = await join(target, entry.name);
    if (!(await exists(targetPath))) {
      throw new Error(`迁移目标缺少文件: ${targetPath}`);
    }
    const targetInfo = await stat(targetPath);
    if (entry.isDirectory !== targetInfo.isDirectory) {
      throw new Error(`迁移目标类型不一致: ${targetPath}`);
    }
    if (entry.isDirectory) {
      await verifyDirectorySubset(sourcePath, targetPath, ignoredNames);
    }
  }
}

function isValidEntityConfig(value: unknown, id: string): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<string, unknown>).id === id
  );
}

export async function repairInvalidEntityConfigs(
  sourceRoot: string,
  targetRoot: string,
  configFileName: string
): Promise<number> {
  if (!(await exists(sourceRoot))) return 0;
  let repaired = 0;

  for (const entry of await readDir(sourceRoot)) {
    if (!entry.isDirectory) continue;
    const sourceConfig = await join(sourceRoot, entry.name, configFileName);
    if (!(await exists(sourceConfig))) continue;

    const targetDirectory = await join(targetRoot, entry.name);
    const targetConfig = await join(targetDirectory, configFileName);
    const targetValue = (await exists(targetConfig))
      ? await readJson<unknown>(targetConfig)
      : null;
    if (isValidEntityConfig(targetValue, entry.name)) continue;

    const sourceValue = await readJson<unknown>(sourceConfig);
    if (!isValidEntityConfig(sourceValue, entry.name)) {
      throw new Error(`历史实体配置无效: ${sourceConfig}`);
    }

    await mkdir(targetDirectory, { recursive: true });
    if (await exists(targetConfig)) {
      const invalidBackup = `${targetConfig}.migration-invalid.bak`;
      if (!(await exists(invalidBackup))) {
        await copyFile(targetConfig, invalidBackup);
      }
      await remove(targetConfig);
    }
    await copyFile(sourceConfig, targetConfig);
    repaired += 1;
  }

  return repaired;
}

export { writeJsonAtomically };

export function resetDataMigrationStateForTesting(): void {
  activeMigrations.clear();
}
