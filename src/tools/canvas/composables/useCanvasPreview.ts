import { ref } from "vue";
import { debounce } from "lodash-es";

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
  const isRefreshing = ref(false);
  const previewMode = ref<"srcdoc" | "physical">("srcdoc");
  const consoleMessages = ref<ConsoleMessage[]>([]);

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
        result = result.replace(match[0], `<style>/* ${href} */\n${cssContent}</style>`);
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

  // 注入控制台捕获脚本
  function injectConsoleCapture(html: string): string {
    const captureScript = `<script>
(function() {
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
})();
</script>`;
    return html.replace(/<head[^>]*>/i, (match) => match + "\n" + captureScript);
  }

  // 刷新预览（防抖）
  const refreshPreview = debounce(async () => {
    isRefreshing.value = true;
    try {
      srcdoc.value = await buildSrcdoc();
    } finally {
      isRefreshing.value = false;
    }
  }, 300);

  // 强制刷新（不防抖）
  async function forceRefresh() {
    isRefreshing.value = true;
    try {
      srcdoc.value = await buildSrcdoc();
    } finally {
      isRefreshing.value = false;
    }
  }

  // 清空控制台
  function clearConsole() {
    consoleMessages.value = [];
  }

  return {
    srcdoc,
    isRefreshing,
    previewMode,
    consoleMessages,
    refreshPreview,
    forceRefresh,
    clearConsole,
    resolveFileContent,
  };
}