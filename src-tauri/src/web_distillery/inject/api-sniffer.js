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
    // 如果 resource-proxy.js 已经保存了原始 URL，优先使用
    this._originalApiUrl = this.__originalUrl || url;
    return open.apply(this, arguments);
  };

  XHR.send = function () {
    this.addEventListener('load', function () {
      try {
        // 优先使用原始 URL（resource-proxy.js 重写前的）
        const url = this._originalApiUrl || this._url;
        // 简单过滤：忽略静态资源和代理内部路径
        if (url.includes('.js') || url.includes('.css') || url.includes('.png') || url.includes('.jpg')) return;
        if (url.startsWith('/__distillery/')) return;

        const contentType = this.getResponseHeader('content-type') || '';
        window.__DISTILLERY_BRIDGE__.send({
          type: 'api-discovered',
          url: url,
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
    // 在调用前记录原始 URL（resource-proxy.js 可能会重写 args）
    let originalUrl = '';
    let method = 'GET';

    if (typeof args[0] === 'string') {
      originalUrl = args[0];
      method = args[1]?.method || 'GET';
    } else if (args[0] instanceof Request) {
      originalUrl = args[0].url;
      method = args[0].method;
    }

    const response = await originalFetch.apply(this, args);

    try {
      // 从代理 URL 中还原原始 URL
      let reportUrl = originalUrl;
      if (reportUrl.includes('/proxy-resource?url=')) {
        try {
          const u = new URL(reportUrl, window.location.origin);
          reportUrl = decodeURIComponent(u.searchParams.get('url') || reportUrl);
        } catch (e) { }
      }

      // 忽略静态资源和代理内部路径
      if (reportUrl.startsWith('/__distillery/')) { /* skip */ }
      else if (!reportUrl.includes('.js') && !reportUrl.includes('.css') && !reportUrl.includes('.png')) {
        const ct = response.headers.get('content-type') || '';
        window.__DISTILLERY_BRIDGE__.send({
          type: 'api-discovered',
          url: reportUrl,
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
