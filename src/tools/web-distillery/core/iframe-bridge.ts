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

/**
 * core/iframe-bridge.ts - Iframe 通信封装
 */
import { invoke } from "@/platform/native/core";
import { useWebDistilleryStore } from "../stores/store";
import { cookieProfileStore } from "./cookie-profile-store";
import selectorPickerScript from "../inject/selector-picker.js?raw";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { getLocalISOString } from "@/utils/time";
import type { CookieProfile } from "../types";

const logger = createModuleLogger("web-distillery/iframe-bridge");
const errorHandler = createModuleErrorHandler("web-distillery/iframe-bridge");

export type DomExtractedCallback = (
  error: Error | null,
  html?: string,
  url?: string,
  title?: string
) => void;

export class IframeBridge {
  private static instance: IframeBridge;
  private iframe: HTMLIFrameElement | null = null;
  private proxyOrigin: string | null = null;
  private revision = 0;
  private initializing: Promise<void> | null = null;
  private creating = false;
  private pendingWaits = new Set<() => void>();
  private messageHandler: ((event: MessageEvent) => void) | null = null;

  private domExtractedCallbacks = new Map<string, DomExtractedCallback>();
  private domRequestIds: string[] = [];
  private cookieExtractedCallbacks: ((cookies: string, url: string) => void)[] =
    [];
  private elementSelectedCallbacks: ((data: any) => void)[] = [];
  private navigationCallbacks: ((url: string, title: string) => void)[] = [];

  private constructor() {}

  public static getInstance(): IframeBridge {
    if (!IframeBridge.instance) {
      IframeBridge.instance = new IframeBridge();
    }
    return IframeBridge.instance;
  }

  public init(): Promise<void> {
    if (this.initializing) return this.initializing;
    const revision = this.revision;
    const operation = (async () => {
      try {
        const port = await invoke<number>("distillery_get_proxy_port");
        if (revision !== this.revision) throw new Error("网页会话已关闭");
        if (!port) await invoke<number>("distillery_start_proxy");
        const origin = await invoke<string | null>(
          "distillery_get_proxy_origin"
        );
        if (revision !== this.revision) throw new Error("网页会话已关闭");
        if (
          !origin ||
          !new RegExp("^http://[a-f0-9]{32}[.]localhost:[0-9]+$").test(origin)
        )
          throw new Error("网页代理地址无效，请重新加载页面");
        this.proxyOrigin = origin;
        if (!this.messageHandler) {
          this.messageHandler = (event) => {
            if (
              this.iframe &&
              event.source === this.iframe.contentWindow &&
              event.origin === this.proxyOrigin
            )
              this.handleMessage(event.data);
          };
          window.addEventListener("message", this.messageHandler);
        }
      } catch (error) {
        this.proxyOrigin = null;
        logger.error("Failed to initialize proxy server", error);
        throw error;
      }
    })();
    this.initializing = operation;
    void operation
      .finally(() => {
        if (this.initializing === operation) this.initializing = null;
      })
      .catch(() => {});
    return operation;
  }

  private waitFor<T>(
    timeoutMs: number,
    register: (
      resolve: (value: T) => void,
      reject: (error: Error) => void
    ) => () => void
  ): Promise<T> {
    const promise = new Promise<T>((resolve, reject) => {
      let settled = false;
      let unregister = () => {};
      const finish = (error?: Error, value?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unregister();
        this.pendingWaits.delete(cancel);
        if (error) reject(error);
        else resolve(value as T);
      };
      const cancel = () => finish(new Error("网页会话已关闭"));
      const timer = setTimeout(
        () =>
          finish(
            new DOMException("等待网页响应超时，请重新加载页面", "TimeoutError")
          ),
        timeoutMs
      );
      this.pendingWaits.add(cancel);
      unregister = register(
        (value) => finish(undefined, value),
        (error) => finish(error)
      );
      if (settled) unregister();
    });
    void promise.catch(() => {});
    return promise;
  }

