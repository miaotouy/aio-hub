// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { open } from "@tauri-apps/plugin-dialog";
import {
  KnowledgeFileParseError,
  parseKnowledgeFile,
  type ParsedKnowledgeFile,
} from "../core/fileParser";
import {
  KNOWLEDGE_FILE_DIALOG_FILTERS,
  getKnowledgeFileName,
} from "../core/formats";
import type { KnowledgeImportFailure } from "../types";

export interface KnowledgeImportProgress {
  phase: "parse" | "ingest";
  processed: number;
  total: number;
}

export interface KnowledgeImportBatchResult {
  imported: number;
  parsed: number;
  skippedDuplicates: number;
  failures: KnowledgeImportFailure[];
  warnings?: string[];
}

interface KnowledgeImportDependencies {
  parseFile?: (path: string) => Promise<ParsedKnowledgeFile>;
  ingestFiles?: (
    files: ParsedKnowledgeFile[]
  ) => Promise<{ imported: number; failures: KnowledgeImportFailure[] }>;
  processPaths?: (paths: string[]) => Promise<{
    imported: number;
    parsed: number;
    skippedDuplicates: number;
    failures: KnowledgeImportFailure[];
    warnings?: string[];
  }>;
  onProgress?: (progress: KnowledgeImportProgress) => void;
}

function pathKey(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  return /^[a-z]:\//i.test(normalized)
    ? normalized.toLocaleLowerCase()
    : normalized;
}

function uniquePaths(paths: readonly string[]): {
  paths: string[];
  skippedDuplicates: number;
} {
  const seen = new Set<string>();
  const unique: string[] = [];
  let skippedDuplicates = 0;
  for (const path of paths) {
    if (!path.trim()) continue;
    const key = pathKey(path);
    if (seen.has(key)) {
      skippedDuplicates += 1;
      continue;
    }
    seen.add(key);
    unique.push(path);
  }
  return { paths: unique, skippedDuplicates };
}

export async function selectImportPaths(): Promise<string[]> {
  const selected = await open({
    title: "导入知识资料",
    directory: false,
    multiple: true,
    filters: KNOWLEDGE_FILE_DIALOG_FILTERS.map((filter) => ({
      name: filter.name,
      extensions: [...filter.extensions],
    })),
  });
  if (Array.isArray(selected)) {
    return selected.filter((item): item is string => typeof item === "string");
  }
  return typeof selected === "string" ? [selected] : [];
}

export async function importPaths(
  paths: readonly string[],
  dependencies: KnowledgeImportDependencies
): Promise<KnowledgeImportBatchResult> {
  const deduplicated = uniquePaths(paths);
  if (dependencies.processPaths) {
    dependencies.onProgress?.({
      phase: "ingest",
      processed: 0,
      total: deduplicated.paths.length,
    });
    const result = await dependencies.processPaths(deduplicated.paths);
    return {
      ...result,
      skippedDuplicates:
        deduplicated.skippedDuplicates + result.skippedDuplicates,
    };
  }
  const parsedFiles: ParsedKnowledgeFile[] = [];
  const failures: KnowledgeImportFailure[] = [];
  const parseFile = dependencies.parseFile ?? parseKnowledgeFile;
  dependencies.onProgress?.({
    phase: "parse",
    processed: 0,
    total: deduplicated.paths.length,
  });

  for (const path of deduplicated.paths) {
    try {
      parsedFiles.push(await parseFile(path));
    } catch (error) {
      failures.push({
        sourcePath: path,
        fileName: getKnowledgeFileName(path),
        stage:
          error instanceof KnowledgeFileParseError ? error.stage : "parse",
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      dependencies.onProgress?.({
        phase: "parse",
        processed: parsedFiles.length + failures.length,
        total: deduplicated.paths.length,
      });
    }
  }

  dependencies.onProgress?.({
    phase: "ingest",
    processed: 0,
    total: parsedFiles.length,
  });
  const ingestResult = parsedFiles.length
    ? await dependencies.ingestFiles!(parsedFiles)
    : { imported: 0, failures: [] };
  return {
    imported: ingestResult.imported,
    parsed: parsedFiles.length,
    skippedDuplicates: deduplicated.skippedDuplicates,
    failures: [...failures, ...ingestResult.failures],
  };
}
