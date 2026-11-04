// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { ref, onScopeDispose } from "vue";
import { debounce } from "lodash-es";
import { createCanvasHtmlPreview } from "@/platform/modules/html-preview";
import { isElectronRuntime } from "@/platform/core/env";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("Canvas/Preview");
const errorHandler = createModuleErrorHandler("Canvas/Preview");

export interface ConsoleMessage {
  id: string;
  level: "log" | "warn" | "error" | "info";
  args: string[];
  timestamp: number;
}

function resolvePreviewRelativePath(entryFile: string, reference: string) {
  const path = reference.split(/[?#]/, 1)[0];
  if (!path || /^(?:[a-z][a-z+.-]*:|\/|#)/i.test(path)) return null;

  const baseSegments = entryFile.split("/").slice(0, -1);
  const resolved: string[] = [];
  for (const segment of [...baseSegments, ...path.split("/")]) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (!resolved.length) return null;
      resolved.pop();
      continue;
    }
    resolved.push(segment);
  }
  return resolved.join("/");
}

/**
 * 将待审批的 CSS / JS 覆盖文件内联到 srcdoc，让预览可以使用内存候选内容，
 * 保留磁盘上的原文件。其他静态资源通过当前宿主的项目资源来源读取。
 */
function inlinePreviewOverrides(
  content: string,
  entryFile: string,
  overrides: Record<string, string>
) {
  if (!Object.keys(overrides).length) return content;

  const inlineStyles = content.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = tag.match(/\brel\s*=\s*(["'])(.*?)\1/i)?.[2] || "";
    const href = tag.match(/\bhref\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!/\bstylesheet\b/i.test(rel) || !href) return tag;

    const path = resolvePreviewRelativePath(entryFile, href);
    const css = path ? overrides[path] : undefined;
    return css === undefined
      ? tag
      : `<style data-canvas-preview-overlay="${path}">${css}</style>`;
  });

  return inlineStyles.replace(
    /<script\b([^>]*)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>\s*<\/script\s*>/gi,
    (tag, before: string, _quote: string, src: string, after: string) => {
      const path = resolvePreviewRelativePath(entryFile, src);
      const script = path ? overrides[path] : undefined;
      return script === undefined
        ? tag
        : `<script${before}${after}>${script}</script>`;
    }
  );
}

/**
 * Canvas 预览引擎 (Physical-First 架构)
 * Electron 使用独立项目预览来源，Tauri 使用 asset:// 加载物理文件
 */
export function useCanvasPreview(options: {
  canvasId: () => string | null;
  basePath: () => string | null;
  entryFile?: () => string;
  readFile: (canvasId: string, path: string) => Promise<string | null>;
  previewOverrides?: () => Record<string, string>;
}) {
  const previewSrc = ref("");
  const previewSrcdoc = ref("");
  const isRefreshing = ref(false);
  const consoleMessages = ref<ConsoleMessage[]>([]);
  const htmlPreview = createCanvasHtmlPreview();
  let generation = 0,
    disposed = false;

  /**
   * 刷新预览 (防抖)
   */
  const refreshPreview = debounce(async () => {
    const current = ++generation;
    try {
      const canvasId = options.canvasId();
      const path = options.basePath();
      const entry = options.entryFile?.() || "index.html";

      if (!canvasId || !path) return;

      // 读取入口文件内容
      const entryContent = await options.readFile(canvasId, entry);
      if (disposed || current !== generation) return;
      if (entryContent === null) {
        previewSrc.value = "";
        previewSrcdoc.value = "<h1>Error: Entry file not found</h1>";
        return;
      }

      let content = inlinePreviewOverrides(
        entryContent,
        entry,
        options.previewOverrides?.() || {}
      );

      const source = await htmlPreview.render(
        { canvasId, basePath: path },
        (finalBaseUrl) => {
          logger.info("预览 Base URL 已构建", {
            originalPath: path,
            finalBaseUrl,
          });
          // 注入 <base> 标签以解决相对路径问题
          // 同时也注入控制台捕获脚本 (参考项目惯例)
          const injectedScript = `
      <script>
        (function() {
          const originalLog = console.log;
          const originalWarn = console.warn;
          const originalError = console.error;
          const originalInfo = console.info;

          function sendToHost(level, args) {
            window.parent.postMessage({
              type: 'canvas-console',
              level: level,
              args: Array.from(args).map(arg => {
                try { return typeof arg === 'object' ? JSON.stringify(arg) : String(arg); }
                catch(e) { return '[Unserializable]'; }
              }),
              timestamp: Date.now()
            }, '*');
          }

          function sendErrorToHost(errorData) {
            // 避免发送空消息
            if (!errorData.message) return;
            
            window.parent.postMessage({
              type: 'canvas-runtime-error',
              ...errorData,
              timestamp: Date.now()
            }, '*');
          }

          console.log = function() { sendToHost('log', arguments); originalLog.apply(console, arguments); };
          console.warn = function() {
            sendToHost('warn', arguments);
            originalWarn.apply(console, arguments);
            sendErrorToHost({
              level: 'warn',
              message: Array.from(arguments).map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
            });
          };
          console.error = function() {
            sendToHost('error', arguments);
            originalError.apply(console, arguments);
            
            const message = Array.from(arguments).map(arg => {
              if (arg instanceof Error) return arg.message;
              return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            }).join(' ');
            
            const firstArg = arguments[0];
            sendErrorToHost({
              level: 'error',
              message: message,
              stack: firstArg instanceof Error ? firstArg.stack : new Error().stack
            });
          };
          console.info = function() { sendToHost('info', arguments); originalInfo.apply(console, arguments); };

          // 1. 全局错误捕获
          window.addEventListener('error', function(event) {
            // 忽略资源加载错误（message 为空）
            if (!event.message && (event.target?.src || event.target?.href)) {
              sendErrorToHost({
                level: 'warn',
                message: 'Failed to load resource: ' + (event.target.src || event.target.href),
                filename: event.target.src || event.target.href
              });
              return;
            }

            sendErrorToHost({
              level: 'error',
              message: event.message || 'Unknown runtime error',
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
              stack: event.error?.stack
            });
          }, true); // 使用捕获阶段以捕获资源错误

          // 2. 未处理的 Promise Rejection
          window.addEventListener('unhandledrejection', function(event) {
            const reason = event.reason;
            sendErrorToHost({
              level: 'error',
              message: reason?.message || String(reason),
              stack: reason?.stack || 'No stack trace available'
            });
          });
        })();
      </script>
    `;

          // 预览内容属于不可信项目代码：在 iframe 内再施加最小 CSP，
          // 即使宿主应用的全局 CSP 因兼容性而宽松，也不能让预览继承该权限边界。
          const localResources = isElectronRuntime()
            ? "aiohub://canvas-preview"
            : "asset:";
          const previewCsp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob: ${localResources} http: https:; style-src 'unsafe-inline' ${localResources} http: https:; img-src data: blob: ${localResources} http: https:; font-src data: ${localResources} http: https:; media-src data: blob: ${localResources} http: https:; connect-src http: https: ws: wss:; frame-src http: https:; object-src 'none'; form-action 'none'">`;
          const baseTag = `<base href="${finalBaseUrl}">`;
          const injectedHead = `${previewCsp}\n    ${baseTag}\n    ${injectedScript}`;

          // 注入到 <head> 开头，确保 CSP 出现在项目自身脚本之前。
          if (content.includes("<head>")) {
            content = content.replace("<head>", `<head>\n    ${injectedHead}`);
          } else if (content.includes("<html>")) {
            content = content.replace(
              "<html>",
              `<html>\n<head>\n    ${injectedHead}\n</head>`
            );
          } else {
            content = `${previewCsp}\n${baseTag}\n${injectedScript}\n${content}`;
          }

          return content;
        }
      );
      if (disposed || current !== generation) return;
      previewSrcdoc.value = source.srcdoc;
      previewSrc.value = source.src;
    } catch (error) {
      if (!disposed && current === generation)
        errorHandler.error(error, "更新画布预览失败");
    }
  }, 300);
  onScopeDispose(() => {
    disposed = true;
    generation++;
    refreshPreview.cancel();
    void htmlPreview
      .dispose()
      .catch((error) => logger.warn("释放画布预览失败", error));
  });

  /**
   * 强制刷新 (不防抖)
   */
  function forceRefresh() {
    refreshPreview();
  }

  /**
   * 清空控制台
   */
  function clearConsole() {
    consoleMessages.value = [];
  }

  return {
    previewSrc,
    previewSrcdoc,
    isRefreshing,
    consoleMessages,
    refreshPreview,
    forceRefresh,
    clearConsole,
  };
}
