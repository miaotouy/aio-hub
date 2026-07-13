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

import { defineStore } from "pinia";
import { ref } from "vue";
import type { LlmProfile } from "@/types/llm-profiles";
import type { SimilarityAlgorithm } from "./composables/useVectorMath";

export const useEmbeddingPlaygroundStore = defineStore(
  "embedding-playground",
  () => {
    // --- 共享文本数据 ---
    const anchorText = ref("人工智能");
    const comparisonTexts = ref<string[]>([
      "机器学习",
      "深度学习",
      "神经网络",
      "人类智慧",
      "Python 编程",
      "美味的红烧肉",
      "今天天气真好",
      "莎士比亚全集",
      "量子物理学",
    ]);
    const rawInput = ref(
      "自然语言处理（NLP）是计算机科学、人工智能和语言学领域的分支学科。它致力于让计算机能够理解、解释和生成人类语言。"
    );
    const searchQuery = ref("如何构建桌面应用程序？");

    // --- 共享算法配置 ---
    const similarityAlgorithm = ref<SimilarityAlgorithm>("cosine");

    // --- 各模式独立的模型选择状态 ---
    const quickCompareProfile = ref<LlmProfile | null>(null);
    const quickCompareModelId = ref("");
    const quickCompareCombos = ref<string[]>([]);
    const quickCompareIsMulti = ref(false);

    const similarityProfile = ref<LlmProfile | null>(null);
    const similarityModelId = ref("");

    const multiArenaCombos = ref<string[]>([]);

    const retrievalProfile = ref<LlmProfile | null>(null);
    const retrievalModelId = ref("");
    const searchTopK = ref(3);
    const searchThreshold = ref(0.2);

    const rawProfile = ref<LlmProfile | null>(null);
    const rawModelId = ref("");
    const rawDimensions = ref<number | undefined>(undefined);

    // --- 检索模拟知识库数据 ---
    const knowledgeBase = ref<{ text: string; embedding?: number[] }[]>([
      { text: "AIO Hub 是一款桌面 AI 工具。" },
      { text: "Embedding 是 RAG 的核心组件，用于将文本转换为向量。" },
      { text: "Vue 3 是一个渐进式 JavaScript 框架。" },
      { text: "Tauri 用于构建更小、更快、更安全的跨平台桌面应用。" },
      { text: "Rust 语言以内存安全和高性能著称。" },
      { text: "光速是宇宙中信息传递的速度上限，约为 30 万公里每秒。" },
      { text: "线粒体被称为细胞的“能量工厂”。" },
      { text: "万有引力定律由艾萨克·牛顿提出。" },
      { text: "《红楼梦》是中国古代四大名著之首。" },
      { text: "印象派绘画强调对光影变化的捕捉。" },
      { text: "宫保鸡丁是一道闻名中外的川菜。" },
      { text: "拿铁咖啡主要由浓缩咖啡和蒸奶构成。" },
    ]);

    return {
      anchorText,
      comparisonTexts,
      rawInput,
      searchQuery,
      similarityAlgorithm,

      quickCompareProfile,
      quickCompareModelId,
      quickCompareCombos,
      quickCompareIsMulti,

      similarityProfile,
      similarityModelId,

      multiArenaCombos,

      retrievalProfile,
      retrievalModelId,
      searchTopK,
      searchThreshold,
      knowledgeBase,

      rawProfile,
      rawModelId,
      rawDimensions,
    };
  }
);
