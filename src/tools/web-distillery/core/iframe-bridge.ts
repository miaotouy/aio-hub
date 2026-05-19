/**
 * core/iframe-bridge.ts - Iframe 通信封装
 */
import { invoke } from "@tauri-apps/api/core";
import { useWebDistilleryStore } from "../stores/store";
import { cookieProfileStore } from "./cookie-profile-store";
import selectorPickerScript from "../inject/selector-picker.js?raw";
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
  private navigationCallbacks: ((url: string, title: string) => void)[] = [];

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

    // 在加载页面之前，先同步已激活的身份 cookies 到代理层
    await this.syncActiveCookiesToProxy(options.url);

    const store = useWebDistilleryStore();

    this.iframe = document.createElement("iframe");
    this.iframe.className = "distillery-iframe";
    this.iframe.style.border = "none";
    this.iframe.style.width = "100%";
    this.iframe.style.height = "100%";
    // 注意：同时设置 allow-scripts 和 allow-same-origin 会使 iframe 能够绕过沙箱限制（沙箱逃逸）
    // 但对于 web-distillery 这种需要代理注入脚本并与父窗口通信的场景，这是必须的。
    // 我们通过 CSP 来限制 iframe 的行为。
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
        case "local-storage-extracted":
          this.localStorageExtractedCallbacks.forEach((cb) => cb(payload.data || {}));
          this.localStorageExtractedCallbacks = [];
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
        case "page-loaded":
          // 页面加载完成（初始加载或全量刷新），通知导航监听器
          this.navigationCallbacks.forEach((cb) => cb(payload.url || "", payload.title || ""));
          break;
        case "navigation-changed":
          // SPA 内部路由变化（pushState/replaceState/popstate）
          this.navigationCallbacks.forEach((cb) => cb(payload.url || "", payload.title || ""));
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

  /**
   * 自动滚动页面以触发懒加载内容
   * 参考 UrlFetch 的 autoScroll 逻辑
   */
  public async autoScroll(maxScrolls = 3, delayMs = 800): Promise<void> {
    const script = `
      (function() {
        var maxScrolls = ${maxScrolls};
        var delay = ${delayMs};
        var scrolls = 0;
        var lastHeight = document.body.scrollHeight;

        function doScroll() {
          if (scrolls >= maxScrolls) {
            // 滚动完成，回到顶部
            window.scrollTo(0, 0);
            if (window.__DISTILLERY_BRIDGE__) {
              window.__DISTILLERY_BRIDGE__.send({ type: 'scroll-complete' });
            }
            return;
          }
          window.scrollTo(0, document.body.scrollHeight);
          scrolls++;
          setTimeout(function() {
            var newHeight = document.body.scrollHeight;
            if (newHeight === lastHeight) {
              // 高度没变，再等一次确认
              setTimeout(function() {
                var finalHeight = document.body.scrollHeight;
                if (finalHeight === lastHeight) {
                  // 确认没有新内容，结束
                  window.scrollTo(0, 0);
                  if (window.__DISTILLERY_BRIDGE__) {
                    window.__DISTILLERY_BRIDGE__.send({ type: 'scroll-complete' });
                  }
                  return;
                }
                lastHeight = finalHeight;
                doScroll();
              }, delay);
            } else {
              lastHeight = newHeight;
              doScroll();
            }
          }, delay);
        }
        doScroll();
      })();
    `;

    const promise = new Promise<void>((resolve) => {
      const timeout = setTimeout(
        () => {
          resolve(); // 超时也继续，不阻塞主流程
        },
        (maxScrolls + 2) * delayMs * 2 + 2000,
      );

      const handler = (event: MessageEvent) => {
        if (this.iframe && event.source === this.iframe.contentWindow) {
          const payload = event.data;
          if (payload && payload.type === "scroll-complete") {
            clearTimeout(timeout);
            window.removeEventListener("message", handler);
            resolve();
          }
        }
      };
      window.addEventListener("message", handler);
    });

    await this.evalScript(script);
    await promise;
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

  public async enablePicker(
    optionsOrCb: { mode: string; continuous?: boolean } | ((data: any) => void),
    onSelected?: (data: any) => void,
  ) {
    await this.evalScript(selectorPickerScript);

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
      `if(window.__distillerySelectorPicker) window.__distillerySelectorPicker.addHighlight(${JSON.stringify(selector)}, ${JSON.stringify(mode)})`,
    );
  }

  public async removeHighlight(selector: string) {
    await this.evalScript(
      `if(window.__distillerySelectorPicker) window.__distillerySelectorPicker.removeHighlight(${JSON.stringify(selector)})`,
    );
  }

  public async clearHighlights() {
    await this.evalScript(`if(window.__distillerySelectorPicker) window.__distillerySelectorPicker.clearHighlights()`);
  }

  public async syncHighlights() {
    await this.evalScript(`if(window.__distillerySelectorPicker) window.__distillerySelectorPicker.syncHighlights()`);
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

  /** 获取 iframe 页面的 localStorage 快照 */
  public async getLocalStorage(): Promise<Record<string, string>> {
    const script = `
      (function() {
        if (window.__DISTILLERY_BRIDGE__) {
          var data = {};
          for (var i = 0; i < localStorage.length; i++) {
            var key = localStorage.key(i);
            if (key !== null) data[key] = localStorage.getItem(key) || '';
          }
          window.__DISTILLERY_BRIDGE__.send({
            type: 'local-storage-extracted',
            data: data
          });
        }
      })();
    `;
    await this.evalScript(script);
    return this.waitForLocalStorageExtracted(5000);
  }

  private localStorageExtractedCallbacks: ((data: Record<string, string>) => void)[] = [];

  public waitForLocalStorageExtracted(timeoutMs = 5000): Promise<Record<string, string>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("localStorage extraction timed out after " + timeoutMs + "ms"));
      }, timeoutMs);

      const callback = (data: Record<string, string>) => {
        clearTimeout(timer);
        resolve(data);
      };
      this.localStorageExtractedCallbacks.push(callback);
    });
  }

  /** 注册导航变化监听器（page-loaded + SPA navigation-changed） */
  public onNavigationChange(callback: (url: string, title: string) => void): () => void {
    this.navigationCallbacks.push(callback);
    return () => {
      this.navigationCallbacks = this.navigationCallbacks.filter((cb) => cb !== callback);
    };
  }

  /**
   * 将已激活的身份 cookies + localStorage 同步到代理层
   * 在页面加载前调用，确保代理发出的第一个请求就携带正确的 cookies，
   * 且 localStorage 在页面 JS 执行前被还原
   */
  public async syncActiveCookiesToProxy(url?: string): Promise<void> {
    const targetUrl = url || useWebDistilleryStore().url;
    if (!targetUrl) {
      logger.debug("syncActiveCookiesToProxy: no URL, skipping");
      return;
    }

    try {
      const fullUrl = targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`;
      await cookieProfileStore.load();
      const activeProfile = await cookieProfileStore.getActiveProfileForUrl(fullUrl);

      if (activeProfile) {
        const cookieStr = activeProfile.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
        await invoke("distillery_set_proxy_cookies", { cookies: cookieStr });

        // 同步 localStorage 到代理层（用于 SPA token 恢复）
        if (activeProfile.localStorage && Object.keys(activeProfile.localStorage).length > 0) {
          await invoke("distillery_set_proxy_local_storage", {
            data: JSON.stringify(activeProfile.localStorage),
          });
          logger.info("Synced active profile localStorage to proxy", {
            keyCount: Object.keys(activeProfile.localStorage).length,
          });
        } else {
          await invoke("distillery_set_proxy_local_storage", { data: null });
        }

        logger.info("Synced active profile cookies to proxy before page load", {
          profileId: activeProfile.id,
          profileName: activeProfile.name,
          cookieCount: activeProfile.cookies.length,
          hasLocalStorage: !!activeProfile.localStorage,
          url: fullUrl,
        });
      } else {
        logger.debug("No active profile for URL, proxy cookies not set", { url: fullUrl });
        await invoke("distillery_set_proxy_local_storage", { data: null });
      }
    } catch (err) {
      logger.warn("Failed to sync cookies to proxy", err);
    }
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
    this.localStorageExtractedCallbacks = [];
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
    this.localStorageExtractedCallbacks = [];
    this.navigationCallbacks = [];
  }
}

export const iframeBridge = IframeBridge.getInstance();
