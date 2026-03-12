/**
 * anti-detection.js - 反反爬虫保护层
 * 必须在 bridge.js 之前注入，冻结关键 API 防止页面 JS 反噬
 */
(function () {
  'use strict';

  // 1. 禁用 debugger 陷阱
  const noop = () => { };
  const originalEval = window.eval;
  window.eval = function (code) {
    if (typeof code === 'string' && code.includes('debugger')) {
      console.warn('[Distillery] Blocked debugger trap');
      return;
    }
    return originalEval.call(this, code);
  };

  // 2. 冻结关键对象，防止页面 JS 篡改我们的 Hook
  const freeze = (obj, prop) => {
    try {
      const descriptor = Object.getOwnPropertyDescriptor(obj, prop);
      if (descriptor && descriptor.configurable) {
        Object.defineProperty(obj, prop, {
          ...descriptor,
          configurable: false,
          writable: false
        });
      }
    } catch (e) { }
  };

  // 保护 Object 原型方法
  freeze(Object, 'defineProperty');
  freeze(Object, 'getOwnPropertyDescriptor');
  freeze(Object.prototype, 'hasOwnProperty');

  // 保护 Function 原型
  freeze(Function.prototype, 'call');
  freeze(Function.prototype, 'apply');
  freeze(Function.prototype, 'bind');

  // 3. 隐藏 WebView 特征（伪装成普通 Chrome）
  try {
    // 删除 WebView2 特有的标识
    if (window.chrome && window.chrome.webview) {
      // 保存原始引用供我们自己使用
      window.__DISTILLERY_NATIVE_POSTMESSAGE__ = window.chrome.webview.postMessage.bind(window.chrome.webview);

      // 对外隐藏
      Object.defineProperty(window.chrome, 'webview', {
        get: () => undefined,
        configurable: false
      });
    }

    // 隐藏 WKWebView 特征
    if (window.webkit && window.webkit.messageHandlers) {
      window.__DISTILLERY_NATIVE_POSTMESSAGE__ = window.webkit.messageHandlers.ipc?.postMessage?.bind(window.webkit.messageHandlers.ipc);

      Object.defineProperty(window.webkit, 'messageHandlers', {
        get: () => ({}),
        configurable: false
      });
    }
  } catch (e) {
    console.warn('[Distillery] Failed to hide WebView features', e);
  }

  // 4. 防止无限循环/死锁（设置执行时间限制）
  let scriptStartTime = Date.now();
  const MAX_SCRIPT_TIME = 30000; // 30秒超时

  const checkTimeout = () => {
    if (Date.now() - scriptStartTime > MAX_SCRIPT_TIME) {
      console.error('[Distillery] Script execution timeout, force stopping');
      window.stop();
    }
  };

  setInterval(checkTimeout, 1000);

  // 5. 保护我们的全局对象不被页面 JS 发现
  const hideGlobal = (name) => {
    Object.defineProperty(window, name, {
      enumerable: false,
      configurable: false
    });
  };

  // 延迟执行，等 bridge 和 sniffer 注入后再隐藏
  setTimeout(() => {
    hideGlobal('__DISTILLERY_BRIDGE__');
    hideGlobal('__DISTILLERY_SNIFFER_LOADED__');
    hideGlobal('__DISTILLERY_NATIVE_POSTMESSAGE__');
  }, 100);

  // 6. 拦截可疑的反爬虫检测
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    // 拦截对我们操作的监听
    if (type === 'copy' || type === 'cut' || type === 'contextmenu') {
      console.warn('[Distillery] Blocked suspicious event listener:', type);
      return;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  // 7. 防止页面检测 Headless 模式
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
    configurable: false
  });

  // 8. 伪装 Chrome 插件环境（某些反爬会检测）
  if (!window.chrome) {
    window.chrome = {};
  }
  window.chrome.runtime = {
    connect: noop,
    sendMessage: noop
  };

  console.log('[Distillery] Anti-detection layer initialized');
})();