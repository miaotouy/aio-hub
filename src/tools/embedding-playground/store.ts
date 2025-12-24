import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { LlmProfile } from '@/types/llm-profiles';
import type { SimilarityAlgorithm } from './composables/useVectorMath';

export const useEmbeddingPlaygroundStore = defineStore('embedding-playground', () => {
  // --- 共享配置 ---
  const selectedProfile = ref<LlmProfile | null>(null);
  const selectedModelId = ref('');

  // --- 基础调试状态 ---
  const rawInput = ref('自然语言处理（NLP）是计算机科学、人工智能和语言学领域的分支学科。它致力于让计算机能够理解、解释和生成人类语言。');
  const rawDimensions = ref<number | undefined>(undefined);

  // --- 相似度对比状态 ---
  const similarityAlgorithm = ref<SimilarityAlgorithm>('cosine');
  const anchorText = ref('人工智能');
  const comparisonTexts = ref<string[]>([
    '机器学习', // 高相关
    '深度学习', // 高相关
    '神经网络', // 高相关
    '人类智慧', // 中相关
    'Python 编程', // 中相关（工具）
    '美味的红烧肉', // 无关（食物）
    '今天天气真好', // 无关（日常）
    '莎士比亚全集', // 无关（文学）
    '量子物理学' // 低相关（科学）
  ]);

  // --- 检索模拟状态 ---
  const knowledgeBase = ref<{ text: string; embedding?: number[] }[]>([
    // 技术类
    { text: 'AIO Hub 是一款桌面 AI 工具。' },
    { text: 'Embedding 是 RAG 的核心组件，用于将文本转换为向量。' },
    { text: 'Vue 3 是一个渐进式 JavaScript 框架。' },
    { text: 'Tauri 用于构建更小、更快、更安全的跨平台桌面应用。' },
    { text: 'Rust 语言以内存安全和高性能著称。' },
    // 科学类
    { text: '光速是宇宙中信息传递的速度上限，约为 30 万公里每秒。' },
    { text: '线粒体被称为细胞的“能量工厂”。' },
    { text: '万有引力定律由艾萨克·牛顿提出。' },
    // 文化与生活
    { text: '《红楼梦》是中国古代四大名著之首。' },
    { text: '印象派绘画强调对光影变化的捕捉。' },
    { text: '宫保鸡丁是一道闻名中外的川菜。' },
    { text: '拿铁咖啡主要由浓缩咖啡和蒸奶构成。' }
  ]);
  const searchQuery = ref('如何构建桌面应用程序？');
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