/**
 * inject/bridge.js - 子 Webview 的初始化脚本
 * 负责建立子 Webview 与 Rust/主 Webview 之间的通信桥梁
 */
(function () {
  const NONCE = "__NONCE_PLACEHOLDER__";

  // 平台检测 + 统一发送接口
  const postMessage = (function () {
    // Windows (WebView2/Chromium)
    if (window.chrome && window.chrome.webview) {
      return (data) => window.chrome.webview.postMessage(data);
    }
    // macOS (WKWebView)
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc) {
      return (data) => window.webkit.messageHandlers.ipc.postMessage(data);
    }
    // Linux (WebKitGTK)
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ipc) {
      return (data) => window.webkit.messageHandlers.ipc.postMessage(data);
    }
    return (data) => console.warn("[Distillery Bridge] No IPC handler found", data);
  })();

  window.__DISTILLERY_BRIDGE__ = {
    send(payload) {
      postMessage(JSON.stringify({ nonce: NONCE, ...payload }));
    },
  };

  /**
   * P1: 媒体控制 (跨平台保险)
   * 即使 Rust 端设置了 autoplay-policy，JS 侧再加一层保护
   */
  function disableMedia() {
    try {
      const mediaElements = document.querySelectorAll('video, audio');
      mediaElements.forEach(el => {
        el.pause();
        el.autoplay = false;
        el.muted = true;
        el.removeAttribute('autoplay');
        // 禁止程序化播放
        el.play = () => Promise.resolve();
      });
    } catch (e) { }
  }

  // 初始化时禁用一次
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', disableMedia);
  } else {
    disableMedia();
  }

  // P1: MutationObserver 监听动态插入的媒体
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === 1) { // Element
          if (node.tagName === 'VIDEO' || node.tagName === 'AUDIO') {
            node.pause(); node.autoplay = false; node.muted = true;
            node.play = () => Promise.resolve();
          }
          node.querySelectorAll?.('video, audio').forEach(el => {
            el.pause(); el.autoplay = false; el.muted = true;
            el.play = () => Promise.resolve();
          });
        }
      });
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // 通知已就绪
  window.addEventListener('DOMContentLoaded', () => {
    window.__DISTILLERY_BRIDGE__.send({ type: 'webview-ready' });
  });

  // P3: 增加页面完全加载信号
  window.addEventListener('load', () => {
    window.__DISTILLERY_BRIDGE__.send({ type: 'page-loaded' });
  });
})();
