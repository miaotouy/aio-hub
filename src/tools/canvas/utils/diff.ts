import { createModuleLogger } from "@/utils/logger";
import { type DiffResult, type DiffOptions, DiffFuzzyMatchError } from "../types/diff";

const logger = createModuleLogger("Canvas/Diff");

/**
 * Bigram Dice Coefficient 实现（纯函数，零依赖）
 * 用于计算两个字符串的相似度
 */
function bigramDice(a: string, b: string): number {
  const s1 = a.trim();
  const s2 = b.trim();
  if (s1 === s2) return 1;
  if (s1.length < 2 || s2.length < 2) {
    return s1 === s2 ? 1 : 0;
  }

  const bigrams1 = new Map<string, number>();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.substring(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.substring(i, i + 2);
    const count = bigrams1.get(bg);
    if (count && count > 0) {
      intersection++;
      bigrams1.set(bg, count - 1);
    }
  }

  return (2 * intersection) / (s1.length - 1 + s2.length - 1);
}

/**
 * 移除内容中的行号前缀
 */
function stripLineNumbers(content: string): string {
  return content
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*\d+\s*\|\s?(.*)$/);
      return match ? match[1] : line;
    })
    .join("\n");
}

/**
 * 核心 Diff 应用逻辑：应用 Search/Replace 变更
 */
