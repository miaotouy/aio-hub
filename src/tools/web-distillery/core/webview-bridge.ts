/**
 * core/webview-bridge.ts - 前端 IPC 通信封装
 * 负责与子 Webview 进行双向通信
 */
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useWebDistilleryStore } from "../stores/store";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("web-distillery/bridge");
const errorHandler = createModuleErrorHandler("web-distillery/bridge");

export type DomExtractedCallback = (html: string, url: string, title: string) => void;

export class WebviewBridge {
  private static instance: WebviewBridge;
  private unlisten: (() => void) | null = null;
  private domExtractedCallbacks: DomExtractedCallback[] = [];
  private cookieExtractedCallbacks: ((cookies: string, url: string) => void)[] = [];
  private elementSelectedCallbacks: ((data: any) => void)[] = [];

  private constructor() {}

  public static getInstance(): WebviewBridge {
    if (!WebviewBridge.instance) {
      WebviewBridge.instance = new WebviewBridge();
    }
    return WebviewBridge.instance;
  }

  /** 初始化监听器 */
  public async init() {
    if (this.unlisten) return;

    this.unlisten = await listen<string>("distillery-message", (event) => {
      try {
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
    const store = useWebDistilleryStore();

    switch (payload.type) {
      case "webview-ready":
        logger.info("Sub-webview is ready");
        break;

      case "dom-extracted":
        this.domExtractedCallbacks.forEach((cb) => cb(payload.html, payload.url, payload.title));
        this.domExtractedCallbacks = [];
        break;

      case "dom-extract-error":
        console.error("[Distillery Bridge] DOM extraction error:", payload.error);
        break;

      case "api-discovered":
        store.addDiscoveredApi({
          url: payload.url,
          method: payload.method,
          contentType: payload.apiType === "json" ? "application/json" : "text/plain",
          bodyPreview: "",
          isJson: payload.apiType === "json",
          timestamp: new Date().toISOString(),
        });
        break;

      case "cookies-extracted":
        this.cookieExtractedCallbacks.forEach((cb) => cb(payload.cookies, payload.url));
        this.cookieExtractedCallbacks = [];
        break;

      case "element-selected":
        this.elementSelectedCallbacks.forEach((cb) => cb(payload.data));
        break;

      default:
        console.log("[Distillery Bridge] Received unknown message:", payload);
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
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.domExtractedCallbacks = this.domExtractedCallbacks.filter((cb) => cb !== callback);
        reject(new Error(`DOM extraction timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const callback: DomExtractedCallback = (html, url, title) => {
        clearTimeout(timer);
        resolve({ html, url, title });
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
    const result = await invoke("distillery_create_webview", { options });
    store.setWebviewCreated(true);
    return result;
  }

  public async navigate(url: string) {
    return await invoke("distillery_navigate", { url });
  }

  public async destroy() {
    const store = useWebDistilleryStore();
    const result = await invoke("distillery_destroy_webview");
    store.setWebviewCreated(false);
    return result;
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
