/**
 * core/iframe-bridge.ts - Iframe 通信封装
 */
import { invoke } from "@tauri-apps/api/core";
import { useWebDistilleryStore } from "../stores/store";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getLocalISOString } from "@/utils/time";

const logger = createModuleLogger("web-distillery/iframe-bridge");
const errorHandler = createModuleErrorHandler("web-distillery/iframe-bridge");

export type DomExtractedCallback = (error: Error | null, html?: string, url?: string, title?: string) => void;

export class IframeBridge {
  private static instance: IframeBridge;
  private iframe: HTMLIFrameElement | null = null;
  private proxyPort: number | null = null;
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  private domExtractedCallbacks: DomExtractedCallback[] = [];
  private cookieExtractedCallbacks: ((cookies: string, url: string) => void)[] = [];
  private elementSelectedCallbacks: ((data: any) => void)[] = [];

  private constructor() {}

  public static getInstance(): IframeBridge {
    if (!IframeBridge.instance) {
      IframeBridge.instance = new IframeBridge();
    }
    return IframeBridge.instance;
  }

  public async init(): Promise<void> {
    try {
      // 1. 尝试获取现有端口
      const existingPort = await invoke<number>("distillery_get_proxy_port").catch(() => 0);

      if (existingPort > 0) {
        this.proxyPort = existingPort;
      } else {
        // 2. 如果没有运行，则启动它
        this.proxyPort = await invoke<number>("distillery_start_proxy");
      }

      logger.info("Proxy server initialized", { port: this.proxyPort });
    } catch (e) {
      this.proxyPort = null; // 失败时重置，允许重试
      logger.error("Failed to initialize proxy server", e);
      throw e;
    }

    if (!this.messageHandler) {
      this.messageHandler = (event: MessageEvent) => {
        if (this.iframe && event.source === this.iframe.contentWindow) {
          this.handleMessage(event.data);
        }
      };
      window.addEventListener("message", this.messageHandler);
    }
  }