export function applySearchReplaceDiff(
  originalContent: string,
  search: string,
  replace: string,
  options: DiffOptions = {},
): DiffResult {
  const searchStr = stripLineNumbers(search);
  const replaceStr = stripLineNumbers(replace);

  if (searchStr === "") {
    const content = originalContent + (originalContent.endsWith("\n") ? "" : "\n") + replaceStr;
    return {
      content,
      strategy: "exact",
      confidence: 1.0,
      matchRange: [originalContent.split(/\r?\n/).length + 1, content.split(/\r?\n/).length],
      duplicateCount: 1,
      warnings: [],
    };
  }

  const resultLines = originalContent.split(/\r?\n/);
  const searchLines = searchStr.split(/\r?\n/);
  const replaceLines = replaceStr.split(/\r?\n/);

  const findBestMatchIndex = (indices: number[], startLineHint?: number): number => {
    if (indices.length === 0) return -1;
    if (!startLineHint || indices.length === 1) return indices[0];

    const targetIndex = startLineHint - 1;
    return indices.reduce((prev, curr) => {
      return Math.abs(curr - targetIndex) < Math.abs(prev - targetIndex) ? curr : prev;
    });
  };

  // 1. 尝试简单精确匹配
  const exactIndices: number[] = [];
  let lastExactIndex = originalContent.indexOf(searchStr);
  while (lastExactIndex !== -1) {
    const lineIndex = originalContent.substring(0, lastExactIndex).split(/\r?\n/).length - 1;
    exactIndices.push(lineIndex);
    lastExactIndex = originalContent.indexOf(searchStr, lastExactIndex + 1);
  }

  if (exactIndices.length > 0) {
    const matchedIndex = findBestMatchIndex(exactIndices, options.startLine);
    const before = resultLines.slice(0, matchedIndex);
    const after = resultLines.slice(matchedIndex + searchLines.length);
    const warnings: string[] = [];

    if (exactIndices.length > 1) {
      if (options.startLine) {
        warnings.push(`匹配到 ${exactIndices.length} 处，已根据行号提示选择第 ${matchedIndex + 1} 行的匹配`);
      } else {
        warnings.push(
          `匹配到 ${exactIndices.length} 处，已替换第一处。建议提供 startLine 参数或更精确的上下文以消歧义`,
        );
      }
    }

    return {
      content: [...before, ...replaceLines, ...after].join("\n"),
      strategy: "exact",
      confidence: 1.0,
      matchRange: [matchedIndex + 1, matchedIndex + searchLines.length],
      duplicateCount: exactIndices.length,
      warnings,
    };
  }

  // 2. 尝试行匹配（处理缩进和末尾空格）
  const tryLineMatch = (strategy: "trimEnd" | "trim"): DiffResult | null => {
    const indices: number[] = [];
    const processLine = (l: string) => (strategy === "trim" ? l.trim() : l.trimEnd());
    const processedSearchLines = searchLines.map(processLine);

    for (let j = 0; j <= resultLines.length - processedSearchLines.length; j++) {
      let match = true;
      for (let k = 0; k < processedSearchLines.length; k++) {
        if (processLine(resultLines[j + k]) !== processedSearchLines[k]) {
          match = false;
          break;
        }
      }
      if (match) {
        indices.push(j);
      }
    }

    if (indices.length > 0) {
      const matchedIndex = findBestMatchIndex(indices, options.startLine);
      const before = resultLines.slice(0, matchedIndex);
      const after = resultLines.slice(matchedIndex + searchLines.length);

      // 尝试保持原始缩进
      const originalIndentation = resultLines[matchedIndex].match(/^\s*/)?.[0] || "";
      const searchFirstLineIndentation = searchLines[0].match(/^\s*/)?.[0] || "";

      const fixedReplaceLines = replaceLines.map((line) => {
        if (line.startsWith(searchFirstLineIndentation)) {
          return originalIndentation + line.substring(searchFirstLineIndentation.length);
        }
        return line;
      });

      const warnings: string[] = [];
      if (indices.length > 1) {
        if (options.startLine) {
          warnings.push(`匹配到 ${indices.length} 处，已根据行号提示选择第 ${matchedIndex + 1} 行的匹配`);
        } else {
          warnings.push(`匹配到 ${indices.length} 处，已替换第一处。建议提供 startLine 参数或更精确的上下文以消歧义`);
        }
      }

      return {
        content: [...before, ...fixedReplaceLines, ...after].join("\n"),
        strategy,
        confidence: 1.0,
        matchRange: [matchedIndex + 1, matchedIndex + searchLines.length],
        duplicateCount: indices.length,
        warnings,
      };
    }
    return null;
  };

  const trimEndResult = tryLineMatch("trimEnd");
  if (trimEndResult) return trimEndResult;

  const trimResult = tryLineMatch("trim");
  if (trimResult) return trimResult;

  // 3. 尝试模糊匹配 (Fuzzy Match)
  const fuzzyThreshold = 0.85;
  const candidateThreshold = 0.75;
  let bestScore = -1;
  let bestIndex = -1;
  const candidateMatches: Array<{ index: number; score: number }> = [];

  for (let j = 0; j <= resultLines.length - searchLines.length; j++) {
    let totalScore = 0;
    for (let k = 0; k < searchLines.length; k++) {
      const score = bigramDice(resultLines[j + k], searchLines[k]);
      // 首尾行加权
      const weight = k === 0 || k === searchLines.length - 1 ? 1.2 : 1.0;
      totalScore += score * weight;
    }
    const averageScore = totalScore / (searchLines.length + (searchLines.length > 1 ? 0.4 : 0));

    if (averageScore >= candidateThreshold) {
      candidateMatches.push({ index: j, score: averageScore });
    }

    if (averageScore > bestScore) {
      bestScore = averageScore;
      bestIndex = j;
    }
  }

  if (bestScore >= fuzzyThreshold) {
    const matchedIndex = findBestMatchIndex(
      candidateMatches.filter((m) => m.score >= fuzzyThreshold).map((m) => m.index),
      options.startLine,
    );
    const actualBestIndex = matchedIndex !== -1 ? matchedIndex : bestIndex;
    const actualBestScore =
      matchedIndex !== -1 ? candidateMatches.find((m) => m.index === matchedIndex)!.score : bestScore;

    const before = resultLines.slice(0, actualBestIndex);
    const after = resultLines.slice(actualBestIndex + searchLines.length);

    const warnings: string[] = [`模糊匹配成功 (置信度: ${(actualBestScore * 100).toFixed(0)}%)`];

    const duplicateCount = candidateMatches.filter((m) => m.score >= fuzzyThreshold).length;
    if (duplicateCount > 1) {
      warnings.push(`检测到 ${duplicateCount} 处相似片段，已根据策略选择其一`);
    }

    return {
      content: [...before, ...replaceLines, ...after].join("\n"),
      strategy: "fuzzy",
      confidence: actualBestScore,
      matchRange: [actualBestIndex + 1, actualBestIndex + searchLines.length],
      duplicateCount,
      warnings,
    };
  }

  // 4. 匹配失败，处理候选提示
  if (bestScore >= candidateThreshold) {
    const preview = resultLines
      .slice(bestIndex, bestIndex + 5)
      .map((line, i) => `${bestIndex + i + 1} | ${line}`)
      .join("\n");

    throw new DiffFuzzyMatchError({
      confidence: bestScore,
      lineRange: [bestIndex + 1, bestIndex + searchLines.length],
      preview,
    });
  }

  // 完全匹配失败
  const context = searchLines.slice(0, 3).join("\n");
  logger.warn("Diff 匹配失败", { searchStr: context });
  throw new Error(`无法匹配代码块。未找到以下内容（前几行）：\n${context}\n请确保 search 部分与文件内容逻辑一致。`);
}
