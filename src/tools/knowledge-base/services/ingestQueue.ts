// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import {
  KnowledgeFileParseError,
  parseKnowledgeFile,
} from "../core/fileParser";
import { getKnowledgeFileName } from "../core/formats";
import {
  claimKnowledgeIngestTask,
  completeKnowledgeIngestTask,
  enqueueKnowledgePaths,
  failKnowledgeIngestTask,
  listKnowledgeIngestTasks,
  listKnowledgeLibraries,
  vectorizeKnowledgeLibrary,
} from "./service";
import { knowledgeRuntimeConfigManager } from "../config";
import type { KnowledgeImportFailure, KnowledgeIngestTask } from "../types";

export interface KnowledgeQueueImportResult {
  imported: number;
  parsed: number;
  skippedDuplicates: number;
  failures: KnowledgeImportFailure[];
  warnings?: string[];
}

export async function processKnowledgeImportQueue(
  libraryId: string,
  paths: string[],
  options: {
    onProgress?: (processed: number, total: number) => void;
  } = {}
): Promise<KnowledgeQueueImportResult> {
  const runtimeConfig = await knowledgeRuntimeConfigManager.load();
  const enqueueResult = await enqueueKnowledgePaths(libraryId, paths);
  const targetTaskIds = new Set(enqueueResult.taskIds);
  const recoverableTasks = (await listKnowledgeIngestTasks(libraryId, 1000)).filter(
    (task) =>
      task.status === "pending" ||
      task.status === "processing" ||
      task.status === "retry"
  );
  for (const task of recoverableTasks) targetTaskIds.add(task.id);
  const totalTasks = targetTaskIds.size;
  const failures = new Map<string, KnowledgeImportFailure>();
  for (const failure of enqueueResult.failures) {
    failures.set(failure.sourcePath, {
      sourcePath: failure.sourcePath,
      fileName: getKnowledgeFileName(failure.sourcePath),
      stage: "validation",
      message: failure.message,
    });
  }
  let imported = 0;
  let parsed = 0;
  let settled = 0;
  options.onProgress?.(0, totalTasks);

  async function processTask(task: KnowledgeIngestTask): Promise<void> {
    try {
      if (task.operation === "delete") {
        await completeKnowledgeIngestTask(task, {
          content: "",
          sourceChecksum: task.expectedChecksum,
          parserVersion: "knowledge-delete-v1",
        });
      } else {
        const result = await parseKnowledgeFile(task.sourcePath);
        parsed += 1;
        await completeKnowledgeIngestTask(task, result);
        imported += 1;
      }
      settled += 1;
      options.onProgress?.(settled, totalTasks);
    } catch (error) {
      const retryable =
        error instanceof KnowledgeFileParseError && error.stage === "read";
      let failedTask: KnowledgeIngestTask;
      try {
        failedTask = await failKnowledgeIngestTask(task, error, retryable);
      } catch (failError) {
        if (String(failError).toLocaleLowerCase().includes("lease")) return;
        throw failError;
      }
      if (failedTask.status === "failed" || failedTask.status === "cancelled") {
        failures.set(task.sourcePath, {
          sourcePath: task.sourcePath,
          fileName: getKnowledgeFileName(task.sourcePath),
          stage:
            error instanceof KnowledgeFileParseError ? error.stage : "ingest",
          message: error instanceof Error ? error.message : String(error),
        });
        settled += 1;
        options.onProgress?.(settled, totalTasks);
      }
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      const task = await claimKnowledgeIngestTask(
        libraryId,
        runtimeConfig.ingestLeaseTimeoutSeconds
      );
      if (task) {
        await processTask(task);
        continue;
      }
      const pending = (await listKnowledgeIngestTasks(libraryId, 1000)).filter(
        (candidate) =>
          targetTaskIds.has(candidate.id) &&
          (candidate.status === "pending" ||
            candidate.status === "processing" ||
            candidate.status === "retry")
      );
      if (!pending.length) return;
      const nextAvailableAt = Math.min(
        ...pending.map((candidate) =>
          candidate.status === "processing"
            ? (candidate.leaseExpiresAt ?? candidate.availableAt)
            : candidate.availableAt
        )
      );
      const delayMs = Math.max(
        50,
        Math.min(1000, nextAvailableAt * 1000 - Date.now())
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  const workerCount = Math.min(
    runtimeConfig.ingestQueueConcurrency,
    totalTasks
  );
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  const warnings: string[] = [];
  const library = (await listKnowledgeLibraries()).find(
    (candidate) => candidate.id === libraryId
  );
  if (imported > 0 && library?.config.indexes.semantic) {
    try {
      await vectorizeKnowledgeLibrary(libraryId);
    } catch (error) {
      warnings.push(
        `文档和关键词索引已保存，语义向量将在重试后补齐：${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  return {
    imported,
    parsed,
    skippedDuplicates:
      enqueueResult.skippedQueued + enqueueResult.skippedUnchanged,
    failures: [...failures.values()],
    ...(warnings.length ? { warnings } : {}),
  };
}
