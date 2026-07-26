import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MIGRATION_FIXTURE_SCHEMA_VERSION = 1;

export interface MigrationFixtureExpectedCounts {
  collections: number;
  entries: number;
  vectors: number;
  pendingVectors: number;
  issues: number;
}

export interface MigrationFixtureManifestFile {
  path: string;
  sha256: string;
}

export interface MigrationFixtureManifest {
  schemaVersion: typeof MIGRATION_FIXTURE_SCHEMA_VERSION;
  fixtureId: string;
  sourceAppVersion: string;
  migrationId: string;
  allowedPaths: string[];
  files: MigrationFixtureManifestFile[];
  expected: MigrationFixtureExpectedCounts;
}

export interface PreparedMigrationFixture {
  fixtureRoot: string;
  sourceAppDataDir: string;
  manifest: MigrationFixtureManifest;
}

export interface StagedMigrationFixture {
  fixtureId: string;
  dataDir: string;
  manifest: MigrationFixtureManifest;
  copiedFiles: Array<{ path: string; sha256: string }>;
}

interface FixtureOptions {
  fixturesRoot?: string;
}

function sha256(filePath: string): string {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function isSafeRelativePath(value: string): boolean {
  if (!value || value.includes("\\") || path.posix.isAbsolute(value))
    return false;
  const normalized = path.posix.normalize(value);
  return (
    normalized === value &&
    normalized !== "." &&
    !normalized.startsWith("../") &&
    !normalized.includes("/../")
  );
}

function assertSafeFixtureId(fixtureId: string): void {
  if (!isSafeRelativePath(fixtureId)) {
    throw new Error("Migration fixture ID must be a safe relative path.");
  }
}

function normalizedPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function assertPathChainSafe(target: string): void {
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  let current = root;
  for (const segment of path
    .relative(root, resolved)
    .split(path.sep)
    .filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) continue;
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Migration fixture path must not contain links or junctions: ${current}`
      );
    }
    const real = fs.realpathSync.native(current);
    if (normalizedPath(real) !== normalizedPath(current)) {
      throw new Error(
        `Migration fixture path resolves through a reparse point: ${current}`
      );
    }
  }
}

function assertSafeDirectory(directory: string): void {
  assertPathChainSafe(directory);
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(
      `Migration fixture path must be a real directory: ${directory}`
    );
  }
}

function assertNoSymlinks(root: string): void {
  const visit = (current: string): void => {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `Migration fixture must not contain symbolic links: ${current}`
      );
    }
    if (!stat.isDirectory()) return;
    for (const entry of fs.readdirSync(current))
      visit(path.join(current, entry));
  };
  visit(root);
}

function listFiles(root: string): string[] {
  const result: string[] = [];
  const visit = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      if (entry.isSymbolicLink()) {
        throw new Error(
          `Migration fixture must not contain symbolic links: ${relative}`
        );
      }
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) result.push(relative);
      else
        throw new Error(
          `Migration fixture contains an unsupported entry: ${relative}`
        );
    }
  };
  visit(root);
  return result.sort();
}

function asExpectedCounts(value: unknown): MigrationFixtureExpectedCounts {
  if (!value || typeof value !== "object") {
    throw new Error("Migration fixture manifest must include expected counts.");
  }
  const record = value as Record<string, unknown>;
  const keys = [
    "collections",
    "entries",
    "vectors",
    "pendingVectors",
    "issues",
  ] as const;
  const expected = {} as MigrationFixtureExpectedCounts;
  for (const key of keys) {
    const count = record[key];
    if (!Number.isInteger(count) || (count as number) < 0) {
      throw new Error(
        `Migration fixture expected.${key} must be a non-negative integer.`
      );
    }
    expected[key] = count as number;
  }
  return expected;
}

function readManifest(manifestPath: string): MigrationFixtureManifest {
  let value: unknown;
  try {
    value = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read migration fixture manifest: ${String(error)}`);
  }
  if (!value || typeof value !== "object") {
    throw new Error("Migration fixture manifest must be an object.");
  }
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== MIGRATION_FIXTURE_SCHEMA_VERSION) {
    throw new Error("Unsupported migration fixture schema version.");
  }
  const strings = ["fixtureId", "sourceAppVersion", "migrationId"] as const;
  for (const key of strings) {
    if (typeof record[key] !== "string" || !record[key].trim()) {
      throw new Error(
        `Migration fixture manifest ${key} must be a non-empty string.`
      );
    }
  }
  if (!Array.isArray(record.allowedPaths) || !Array.isArray(record.files)) {
    throw new Error(
      "Migration fixture manifest must declare allowedPaths and files."
    );
  }
  const allowedPaths = record.allowedPaths.map((item) => {
    if (typeof item !== "string" || !isSafeRelativePath(item)) {
      throw new Error(
        "Migration fixture manifest contains an unsafe allowed path."
      );
    }
    return item;
  });
  const files = record.files.map((item): MigrationFixtureManifestFile => {
    if (!item || typeof item !== "object") {
      throw new Error(
        "Migration fixture manifest contains an invalid file entry."
      );
    }
    const file = item as Record<string, unknown>;
    if (
      typeof file.path !== "string" ||
      !isSafeRelativePath(file.path) ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/i.test(file.sha256)
    ) {
      throw new Error(
        "Migration fixture manifest contains an invalid file hash entry."
      );
    }
    return { path: file.path, sha256: file.sha256.toLowerCase() };
  });
  const sortedAllowed = [...allowedPaths].sort();
  const sortedFilePaths = files.map((item) => item.path).sort();
  if (
    new Set(allowedPaths).size !== allowedPaths.length ||
    new Set(sortedFilePaths).size !== sortedFilePaths.length ||
    JSON.stringify(sortedAllowed) !== JSON.stringify(sortedFilePaths)
  ) {
    throw new Error(
      "Migration fixture allowedPaths must exactly match hashed files."
    );
  }

  return {
    schemaVersion: MIGRATION_FIXTURE_SCHEMA_VERSION,
    fixtureId: record.fixtureId as string,
    sourceAppVersion: record.sourceAppVersion as string,
    migrationId: record.migrationId as string,
    allowedPaths,
    files,
    expected: asExpectedCounts(record.expected),
  };
}

