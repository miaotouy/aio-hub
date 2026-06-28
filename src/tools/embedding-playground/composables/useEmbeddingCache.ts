import { ref } from "vue";
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

const errorHandler = createModuleErrorHandler(
  "embedding-playground/useEmbeddingCache"
);

export function useEmbeddingCache() {
  const embeddingCache = ref<Map<string, Map<string, number[]>>>(new Map());

  const getModelCache = (combo: string) => {
    if (!embeddingCache.value.has(combo)) {
      embeddingCache.value.set(combo, new Map());
    }
    return embeddingCache.value.get(combo)!;
  };

  const embedTexts = async (
    target: EmbeddingModelTarget,
    texts: string[],
    options: Omit<EmbeddingRequestOptions, "modelId" | "input"> = {}
  ): Promise<CachedEmbeddingResult | null> => {
    const cleanTexts = texts.map((text) => text.trim());
    if (cleanTexts.some((text) => !text)) {
      errorHandler.warn("存在空文本，请先补全后再执行");
      return null;
    }

    const modelCache = getModelCache(target.combo);
    const uniqueTexts = [...new Set(cleanTexts)];
    const textsToEmbed = uniqueTexts.filter((text) => !modelCache.has(text));
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
        modelCache.set(textsToEmbed[index], item.embedding);
      });
    }

    const embeddings: number[][] = [];
    for (const text of cleanTexts) {
      const embedding = modelCache.get(text);
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
