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

  // 通知已就绪
  window.addEventListener('DOMContentLoaded', () => {
    window.__DISTILLERY_BRIDGE__.send({ type: 'webview-ready' });
  });
})();
