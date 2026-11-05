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

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { DirectoryTrees, type DirectoryTreeNode } from "./directory-tree";
let temp: string, root: string;
const trees = new DirectoryTrees();
const args = (extra: Record<string, unknown> = {}) => ({
  path: root,
  showFiles: true,
  showHidden: false,
  maxDepth: 0,
  ignorePatterns: [],
  ...extra,
});
async function put(relative: string, content = "test") {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
}
function paths(root: DirectoryTreeNode, prefix = ""): string[] {
  return root.children.flatMap((child) => {
    const name = prefix + child.name;
    return [name, ...paths(child, name + "/")];
  });
}
beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "aiohub-tree-"));
  root = path.join(temp, "selected");
  await fs.mkdir(root);
});
afterEach(async () => {
  trees.disposeAll();
  await fs.rm(temp, { recursive: true, force: true });
});
describe("directory tree public command contract", () => {
  it("preserves Unicode nodes, stable directory-first ordering, sizes and stats", async () => {
    await put("z.bin", "1234");
    await put("A.txt", "abc");
    await put("src/文🧪.ts", "中文");
    await put("src/deep/tail", "12345");
    await fs.mkdir(path.join(root, "empty"));
    await put(".hidden.txt");
    const result = await trees.generate(1, args());
    expect(result.structure).toMatchObject({
      name: "selected",
      is_dir: true,
      size: 18,
      error: null,
    });
    expect(result.structure.children.map((n) => n.name)).toEqual([
      "empty",
      "src",
      "A.txt",
      "z.bin",
    ]);
    expect(paths(result.structure)).toEqual([
      "empty",
      "src",
      "src/deep",
      "src/deep/tail",
      "src/文🧪.ts",
      "A.txt",
      "z.bin",
    ]);
    expect(result.stats).toEqual({
      total_dirs: 3,
      total_files: 4,
      show_files: true,
      show_hidden: false,
      max_depth: "无限制",
      filter_count: 0,
    });
    const shallow = await trees.generate(
      1,
      args({ maxDepth: 1, showHidden: true })
    );
    expect(shallow.stats).toMatchObject({
      total_dirs: 2,
      total_files: 3,
      max_depth: "1",
      show_hidden: true,
    });
    expect(paths(shallow.structure)).toEqual([
      "empty",
      "src",
      ".hidden.txt",
      "A.txt",
      "z.bin",
    ]);
    const folders = await trees.generate(1, args({ showFiles: false }));
    expect(folders.stats.total_files).toBe(4);
    expect(folders.structure.size).toBe(0);
    expect(paths(folders.structure)).toEqual(["empty", "src", "src/deep"]);
  });
  it("scopes gitignore to the selected root and descendants, including nested negation", async () => {
    await fs.writeFile(path.join(temp, ".gitignore"), "parent-only.txt\n");
    await put(".gitignore", "*.log\nblocked/\n");
    await put("src/.gitignore", "!keep.log\nchild-only.txt\n");
    for (const file of [
      "parent-only.txt",
      "a.log",
      "src/a.log",
      "src/keep.log",
      "src/child-only.txt",
      "src/note.txt",
      "blocked/hidden",
    ])
      await put(file);
    const result = await trees.generate(
      1,
      args({ ignorePatterns: ["__USE_GITIGNORE__"] })
    );
    expect(paths(result.structure)).toEqual([
      "src",
      "src/keep.log",
      "src/note.txt",
      "parent-only.txt",
    ]);
    expect(result.stats).toMatchObject({
      total_dirs: 1,
      total_files: 3,
      filter_count: 0,
    });
    const unfiltered = await trees.generate(1, args());
    expect(paths(unfiltered.structure)).toContain("blocked/hidden");
    expect(paths(unfiltered.structure)).toContain("a.log");
  });
  it("applies custom excludes and explicit whitelists before gitignore and hidden filtering", async () => {
    await put(".gitignore", "*.log\n");
    await put("keep.log");
    await put("drop.log");
    await put("note.txt");
    await put("src/keep.log");
    await put(".wanted.txt");
    const excluded = await trees.generate(
      1,
      args({ ignorePatterns: ["*.log"] })
    );
    expect(paths(excluded.structure)).toEqual(["src", "note.txt"]);
    const selected = await trees.generate(
      1,
      args({
        ignorePatterns: [
          "__USE_GITIGNORE__",
          "*.log",
          "!keep.log",
          "!.wanted.txt",
        ],
      })
    );
    expect(paths(selected.structure)).toEqual([
      "src",
      "src/keep.log",
      ".wanted.txt",
      "keep.log",
    ]);
    expect(selected.stats.filter_count).toBe(3);
  });
  it("honors hidden negation, rooted/escaped globs, brace alternatives and directory override precedence", async () => {
    await put(".gitignore", "!.visible\nblocked/\n/root-only.txt\n");
    for (const file of [
      ".visible",
      ".hidden",
      "blocked/keep.txt",
      "blocked/drop.bin",
      "root-only.txt",
      "src/root-only.txt",
      "#literal",
      "!literal",
      "alpha.ts",
      "beta.js",
    ])
      await put(file);
    const git = await trees.generate(
      1,
      args({ ignorePatterns: ["__USE_GITIGNORE__"] })
    );
    expect(paths(git.structure)).toContain(".visible");
    expect(paths(git.structure)).not.toContain(".hidden");
    expect(paths(git.structure)).not.toContain("blocked");
    expect(paths(git.structure)).not.toContain("root-only.txt");
    expect(paths(git.structure)).toContain("src/root-only.txt");
    const reopened = await trees.generate(
      1,
      args({
        ignorePatterns: ["__USE_GITIGNORE__", "!blocked/", "!blocked/*.txt"],
      })
    );
    expect(paths(reopened.structure)).toContain("blocked/keep.txt");
    expect(paths(reopened.structure)).not.toContain("blocked/drop.bin");
    const custom = await trees.generate(
      1,
      args({
        ignorePatterns: [
          "**/*.{ts,js}",
          "\\#literal",
          "\\!literal",
          "/root-only.txt",
        ],
      })
    );
    for (const excluded of [
      "alpha.ts",
      "beta.js",
      "#literal",
      "!literal",
      "root-only.txt",
    ])
      expect(paths(custom.structure)).not.toContain(excluded);
    expect(paths(custom.structure)).toContain("src/root-only.txt");
  });
  it("keeps linked directories as leaves, avoids cycles and never reads linked ignore files", async () => {
    await put("file.txt");
    const external = path.join(temp, "external");
    await fs.mkdir(external);
    await fs.writeFile(path.join(external, "outside.txt"), "outside");
    await fs.symlink(
      external,
      path.join(root, "outside-link"),
      process.platform === "win32" ? "junction" : "dir"
    );
    await fs.symlink(
      root,
      path.join(root, "cycle"),
      process.platform === "win32" ? "junction" : "dir"
    );
    const result = await trees.generate(
      1,
      args({ ignorePatterns: ["__USE_GITIGNORE__"] })
    );
    expect(paths(result.structure)).toEqual([
      "cycle",
      "file.txt",
      "outside-link",
    ]);
    expect(result.stats).toMatchObject({ total_dirs: 0, total_files: 3 });
    const linkedRoot = await trees.generate(
      1,
      args({ path: path.join(root, "outside-link") })
    );
    expect(linkedRoot.structure.name).toBe("outside-link");
    expect(paths(linkedRoot.structure)).toEqual(["outside.txt"]);
    // Junctions are available without Windows symlink privileges, including a .gitignore-named directory.
    await fs.symlink(
      external,
      path.join(root, ".gitignore"),
      process.platform === "win32" ? "junction" : "dir"
    );
    expect(
      paths(
        (
          await trees.generate(
            1,
            args({ ignorePatterns: ["__USE_GITIGNORE__"] })
          )
        ).structure
      )
    ).toContain("file.txt");
  });
  it("rejects invalid roots and option values, and completes an empty selected directory", async () => {
    const empty = await trees.generate(1, args());
    expect(empty.structure.children).toEqual([]);
    expect(empty.stats.total_files).toBe(0);
    await put("file.txt");
    for (const extra of [
      { path: "relative" },
      { path: path.join(root, "missing") },
      { path: path.join(root, "file.txt") },
      { maxDepth: -1 },
      { maxDepth: 1.5 },
      { showFiles: "yes" },
      { ignorePatterns: [1] },
    ])
      await expect(trees.generate(1, args(extra))).rejects.toThrow();
  });
  it("cancels only scans owned by a closing window and accepts replacement scans after reload", async () => {
    for (let index = 0; index < 90; index++) await put(`src/${index}.txt`);
    const interrupted = trees.generate(1, args());
    const independent = trees.generate(2, args());
    trees.disposeOwner(1);
    await expect(interrupted).rejects.toMatchObject({ code: "ABORTED" });
    expect((await independent).stats.total_files).toBe(90);
    expect(
      (await trees.generate(1, args({ maxDepth: 1 }))).stats.total_dirs
    ).toBe(1);
    const stopping = trees.generate(3, args());
    trees.disposeAll();
    await expect(stopping).rejects.toMatchObject({ code: "ABORTED" });
  });
});
