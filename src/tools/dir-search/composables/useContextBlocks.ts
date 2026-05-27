import { computed, type Ref } from "vue";
import type { SearchMatch, ContextBlock } from "../types";

/**
 * 将同一文件的匹配列表合并为上下文块
 * 当多个匹配行的上下文范围重叠或相邻时，合并为连续的代码块
 */
export function buildContextBlocks(
  matches: SearchMatch[],
  contextLines: number
): ContextBlock[] {
  if (matches.length === 0 || contextLines <= 0) return [];

  // 确保按行号排序
  const sorted = [...matches].sort((a, b) => a.lineNumber - b.lineNumber);

  const blocks: ContextBlock[] = [];
  let currentBlock: ContextBlock | null = null;
  let currentBlockEnd = -1; // 当前块覆盖的最后一行

  for (const match of sorted) {
    const matchLine = match.lineNumber;
    const blockStart = matchLine - (match.contextBefore?.length ?? 0);
    const blockEnd = matchLine + (match.contextAfter?.length ?? 0);

    if (currentBlock === null || blockStart > currentBlockEnd + 2) {
      // 创建新块（gap > 1 行则分离）
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = { startLine: blockStart, lines: [] };

      // 添加上下文前行
      if (match.contextBefore) {
        for (let i = 0; i < match.contextBefore.length; i++) {
          const lineNum = matchLine - match.contextBefore.length + i;
          currentBlock.lines.push({
            lineNumber: lineNum,
            content: match.contextBefore[i],
            matchInfo: null,
          });
        }
      }

      // 添加匹配行
      currentBlock.lines.push({
        lineNumber: matchLine,
        content: match.lineContent,
        matchInfo: { matchStart: match.matchStart, matchEnd: match.matchEnd },
      });

      // 添加上下文后行
      if (match.contextAfter) {
        for (let i = 0; i < match.contextAfter.length; i++) {
          currentBlock.lines.push({
            lineNumber: matchLine + 1 + i,
            content: match.contextAfter[i],
            matchInfo: null,
          });
        }
      }

      currentBlockEnd = blockEnd;
    } else {
      // 合并到当前块：需要去重已有的行
      const existingLineNumbers = new Set(
        currentBlock.lines.map((l) => l.lineNumber)
      );

      // 添加上下文前行（去重）
      if (match.contextBefore) {
        for (let i = 0; i < match.contextBefore.length; i++) {
          const lineNum = matchLine - match.contextBefore.length + i;
          if (!existingLineNumbers.has(lineNum)) {
            currentBlock.lines.push({
              lineNumber: lineNum,
              content: match.contextBefore[i],
              matchInfo: null,
            });
            existingLineNumbers.add(lineNum);
          }
        }
      }

      // 添加匹配行（可能已存在为上下文行，需要升级为匹配行）
      const existingIdx = currentBlock.lines.findIndex(
        (l) => l.lineNumber === matchLine
      );
      if (existingIdx >= 0) {
        // 升级为匹配行
        currentBlock.lines[existingIdx].matchInfo = {
          matchStart: match.matchStart,
          matchEnd: match.matchEnd,
        };
      } else {
        currentBlock.lines.push({
          lineNumber: matchLine,
          content: match.lineContent,
          matchInfo: { matchStart: match.matchStart, matchEnd: match.matchEnd },
        });
        existingLineNumbers.add(matchLine);
      }

      // 添加上下文后行（去重）
      if (match.contextAfter) {
        for (let i = 0; i < match.contextAfter.length; i++) {
          const lineNum = matchLine + 1 + i;
          if (!existingLineNumbers.has(lineNum)) {
            currentBlock.lines.push({
              lineNumber: lineNum,
              content: match.contextAfter[i],
              matchInfo: null,
            });
            existingLineNumbers.add(lineNum);
          }
        }
      }

      currentBlockEnd = Math.max(currentBlockEnd, blockEnd);
    }
  }

  // 推入最后一个块
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  // 对每个块内的行按行号排序
  for (const block of blocks) {
    block.lines.sort((a, b) => a.lineNumber - b.lineNumber);
    block.startLine = block.lines[0]?.lineNumber ?? 0;
  }

  return blocks;
}

/**
 * 响应式 composable：根据匹配列表和上下文行数计算上下文块
 */
export function useContextBlocks(
  matches: Ref<SearchMatch[]>,
  contextLines: Ref<number>
) {
  const blocks = computed(() =>
    buildContextBlocks(matches.value, contextLines.value)
  );
  return { blocks };
}
