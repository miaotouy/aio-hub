import { readdirSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

// 用户手册自动发布；开发文档逐篇选入，保持原有路径和仓库内引用。
export const developerPages = new Set([
  "architecture/composables-overview.md",
  "architecture/embedding-infrastructure.md",
  "architecture/llm-apis-architecture.md",
  "architecture/llm-chat-ui-structure.md",
  "architecture/llm-media-infrastructure.md",
  "architecture/model-metadata-system.md",
  "architecture/overview.md",
  "architecture/plugin-async-task-support.md",
  "architecture/services-architecture.md",
  "architecture/settings-architecture-overview.md",
  "architecture/theme-system-architecture.md",
  "architecture/tools-architecture-overview.md",
  "architecture/transcription-architecture.md",
  "architecture/ui-structure-diagram.md",
  "architecture/window-sync-architecture.md",
  "guide/adding-new-tool.md",
  "guide/asset-source-module-guide.md",
  "guide/config-management.md",
  "guide/contribution-guide.md",
  "guide/getting-started.md",
  "guide/llm-chat-plugin-guide.md",
  "guide/logging-error-handling.md",
  "guide/mobile-build.md",
  "guide/mobile-ui-development.md",
  "guide/plugins/async-tasks.md",
  "guide/plugins/hooks-and-extensions.md",
  "guide/plugins/index.md",
  "guide/plugins/js-plugin.md",
  "guide/plugins/native-plugin.md",
  "guide/plugins/plugin-ui.md",
  "guide/plugins/sidecar-plugin.md",
  "guide/state-management-guide.md",
  "guide/tool-registry-guide.md",
  "guide/window-config-system.md",
  "guide/dev-control.md",
  "guide/docs-maintenance.md",
]);

export function isPublishedPage(page: string): boolean {
  return (
    page === "index.md" ||
    page.startsWith("user-guide/") ||
    developerPages.has(page)
  );
}

export function getExcludedPages(): string[] {
  const docsDir = fileURLToPath(new URL("../", import.meta.url));
  const excluded: string[] = [];
  function visit(directory: string) {
    for (const entry of readdirSync(join(docsDir, directory), {
      withFileTypes: true,
    })) {
      const relative = posix.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (![".vitepress", "public", "node_modules"].includes(entry.name))
          visit(relative);
      } else if (entry.name.endsWith(".md") && !isPublishedPage(relative)) {
        excluded.push(relative);
      }
    }
  }
  visit("");
  return excluded;
}

// 公开文章引用仓库源码或内部文档时，在 GitHub 查看原文件。
export function resolveRepositoryLink(href: string, page: string): string {
  if (!href || /^(?:[a-z][a-z\d+.-]*:|#|\/\/)/i.test(href)) return href;
  const [pathname, fragment] = href.split("#", 2);
  const resolved = pathname.startsWith("/")
    ? posix.normalize(pathname.slice(1))
    : posix.normalize(posix.join(posix.dirname(page), pathname));
  const repositoryPath = resolved.startsWith("../")
    ? posix.normalize(posix.join("docs", resolved))
    : null;
  const markdownPath = resolved.endsWith(".md") ? resolved : resolved + ".md";
  if (!repositoryPath && isPublishedPage(markdownPath)) return href;
  if (!repositoryPath && !pathname.endsWith(".md")) return href;
  const target = repositoryPath ?? posix.join("docs", resolved);
  if (target.startsWith("../")) return href;
  const line = target.match(/:(\d+)$/);
  const cleanTarget = target.replace(/:\d+$/, "");
  const anchor = fragment ? "#" + fragment : line ? "#L" + line[1] : "";
  return (
    "https://github.com/miaotouy/aio-hub/blob/main/" + cleanTarget + anchor
  );
}
