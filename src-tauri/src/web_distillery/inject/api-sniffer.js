/**
 * api-sniffer.js
 * 注入子 Webview 的脚本，用于 Hook 请求并发现潜在 API
 */
(function () {
  if (window.__DISTILLERY_SNIFFER_LOADED__) return;
  window.__DISTILLERY_SNIFFER_LOADED__ = true;

  const bridge = window.__DISTILLERY_BRIDGE__;
  if (!bridge) {
    console.warn('[Sniffer] Bridge not found, skipping');
    return;
  }

  // 辅助函数：解析响应类型
  function getContentType(headers) {
    if (!headers) return 'unknown';
    const ct = headers.get ? headers.get('content-type') : headers['content-type'];
    if (ct && ct.includes('json')) return 'json';
    if (ct && ct.includes('xml')) return 'xml';
    return 'other';
  }

  // 1. Hook XMLHttpRequest
  const XHR = XMLHttpRequest.prototype;
  const open = XHR.open;
  const send = XHR.send;

  XHR.open = function (method, url) {
    this._method = method;
    this._url = url;
    return open.apply(this, arguments);
  };

  XHR.send = function () {
    this.addEventListener('load', function () {
      try {
        const url = this._url;
        // 简单过滤：忽略静态资源，关注可能的 API
        if (url.includes('.js') || url.includes('.css') || url.includes('.png') || url.includes('.jpg')) return;

        const contentType = this.getResponseHeader('content-type') || '';
        window.__DISTILLERY_BRIDGE__.send({
          type: 'api-discovered',
          url: this.responseURL || url,
          method: this._method,
          apiType: contentType.includes('json') ? 'json' : 'xhr',
          status: this.status
        });
      } catch (e) { }
    });
    return send.apply(this, arguments);
  };

  // 2. Hook Fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      let url = '';
      let method = 'GET';

      if (typeof args[0] === 'string') {
        url = args[0];
        method = args[1]?.method || 'GET';
      } else if (args[0] instanceof Request) {
        url = args[0].url;
        method = args[0].method;
      }

      // 忽略静态资源
      if (!url.includes('.js') && !url.includes('.css') && !url.includes('.png')) {
        const ct = response.headers.get('content-type') || '';
        window.__DISTILLERY_BRIDGE__.send({
          type: 'api-discovered',
          url: url,
          method: method,
          apiType: ct.includes('json') ? 'json' : 'fetch',
          status: response.status
        });
      }
    } catch (e) { }

    return response;
  };

  console.log('[Sniffer] Hooked fetch/XHR');
})();
