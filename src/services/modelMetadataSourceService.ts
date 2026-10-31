// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  BUILTIN_METADATA_SOURCE_ADAPTERS,
  createCatalogSnapshot,
  getMetadataSourceAdapter,
  type MetadataCatalogSnapshot,
  type MetadataSourceAdapter,
  type ParsedMetadataCatalog,
} from "@aiohub/model-metadata-core";
import type { ModelMetadataProperties } from "@/types/model-metadata";
import { ensureResponseOk, fetchWithTimeout } from "@/llm-apis/common";
import { useModelMetadataStore } from "@/stores/modelMetadataStore";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("services/modelMetadataSource");
const FETCH_TIMEOUT = 30000;

export interface MetadataSourceUpdateResult {
  sourceId: string;
  updated: boolean;
  ruleCount: number;
  revision: string;
  warnings: string[];
}

export function getMetadataSourceAdapters(): MetadataSourceAdapter[] {
  return BUILTIN_METADATA_SOURCE_ADAPTERS;
}

async function requestSourcePayload(
  adapter: MetadataSourceAdapter,
  signal?: AbortSignal
): Promise<unknown> {
  const { url } = adapter.definition;
  let response: Response;
  try {
    response = await tauriFetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      connectTimeout: FETCH_TIMEOUT,
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    logger.warn("Tauri HTTP 拉取元数据源失败，改用代理", {
      sourceId: adapter.definition.id,
      error: String(error),
    });
    response = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        forceProxy: true,
        requestKind: "tool",
      },
      FETCH_TIMEOUT,
      signal
    );
  }
  await ensureResponseOk(response);
  return await response.json();
}

export async function fetchMetadataSourceCatalog(
  adapter: MetadataSourceAdapter,
  signal?: AbortSignal
): Promise<ParsedMetadataCatalog> {
  const payload = await requestSourcePayload(adapter, signal);
  return adapter.parse(payload);
}

export async function updateMetadataSource(
  sourceId: string,
  options: { signal?: AbortSignal; force?: boolean } = {}
): Promise<MetadataSourceUpdateResult> {
  const adapter = getMetadataSourceAdapter(sourceId);
  if (!adapter) {
    throw new Error(`未知的模型元数据源：${sourceId}`);
  }

  const store = useModelMetadataStore();
  const previous = store.getExternalSourceState(sourceId);
  try {
    const parsed = await fetchMetadataSourceCatalog(adapter, options.signal);
    if (
      !options.force &&
      previous?.lastRevision === parsed.revision &&
      store.getExternalCatalog(sourceId)
    ) {
      return {
        sourceId,
        updated: false,
        ruleCount: parsed.rules.length,
        revision: parsed.revision,
        warnings: parsed.warnings,
      };
    }

    const snapshot = createCatalogSnapshot(
      parsed.rules,
      parsed.revision,
      parsed.generatedAt,
      parsed.sourceId
    ) as unknown as MetadataCatalogSnapshot<ModelMetadataProperties>;
    const saved = await store.applyExternalCatalog(snapshot);
    if (!saved) throw new Error("外部源配置校验失败，未写入");
    return {
      sourceId,
      updated: true,
      ruleCount: parsed.rules.length,
      revision: parsed.revision,
      warnings: parsed.warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await store.recordExternalSourceError(sourceId, message);
    throw error;
  }
}

/** Silently refresh enabled sources that opted into auto update. */
export async function runMetadataSourceAutoUpdate(
  signal?: AbortSignal
): Promise<void> {
  const store = useModelMetadataStore();
  for (const adapter of BUILTIN_METADATA_SOURCE_ADAPTERS) {
    const sourceId = adapter.definition.id;
    const state = store.getExternalSourceState(sourceId);
    if (!state?.enabled || !state.autoUpdate) continue;
    try {
      const result = await updateMetadataSource(sourceId, { signal });
      logger.info("外部元数据源自动更新完成", {
        sourceId,
        updated: result.updated,
        ruleCount: result.ruleCount,
      });
    } catch (error) {
      logger.warn("外部元数据源自动更新失败", {
        sourceId,
        error: String(error),
      });
    }
  }
}
