/**
 * Stage 4: 结构转换 (Converter)
 * 职责：HTML Element -> Markdown
 */
import type { FetchFormat } from "../../types";
import TurndownService from "turndown";

export class Converter {
  private turndown: TurndownService;

  constructor() {
    this.turndown = new TurndownService({
      headingStyle: "atx",
      hr: "---",
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
    });

    // 排除无意义的空元素或仅含装饰性内容的元素
    this.turndown.addRule("cleanup-empty", {
      filter: ["a", "span", "div", "p"],
      replacement: (content, node) => {
        const el = node as HTMLElement;
        const hasText = !!el.textContent?.trim();
        const hasMedia = !!el.querySelector("img, video, canvas");
        if (!hasText && !hasMedia) return "";
        return content;
      },
    });

    // 防止嵌套链接
    this.turndown.addRule("no-nested-links", {
      filter: (node) => {
        return node.nodeName === "A" && !!(node as HTMLElement).querySelector("a");
      },
      replacement: (content) => content,
    });

    // 集成自定义表格转换逻辑
    this.turndown.addRule("custom-table", {
      filter: "table",
      replacement: (_content, node) => {
        return this.convertTable(node as HTMLElement);
      },
    });

    // 特殊处理图片（支持 data-src 等）
    this.turndown.addRule("custom-img", {
      filter: "img",
      replacement: (_content, node) => {
        const el = node as HTMLElement;
        const src = el.getAttribute("src") || el.getAttribute("data-src") || el.getAttribute("data-actualsrc");
        const alt = el.getAttribute("alt") || "image";
        if (!src) return "";
        return `![${alt}](${src})`;
      },
    });
  }

  /**
   * 转换为目标格式
   */
  public process(element: HTMLElement, format: FetchFormat): string {
    if (format === "html") {
      return element.innerHTML;
    }

    if (format === "text") {
      return element.textContent || "";
    }

    if (format === "json") {
      return JSON.stringify({
        text: element.textContent,
        html: element.innerHTML,
      });
    }

    // 默认转换为 Markdown
    return this.toMarkdown(element);
  }

  private toMarkdown(element: HTMLElement): string {
    return this.turndown.turndown(element).trim();
  }

  /**
   * 将 HTML 表格转换为 Markdown 表格
   */
  private convertTable(table: HTMLElement): string {
    const rows: string[][] = [];
    let hasHeader = false;

    // 提取表头 (thead 或第一个 tr)
    const thead = table.querySelector("thead");
    const tbody = table.querySelector("tbody");
    const allRows = Array.from(table.querySelectorAll("tr"));

    if (allRows.length === 0) return "";

    // 判断是否有表头
    const firstRow = allRows[0];
    const hasThInFirstRow = firstRow.querySelectorAll("th").length > 0;

    if (thead || hasThInFirstRow) {
      hasHeader = true;
      const headerRow = thead ? Array.from(thead.querySelectorAll("tr"))[0] : firstRow;
      if (headerRow) {
        const headers = Array.from(headerRow.querySelectorAll("th, td")).map((cell) =>
          this.getCellText(cell as HTMLElement)
        );
        rows.push(headers);
      }
    }

    // 提取数据行
    const dataRows =
      hasHeader && !thead
        ? allRows.slice(1)
        : tbody
          ? Array.from(tbody.querySelectorAll("tr"))
          : hasHeader
            ? allRows.slice(1)
            : allRows;

    for (const row of dataRows) {
      const cells = Array.from(row.querySelectorAll("td, th")).map((cell) => this.getCellText(cell as HTMLElement));
      if (cells.length > 0) {
        rows.push(cells);
      }
    }

    if (rows.length === 0) return "";

    // 如果没有表头，创建一个空表头
    if (!hasHeader) {
      const colCount = Math.max(...rows.map((r) => r.length));
      const emptyHeader = Array(colCount).fill("");
      rows.unshift(emptyHeader);
    }

    // 计算每列的最大宽度
    const colCount = Math.max(...rows.map((r) => r.length));
    const colWidths = Array(colCount).fill(3); // 最小宽度为 3

    for (const row of rows) {
      for (let i = 0; i < row.length; i++) {
        colWidths[i] = Math.max(colWidths[i], this.getDisplayWidth(row[i]));
      }
    }

    // 限制列宽，避免分隔线过长影响可读性（渲染结果不依赖 - 的数量）
    const MAX_COLUMN_DISPLAY_WIDTH = 20;
    for (let i = 0; i < colWidths.length; i++) {
      colWidths[i] = Math.min(colWidths[i], MAX_COLUMN_DISPLAY_WIDTH);
    }

    // 构建 Markdown 表格
    let md = "\n\n";

    // 表头
    const headerRow = rows[0];
    md += "|";
    for (let i = 0; i < colCount; i++) {
      const cell = headerRow[i] || "";
      md += ` ${this.padCell(cell, colWidths[i])} |`;
    }
    md += "\n";

    // 分隔线
    md += "|";
    for (let i = 0; i < colCount; i++) {
      md += ` ${"-".repeat(colWidths[i])} |`;
    }
    md += "\n";

    // 数据行
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      md += "|";
      for (let j = 0; j < colCount; j++) {
        const cell = row[j] || "";
        md += ` ${this.padCell(cell, colWidths[j])} |`;
      }
      md += "\n";
    }

    md += "\n";
    return md;
  }

  /**
   * 提取单元格文本内容（支持嵌套元素）
   */
  private getCellText(cell: HTMLElement): string {
    // 单元格内部我们也直接用 turndown 来递归转换，这样更统一
    // 注意：单元格内不支持复杂的块级元素，turndown 默认会处理好
    return this.turndown.turndown(cell).replace(/\n+/g, "<br>").trim();
  }

  /**
   * 计算字符串的显示宽度（考虑中文字符，并剔除 Markdown 链接的影响）
   */
  private getDisplayWidth(str: string): number {
    // 剔除 Markdown 链接中的 URL 部分，只保留显示文本: [text](url) -> text
    // 同时也剔除图片链接: ![alt](url) -> alt
    const cleanStr = str.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1");

    let width = 0;
    for (const char of cleanStr) {
      // 中文字符、全角字符占 2 个宽度
      if (/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(char)) {
        width += 2;
      } else {
        width += 1;
      }
    }
    return width;
  }

  /**
   * 填充单元格内容到指定宽度
   */
  private padCell(str: string, width: number): string {
    const displayWidth = this.getDisplayWidth(str);
    const padding = width - displayWidth;
    return str + " ".repeat(Math.max(0, padding));
  }
}
