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

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

interface PackageJson {
  version: string;
}

const root = process.cwd();
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8")
) as PackageJson;
const releasesDir = join(root, "src", "flows", "upgrade", "releases");
const expectedBaseName = `v${packageJson.version}`;
const expectedFiles = [`${expectedBaseName}.ts`, `${expectedBaseName}.md`];
const files = await readdir(releasesDir);

for (const file of expectedFiles) {
  if (!files.includes(file)) {
    throw new Error(
      `当前桌面版本 ${packageJson.version} 缺少本地版本说明资源: ${file}`
    );
  }
}

const manifestFiles = files.filter(
  (file) => file.startsWith("v") && file.endsWith(".ts")
);
const versions = new Map<string, string>();
for (const file of manifestFiles) {
  const content = await readFile(join(releasesDir, file), "utf8");
  const version = content.match(/\bversion:\s*["']([^"']+)["']/)?.[1];
  if (!version) {
    throw new Error(`版本说明 manifest 缺少静态 version 字段: ${file}`);
  }
  const duplicate = versions.get(version);
  if (duplicate) {
    throw new Error(`版本说明版本号重复: ${version} (${duplicate}, ${file})`);
  }
  versions.set(version, file);
}

const expectedManifest = versions.get(packageJson.version);
if (expectedManifest !== `${expectedBaseName}.ts`) {
  throw new Error(
    `当前桌面版本 ${packageJson.version} 的 manifest 版本字段与文件名不一致`
  );
}

console.info(
  `本地版本说明检查通过: ${packageJson.version} (${manifestFiles.length} 个 manifest)`
);
