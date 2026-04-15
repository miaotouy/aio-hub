import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/Diff");

/**
 * 核心 Diff 应用逻辑：应用 Search/Replace 变更
 */
export function applySearchReplaceDiff(originalContent: string, search: string, replace: string): string {
  const stripLineNumbers = (content: string) => {
    return content
      .split(/\r?\n/)
      .map((line) => {
        const match = line.match(/^\s*\d+\s*\|\s?(.*)$/);
        return match ? match[1] : line;
      })
      .join("\n");
  };

  const searchStr = stripLineNumbers(search);
  const replaceStr = stripLineNumbers(replace);

  if (searchStr === "") {
    return originalContent + (originalContent.endsWith("\n") ? "" : "\n") + replaceStr;
  }

  // 1. 尝试简单精确匹配
  if (originalContent.includes(searchStr)) {
    return originalContent.replace(searchStr, replaceStr);
  }

  // 2. 尝试行匹配（处理缩进和末尾空格）
  const resultLines = originalContent.split(/\r?\n/);
  const searchLines = searchStr.split(/\r?\n/);
  const replaceLines = replaceStr.split(/\r?\n/);

  let matchedIndex = -1;

  // 宽松匹配：忽略末尾空格
  const searchLinesNoTrailing = searchLines.map((l) => l.trimEnd());
  for (let j = 0; j <= resultLines.length - searchLinesNoTrailing.length; j++) {
    let match = true;
    for (let k = 0; k < searchLinesNoTrailing.length; k++) {
      if (resultLines[j + k].trimEnd() !== searchLinesNoTrailing[k]) {
        match = false;
        break;
      }
    }
    if (match) {
      matchedIndex = j;
      break;
    }
  }

  // 更宽松匹配：两端 trim
  if (matchedIndex === -1) {
    const searchLinesTrimmed = searchLines.map((l) => l.trim());
    for (let j = 0; j <= resultLines.length - searchLinesTrimmed.length; j++) {
      let match = true;
      for (let k = 0; k < searchLinesTrimmed.length; k++) {
        if (resultLines[j + k].trim() !== searchLinesTrimmed[k]) {
          match = false;
          break;
        }
      }
      if (match) {
        matchedIndex = j;
        break;
      }
    }
  }

  if (matchedIndex !== -1) {
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

    return [...before, ...fixedReplaceLines, ...after].join("\n");
  }

  // 匹配失败
  const context = searchLines.slice(0, 3).join("\n");
  logger.warn("Diff 匹配失败", { searchStr: context });
  throw new Error(`无法匹配代码块。未找到以下内容（前几行）：\n${context}\n请确保 search 部分与文件内容逻辑一致。`);
}
