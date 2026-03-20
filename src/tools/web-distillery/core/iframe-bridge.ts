/**
 * core/iframe-bridge.ts - Iframe 通信封装
 * 替代旧的 WebviewBridge，通过 Iframe + 本地代理实现网页加载和通信
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
  
  // 回调管理（和旧 bridge 保持一致的模式）
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

  /** 初始化：启动代理服务器 + 注册 postMessage 监听 */
  public async init(): Promise<void> {
    // 1. 启动代理服务器（如果还没启动）
    if (!this.proxyPort) {
      try {
        this.proxyPort = await invoke<number>('distillery_get_proxy_port');
        if (this.proxyPort === 0) {
          this.proxyPort = await invoke<number>('distillery_start_proxy');
        }
        logger.info("Proxy server initialized", { port: this.proxyPort });
      } catch (e) {
        logger.error("Failed to start proxy server", e);
        throw e;
      }
    }
    
    // 2. 注册 window message 监听器
    if (!this.messageHandler) {
      this.messageHandler = (event: MessageEvent) => {
        // 安全检查：只处理来自我们 iframe 的消息
        if (this.iframe && event.source === this.iframe.contentWindow) {
          this.handleMessage(event.data);
        }
      };
      window.addEventListener('message', this.messageHandler);
    }
  }

  /** 创建 Iframe 并加载目标 URL */
  public async create(options: {
    url: string;
    hidden?: boolean;
    container: HTMLElement;
  }): Promise<void> {
    // 确保已初始化
    await this.init();
    
    // 销毁旧的 iframe
    this.destroyIframe();
    
    const store = useWebDistilleryStore();
    
    // 创建新 iframe
    this.iframe = document.createElement('iframe');
    this.iframe.className = 'distillery-iframe';
    this.iframe.style.border = 'none';
    this.iframe.style.width = '100%';
    this.iframe.style.height = '100%';
    // 允许脚本和同源（由于是 localhost 代理，同源是必须的以支持 bridge.js 的 postMessage）
    this.iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms allow-popups');
    
    if (options.hidden) {
      this.iframe.style.position = 'absolute';
      this.iframe.style.left = '-9999px';
      this.iframe.style.top = '-9999px';
      this.iframe.style.visibility = 'hidden';
      this.iframe.style.width = '1920px';
      this.iframe.style.height = '5000px';
    }
    
    options.container.appendChild(this.iframe);
    
    // 构建代理 URL
    const proxyUrl = `http://127.0.0.1:${this.proxyPort}/proxy?url=${encodeURIComponent(options.url)}`;
    
    // 加载并等待
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.iframe) this.iframe.onload = null;
        reject(new Error('Iframe 加载超时'));
      }, 30000);
      
      this.iframe!.onload = () => {
        clearTimeout(timeout);
        store.setWebviewCreated(true);
        resolve();
      };
      this.iframe!.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Iframe 加载失败'));
      };
      
      this.iframe!.src = proxyUrl;
    });
  }

  /** 别名方法，兼容旧代码调用 */
  public async createWebview(options: {
    url: string;
    container: HTMLElement;
    headless?: boolean;
  }) {
    return this.create({
      url: options.url,
      container: options.container,
      hidden: options.headless
    });
  }

  /** 处理来自 Iframe 的消息 */
  private handleMessage(payload: any) {
    try {
      const store = useWebDistilleryStore();

      if (!payload || typeof payload !== 'object') return;

      logger.debug(`Handling message type: ${payload.type}`, { payload });
      
      switch (payload.type) {
        case "webview-ready":
          logger.info("Iframe bridge ready");
          break;

        case "page-loaded":
          logger.info("Iframe page fully loaded");
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
          logger.error("DOM extraction error reported by iframe", { error: payload.error });
          this.domExtractedCallbacks.forEach((cb) => {
            try {
              cb(new Error(payload.error || "DOM extraction error from iframe"));
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
          logger.error("Iframe runtime error", {
            message: payload.message,
            source: payload.source,
            line: payload.line,
            stack: payload.stack,
          });
          break;

        case "eval-error":
          logger.error("Script eval error in iframe", { error: payload.error });
          break;

        default:
          logger.debug("Received unknown message type", { type: payload.type });
      }
    } catch (err) {
      errorHandler.handle(err, {
        userMessage: "处理 Iframe 消息失败",
      });
    }
  }

  /** 在 Iframe 中执行脚本 */
  public async evalScript(script: string): Promise<void> {
    if (!this.iframe?.contentWindow) {
      throw new Error('Iframe not available');
    }
    this.iframe.contentWindow.postMessage({ type: '__distillery_eval', script }, '*');
  }

  /** 触发 DOM 提取 */
  public async extractDom(waitFor?: string, waitTimeoutMs?: number): Promise<string> {
    const timeoutMs = waitTimeoutMs || 10000;
    const selectorJson = waitFor ? JSON.stringify(waitFor) : 'null';
    
    // 从 webview.rs 移植的 JS 逻辑
    const extractScript = `
      (function() {
        const selector = ${selectorJson};
        const startTime = Date.now();
        const timeout = ${timeoutMs};
        console.log('[Distillery] Extraction script started. Waiting for:', selector || 'body content');

        function tryExtract() {
          const isReady = document.readyState === 'complete' || document.readyState === 'interactive';
          const elementFound = !selector || !!document.querySelector(selector);
          const hasBodyContent = document.body && document.body.innerText.length > 500;
          const wechatContentReady = !selector && !!document.getElementById('js_content');

          if ((isReady && elementFound) || wechatContentReady || hasBodyContent) {
            console.log('[Distillery] extraction conditions met', { isReady, elementFound, wechatContentReady, hasBodyContent });
            performExtraction();
          } else if (Date.now() - startTime < timeout) {
            setTimeout(tryExtract, 250);
          } else {
            console.warn('[Distillery] Extraction timeout, proceeding anyway', { elapsed: Date.now() - startTime });
            performExtraction();
          }
        }

        function performExtraction() {
          try {
            const html = document.documentElement.outerHTML;
            const payload = {
              type: 'dom-extracted',
              html: html,
              url: window.location.href,
              title: document.title
            };
            
            if (window.__DISTILLERY_BRIDGE__ && typeof window.__DISTILLERY_BRIDGE__.send === 'function') {
              window.__DISTILLERY_BRIDGE__.send(payload);
            }
          } catch(e) {
            console.error('[Distillery] Extraction failed:', e);
            if (window.__DISTILLERY_BRIDGE__) {
              window.__DISTILLERY_BRIDGE__.send({ type: 'dom-extract-error', error: e.message });
            }
          }
        }

        tryExtract();
      })();
    `;
    
    await this.evalScript(extractScript);
    return "extraction-triggered";
  }

  /** 等待 DOM 提取结果 */
  public waitForDomExtracted(timeoutMs = 15000): Promise<{ html: string; url: string; title: string }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.domExtractedCallbacks = this.domExtractedCallbacks.filter((cb) => cb !== callback);
        reject(new Error(`DOM extraction timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const callback: DomExtractedCallback = (error, html, url, title) => {
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

  /** 获取选择器拾取脚本内容 */
  private async getPickerScript(): Promise<string> {
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

  /** 获取 Cookie */
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

  /** 设置 Cookie */
  public async setCookie(cookieStr: string): Promise<void> {
    const script = `
      (function() {
        document.cookie = ${JSON.stringify(cookieStr)};
      })();
    `;
    await this.evalScript(script);
  }

  /** 等待 Cookie 提取结果 */
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

  /** 销毁 Iframe */
  private destroyIframe() {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
  }

  /** 销毁方法，兼容旧代码 */
  public async destroy() {
    this.destroyIframe();
    const store = useWebDistilleryStore();
    store.setWebviewCreated(false);
  }

  /** 终极强制清理 */
  public async forceCleanup() {
    this.destroyIframe();
    this.domExtractedCallbacks = [];
    this.cookieExtractedCallbacks = [];
    this.elementSelectedCallbacks = [];
    
    const store = useWebDistilleryStore();
    store.setLoading(false);
    store.setWebviewCreated(false);
  }

  /** 释放所有资源 */
  public dispose() {
    this.destroyIframe();
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }
    this.domExtractedCallbacks = [];
    this.cookieExtractedCallbacks = [];
    this.elementSelectedCallbacks = [];
  }
}

export const iframeBridge = IframeBridge.getInstance();