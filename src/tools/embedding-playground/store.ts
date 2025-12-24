import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { LlmProfile } from '@/types/llm-profiles';
import type { SimilarityAlgorithm } from './composables/useVectorMath';

export const useEmbeddingPlaygroundStore = defineStore('embedding-playground', () => {
  // --- 共享配置 ---
  const selectedProfile = ref<LlmProfile | null>(null);
  const selectedModelId = ref('');

  // --- 基础调试状态 ---
  const rawInput = ref('这是一段用于测试 Embedding 的文本。');
  const rawDimensions = ref<number | undefined>(undefined);

  // --- 相似度对比状态 ---
  const similarityAlgorithm = ref<SimilarityAlgorithm>('cosine');
  const anchorText = ref('人工智能');
  const comparisonTexts = ref<string[]>([
    '机器学习',
    '深度学习',
    '苹果公司',
    '今天天气不错',
    'AI 革命'
  ]);

  // --- 检索模拟状态 ---
  const knowledgeBase = ref<{ text: string; embedding?: number[] }[]>([
    { text: 'AIO Hub 是一款桌面 AI 工具。' },
    { text: 'Embedding 是 RAG 的核心。' },
    { text: 'Vue 3 是一个前端框架。' },
    { text: 'Tauri 用于构建跨平台桌面应用。' }
  ]);
  const searchQuery = ref('');
  const searchTopK = ref(3);
  const searchThreshold = ref(20);

  return {
    // 共享
    selectedProfile,
    selectedModelId,
    
    // 基础调试
    rawInput,
    rawDimensions,
    
    // 相似度对比
    similarityAlgorithm,
    anchorText,
    comparisonTexts,
    
    // 检索模拟
    knowledgeBase,
    searchQuery,
    searchTopK,
    searchThreshold,
  };
});