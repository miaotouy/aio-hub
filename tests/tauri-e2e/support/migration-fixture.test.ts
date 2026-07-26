import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupStagedMigrationData,
  prepareMigrationFixture,
  stageMigrationFixture,
  writeE2eRunMarker,
} from "./migration-fixture";

const tempDirs: string[] = [];

function tempDir(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

function copyDirectory(source: string, destination: string): void {
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("migration fixture staging", () => {
  it("validates the versioned minimal fixture and copies only hashed migration files", () => {
    const fixture = prepareMigrationFixture("legacy-file-system-v1/minimal");
    const destination = path.join(tempDir("aio-migration-stage-"), "app-data");
    const staged = stageMigrationFixture(fixture, destination);

    expect(staged.manifest.expected).toEqual({
      collections: 1,
      entries: 1,
      vectors: 1,
      pendingVectors: 0,
      issues: 0,
    });
    expect(staged.copiedFiles).toHaveLength(4);
    expect(fs.existsSync(path.join(destination, "knowledge", "bases"))).toBe(true);
    expect(fs.existsSync(path.join(destination, "llm-service"))).toBe(false);
  });

  it("rejects a fixture whose copied source differs from its manifest hash", () => {
    const original = prepareMigrationFixture("legacy-file-system-v1/minimal");
    const fixturesRoot = tempDir("aio-migration-fixture-");
    const fixtureId = "legacy-file-system-v1/minimal";
    const fixtureRoot = path.join(fixturesRoot, fixtureId);
    copyDirectory(original.fixtureRoot, fixtureRoot);
    fs.appendFileSync(
      path.join(
        fixtureRoot,
        "app-data",
        "knowledge",
        "bases",
        "11111111-1111-4111-8111-111111111111",
        "meta.json"
      ),
      "tampered"
    );

    expect(() => prepareMigrationFixture(fixtureId, { fixturesRoot })).toThrow(
      /hash mismatch/
    );
  });

  it("only removes staged app-data when the run marker and controlled root agree", () => {
    const controlledRunsRoot = path.join(tempDir("aio-e2e-runs-"), "e2e-runs");
    const runId = "migration-test-run";
    const runRoot = path.join(controlledRunsRoot, runId);
    const dataDir = path.join(runRoot, "app-data");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(path.join(dataDir, "state.json"), "{}");
    writeE2eRunMarker(runRoot, runId, dataDir);

    cleanupStagedMigrationData({ runRoot, runId, dataDir, controlledRunsRoot });
    expect(fs.existsSync(dataDir)).toBe(false);

    fs.mkdirSync(dataDir, { recursive: true });
    writeE2eRunMarker(runRoot, "different-run", dataDir);
    expect(() =>
      cleanupStagedMigrationData({ runRoot, runId, dataDir, controlledRunsRoot })
    ).toThrow(/mismatched run marker/);
    expect(fs.existsSync(dataDir)).toBe(true);
  });
});
