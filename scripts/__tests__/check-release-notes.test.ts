// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkReleaseNotes } from "../check-release-notes";

const roots: string[] = [];

async function createReleaseFixture(
  version: string,
  manifestVersion = version,
  channel = version.includes("-") ? "prerelease" : "stable"
): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aiohub-release-notes-"));
  roots.push(root);
  const releasesDir = join(root, "src", "flows", "upgrade", "releases");
  await mkdir(releasesDir, { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ version }),
    "utf8"
  );
  await writeFile(
    join(releasesDir, `v${version}.md`),
    `# ${version}\n`,
    "utf8"
  );
  await writeFile(
    join(releasesDir, `v${version}.ts`),
    `export const release = { version: "${manifestVersion}", channel: "${channel}" };\n`,
    "utf8"
  );
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("checkReleaseNotes", () => {
  it.each([
    ["stable", "0.7.0"],
    ["prerelease", "0.7.0-alpha.1"],
  ])("accepts an exact %s package/manifest pair", async (_kind, version) => {
    const root = await createReleaseFixture(version);

    await expect(checkReleaseNotes(root)).resolves.toEqual({
      version,
      manifestCount: 1,
    });
  });

  it("rejects a prerelease manifest carrying a stable channel", async () => {
    const root = await createReleaseFixture(
      "0.7.0-alpha.1",
      "0.7.0-alpha.1",
      "stable"
    );

    await expect(checkReleaseNotes(root)).rejects.toThrow(
      "manifest channel 应为 prerelease"
    );
  });

  it("rejects a file whose manifest version does not match package.json", async () => {
    const root = await createReleaseFixture("0.7.0", "0.7.0-alpha.1");

    await expect(checkReleaseNotes(root)).rejects.toThrow(
      "manifest 版本字段与文件名不一致"
    );
  });
});
