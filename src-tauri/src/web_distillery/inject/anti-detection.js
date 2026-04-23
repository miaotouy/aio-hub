/**
 * anti-detection.js - 反反爬虫保护层
 * 必须在 bridge.js 之前注入
 * 注意：不再冻结核心 JS API (Object.defineProperty, Function.prototype 等)，
 * 因为这会破坏现代框架 (React, Vue, Docusaurus) 的正常初始化。
 */
(function () {
  'use strict';

  const noop = () => { };

  // 1. 隐藏 WebView 特征（伪装成普通 Chrome）
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

  // 2. 保护我们的全局对象不被页面 JS 发现
  const hideGlobal = (name) => {
    Object.defineProperty(window, name, {
      enumerable: false,
      configurable: false
    });
  };

  // 延迟执行，等 bridge 和 sniffer 注入后再隐藏
  // 使用 requestIdleCallback 或较长的延迟，避免干扰 React Hydration 关键期
  const finalizeHiding = () => {
    hideGlobal('__DISTILLERY_BRIDGE__');
    hideGlobal('__DISTILLERY_SNIFFER_LOADED__');
    hideGlobal('__DISTILLERY_NATIVE_POSTMESSAGE__');
  };

  if (window.requestIdleCallback) {
    requestIdleCallback(() => setTimeout(finalizeHiding, 500));
  } else {
    setTimeout(finalizeHiding, 1000);
  }

  // 3. 防止页面检测 Headless 模式
  Object.defineProperty(navigator, 'webdriver', {
    get: () => false,
    configurable: false
  });

  // 4. 伪装 Chrome 插件环境（某些反爬会检测）
  // 完善 mock，防止访问 plugins 等属性时报错
  if (!window.chrome) {
    window.chrome = {
      runtime: {
        connect: noop,
        sendMessage: noop,
        id: undefined
      },
      app: {
        isInstalled: false,
        InstallState: {
          DISABLED: 'disabled',
          INSTALLED: 'installed',
          NOT_INSTALLED: 'not_installed'
        },
        RunningState: {
          CANNOT_RUN: 'cannot_run',
          READY_TO_RUN: 'ready_to_run',
          RUNNING: 'running'
        }
      },
      loadTimes: noop,
      csi: noop,
      plugins: []
    };
  } else if (!window.chrome.plugins) {
    // 如果已经存在 chrome 对象但没有 plugins，补全它
    try {
      window.chrome.plugins = [];
    } catch (e) { }
  }

  // console.log('[Distillery] Anti-detection layer initialized');
})();