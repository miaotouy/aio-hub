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

import { ref } from "vue";
import { stableJson } from "@aiohub/llm-core";
import { callEmbeddingApi } from "@/llm-apis/embedding";
import type {
  EmbeddingRequestOptions,
  EmbeddingResponse,
} from "@/llm-apis/embedding-types";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { EmbeddingModelTarget } from "./useEmbeddingModelOptions";

export interface CachedEmbeddingResult {
  embeddings: number[][];
  response: EmbeddingResponse | null;
  executionTime: number;
  cacheHits: number;
}

export interface EmbeddingCacheScope {
  adapterContractVersion?: number;
  datasetVersion?: string;
  inputKind?: "query" | "document" | "generic";
}

export function buildEmbeddingCacheScopeKey(
  combo: string,
  options: Omit<EmbeddingRequestOptions, "modelId" | "input">,
  scope: EmbeddingCacheScope = {}
): string {
  return stableJson({
    route: combo,
    dimensions: options.dimensions ?? null,
    taskType: options.taskType ?? null,
    encodingFormat: options.encodingFormat ?? "float",
    title: options.title ?? null,
    adapterContractVersion: scope.adapterContractVersion ?? 1,
    datasetVersion: scope.datasetVersion ?? null,
    inputKind: scope.inputKind ?? "generic",
  });
}

export async function hashEmbeddingInput(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

const errorHandler = createModuleErrorHandler(
  "embedding-playground/useEmbeddingCache"
);

export function useEmbeddingCache() {
  const embeddingCache = ref<Map<string, Map<string, number[]>>>(new Map());

  const getModelCache = (scopeKey: string) => {
    if (!embeddingCache.value.has(scopeKey)) {
      embeddingCache.value.set(scopeKey, new Map());
    }
    return embeddingCache.value.get(scopeKey)!;
  };

  const embedTexts = async (
    target: EmbeddingModelTarget,
    texts: string[],
    options: Omit<EmbeddingRequestOptions, "modelId" | "input"> = {},
    scope: EmbeddingCacheScope = {}
  ): Promise<CachedEmbeddingResult | null> => {
    const cleanTexts = texts.map((text) => text.trim());
    if (cleanTexts.some((text) => !text)) {
      errorHandler.warn("存在空文本，请先补全后再执行");
      return null;
    }

    const scopeKey = buildEmbeddingCacheScopeKey(target.combo, options, scope);
    const modelCache = getModelCache(scopeKey);
    const uniqueTexts = [...new Set(cleanTexts)];
    const inputHashes = new Map(
      await Promise.all(
        uniqueTexts.map(
          async (text) => [text, await hashEmbeddingInput(text)] as const
        )
      )
    );
    const textsToEmbed = uniqueTexts.filter(
      (text) => !modelCache.has(inputHashes.get(text)!)
    );
    const cacheHits = uniqueTexts.length - textsToEmbed.length;

    let response: EmbeddingResponse | null = null;
    let executionTime = 0;

    if (textsToEmbed.length > 0) {
      const startTime = Date.now();
      try {
        response = await callEmbeddingApi(target.profile, {
          ...options,
          modelId: target.modelId,
          input: textsToEmbed,
        });
        executionTime = Date.now() - startTime;
      } catch (error) {
        errorHandler.error(error, `Embedding 请求失败: ${target.label}`);
        return null;
      }

      if (!response || response.data.length !== textsToEmbed.length) {
        errorHandler.warn(`模型 ${target.label} 返回的向量数量不匹配`);
        return null;
      }

      response.data.forEach((item, index) => {
        modelCache.set(inputHashes.get(textsToEmbed[index])!, item.embedding);
      });
    }

    const embeddings: number[][] = [];
    for (const text of cleanTexts) {
      const embedding = modelCache.get(inputHashes.get(text)!);
      if (!embedding) {
        errorHandler.warn(`无法读取缓存向量: ${text.slice(0, 16)}`);
        return null;
      }
      embeddings.push(embedding);
    }

    return {
      embeddings,
      response,
      executionTime,
      cacheHits,
    };
  };

  const clearCache = () => {
    embeddingCache.value.clear();
  };

  return {
    embeddingCache,
    embedTexts,
    clearCache,
  };
}
