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

  // 内部 URL 过滤（Tauri IPC 等不应被报告为 API）
  function isInternalUrl(url) {
    if (!url) return false;
    if (url.indexOf('ipc.localhost') !== -1) return true;
    if (url.indexOf('tauri.localhost') !== -1) return true;
    if (url.indexOf('asset.localhost') !== -1) return true;
    return false;
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
        // 简单过滤：忽略静态资源、代理内部路径和 Tauri IPC
        if (url.includes('.js') || url.includes('.css') || url.includes('.png') || url.includes('.jpg')) return;
        if (url.startsWith('/__distillery/')) return;
        if (isInternalUrl(url)) return;

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

      // 忽略静态资源、代理内部路径和 Tauri IPC
      if (reportUrl.startsWith('/__distillery/')) { /* skip */ }
      else if (isInternalUrl(reportUrl)) { /* skip Tauri IPC */ }
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
