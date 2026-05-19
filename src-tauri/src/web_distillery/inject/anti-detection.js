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

    // 中和 Tauri IPC 特征
    // Tauri v2 会向 iframe 注入 __TAURI_INTERNALS__ 等全局变量，
    // 导致 B站等网站检测到 Tauri 环境后使用 IPC 打开链接而非正常导航。
    //
    // 策略：不隐藏 Tauri 对象（隐藏会导致 Tauri VM 脚本崩溃），
    // 而是 hook invoke 方法，将 open_url 等导航类 IPC 调用转为正常的浏览器导航。
    // 这样 B站的 Tauri 适配代码正常执行，但实际效果是浏览器内导航。
    if (window.__TAURI_INTERNALS__) {
      var origInvoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = function (cmd, args) {
        // 拦截 opener 插件的 open_url 命令，转为代理内导航
        if (cmd && (cmd.indexOf('open_url') !== -1 || cmd.indexOf('open') !== -1)) {
          var url = args && (args.url || args.path);
          if (url && /^https?:\/\//.test(url)) {
            // 将绝对 URL 转为相对路径，保持在代理服务器内导航
            // 例如 https://www.bilibili.com/video/xxx -> /video/xxx
            try {
              var parsed = new URL(url);
              var currentHost = window.location.hostname;
              // 如果目标 URL 的域名与当前代理的目标站点相同（或是其子域名），
              // 则提取路径部分进行相对导航（通过 fallback 路由）
              var targetHost = parsed.hostname;
              // 简单匹配：去掉 www. 前缀后比较主域名
              var normalizeHost = function (h) { return h.replace(/^www\./, ''); };
              // 当前页面在代理中，origin 是 127.0.0.1，无法直接比较
              // 所以对所有外部 URL 都提取路径进行代理内导航
              window.location.href = parsed.pathname + parsed.search + parsed.hash;
            } catch (e) {
              window.location.href = url;
            }
            return Promise.resolve();
          }
        }
        // 其他 IPC 调用静默返回（不转发到真实 IPC，避免 502）
        return Promise.resolve();
      };

      // 确保 plugins 属性存在（Tauri VM 脚本会访问）
      if (!window.__TAURI_INTERNALS__.plugins) {
        window.__TAURI_INTERNALS__.plugins = {};
      }
    }

    // 对于其他 Tauri 全局变量，确保不会因属性访问报错
    if (typeof window.__TAURI__ !== 'undefined' && window.__TAURI__) {
      // __TAURI__ 通常是 API 入口，确保其方法不会抛出
      // 不做额外处理，让它保持原样（Tauri VM 脚本需要它）
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