/**
 * inject/bridge.js - 子 Webview 的初始化脚本
 * 负责建立子 Webview 与 Rust/主 Webview 之间的通信桥梁
 */
(function () {
  const NONCE = "__NONCE_PLACEHOLDER__";
  const isIframe = window !== window.parent;
  console.log("[Distillery Bridge] Initializing bridge with nonce:", NONCE, "isIframe:", isIframe);

  // 捕获全局错误
  window.addEventListener('error', (event) => {
    if (window.__DISTILLERY_BRIDGE__ && typeof window.__DISTILLERY_BRIDGE__.send === 'function') {
      window.__DISTILLERY_BRIDGE__.send({
        type: 'window-error',
        message: event.message,
        source: event.filename,
        line: event.lineno,
        col: event.colno,
        stack: event.error ? event.error.stack : ''
      });
    }
  });

  // 平台检测 + 统一发送接口
  const nativePost = (function () {
    if (window.ipc && typeof window.ipc.postMessage === 'function') {
      return window.ipc.postMessage.bind(window.ipc);
    }
    if (window.__DISTILLERY_NATIVE_POSTMESSAGE__) {
      return window.__DISTILLERY_NATIVE_POSTMESSAGE__;
    }
    if (window.chrome?.webview?.postMessage) {
      return window.chrome.webview.postMessage.bind(window.chrome.webview);
    }
    if (window.webkit?.messageHandlers?.ipc?.postMessage) {
      return window.webkit.messageHandlers.ipc.postMessage.bind(window.webkit.messageHandlers.ipc);
    }
    return null;
  })();

  window.__DISTILLERY_BRIDGE__ = {
    send(payload) {
      const finalPayload = { nonce: NONCE, ...payload };
      console.log("[Distillery Bridge] Sending message:", payload.type);

      // 核心策略：通过 postMessage 发送给父窗口或主窗口
      if (isIframe) {
        // Iframe 环境：直接 postMessage 给父窗口
        window.parent.postMessage(finalPayload, '*');
      } else if (window.opener) {
        // 独立窗口环境（向后兼容）
        window.opener.postMessage({
          source: 'distillery-sub-webview',
          payload: finalPayload
        }, '*');
      }

      // 备选：尝试通过 nativePost 发送符合协议的 JSON
      if (nativePost) {
        try {
          nativePost(JSON.stringify({
            cmd: "distillery_forward_message",
            payload: finalPayload,
            callback: 0,
            error: 0
          }));
        } catch(e) {}
      }
    },

    sendRaw(payload) {
      if (nativePost) {
        try {
          nativePost(JSON.stringify(payload));
        } catch(e) {}
      }
    }
  };

  // 通知主进程：桥接已就绪
  window.__DISTILLERY_BRIDGE__.send({ type: 'webview-ready' });

  // 监听来自父窗口的命令
  if (isIframe) {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === '__distillery_eval') {
        try {
          // 安全提示：虽然 eval 有风险，但在受控的本地代理环境下是必要的
          (0, eval)(event.data.script);
        } catch (e) {
          console.error('[Distillery Bridge] Eval error:', e);
          window.__DISTILLERY_BRIDGE__.send({
            type: 'eval-error',
            error: e.message
          });
        }
      }
    });
  }

  // 监听 DOMContentLoaded
  document.addEventListener('DOMContentLoaded', () => {
    window.__DISTILLERY_BRIDGE__.send({ type: 'page-loaded' });
  });
})();
