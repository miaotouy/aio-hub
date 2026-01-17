import { Token, ParserContext } from "../types";
import { AstNode } from "../../types";

/**
 * 解析表格
 */
export function parseTable(
  ctx: ParserContext,
  tokens: Token[],
  start: number
): { node: AstNode | null; nextIndex: number } {
  let i = start;

  // 跳过前导换行
  while (i < tokens.length && tokens[i].type === "newline") {
    i++;
  }

  const rows: AstNode[] = [];

  // 先解析分隔符行，提取对齐信息，以便表头也能使用
  // 需要先临时跳过表头行，找到分隔符行
  let tempIndex = i;
  while (tempIndex < tokens.length && tokens[tempIndex].type !== "newline") {
    tempIndex++;
  }
  if (tempIndex < tokens.length) tempIndex++; // 跳过表头后的换行

  // 提取分隔符行
  const aligns: ('left' | 'center' | 'right')[] = [];
  let separatorLine = "";
  while (tempIndex < tokens.length) {
    const t = tokens[tempIndex];
    if (t.type === "newline") {
      break;
    }
    if (t.type === "text") {
      separatorLine += t.content;
    }
    tempIndex++;
  }

  // 解析分隔符以确定对齐方式
  // 格式: |:---|:---:|---:| 或 |---|---|---|
  const separatorCells = separatorLine.split("|").filter(cell => cell.trim());
  for (const cell of separatorCells) {
    const trimmed = cell.trim();
    if (trimmed.startsWith(":") && trimmed.endsWith(":")) {
      aligns.push("center");
    } else if (trimmed.endsWith(":")) {
      aligns.push("right");
    } else {
      aligns.push("left");
    }
  }

  // 解析表头
  const headerCells: AstNode[] = [];
  let cellContent: Token[] = [];
  let headerCellIndex = 0;

  while (i < tokens.length) {
    const t = tokens[i];

    if (t.type === "newline") {
      if (cellContent.length > 0) {
        const cellChildren = ctx.parseInlines(cellContent);
        const align = aligns[headerCellIndex] || "left";
        headerCells.push({
          id: "",
          type: "table_cell",
          props: { isHeader: true, align },
          children: cellChildren,
          meta: { range: { start: 0, end: 0 }, status: "stable" },
        });
      }
      i++;
      break;
    }

    if (t.type === "text") {
      const parts = t.content.split("|");
      for (let j = 0; j < parts.length; j++) {
        const part = parts[j].trim();
        if (part) {
          cellContent.push({ type: "text", content: part });
        }
        if (j < parts.length - 1) {
          // 遇到 | 分隔符，保存当前单元格
          if (cellContent.length > 0) {
            const cellChildren = ctx.parseInlines(cellContent);
            const align = aligns[headerCellIndex] || "left";
            headerCells.push({
              id: "",
              type: "table_cell",
              props: { isHeader: true, align },
              children: cellChildren,
              meta: { range: { start: 0, end: 0 }, status: "stable" },
            });
            cellContent = [];
            headerCellIndex++;
          }
        }
      }
    } else {
      cellContent.push(t);
    }

    i++;
  }

  if (headerCells.length > 0) {
    rows.push({
      id: "",
      type: "table_row",
      props: { isHeader: true },
      children: headerCells,
      meta: { range: { start: 0, end: 0 }, status: "stable" },
    });
  }

  // 跳过分隔符行（已经在前面解析过了）
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "newline") {
      i++;
      break;
    }
    i++;
  }

  // 解析表格内容行
  while (i < tokens.length) {
    const t = tokens[i];

    // 空行或非表格行结束表格
    if (
      t.type === "newline" ||
      t.type === "heading_marker" ||
      t.type === "html_open" ||
      t.type === "hr_marker" ||
      t.type === "code_fence" ||
      t.type === "list_marker" ||
      t.type === "blockquote_marker"
    ) {
      break;
    }

    // 检查是否包含 |
    let hasPipe = false;
    if (t.type === "text" && t.content.includes("|")) {
      hasPipe = true;
    }

    if (!hasPipe) {
      break;
    }

    // 解析数据行
    const dataCells: AstNode[] = [];
    cellContent = [];
    let cellIndex = 0;

    while (i < tokens.length) {
      const tok = tokens[i];

      if (tok.type === "newline") {
        if (cellContent.length > 0) {
          const cellChildren = ctx.parseInlines(cellContent);
          const align = aligns[cellIndex] || "left";
          dataCells.push({
            id: "",
            type: "table_cell",
            props: { align },
            children: cellChildren,
            meta: { range: { start: 0, end: 0 }, status: "stable" },
          });
        }
        i++;
        break;
      }

      if (tok.type === "text") {
        const parts = tok.content.split("|");
        for (let j = 0; j < parts.length; j++) {
          const part = parts[j].trim();
          if (part) {
            cellContent.push({ type: "text", content: part });
          }
          if (j < parts.length - 1) {
            if (cellContent.length > 0) {
              const cellChildren = ctx.parseInlines(cellContent);
              const align = aligns[cellIndex] || "left";
              dataCells.push({
                id: "",
                type: "table_cell",
                props: { align },
                children: cellChildren,
                meta: { range: { start: 0, end: 0 }, status: "stable" },
              });
              cellContent = [];
              cellIndex++;
            }
          }
        }
      } else {
        cellContent.push(tok);
      }

      i++;
    }

    if (dataCells.length > 0) {
      rows.push({
        id: "",
        type: "table_row",
        props: {},
        children: dataCells,
        meta: { range: { start: 0, end: 0 }, status: "stable" },
      });
    }
  }

  if (rows.length === 0) {
    return { node: null, nextIndex: i };
  }

  return {
    node: {
      id: "",
      type: "table",
      props: { align: aligns },
      children: rows,
      meta: { range: { start: 0, end: 0 }, status: "stable" },
    },
    nextIndex: i,
  };
}
