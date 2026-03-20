/**
 * core/webview-bridge.ts - 前端 IPC 通信封装
 * 负责与子 Webview 进行双向通信
 */
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useWebDistilleryStore } from "../stores/store";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getLocalISOString } from "@/utils/time";

const logger = createModuleLogger("web-distillery/bridge");
const errorHandler = createModuleErrorHandler("web-distillery/bridge");

export type DomExtractedCallback = (error: Error | null, html?: string, url?: string, title?: string) => void;

export class WebviewBridge {
  private static instance: WebviewBridge;
  private unlisten: (() => void) | null = null;
  private domExtractedCallbacks: DomExtractedCallback[] = [];
  private cookieExtractedCallbacks: ((cookies: string, url: string) => void)[] = [];
  private elementSelectedCallbacks: ((data: any) => void)[] = [];

  private constructor() { }

  public static getInstance(): WebviewBridge {
    if (!WebviewBridge.instance) {
      WebviewBridge.instance = new WebviewBridge();
    }
    return WebviewBridge.instance;
  }

  /** 初始化监听器 */
  public async init() {
    if (this.unlisten) return;

    // 1. 监听来自 window.opener.postMessage 的跨窗口消息
    // 这是处理外部 URL 子 Webview 消息的最稳健方式
    window.addEventListener('message', async (event) => {
      if (event.data && event.data.source === 'distillery-sub-webview') {
        const { payload } = event.data;
        logger.debug("Received postMessage from sub-webview", { type: payload.type });
        
        // 转发到 Rust 命令（由主窗口发起，拥有完整权限）
        try {
          await invoke('distillery_forward_message', { payload });
        } catch (e) {
          logger.error("Failed to forward sub-webview message to Rust", e);
        }
      }
    });

    // 2. 监听来自 Rust 的事件总线
    this.unlisten = await listen<string>("distillery-message", (event) => {
      try {
        logger.debug("Received distillery-message event", {
          payload: event.payload,
          timestamp: new Date().toISOString()
        });
        const payload = JSON.parse(event.payload);
        this.handleMessage(payload);
      } catch (e) {
        errorHandler.handle(e, {
          userMessage: "解析子 Webview 消息失败",
          context: { payload: event.payload },
        });
      }
    });
  }

  /** 处理来自子 Webview 的消息 */
  private handleMessage(payload: any) {
    try {
      const store = useWebDistilleryStore();

      logger.debug(`Handling message type: ${payload.type}`);
      switch (payload.type) {
        case "webview-ready":
          logger.info("Sub-webview DOM content loaded (webview-ready)");
          break;

        case "page-loaded":
          logger.info("Sub-webview page fully loaded (page-loaded)");
          break;

        case "dom-extracted":
          logger.info("DOM extraction successful", {
            url: payload.url,
            title: payload.title,
            htmlLength: payload.html?.length
          });
          this.domExtractedCallbacks.forEach((cb) => {
            try {
              cb(null, payload.html, payload.url, payload.title);
            } catch (err) {
              logger.error("DOM extracted callback error", err);
            }
          });
          this.domExtractedCallbacks = [];
          break;

        case "dom-extract-error":
          logger.error("DOM extraction error reported by webview", { error: payload.error });
          this.domExtractedCallbacks.forEach((cb) => {
            try {
              cb(new Error(payload.error || "DOM extraction error from webview"));
            } catch (err) {
              logger.error("DOM extracted callback error handling failed", err);
            }
          });
          this.domExtractedCallbacks = [];
          break;

        case "api-discovered":
          store.addDiscoveredApi({
            url: payload.url,
            method: payload.method,
            contentType: payload.apiType === "json" ? "application/json" : "text/plain",
            bodyPreview: "",
            isJson: payload.apiType === "json",
            timestamp: getLocalISOString(),
          });
          break;

        case "cookies-extracted":
          this.cookieExtractedCallbacks.forEach((cb) => {
            try {
              cb(payload.cookies, payload.url);
            } catch (err) {
              logger.error("Cookie extracted callback error", err);
            }
          });
          this.cookieExtractedCallbacks = [];
          break;

        case "element-selected":
          this.elementSelectedCallbacks.forEach((cb) => {
            try {
              cb(payload.data);
            } catch (err) {
              logger.error("Element selected callback error", err);
            }
          });
          break;

        case "window-error":
          logger.error("Sub-webview runtime error", {
            message: payload.message,
            source: payload.source,
            line: payload.line,
            stack: payload.stack,
          });
          break;

        default:
          logger.debug("Received unknown message type", { type: payload.type });
      }
    } catch (err) {
      logger.error("Error handling webview message", err);
    }
  }

