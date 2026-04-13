import { ref, computed } from "vue";
import { debounce } from "lodash-es";
import { convertFileSrc } from "@tauri-apps/api/core";

export interface ConsoleMessage {
  id: string;
  level: "log" | "warn" | "error" | "info";
  args: string[];
  timestamp: number;
}

// 文件内容解析器
export function useCanvasPreview(options: {
  canvasId: () => string | null;
  pendingUpdates: () => Record<string, string>;
  readPhysicalFile: (canvasId: string, filepath: string) => Promise<string | null>;
  basePath: () => string | null;
}) {
  const srcdoc = ref("");
  const physicalSrc = ref("");
  const isRefreshing = ref(false);
  const previewMode = ref<"srcdoc" | "physical">("srcdoc");
  const consoleMessages = ref<ConsoleMessage[]>([]);

  // 影子文件覆盖策略：当有影子文件时，强制回退到 srcdoc 模式以实时预览
  const effectiveMode = computed(() => {
    const pending = options.pendingUpdates();
    if (Object.keys(pending).length > 0) {
      return "srcdoc";
    }
    return previewMode.value;
  });

  // 解析文件内容：优先影子文件，回退物理文件
  async function resolveFileContent(filepath: string): Promise<string> {
    const canvasId = options.canvasId();
    if (!canvasId) return "";

    const pending = options.pendingUpdates();
    if (pending[filepath] !== undefined) return pending[filepath];

    const content = await options.readPhysicalFile(canvasId, filepath);
    return content ?? "";
  }

  // 构建 srcdoc：将 CSS/JS 引用内联化
  async function buildSrcdoc(): Promise<string> {
    let html = await resolveFileContent("index.html");
    if (!html) return "";

    // 内联 <link rel="stylesheet" href="xxx.css">
    html = await inlineCssReferences(html);
    // 内联 <script src="xxx.js">
    html = await inlineJsReferences(html);
    // 注入控制台捕获脚本
    html = injectConsoleCapture(html);

    return html;
  }

  // 正则匹配并内联 CSS
  async function inlineCssReferences(html: string): Promise<string> {
    const linkRegex = /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi;
    const linkRegex2 = /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi;

    let result = html;
    for (const regex of [linkRegex, linkRegex2]) {
      const matches = [...result.matchAll(regex)];
      for (const match of matches) {
        const href = match[1];
        if (href.startsWith("http://") || href.startsWith("https://")) continue;
        const cssContent = await resolveFileContent(href);
        // 添加 data-file 属性以便 CSS 热替换定位
        result = result.replace(match[0], `<style data-file="${href}">/* ${href} */\n${cssContent}</style>`);
      }
    }
    return result;
  }

  // 正则匹配并内联 JS
  async function inlineJsReferences(html: string): Promise<string> {
    const scriptRegex = /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi;
    let result = html;
    const matches = [...result.matchAll(scriptRegex)];
    for (const match of matches) {
      const src = match[1];
      if (src.startsWith("http://") || src.startsWith("https://")) continue;
      const jsContent = await resolveFileContent(src);
      result = result.replace(match[0], `<script>/* ${src} */\n${jsContent}</script>`);
    }
    return result;
  }

  // 注入控制台捕获脚本与热替换监听
  function injectConsoleCapture(html: string): string {
    const captureScript = `<script>
(function() {
  // 1. 控制台捕获
  const origConsole = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  function send(level, args) {
    try {
      window.parent.postMessage({
        type: 'canvas-console',
        level: level,
        args: Array.from(args).map(a => {
          try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
          catch(e) { return String(a); }
        }),
        timestamp: Date.now()
      }, '*');
    } catch(e) {}
  }
  console.log = function() { send('log', arguments); origConsole.log.apply(console, arguments); };
  console.warn = function() { send('warn', arguments); origConsole.warn.apply(console, arguments); };
  console.error = function() { send('error', arguments); origConsole.error.apply(console, arguments); };
  console.info = function() { send('info', arguments); origConsole.info.apply(console, arguments); };
  window.addEventListener('error', function(e) {
    send('error', [e.message + ' at ' + e.filename + ':' + e.lineno]);
  });

  // 2. CSS 热替换监听
  window.addEventListener('message', function(e) {
    if (e.data?.type === 'canvas-css-reload') {
      // 处理外部 link 标签
      const links = document.querySelectorAll('link[rel="stylesheet"]');
      links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('http')) {
          // 添加时间戳强制刷新
          const url = new URL(link.getAttribute('href'), window.location.href);
          url.searchParams.set('t', Date.now().toString());
          link.setAttribute('href', url.pathname + url.search);
        }
      });
      // 处理内联 style 标签 (srcdoc 模式)
      if (e.data.styles) {
        Object.entries(e.data.styles).forEach(([filename, content]) => {
          const style = document.querySelector(\`style[data-file="\${filename}"]\`);
          if (style) style.textContent = content;
        });
      }
    }
  });
})();
</script>`;
    return html.replace(/<head[^>]*>/i, (match) => match + "\n" + captureScript);
  }

  // 构建物理路径预览 URL
  async function buildPhysicalPreview() {
    const path = options.basePath();
    if (!path) return "";
    // Windows 路径分隔符替换为 /
    const normalizedPath = path.replace(/\\/g, "/");
    return convertFileSrc(normalizedPath + "/index.html");
  }

  // CSS 热替换
  function hotReloadCss(changedFiles: Record<string, string>, iframe: HTMLIFrameElement | null) {
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage(
      {
        type: "canvas-css-reload",
        styles: changedFiles,
      },
      "*",
    );
  }

  // 刷新预览（防抖）
  const refreshPreview = debounce(async (iframe?: HTMLIFrameElement | null) => {
    // 检查是否可以进行 CSS 热替换
    const pending = options.pendingUpdates();
    const changedFiles = Object.keys(pending);
    const isOnlyCss = changedFiles.length > 0 && changedFiles.every((f) => f.endsWith(".css"));

    if (isOnlyCss && iframe) {
      hotReloadCss(pending, iframe);
      return;
    }

    isRefreshing.value = true;
    try {
      if (effectiveMode.value === "srcdoc") {
        srcdoc.value = await buildSrcdoc();
      } else {
        physicalSrc.value = await buildPhysicalPreview();
      }
    } finally {
      isRefreshing.value = false;
    }
  }, 300);

  // 强制刷新（不防抖）
  async function forceRefresh() {
    isRefreshing.value = true;
    try {
      if (effectiveMode.value === "srcdoc") {
        srcdoc.value = await buildSrcdoc();
      } else {
        physicalSrc.value = await buildPhysicalPreview();
      }
    } finally {
      isRefreshing.value = false;
    }
  }

  function setPreviewMode(mode: "srcdoc" | "physical") {
    previewMode.value = mode;
    forceRefresh();
  }

  // 清空控制台
  function clearConsole() {
    consoleMessages.value = [];
  }

  return {
    srcdoc,
    physicalSrc,
    isRefreshing,
    previewMode,
    effectiveMode,
    consoleMessages,
    refreshPreview,
    forceRefresh,
    clearConsole,
    resolveFileContent,
    setPreviewMode,
  };
}