  public async create(options: {
    url: string;
    hidden?: boolean;
    container: HTMLElement;
    profile?: CookieProfile | null;
  }): Promise<void> {
    if (this.creating) throw new Error("网页正在加载，请等待当前加载完成");
    this.creating = true;
    const revision = this.revision;
    try {
      await this.init();
      if (revision !== this.revision) throw new Error("网页会话已关闭");
      this.destroyIframe();

      // 在加载页面之前，先同步已激活的身份 cookies 到代理层
      await this.syncActiveCookiesToProxy(options.url, options.profile);
      if (revision !== this.revision) throw new Error("网页会话已关闭");

      const store = useWebDistilleryStore();

      this.iframe = document.createElement("iframe");
      this.iframe.className = "distillery-iframe";
      this.iframe.style.border = "none";
      this.iframe.style.width = "100%";
      this.iframe.style.height = "100%";
      // 页面使用独立的随机 loopback origin；同源权限仅供注入脚本访问页面存储。
      this.iframe.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-forms allow-popups"
      );

      if (options.hidden) {
        this.iframe.style.position = "absolute";
        this.iframe.style.left = "-9999px";
        this.iframe.style.top = "-9999px";
        this.iframe.style.visibility = "hidden";
        this.iframe.style.width = "1920px";
        this.iframe.style.height = "5000px";
      }

      options.container.appendChild(this.iframe);

      const proxyUrl =
        this.proxyOrigin + "/proxy?url=" + encodeURIComponent(options.url);
      const iframe = this.iframe;
      await this.waitFor<void>(30000, (resolve, reject) => {
        iframe.onload = () => {
          store.setWebviewCreated(true);
          resolve();
        };
        iframe.onerror = () => reject(new Error("Iframe 加载失败"));
        iframe.src = proxyUrl;
        return () => {
          iframe.onload = null;
          iframe.onerror = null;
        };
      });
    } finally {
      this.creating = false;
    }
  }

  private handleMessage(payload: any) {
    try {
      const store = useWebDistilleryStore();
      if (!payload || typeof payload !== "object") return;

      switch (payload.type) {
        case "dom-extracted":
          this.domExtractedCallbacks.get(payload.requestId)?.(
            null,
            payload.html,
            payload.url,
            payload.title
          );
          break;
        case "local-storage-extracted":
          this.localStorageExtractedCallbacks.forEach((cb) =>
            cb(payload.data || {})
          );
          this.localStorageExtractedCallbacks = [];
          break;
        case "dom-extract-error":
          this.domExtractedCallbacks.get(payload.requestId)?.(
            new Error(payload.error || "DOM extraction error")
          );
          break;
        case "api-discovered":
          store.addDiscoveredApi({
            url: payload.url,
            method: payload.method,
            contentType:
              payload.apiType === "json" ? "application/json" : "text/plain",
            bodyPreview: "",
            isJson: payload.apiType === "json",
            timestamp: getLocalISOString(),
          });
          break;
        case "cookies-extracted":
          this.cookieExtractedCallbacks.forEach((cb) =>
            cb(payload.cookies, payload.url)
          );
          this.cookieExtractedCallbacks = [];
          break;
        case "element-selected":
          if (
            store.pickerMode === "action" &&
            store.pickerActionIndex !== null
          ) {
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
          this.navigationCallbacks.forEach((cb) =>
            cb(payload.url || "", payload.title || "")
          );
          break;
        case "navigation-changed":
          // SPA 内部路由变化（pushState/replaceState/popstate）
          this.navigationCallbacks.forEach((cb) =>
            cb(payload.url || "", payload.title || "")
          );
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
    this.iframe.contentWindow.postMessage(
      { type: "__distillery_eval", script },
      this.proxyOrigin!
    );
  }

  /**
   * 提取当前 Iframe DOM 快照（用于实时预览）
   * 区别于原有 extractDom：不 wait for selector，直接拿当前状态
   */
  public async extractCurrentDom(): Promise<{
    html: string;
    url: string;
    title: string;
  }> {
    const requestId = crypto.randomUUID();
    const promise = this.waitForDom(requestId, 5000);
    const script = `
      (function() {
        if (window.__DISTILLERY_BRIDGE__) {
          window.__DISTILLERY_BRIDGE__.send({
            type: 'dom-extracted',
            requestId: ${JSON.stringify(requestId)},
            html: document.documentElement.outerHTML,
            url: window.location.href,
            title: document.title
          });
        }
      })();
    `;

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

    const promise = this.waitFor<void>(
      (maxScrolls + 2) * delayMs * 2 + 2000,
      (resolve) => {
        const handler = (event: MessageEvent) => {
          if (
            this.iframe &&
            event.source === this.iframe.contentWindow &&
            event.origin === this.proxyOrigin &&
            event.data?.type === "scroll-complete"
          )
            resolve();
        };
        window.addEventListener("message", handler);
        return () => window.removeEventListener("message", handler);
      }
    );
    void promise.catch(() => {});

    await this.evalScript(script);
    await promise.catch((error: unknown) => {
      // 页面计时器在后台可能被节流；超时后继续提取已有内容。
      if (!(error instanceof DOMException && error.name === "TimeoutError"))
        throw error;
    });
  }

  public async extractDom(
    waitFor?: string,
    waitTimeoutMs?: number
  ): Promise<string> {
    const timeoutMs = waitTimeoutMs || 10000;
    const requestId = this.domRequestIds.shift() ?? crypto.randomUUID();
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
              requestId: ${JSON.stringify(requestId)},
              html: document.documentElement.outerHTML,
              url: window.location.href,
              title: document.title
            };
            if (window.__DISTILLERY_BRIDGE__) window.__DISTILLERY_BRIDGE__.send(payload);
          } catch(e) {
            if (window.__DISTILLERY_BRIDGE__) window.__DISTILLERY_BRIDGE__.send({ type: 'dom-extract-error', requestId: ${JSON.stringify(requestId)}, error: e.message });
          }
        }
        tryExtract();
      })();
    `;

    await this.evalScript(extractScript);
    return "extraction-triggered";
  }

  public waitForDomExtracted(
    timeoutMs = 15000
  ): Promise<{ html: string; url: string; title: string }> {
    const id = crypto.randomUUID();
    this.domRequestIds.push(id);
    return this.waitForDom(id, timeoutMs);
  }
  private waitForDom(
    id: string,
    timeoutMs: number
  ): Promise<{ html: string; url: string; title: string }> {
    return this.waitFor(timeoutMs, (resolve, reject) => {
      const callback: DomExtractedCallback = (error, html, url, title) => {
        if (error) reject(error);
        else resolve({ html: html!, url: url!, title: title! });
      };
      this.domExtractedCallbacks.set(id, callback);
      return () => {
        this.domExtractedCallbacks.delete(id);
        this.domRequestIds = this.domRequestIds.filter((item) => item !== id);
      };
    });
  }

  public async enablePicker(
    optionsOrCb: { mode: string; continuous?: boolean } | ((data: any) => void),
    onSelected?: (data: any) => void
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
    await this.evalScript(
      "window.__distillerySelectorPicker.enable(" + optionsJson + ")"
    );
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
      `if(window.__distillerySelectorPicker) window.__distillerySelectorPicker.addHighlight(${JSON.stringify(selector)}, ${JSON.stringify(mode)})`
    );
  }

  public async removeHighlight(selector: string) {
    await this.evalScript(
      `if(window.__distillerySelectorPicker) window.__distillerySelectorPicker.removeHighlight(${JSON.stringify(selector)})`
    );
  }

  public async clearHighlights() {
    await this.evalScript(
      `if(window.__distillerySelectorPicker) window.__distillerySelectorPicker.clearHighlights()`
    );
  }

  public async syncHighlights() {
    await this.evalScript(
      `if(window.__distillerySelectorPicker) window.__distillerySelectorPicker.syncHighlights()`
    );
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

  public waitForCookiesExtracted(
    timeoutMs = 5000
  ): Promise<{ cookies: string; url: string }> {
    return this.waitFor(timeoutMs, (resolve) => {
      const callback = (cookies: string, url: string) =>
        resolve({ cookies, url });
      this.cookieExtractedCallbacks.push(callback);
      return () => {
        this.cookieExtractedCallbacks = this.cookieExtractedCallbacks.filter(
          (item) => item !== callback
        );
      };
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
    const result = this.waitForLocalStorageExtracted(5000);
    void result.catch(() => {});
    await this.evalScript(script);
    return result;
  }

  private localStorageExtractedCallbacks: ((
    data: Record<string, string>
  ) => void)[] = [];

  public waitForLocalStorageExtracted(
    timeoutMs = 5000
  ): Promise<Record<string, string>> {
    return this.waitFor(timeoutMs, (resolve) => {
      const callback = (data: Record<string, string>) => resolve(data);
      this.localStorageExtractedCallbacks.push(callback);
      return () => {
        this.localStorageExtractedCallbacks =
          this.localStorageExtractedCallbacks.filter(
            (item) => item !== callback
          );
      };
    });
  }

  /** 注册导航变化监听器（page-loaded + SPA navigation-changed） */
  public onNavigationChange(
    callback: (url: string, title: string) => void
  ): () => void {
    this.navigationCallbacks.push(callback);
    return () => {
      this.navigationCallbacks = this.navigationCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  }

  /**
   * 将已激活的身份 cookies + localStorage 同步到代理层
   * 在页面加载前调用，确保代理发出的第一个请求就携带正确的 cookies，
   * 且 localStorage 在页面 JS 执行前被还原
   */
  public async syncActiveCookiesToProxy(
    url?: string,
    profile?: CookieProfile | null
  ): Promise<void> {
    const targetUrl = url || useWebDistilleryStore().url;
    if (!targetUrl) {
      logger.debug("syncActiveCookiesToProxy: no URL, skipping");
      return;
    }

    try {
      const fullUrl = targetUrl.startsWith("http")
        ? targetUrl
        : `https://${targetUrl}`;
      await cookieProfileStore.load();
      const activeProfile =
        profile === undefined
          ? await cookieProfileStore.getActiveProfileForUrl(fullUrl)
          : profile;

      if (activeProfile) {
        const cookieStr = activeProfile.cookies
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        await invoke("distillery_set_proxy_cookies", { cookies: cookieStr });

        // 同步 localStorage 到代理层（用于 SPA token 恢复）
        if (
          activeProfile.localStorage &&
          Object.keys(activeProfile.localStorage).length > 0
        ) {
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
        logger.debug("No active profile for URL, proxy cookies not set", {
          url: fullUrl,
        });
        await invoke("distillery_set_proxy_cookies", { cookies: null });
        await invoke("distillery_set_proxy_local_storage", { data: null });
      }
    } catch (err) {
      logger.warn("Failed to sync cookies to proxy", err);
      await invoke("distillery_set_proxy_cookies", { cookies: null });
      await invoke("distillery_set_proxy_local_storage", { data: null });
      throw new Error("身份数据加载失败，请在身份管理中检查后重试");
    }
  }

  private destroyIframe() {
    const store = useWebDistilleryStore();
    store.setPickerMode("idle");
    store.setHoveredElement(null);
    this.elementSelectedCallbacks = [];
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
  }

  public async destroy() {
    this.revision++;
    for (const cancel of [...this.pendingWaits]) cancel();
    this.destroyIframe();
    this.proxyOrigin = null;
    useWebDistilleryStore().setWebviewCreated(false);
    await invoke("distillery_stop_proxy");
  }

  public async forceCleanup() {
    await this.destroy();
    this.domExtractedCallbacks.clear();
    this.domRequestIds = [];
    this.cookieExtractedCallbacks = [];
    this.elementSelectedCallbacks = [];
    this.localStorageExtractedCallbacks = [];
    const store = useWebDistilleryStore();
    store.setLoading(false);
    store.setWebviewCreated(false);
  }

  public dispose() {
    void this.destroy().catch((error) =>
      logger.debug("Proxy cleanup failed", error)
    );
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    this.domExtractedCallbacks.clear();
    this.domRequestIds = [];
    this.cookieExtractedCallbacks = [];
    this.elementSelectedCallbacks = [];
    this.localStorageExtractedCallbacks = [];
    this.navigationCallbacks = [];
  }
}

export const iframeBridge = IframeBridge.getInstance();