  public async create(options: { url: string; hidden?: boolean; container: HTMLElement }): Promise<void> {
    await this.init();
    this.destroyIframe();

    const store = useWebDistilleryStore();

    this.iframe = document.createElement("iframe");
    this.iframe.className = "distillery-iframe";
    this.iframe.style.border = "none";
    this.iframe.style.width = "100%";
    this.iframe.style.height = "100%";
    this.iframe.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-popups");

    if (options.hidden) {
      this.iframe.style.position = "absolute";
      this.iframe.style.left = "-9999px";
      this.iframe.style.top = "-9999px";
      this.iframe.style.visibility = "hidden";
      this.iframe.style.width = "1920px";
      this.iframe.style.height = "5000px";
    }

    options.container.appendChild(this.iframe);

    const proxyUrl = "http://127.0.0.1:" + this.proxyPort + "/proxy?url=" + encodeURIComponent(options.url);

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.iframe) this.iframe.onload = null;
        reject(new Error("Iframe 加载超时"));
      }, 30000);

      this.iframe!.onload = () => {
        clearTimeout(timeout);
        store.setWebviewCreated(true);
        resolve();
      };
      this.iframe!.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Iframe 加载失败"));
      };

      this.iframe!.src = proxyUrl;
    });
  }

  private handleMessage(payload: any) {
    try {
      const store = useWebDistilleryStore();
      if (!payload || typeof payload !== "object") return;

      switch (payload.type) {
        case "dom-extracted":
          this.domExtractedCallbacks.forEach((cb) => cb(null, payload.html, payload.url, payload.title));
          this.domExtractedCallbacks = [];
          break;
        case "dom-extract-error":
          this.domExtractedCallbacks.forEach((cb) => cb(new Error(payload.error || "DOM extraction error")));
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
          this.cookieExtractedCallbacks.forEach((cb) => cb(payload.cookies, payload.url));
          this.cookieExtractedCallbacks = [];
          break;
        case "element-selected":
          if (store.pickerMode === "action" && store.pickerActionIndex !== null) {
            // 路由到动作序列拾取
            const index = store.pickerActionIndex;
            const step = store.recipeDraft?.actions?.[index];
            if (step && "selector" in step) {
              const updatedStep = { ...step, selector: payload.data.selector };
              store.updateAction(index, updatedStep as any);
            }
            store.setPickerMode("idle");
          } else {
            this.elementSelectedCallbacks.forEach((cb) => cb(payload.data));
          }
          break;
        case "element-hovered":
          store.setHoveredElement(payload.data);
          break;
        case "picker-cancelled":
          store.setPickerMode("idle");
          break;
      }
    } catch (err) {
      errorHandler.handle(err, { userMessage: "处理 Iframe 消息失败" });
    }
  }

  public async evalScript(script: string): Promise<void> {
    if (!this.iframe?.contentWindow) throw new Error("Iframe not available");
    this.iframe.contentWindow.postMessage({ type: "__distillery_eval", script }, "*");
  }

  /**
   * 提取当前 Iframe DOM 快照（用于实时预览）
   * 区别于原有 extractDom：不 wait for selector，直接拿当前状态
   */
  public async extractCurrentDom(): Promise<{ html: string; url: string; title: string }> {
    const script = `
      (function() {
        if (window.__DISTILLERY_BRIDGE__) {
          window.__DISTILLERY_BRIDGE__.send({
            type: 'dom-extracted',
            html: document.documentElement.outerHTML,
            url: window.location.href,
            title: document.title
          });
        }
      })();
    `;

    const promise = this.waitForDomExtracted(5000);
    await this.evalScript(script);
    return promise;
  }

  public async extractDom(waitFor?: string, waitTimeoutMs?: number): Promise<string> {
    const timeoutMs = waitTimeoutMs || 10000;
    const selectorJson = waitFor ? JSON.stringify(waitFor) : "null";

    const extractScript =
      `
      (function() {
        const selector = ` +
      selectorJson +
      `;
        const startTime = Date.now();
        const timeout = ` +
      timeoutMs +
      `;
        function tryExtract() {
          const isReady = document.readyState === 'complete' || document.readyState === 'interactive';
          const elementFound = !selector || !!document.querySelector(selector);
          if (isReady && elementFound) {
            performExtraction();
          } else if (Date.now() - startTime < timeout) {
            setTimeout(tryExtract, 250);
          } else {
            performExtraction();
          }
        }
        function performExtraction() {
          try {
            const payload = {
              type: 'dom-extracted',
              html: document.documentElement.outerHTML,
              url: window.location.href,
              title: document.title
            };
            if (window.__DISTILLERY_BRIDGE__) window.__DISTILLERY_BRIDGE__.send(payload);
          } catch(e) {
            if (window.__DISTILLERY_BRIDGE__) window.__DISTILLERY_BRIDGE__.send({ type: 'dom-extract-error', error: e.message });
          }
        }
        tryExtract();
      })();
    `;

    await this.evalScript(extractScript);
    return "extraction-triggered";
  }

  public waitForDomExtracted(timeoutMs = 15000): Promise<{ html: string; url: string; title: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("DOM extraction timed out after " + timeoutMs + "ms"));
      }, timeoutMs);

      const callback: DomExtractedCallback = (error, html, url, title) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve({ html: html!, url: url!, title: title! });
      };
      this.domExtractedCallbacks.push(callback);
    });
  }

  private async getPickerScript(): Promise<string> {
    const response = await fetch("/src/tools/web-distillery/inject/selector-picker.js");
    return await response.text();
  }

  public async enablePicker(
    optionsOrCb: { mode: string; continuous?: boolean } | ((data: any) => void),
    onSelected?: (data: any) => void,
  ) {
    const script = await this.getPickerScript();
    await this.evalScript(script);

    let options = { mode: "include", continuous: true };
    let callback = onSelected;

    if (typeof optionsOrCb === "function") {
      callback = optionsOrCb;
    } else {
      options = { ...options, ...optionsOrCb };
    }

    const optionsJson = JSON.stringify(options);
    await this.evalScript("window.__distillerySelectorPicker.enable(" + optionsJson + ")");
    if (callback) {
      this.elementSelectedCallbacks = [callback];
    }
  }

  public async disablePicker() {
    await this.evalScript("window.__distillerySelectorPicker.disable()");
    this.elementSelectedCallbacks = [];
  }

  public async addHighlight(selector: string, mode: string) {
    await this.evalScript(
      `window.__distillerySelectorPicker.addHighlight(${JSON.stringify(selector)}, ${JSON.stringify(mode)})`,
    );
  }

  public async removeHighlight(selector: string) {
    await this.evalScript(`window.__distillerySelectorPicker.removeHighlight(${JSON.stringify(selector)})`);
  }

  public async clearHighlights() {
    await this.evalScript(`window.__distillerySelectorPicker.clearHighlights()`);
  }

  public async syncHighlights() {
    await this.evalScript(`window.__distillerySelectorPicker.syncHighlights()`);
  }

  public async getCookies(): Promise<string> {
    const script = `
      (function() {
        if (window.__DISTILLERY_BRIDGE__) {
          window.__DISTILLERY_BRIDGE__.send({
            type: 'cookies-extracted',
            cookies: document.cookie,
            url: window.location.href
          });
        }
      })();
    `;
    await this.evalScript(script);
    return "cookies-extraction-triggered";
  }

  public waitForCookiesExtracted(timeoutMs = 5000): Promise<{ cookies: string; url: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("Cookie extraction timed out after " + timeoutMs + "ms"));
      }, timeoutMs);

      const callback = (cookies: string, url: string) => {
        clearTimeout(timer);
        resolve({ cookies, url });
      };
      this.cookieExtractedCallbacks.push(callback);
    });
  }

  public async setCookie(cookieStr: string): Promise<void> {
    const script = "document.cookie = " + JSON.stringify(cookieStr) + ";";
    await this.evalScript(script);
  }

  private destroyIframe() {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
  }

  public async destroy() {
    this.destroyIframe();
    useWebDistilleryStore().setWebviewCreated(false);
  }

  public async forceCleanup() {
    this.destroyIframe();
    this.domExtractedCallbacks = [];
    this.cookieExtractedCallbacks = [];
    this.elementSelectedCallbacks = [];
    const store = useWebDistilleryStore();
    store.setLoading(false);
    store.setWebviewCreated(false);
  }

  public dispose() {
    this.destroyIframe();
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    this.domExtractedCallbacks = [];
    this.cookieExtractedCallbacks = [];
    this.elementSelectedCallbacks = [];
  }
}

export const iframeBridge = IframeBridge.getInstance();
