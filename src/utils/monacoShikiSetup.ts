/**
 * 全局 Monaco + Shiki 主题初始化模块
 *
 * 解决的问题：
 * stream-monaco 库内部调用 shikiToMonaco() 会全局拦截 Monaco 的 editor.setTheme()，
 * 使其只接受 Shiki 注册过的主题名。如果 RichCodeEditor 等组件在此之后尝试使用
 * Monaco 内置主题（如 vs-dark / vs），就会抛出 "Theme 'vs-dark' not found" 错误。
 *
 * 方案：
 * 在应用启动时预注册 dark-plus / light-plus 主题（VS Code 默认主题，视觉效果与
 * Monaco 的 vs-dark / vs 几乎一致），确保所有 Monaco 实例都使用 Shiki 已知的主题名。
 */

import { registerMonacoThemes } from "stream-monaco";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("utils/monacoShikiSetup");
const errorHandler = createModuleErrorHandler("utils/monacoShikiSetup");

let initialized = false;
let initPromise: Promise<void> | null = null;

/**
 * 基础语言列表，覆盖项目中常用的语言
 * stream-monaco 的 CodeBlockNode 会在使用时增量注册更多语言
 */
const BASE_LANGUAGES = [
  "javascript",
  "typescript",
  "json",
  "html",
  "css",
  "markdown",
  "xml",
  "yaml",
  "python",
  "rust",
  "go",
  "java",
  "cpp",
  "c",
  "sql",
  "shell",
  "powershell",
  "toml",
  "dockerfile",
  "vue",
  "jsx",
  "tsx",
  "lua",
];

/**
 * 初始化全局 Monaco Shiki 主题
 *
 * 预注册 dark-plus 和 light-plus 主题到 Shiki highlighter，
 * 并通过 shikiToMonaco 桥接到 Monaco。
 *
 * 此函数是幂等的，多次调用只会执行一次初始化。
 * 不阻塞应用启动——如果初始化失败，Monaco 编辑器仍可使用（只是可能缺少高亮）。
 */
export async function initMonacoShikiThemes(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const [darkTheme, lightTheme] = await Promise.all([
        import("shiki/themes/github-dark.mjs"),
        import("shiki/themes/github-light.mjs"),
      ]);

      // 关键：将 Shiki 主题重命名为 Monaco 原生主题名，以欺骗拦截器并保持兼容性
      const vsDark = { ...darkTheme.default, name: "vs-dark" };
      const vs = { ...lightTheme.default, name: "vs" };

      await registerMonacoThemes([vsDark, vs], BASE_LANGUAGES);

      initialized = true;
      logger.info("全局 Monaco Shiki 主题初始化完成", {
        themes: ["vs-dark", "vs"],
        languageCount: BASE_LANGUAGES.length,
      });
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "Monaco 主题初始化失败",
        showToUser: false,
      });
    }
  })();

  return initPromise;
}

/**
 * 获取当前是否已完成初始化
 */
export function isMonacoShikiReady(): boolean {
  return initialized;
}
