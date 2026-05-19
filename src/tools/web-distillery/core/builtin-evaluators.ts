/**
 * 内置程序化提取器
 * 针对特定站点的高精度提取逻辑
 */

/**
 * GitHub 仓库首页提取器
 * 覆盖：仓库首页（文件列表 + README）、Issue/PR、Blob 文件
 */
export function githubRepoEvaluator(doc: Document, url: URL): string | null {
  const pathname = url.pathname;
  let md = "";

  // 1. 获取 Repository 名称和简述
  const repoNameEl = doc.querySelector("strong[itemprop='name'] a") || doc.querySelector("[itemprop='name']");
  if (repoNameEl) {
    md += `# GitHub Repository: ${repoNameEl.textContent?.trim()}\n\n`;
  }
  const aboutEl = doc.querySelector("p.f4") || doc.querySelector(".BorderGrid-cell p");
  if (aboutEl) {
    md += `> ${aboutEl.textContent?.trim()}\n\n`;
  }

  // 2. 获取文件和目录列表
  const fileRows = Array.from(doc.querySelectorAll("tr.react-directory-row, div.react-directory-row"));
  if (fileRows.length > 0) {
    md += `## 文件列表\n`;
    fileRows.forEach((row) => {
      const nameEl = row.querySelector(".react-directory-truncate a, a.Link--primary");
      if (nameEl && nameEl.textContent) {
        const isDir = row.querySelector("svg.icon-directory") || row.querySelector('[aria-label="Directory"]');
        const typeIcon = isDir ? "📁" : "📄";
        const href = (nameEl as HTMLAnchorElement).href || "";
        md += `- ${typeIcon} [${nameEl.textContent.trim()}](${href})\n`;
      }
    });
    md += "\n";
  } else {
    // 旧版 GitHub UI fallback
    const fileLinks = Array.from(doc.querySelectorAll(".js-navigation-item .js-navigation-open"));
    if (fileLinks.length > 0) {
      md += `## 文件列表\n`;
      fileLinks.forEach((link) => {
        if (link.textContent && link.textContent.trim() !== "..") {
          const href = (link as HTMLAnchorElement).href || "";
          md += `- [${link.textContent.trim()}](${href})\n`;
        }
      });
      md += "\n";
    }
  }

  // 3. 获取 README 内容
  const readmeArticle = doc.querySelector("article.markdown-body");
  if (readmeArticle) {
    md += `## README\n\n${readmeArticle.textContent?.trim()}\n`;
  }

  // 4. Issue 或 PR 的内容支持
  const issueTitle = doc.querySelector(".gh-header-title");
  if (issueTitle) {
    md += `# ${issueTitle.textContent?.trim()}\n\n`;
    const comments = doc.querySelectorAll(".timeline-comment");
    comments.forEach((comment) => {
      const author = comment.querySelector(".author");
      const body = comment.querySelector(".comment-body");
      if (author && body) {
        md += `**${author.textContent?.trim()}**: \n${body.textContent?.trim()}\n\n---\n`;
      }
    });
  }

  // 5. Blob 文件（具体代码文件）内容支持
  if (pathname.includes("/blob/")) {
    const blobTextArea = doc.querySelector("textarea#read-only-cursor-text-area") as HTMLTextAreaElement | null;
    if (blobTextArea && blobTextArea.value) {
      const fileNameEl = doc.querySelector("[data-testid='breadcrumbs-filename']") || doc.querySelector("#blob-path");
      const fileName = fileNameEl ? fileNameEl.textContent?.trim() : "Code File";
      md += `## 文件内容: ${fileName}\n\n\`\`\`\n${blobTextArea.value}\n\`\`\`\n`;
    } else {
      // 回退：尝试获取代码区域
      const codeArea =
        doc.querySelector(".js-file-line-container") || doc.querySelector("table[data-paste-markdown-skip]");
      if (codeArea) {
        md += `## 文件代码\n\n\`\`\`\n${codeArea.textContent?.trim()}\n\`\`\`\n`;
      }
    }
  }

  // 只有提取到足够内容才返回
  if (md.length > 50) {
    return md;
  }
  return null;
}

/**
 * GitHub Issue/PR 列表页提取器
 */
export function githubIssueListEvaluator(doc: Document, _url: URL): string | null {
  const issueRows = doc.querySelectorAll("[data-testid='issue-row'], .js-issue-row");
  if (issueRows.length === 0) return null;

  let md = "## Issues\n\n";
  issueRows.forEach((row) => {
    const titleEl = row.querySelector("[data-testid='issue-title-link'], .js-navigation-open");
    const statusEl = row.querySelector("[data-testid='issue-state-icon']");
    if (titleEl) {
      const href = (titleEl as HTMLAnchorElement).href || "";
      const status = statusEl?.getAttribute("aria-label") || "";
      const statusIcon = status.includes("closed") ? "✅" : "🔵";
      md += `- ${statusIcon} [${titleEl.textContent?.trim()}](${href})\n`;
    }
  });

  return md.length > 30 ? md : null;
}