export function prepareMigrationFixture(
  fixtureId: string,
  options: FixtureOptions = {}
): PreparedMigrationFixture {
  assertSafeFixtureId(fixtureId);
  const fixturesRoot = path.resolve(
    options.fixturesRoot ??
      path.resolve(
        fileURLToPath(new URL("../fixtures/migrations", import.meta.url))
      )
  );
  const fixtureRoot = path.resolve(fixturesRoot, fixtureId);
  if (path.relative(fixturesRoot, fixtureRoot).startsWith("..")) {
    throw new Error("Migration fixture resolved outside the fixture root.");
  }
  const sourceAppDataDir = path.join(fixtureRoot, "app-data");
  assertPathChainSafe(fixturesRoot);
  assertPathChainSafe(fixtureRoot);
  if (
    !fs.statSync(fixtureRoot).isDirectory() ||
    !fs.statSync(sourceAppDataDir).isDirectory()
  ) {
    throw new Error(`Migration fixture is incomplete: ${fixtureId}`);
  }
  assertNoSymlinks(fixtureRoot);
  const manifest = readManifest(path.join(fixtureRoot, "manifest.json"));
  if (manifest.fixtureId !== fixtureId) {
    throw new Error("Migration fixture ID does not match its manifest.");
  }
  const actualFiles = listFiles(sourceAppDataDir);
  const expectedFiles = manifest.files.map((file) => file.path).sort();
  if (JSON.stringify(actualFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error(
      "Migration fixture app-data does not exactly match its manifest."
    );
  }
  for (const file of manifest.files) {
    const filePath = path.join(sourceAppDataDir, ...file.path.split("/"));
    if (sha256(filePath) !== file.sha256) {
      throw new Error(`Migration fixture file hash mismatch: ${file.path}`);
    }
  }
  return { fixtureRoot, sourceAppDataDir, manifest };
}

function assertEmptyDirectory(directory: string): void {
  assertPathChainSafe(directory);
  fs.mkdirSync(directory, { recursive: true });
  assertSafeDirectory(directory);
  if (fs.readdirSync(directory).length > 0) {
    throw new Error(`Migration fixture target must be empty: ${directory}`);
  }
}

export function stageMigrationFixture(
  fixture: PreparedMigrationFixture,
  dataDir: string
): StagedMigrationFixture {
  const targetDir = path.resolve(dataDir);
  assertEmptyDirectory(targetDir);
  const copiedFiles: Array<{ path: string; sha256: string }> = [];
  for (const file of fixture.manifest.files) {
    const source = path.join(fixture.sourceAppDataDir, ...file.path.split("/"));
    const target = path.join(targetDir, ...file.path.split("/"));
    const targetParent = path.dirname(target);
    assertPathChainSafe(targetParent);
    fs.mkdirSync(targetParent, { recursive: true });
    assertSafeDirectory(targetParent);
    fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
    assertPathChainSafe(target);
    const copiedHash = sha256(target);
    if (copiedHash !== file.sha256) {
      throw new Error(`Staged migration fixture hash mismatch: ${file.path}`);
    }
    copiedFiles.push({ path: file.path, sha256: copiedHash });
  }
  const stagedFiles = listFiles(targetDir);
  const expectedFiles = fixture.manifest.files.map((file) => file.path).sort();
  if (JSON.stringify(stagedFiles) !== JSON.stringify(expectedFiles)) {
    throw new Error("Staged migration fixture contains unexpected files.");
  }
  return {
    fixtureId: fixture.manifest.fixtureId,
    dataDir: targetDir,
    manifest: fixture.manifest,
    copiedFiles,
  };
}

export function writeE2eRunMarker(
  runRoot: string,
  runId: string,
  dataDir: string
): string {
  const markerPath = path.join(runRoot, ".aio-e2e-run.json");
  assertPathChainSafe(runRoot);
  fs.mkdirSync(runRoot, { recursive: true });
  assertSafeDirectory(runRoot);
  assertPathChainSafe(dataDir);
  assertPathChainSafe(markerPath);
  fs.writeFileSync(
    markerPath,
    `${JSON.stringify({ schemaVersion: 1, runId, dataDir: path.resolve(dataDir) }, null, 2)}\n`,
    "utf8"
  );
  return markerPath;
}

export function cleanupStagedMigrationData(options: {
  runRoot: string;
  runId: string;
  dataDir: string;
  controlledRunsRoot: string;
}): void {
  const runRoot = path.resolve(options.runRoot);
  const controlledRunsRoot = path.resolve(options.controlledRunsRoot);
  const dataDir = path.resolve(options.dataDir);
  if (
    path.dirname(runRoot) !== controlledRunsRoot ||
    path.dirname(dataDir) !== runRoot
  ) {
    throw new Error(
      "Refusing to clean migration data outside the controlled E2E run root."
    );
  }
  assertPathChainSafe(controlledRunsRoot);
  assertSafeDirectory(controlledRunsRoot);
  assertPathChainSafe(runRoot);
  assertSafeDirectory(runRoot);
  assertPathChainSafe(dataDir);
  assertSafeDirectory(dataDir);
  assertNoSymlinks(dataDir);
  const markerPath = path.join(runRoot, ".aio-e2e-run.json");
  assertPathChainSafe(markerPath);
  const markerStat = fs.lstatSync(markerPath);
  if (!markerStat.isFile() || markerStat.isSymbolicLink()) {
    throw new Error(
      "Refusing to clean migration data with an unsafe run marker."
    );
  }
  const marker = JSON.parse(fs.readFileSync(markerPath, "utf8")) as {
    runId?: unknown;
    dataDir?: unknown;
  };
  if (marker.runId !== options.runId || marker.dataDir !== dataDir) {
    throw new Error(
      "Refusing to clean migration data with a mismatched run marker."
    );
  }
  fs.rmSync(dataDir, { recursive: true, force: true });
}
