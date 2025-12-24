/**
 * 向量数学工具函数
 * 提供常用的向量相似度和距离计算算法
 */

export type SimilarityAlgorithm = 'cosine' | 'euclidean' | 'dot' | 'manhattan';

export function useVectorMath() {
  /**
   * 计算点积
   */
  const dotProduct = (vecA: number[], vecB: number[]): number => {
    if (vecA.length !== vecB.length) return 0;
    return vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
  };

  /**
   * 计算向量模长 (L2 范数)
   */
  const norm = (vec: number[]): number => {
    return Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  };

  /**
   * 余弦相似度
   * 范围: [-1, 1]，通常在 Embedding 场景下为 [0, 1]
   */
  const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    const magA = norm(vecA);
    const magB = norm(vecB);
    if (magA === 0 || magB === 0) return 0;
    return dotProduct(vecA, vecB) / (magA * magB);
  };

  /**
   * 欧氏距离 (L2 距离)
   * 范围: [0, +inf)，越小越相似
   */
  const euclideanDistance = (vecA: number[], vecB: number[]): number => {
    if (vecA.length !== vecB.length) return Infinity;
    const squaredDiff = vecA.reduce((sum, a, i) => {
      const diff = a - vecB[i];
      return sum + diff * diff;
    }, 0);
    return Math.sqrt(squaredDiff);
  };

  /**
   * 曼哈顿距离 (L1 距离)
   * 范围: [0, +inf)，越小越相似
   */
  const manhattanDistance = (vecA: number[], vecB: number[]): number => {
    if (vecA.length !== vecB.length) return Infinity;
    return vecA.reduce((sum, a, i) => sum + Math.abs(a - vecB[i]), 0);
  };

  /**
   * 统一计算入口
   * 为了 UI 展示方便，距离类算法可能需要进行转换（如 1/(1+d)）以保持“数值越大越相似”的直觉
   */
  const calculateSimilarity = (
    vecA: number[],
    vecB: number[],
    algo: SimilarityAlgorithm = 'cosine'
  ): number => {
    switch (algo) {
      case 'cosine':
        return cosineSimilarity(vecA, vecB);
      case 'dot':
        return dotProduct(vecA, vecB);
      case 'euclidean': {
        const d = euclideanDistance(vecA, vecB);
        return 1 / (1 + d); // 转换为 [0, 1] 范围的相似度分数
      }
      case 'manhattan': {
        const d = manhattanDistance(vecA, vecB);
        return 1 / (1 + d); // 转换为 [0, 1] 范围的相似度分数
      }
      default:
        return 0;
    }
  };

  return {
    dotProduct,
    norm,
    cosineSimilarity,
    euclideanDistance,
    manhattanDistance,
    calculateSimilarity,
  };
}