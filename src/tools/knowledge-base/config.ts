// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

import { createConfigManager } from "@/utils/configManager";
import {
  KNOWLEDGE_LIBRARY_CONFIG_SCHEMA_VERSION,
  type KnowledgeLibraryIndexConfig,
  type KnowledgeRuntimeConfig,
} from "./types";

export function createDefaultKnowledgeLibraryConfig(): KnowledgeLibraryIndexConfig {
  return {
    schemaVersion: KNOWLEDGE_LIBRARY_CONFIG_SCHEMA_VERSION,
    chunking: {
      strategy: "fixed",
      targetChars: 1000,
      overlapChars: 120,
    },
    embedding: {
      enabled: false,
      routeKey: "",
      queryTaskType: "RETRIEVAL_QUERY",
      documentTaskType: "RETRIEVAL_DOCUMENT",
      encodingFormat: "float",
      adapterContractVersion: 1,
    },
    indexes: {
      keyword: true,
      semantic: false,
      graph: true,
    },
  };
}

export function normalizeKnowledgeLibraryConfig(
  value?: Partial<KnowledgeLibraryIndexConfig> | null
): KnowledgeLibraryIndexConfig {
  const defaults = createDefaultKnowledgeLibraryConfig();
  const requestedDimensions = value?.embedding?.requestedDimensions;
  return {
    schemaVersion:
      value?.schemaVersion ?? KNOWLEDGE_LIBRARY_CONFIG_SCHEMA_VERSION,
    chunking: {
      ...defaults.chunking,
      ...(value?.chunking ?? {}),
    },
    embedding: {
      ...defaults.embedding,
      ...(value?.embedding ?? {}),
      ...(requestedDimensions === undefined
        ? { requestedDimensions: undefined }
        : { requestedDimensions }),
    },
    indexes: {
      ...defaults.indexes,
      ...(value?.indexes ?? {}),
    },
  };
}

export function validateKnowledgeLibraryConfig(
  value: KnowledgeLibraryIndexConfig
): void {
  if (value.schemaVersion !== KNOWLEDGE_LIBRARY_CONFIG_SCHEMA_VERSION) {
    throw new Error(`不支持的资料库配置版本: ${value.schemaVersion}`);
  }
  if (value.chunking.strategy !== "fixed") {
    throw new Error("当前只支持 fixed 分块策略");
  }
  if (value.chunking.targetChars < 200 || value.chunking.targetChars > 8000) {
    throw new Error("分块目标字符数必须在 200 到 8000 之间");
  }
  if (
    value.chunking.overlapChars < 0 ||
    value.chunking.overlapChars >= value.chunking.targetChars ||
    value.chunking.overlapChars > 2000
  ) {
    throw new Error("分块重叠字符数必须小于目标字符数且不超过 2000");
  }
  if (!value.indexes.keyword) {
    throw new Error("当前版本必须保留关键词索引");
  }
  if (value.embedding.enabled !== value.indexes.semantic) {
    throw new Error("语义索引开关与 Embedding 配置状态必须一致");
  }
  if (value.embedding.enabled && !value.embedding.routeKey.trim()) {
    throw new Error("启用语义索引时必须指定 Embedding route");
  }
  const taskTypes = new Set([
    "RETRIEVAL_QUERY",
    "RETRIEVAL_DOCUMENT",
    "SEMANTIC_SIMILARITY",
    "CLASSIFICATION",
    "CLUSTERING",
  ]);
  if (
    !taskTypes.has(value.embedding.queryTaskType) ||
    !taskTypes.has(value.embedding.documentTaskType)
  ) {
    throw new Error("Embedding task type 不受支持");
  }
  if (value.embedding.encodingFormat !== "float") {
    throw new Error("当前只支持 float Embedding 编码");
  }
  if (value.embedding.adapterContractVersion !== 1) {
    throw new Error("当前只支持 Embedding adapter contract v1");
  }
  const dimensions = value.embedding.requestedDimensions;
  if (
    dimensions !== undefined &&
    (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 65536)
  ) {
    throw new Error("请求向量维度必须在 1 到 65536 之间");
  }
}

export function createDefaultKnowledgeRuntimeConfig(): KnowledgeRuntimeConfig {
  return {
    version: "1.0.0",
    defaultEmbeddingRouteKey: "",
    embeddingRequestConcurrency: 2,
    embeddingBatchSize: 32,
    embeddingMaxRetries: 2,
    embeddingRetryDelayMs: 1000,
    ingestQueueConcurrency: 2,
    ingestLeaseTimeoutSeconds: 300,
    maxImportFileBytes: 50 * 1024 * 1024,
    maxImportBatchFiles: 200,
  };
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}

export const knowledgeRuntimeConfigManager =
  createConfigManager<KnowledgeRuntimeConfig>({
    moduleName: "knowledge-base",
    fileName: "runtime-config.json",
    version: "1.0.0",
    debounceDelay: 500,
    createDefault: createDefaultKnowledgeRuntimeConfig,
    mergeConfig(defaults, loaded) {
      return {
        ...defaults,
        ...loaded,
        version: "1.0.0",
        embeddingRequestConcurrency: boundedInteger(
          loaded.embeddingRequestConcurrency,
          defaults.embeddingRequestConcurrency,
          1,
          8
        ),
        embeddingBatchSize: boundedInteger(
          loaded.embeddingBatchSize,
          defaults.embeddingBatchSize,
          1,
          256
        ),
        embeddingMaxRetries: boundedInteger(
          loaded.embeddingMaxRetries,
          defaults.embeddingMaxRetries,
          0,
          10
        ),
        embeddingRetryDelayMs: boundedInteger(
          loaded.embeddingRetryDelayMs,
          defaults.embeddingRetryDelayMs,
          100,
          60000
        ),
        ingestQueueConcurrency: boundedInteger(
          loaded.ingestQueueConcurrency,
          defaults.ingestQueueConcurrency,
          1,
          8
        ),
        ingestLeaseTimeoutSeconds: boundedInteger(
          loaded.ingestLeaseTimeoutSeconds,
          defaults.ingestLeaseTimeoutSeconds,
          30,
          3600
        ),
        maxImportFileBytes: boundedInteger(
          loaded.maxImportFileBytes,
          defaults.maxImportFileBytes,
          1024,
          1024 * 1024 * 1024
        ),
        maxImportBatchFiles: boundedInteger(
          loaded.maxImportBatchFiles,
          defaults.maxImportBatchFiles,
          1,
          10000
        ),
      };
    },
  });

export const saveKnowledgeRuntimeConfigDebounced =
  knowledgeRuntimeConfigManager.saveDebounced;