  /** 获取选择器拾取脚本内容 */
  private async getPickerScript(): Promise<string> {
    // 简单起见，这里通过 fetch 加载。
    // 注意：路径相对于 index.html 所在的运行目录
    const response = await fetch("/src/tools/web-distillery/inject/selector-picker.js");
    return await response.text();
  }

  /** 开启元素拾取模式 */
  public async enablePicker(onSelected: (data: any) => void) {
    const script = await this.getPickerScript();
    await this.evalScript(script);
    await this.evalScript(`window.__distillerySelectorPicker.enable()`);
    this.elementSelectedCallbacks.push(onSelected);
  }

  /** 关闭元素拾取模式 */
  public async disablePicker() {
    await this.evalScript(`window.__distillerySelectorPicker.disable()`);
    this.elementSelectedCallbacks = [];
  }

  /** 等待并获取 DOM 提取结果（Promise 封装） */
  public waitForDomExtracted(timeoutMs = 15000): Promise<{ html: string; url: string; title: string }> {
    logger.debug("Starting to wait for DOM extraction", { timeoutMs });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.domExtractedCallbacks = this.domExtractedCallbacks.filter((cb) => cb !== callback);
        const error = new Error(`DOM extraction timed out after ${timeoutMs}ms (Frontend Promise)`);
        logger.error(error.message, {
          timeoutMs,
          pendingCallbacks: this.domExtractedCallbacks.length
        });
        reject(error);
      }, timeoutMs);

      const callback: DomExtractedCallback = (error, html, url, title) => {
        logger.debug("DOM extraction callback received", { success: !error });
        clearTimeout(timer);
        if (error) {
          reject(error);
        } else {
          resolve({ html: html!, url: url!, title: title! });
        }
      };
      this.domExtractedCallbacks.push(callback);
    });
  }

  /** 销毁监听器 */
  public dispose() {
    if (this.unlisten) {
      this.unlisten();
      this.unlisten = null;
    }
    this.domExtractedCallbacks = [];
    this.cookieExtractedCallbacks = [];
    this.elementSelectedCallbacks = [];
  }

  /** 终极强制清理：销毁 Webview 并重置所有状态 */
  public async forceCleanup() {
    logger.info("Force cleanup triggered");

    // 1. 尝试销毁 Webview
    try {
      await this.destroy();
    } catch (e) {
      logger.debug("Force cleanup: destroy webview failed (possibly already gone)", e);
    }

    // 2. 清理所有回调和监听器
    this.domExtractedCallbacks = [];
    this.cookieExtractedCallbacks = [];
    this.elementSelectedCallbacks = [];

    const store = useWebDistilleryStore();
    store.setLoading(false);
    store.setWebviewCreated(false);
  }

  // --- 命令封装 ---

  public async createWebview(options: {
    url: string;
    x: number;
    y: number;
    width: number;
    height: number;
    headless?: boolean;
  }) {
    const store = useWebDistilleryStore();
    // 如果已经创建了，先销毁
    if (store.isWebviewCreated) {
      try {
        await this.destroy();
      } catch (e) {
        logger.debug("Auto destroy failed before create", e);
      }
    }
    const result = await invoke("distillery_create_webview", { options });
    store.setWebviewCreated(true);
    return result;
  }

  public async navigate(url: string) {
    return await invoke("distillery_navigate", { url });
  }

  public async destroy() {
    const store = useWebDistilleryStore();
    try {
      const result = await invoke("distillery_destroy_webview");
      return result;
    } finally {
      store.setWebviewCreated(false);
    }
  }

  public async resize(x: number, y: number, width: number, height: number) {
    return await invoke("distillery_resize", { x, y, width, height });
  }

  public async evalScript(script: string) {
    return await invoke("distillery_eval", { script });
  }

  public async extractDom(waitFor?: string, waitTimeoutMs?: number): Promise<string> {
    return await invoke<string>("distillery_extract_dom", {
      waitFor: waitFor ?? null,
      waitTimeoutMs: waitTimeoutMs ?? 10000,
    });
  }

  public async getCookies(): Promise<string> {
    return await invoke("distillery_get_cookies");
  }

  public async setCookie(cookieStr: string) {
    return await invoke("distillery_set_cookie", { cookieStr });
  }

  /** 等待并获取 Cookie 提取结果 */
  public waitForCookiesExtracted(timeoutMs = 5000): Promise<{ cookies: string; url: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cookieExtractedCallbacks = this.cookieExtractedCallbacks.filter((cb) => cb !== callback);
        reject(new Error(`Cookie extraction timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const callback = (cookies: string, url: string) => {
        clearTimeout(timer);
        resolve({ cookies, url });
      };
      this.cookieExtractedCallbacks.push(callback);
    });
  }
}

export const webviewBridge = WebviewBridge.getInstance();
