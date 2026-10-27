// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0 (the "License");

import { spawnSync } from "node:child_process";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { formatMarkdownDiagrams } from "./markdown-diagrams";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Git supplies the project/ignore boundary; nested plugin repositories stay out. */
export async function findMarkdownFiles(
  directory: string,
  targets: string[] = []
): Promise<string[]> {
  const paths = targets.map((target) => {
    const rel = relative(directory, resolve(directory, target));
    if (rel === ".." || rel.startsWith(`..${sep}`)) {
      throw new Error(`文档路径超出项目目录：${target}`);
    }
    // Literal pathspecs support directories and Windows paths without glob surprises.
    return `:(literal)${rel.split(sep).join("/") || "."}`;
  });
  const git = spawnSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...paths,
    ],
    { cwd: directory, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }
  );
  if (git.status !== 0)
    throw new Error(git.stderr || "无法列出项目文档，请检查 Git 工作区");
  const files = [...new Set(git.stdout.split("\0"))]
    .filter((file) => /\.md$/i.test(file))
    .filter(
      (file) =>
        !/^(?:plugins|\.agents|\.codex|\.claude|\.kilocode|\.roo)(?:\/|$)/.test(
          file
        )
    );
  const regular: string[] = [];
  for (const file of files.sort()) {
    const absolute = resolve(directory, file);
    try {
      if ((await lstat(absolute)).isFile()) regular.push(absolute);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return regular;
}

export async function runFormatter(args: string[]): Promise<number> {
  const flags = args.filter((arg) => arg.startsWith("-"));
  const invalid = flags.find(
    (arg) => !["--write", "--check", "--help"].includes(arg)
  );
  if (invalid) throw new Error(`未知参数：${invalid}`);
  if (args.includes("--help")) {
    console.info(
      "用法：bun run docs:format -- [--write | --check] [文件或目录 ...]\n默认预览待整理文件；--write 写回，--check 发现待整理文件时返回 1。省略路径时扫描项目 Markdown。"
    );
    return 0;
  }
  if (args.includes("--write") && args.includes("--check")) {
    throw new Error("--write 和 --check 请分别使用");
  }
  const write = args.includes("--write");
  const targets = args.filter((arg) => !arg.startsWith("-"));
  const files = await findMarkdownFiles(root, targets);
  if (targets.length && !files.length)
    throw new Error("指定路径没有可处理的 Markdown 文档");
  let changed = 0;
  let blocks = 0;
  let skipped = 0;
  for (const file of files) {
    const source = await readFile(file, "utf8");
    const formatted = formatMarkdownDiagrams(source);
    for (const issue of formatted.skipped) {
      console.warn(
        `${relative(root, file)}:${issue.line} 保留原样：${issue.reason}`
      );
      skipped++;
    }
    if (source === formatted.text) continue;
    if (write) await writeFile(file, formatted.text, "utf8");
    changed++;
    blocks += formatted.formatted;
    console.info(
      `${write ? "已整理" : "待整理"} ${relative(root, file)}（${formatted.formatted} 处）`
    );
  }
  console.info(
    `扫描 ${files.length} 篇文档，${changed} 篇${write ? "已整理" : "待整理"}，共 ${blocks} 处字符画${skipped ? `，${skipped} 处保留原样待人工查看` : ""}。`
  );
  return args.includes("--check") && changed ? 1 : 0;
}

if (import.meta.main) {
  try {
    process.exitCode = await runFormatter(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
