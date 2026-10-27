// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0 (the "License");

import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
import stringWidth from "string-width";
import { afterEach, describe, expect, it } from "vitest";
import { formatAsciiDiagram } from "../docs/ascii-diagram";
import { findMarkdownFiles } from "../docs/format-ascii-diagrams";
import {
  formatMarkdownDiagrams,
  installDiagramFormatting,
} from "../docs/markdown-diagrams";

const before = await readFile(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../docs/__fixtures__/weather-before.txt"
  ),
  "utf8"
);
const after = await readFile(
  join(
    dirname(fileURLToPath(import.meta.url)),
    "../docs/__fixtures__/weather-after.txt"
  ),
  "utf8"
);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

// Fixtures snapshot the original weather plan. The public contract is aligned
// frames with unchanged content, regardless of parser/solver implementation.
describe("ASCII diagram formatting", () => {
  it("aligns the nested CJK weather UI while preserving symbols and text separators", () => {
    const result = formatAsciiDiagram(before);
    expect(result.skipped).toBeUndefined();
    expect(result.text).toBe(after);
    expect(
      new Set(
        result.text
          .trimEnd()
          .split("\n")
          .map((line) => stringWidth(line))
      )
    ).toEqual(new Set([90]));
    expect(formatAsciiDiagram(result.text)).toMatchObject({
      text: after,
      changed: false,
    });
  });

  it("expands shared Unicode table borders without splitting emoji or combining marks", () => {
    const source = "┌────┬────┐\n│ 中国 │ é😀 │\n└────┴────┘\n";
    const result = formatAsciiDiagram(source);
    expect(result.skipped).toBeUndefined();
    expect(result.text).toBe(
      "┌──────┬─────┐\n│ 中国 │ é😀 │\n└──────┴─────┘\n"
    );
    expect(formatAsciiDiagram(result.text).changed).toBe(false);
  });

  it.each([
    "+-----+\n| A |   |\n+-----+", // Two equally plausible right edges.
    "+-----+ --> label\n| A |\n+-----+", // A connector cannot be safely moved.
    "+-----+\n  A\n+-----+", // Missing vertical frame.
  ])("keeps an uncertain frame intact: %s", (source) => {
    expect(formatAsciiDiagram(source)).toMatchObject({
      text: source,
      changed: false,
      skipped: expect.any(String),
    });
  });
});

describe("Markdown integration", () => {
  it.each(["", "  ", "> "])(
    "preserves BOM, CRLF and container prefix %j while changing only the fence body",
    (prefix) => {
      const wrap = (body: string) =>
        "\ufeff# 标题\r\n\r\n" +
        prefix +
        "~~~text\r\n" +
        body
          .trimEnd()
          .split("\n")
          .map((line) => prefix + line)
          .join("\r\n") +
        "\r\n" +
        prefix +
        "~~~\r\n\r\n正文 `a | b`。\r\n";
      const result = formatMarkdownDiagrams(wrap(before));
      expect(result.formatted).toBe(1);
      expect(result.text).toBe(wrap(after));
      expect(formatMarkdownDiagrams(result.text).formatted).toBe(0);
    }
  );

  it("formats only diagram fences and preserves prose, tables, code examples and incomplete fences", () => {
    const source =
      "# 文档\n\n| A | B |\n| - | - |\n\n```js\n" +
      before +
      "```\n\n````markdown\n```text\n" +
      before +
      "```\n````\n\n```text\n" +
      before;
    expect(formatMarkdownDiagrams(source).text).toBe(source);
  });

  it("renders and copies the same formatted fence content as the repository formatter", () => {
    const source = "# 图\n\n```text\n" + before + "```\n";
    const md = new MarkdownIt();
    installDiagramFormatting(md);
    const rendered = md
      .parse(source, {})
      .find((token) => token.type === "fence")!;
    const saved = new MarkdownIt()
      .parse(formatMarkdownDiagrams(source).text, {})
      .find((token) => token.type === "fence")!;
    expect(rendered.content).toBe(after);
    expect(rendered.content).toBe(saved.content);
  });
});

it("discovers project Markdown including new files while respecting ignores, nested plugins and deleted files", async () => {
  const root = await mkdtemp(join(tmpdir(), "aiohub-diagram-files-"));
  roots.push(root);
  expect(spawnSync("git", ["init", "--quiet", root]).status).toBe(0);
  for (const file of [
    "docs/中文.md",
    "src/tools/demo/ARCHITECTURE.md",
    "plugins/demo/README.md",
    "ignored/generated.md",
    "docs/code.ts",
    "deleted.md",
  ]) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), "fixture", "utf8");
  }
  await writeFile(join(root, ".gitignore"), "ignored/\n", "utf8");
  expect(spawnSync("git", ["add", "deleted.md"], { cwd: root }).status).toBe(0);
  await unlink(join(root, "deleted.md"));
  const paths = (await findMarkdownFiles(root)).map((file) =>
    relative(root, file).replaceAll("\\", "/")
  );
  expect(paths).toEqual(["docs/中文.md", "src/tools/demo/ARCHITECTURE.md"]);
  expect(await findMarkdownFiles(root, ["docs"])).toEqual([
    join(root, "docs/中文.md"),
  ]);
  await expect(findMarkdownFiles(root, ["../outside.md"])).rejects.toThrow(
    "超出项目目录"
  );
});
