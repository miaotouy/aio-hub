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
 * resource-proxy.js - 资源代理重写层
 * 必须在 anti-detection.js 之后、bridge.js 之前注入（同步执行）
 *
 * 解决三个核心问题：
 * 1. 跨域图片 403（CDN 防盗链）：将外部图片 URL 重写为 /proxy-resource?url=...
 * 2. API CORS 阻止：将跨域 fetch/XHR 请求重写为代理路径
 * 3. 懒加载干预：移除 loading="lazy" 属性，强制立即加载
 */
(function () {
  'use strict';

  // 当前代理服务器的 origin（用于判断是否跨域）
  var proxyOrigin = window.location.origin;

  // 不应代理的内部域名（Tauri IPC 等）
  function isInternalUrl(url) {
    if (!url || typeof url !== 'string') return false;
    // Tauri IPC 通信地址 — 绝不能代理
    if (url.indexOf('ipc.localhost') !== -1) return true;
    if (url.indexOf('tauri.localhost') !== -1) return true;
    // Tauri asset 协议
    if (url.indexOf('asset.localhost') !== -1) return true;
    return false;
  }

  // 判断 URL 是否为跨域（绝对 URL 且 origin 不同）
  function isCrossOrigin(url) {
    if (!url || typeof url !== 'string') return false;
    // 内部 URL 永远不代理
    if (isInternalUrl(url)) return false;
    // 协议相对 URL (//example.com/...)
    if (url.startsWith('//')) return true;
    // 绝对 URL
    if (/^https?:\/\//i.test(url)) {
      try {
        var parsed = new URL(url);
        return parsed.origin !== proxyOrigin;
      } catch (e) {
        return false;
      }
    }
    // data: / blob: / 相对路径都不是跨域
    return false;
  }

  // 将跨域 URL 转换为代理 URL
  function toProxyUrl(url) {
    if (!url || typeof url !== 'string') return url;
    // 协议相对 URL 补全为 https
    var fullUrl = url;
    if (url.startsWith('//')) {
      fullUrl = 'https:' + url;
    }
    return '/proxy-resource?url=' + encodeURIComponent(fullUrl);
  }

  // ============================================================
  // 1. Hook Fetch — 将跨域请求重写为代理路径
  //    同时拦截 Tauri IPC 的 open_url 调用，转为正常页面导航
  // ============================================================
  var originalFetch = window.fetch;
  window.fetch = function () {
    var args = Array.prototype.slice.call(arguments);
    var input = args[0];
    var url = '';

    if (typeof input === 'string') {
      url = input;
    } else if (input instanceof Request) {
      url = input.url;
    }

    // 拦截 Tauri IPC 的 open_url 调用：提取目标 URL 并执行代理内导航
    if (url && url.indexOf('ipc.localhost') !== -1 && url.indexOf('open_url') !== -1) {
      // 阻止 IPC 调用，改为代理内页面导航
      // 从请求 body 中提取目标 URL（Tauri IPC 的 body 是 JSON 或 ArrayBuffer）
      var bodySource = null;
      if (args[1] && args[1].body) {
        bodySource = args[1].body;
      } else if (input instanceof Request) {
        bodySource = input.body;
      }
      if (bodySource && typeof bodySource === 'string') {
        try {
          var parsed = JSON.parse(bodySource);
          var targetUrl = parsed.url || (parsed.data && parsed.data.url);
          if (targetUrl && /^https?:\/\//.test(targetUrl)) {
            // 将绝对 URL 转为相对路径，保持在代理服务器内
            try {
              var parsedUrl = new URL(targetUrl);
              window.location.href = parsedUrl.pathname + parsedUrl.search + parsedUrl.hash;
            } catch (e2) {
              window.location.href = targetUrl;
            }
            return Promise.resolve(new Response('', { status: 200 }));
          }
        } catch (e) { }
      }
      // 如果无法解析 body，直接返回空响应（不让 502 错误传播）
      return Promise.resolve(new Response('', { status: 200 }));
    }

    // 内部 URL 直接放行（不代理）
    if (isInternalUrl(url)) {
      return originalFetch.apply(this, args);
    }

    if (isCrossOrigin(url)) {
      var proxyUrl = toProxyUrl(url);
      if (typeof input === 'string') {
        args[0] = proxyUrl;
      } else if (input instanceof Request) {
        // 克隆 Request 并替换 URL
        var init = args[1] || {};
        args[0] = proxyUrl;
        args[1] = Object.assign({}, {
          method: input.method,
          headers: input.headers,
          body: input.body,
          mode: 'same-origin',
          credentials: input.credentials,
          cache: input.cache,
          redirect: input.redirect,
          referrer: input.referrer,
          integrity: input.integrity,
        }, init);
      }
    }

    return originalFetch.apply(this, args);
  };

  // ============================================================
  // 2. Hook XMLHttpRequest — 将跨域请求重写为代理路径
  // ============================================================
  var XHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    if (isCrossOrigin(url)) {
      arguments[1] = toProxyUrl(url);
      // 保存原始 URL 供 api-sniffer 使用
      this.__originalUrl = url;
    }
    return XHROpen.apply(this, arguments);
  };

  // ============================================================
  // 3. DOM 资源重写 + 懒加载修复
  // ============================================================

  // 需要代理的外部资源域名模式（常见 CDN）
  // 不限制特定域名，所有跨域资源都走代理
  function processElement(el) {
    // 处理图片
    if (el.tagName === 'IMG') {
      // 移除懒加载
      if (el.loading === 'lazy') {
        el.loading = 'eager';
      }
      if (el.hasAttribute('loading') && el.getAttribute('loading') === 'lazy') {
        el.setAttribute('loading', 'eager');
      }

      // 重写跨域 src
      var src = el.getAttribute('src');
      if (src && isCrossOrigin(src)) {
        el.setAttribute('src', toProxyUrl(src));
      }

      // 重写 srcset
      var srcset = el.getAttribute('srcset');
      if (srcset && isCrossOrigin(srcset.split(',')[0].trim().split(/\s+/)[0])) {
        el.setAttribute('srcset', rewriteSrcset(srcset));
      }

      // 重写 data-src（常见懒加载库使用）
      var dataSrc = el.getAttribute('data-src');
      if (dataSrc && isCrossOrigin(dataSrc)) {
        el.setAttribute('data-src', toProxyUrl(dataSrc));
      }
    }

    // 处理 source 元素（picture/video/audio）
    if (el.tagName === 'SOURCE') {
      var sSrc = el.getAttribute('src');
      if (sSrc && isCrossOrigin(sSrc)) {
        el.setAttribute('src', toProxyUrl(sSrc));
      }
      var sSrcset = el.getAttribute('srcset');
      if (sSrcset && isCrossOrigin(sSrcset.split(',')[0].trim().split(/\s+/)[0])) {
        el.setAttribute('srcset', rewriteSrcset(sSrcset));
      }
    }

    // 处理 video/audio poster
    if (el.tagName === 'VIDEO' || el.tagName === 'AUDIO') {
      var poster = el.getAttribute('poster');
      if (poster && isCrossOrigin(poster)) {
        el.setAttribute('poster', toProxyUrl(poster));
      }
      var vSrc = el.getAttribute('src');
      if (vSrc && isCrossOrigin(vSrc)) {
        el.setAttribute('src', toProxyUrl(vSrc));
      }
    }

    // 处理 link[rel=stylesheet] 的跨域 CSS
    if (el.tagName === 'LINK' && el.getAttribute('rel') === 'stylesheet') {
      var href = el.getAttribute('href');
      if (href && isCrossOrigin(href)) {
        el.setAttribute('href', toProxyUrl(href));
      }
    }
  }

  // 重写 srcset 属性（格式: "url1 1x, url2 2x" 或 "url1 300w, url2 600w"）
  function rewriteSrcset(srcset) {
    return srcset.split(',').map(function (entry) {
      var parts = entry.trim().split(/\s+/);
      if (parts[0] && isCrossOrigin(parts[0])) {
        parts[0] = toProxyUrl(parts[0]);
      }
      return parts.join(' ');
    }).join(', ');
  }

  // 处理已存在的 DOM 元素
  function processExistingElements() {
    var elements = document.querySelectorAll('img, source, video, audio, link[rel="stylesheet"]');
    for (var i = 0; i < elements.length; i++) {
      processElement(elements[i]);
    }
  }

  // MutationObserver：监控新增/修改的 DOM 元素
  function startObserver() {
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];

        // 新增节点
        if (mutation.type === 'childList') {
          for (var j = 0; j < mutation.addedNodes.length; j++) {
            var node = mutation.addedNodes[j];
            if (node.nodeType === 1) {
              processElement(node);
              // 递归处理子元素
              var children = node.querySelectorAll && node.querySelectorAll('img, source, video, audio, link[rel="stylesheet"]');
              if (children) {
                for (var k = 0; k < children.length; k++) {
                  processElement(children[k]);
                }
              }
            }
          }
        }

        // 属性变化（src/srcset 被动态修改）
        if (mutation.type === 'attributes') {
          var target = mutation.target;
          if (target.nodeType === 1) {
            var attrName = mutation.attributeName;
            if (attrName === 'src' || attrName === 'srcset' || attrName === 'data-src' || attrName === 'poster' || attrName === 'href') {
              processElement(target);
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'data-src', 'poster', 'href', 'loading']
    });
  }

  // ============================================================
  // 4. Hook Image 构造函数（处理 JS 动态创建的图片）
  // ============================================================
  var OrigImage = window.Image;
  window.Image = function (width, height) {
    var img = new OrigImage(width, height);
    var origSrcDesc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src') ||
      Object.getOwnPropertyDescriptor(img.__proto__, 'src');

    if (origSrcDesc && origSrcDesc.set) {
      Object.defineProperty(img, 'src', {
        get: function () {
          return origSrcDesc.get ? origSrcDesc.get.call(this) : this.getAttribute('src');
        },
        set: function (val) {
          if (isCrossOrigin(val)) {
            val = toProxyUrl(val);
          }
          if (origSrcDesc.set) {
            origSrcDesc.set.call(this, val);
          } else {
            this.setAttribute('src', val);
          }
        },
        configurable: true
      });
    }

    // 强制 eager loading
    img.loading = 'eager';
    return img;
  };
  window.Image.prototype = OrigImage.prototype;

  // ============================================================
  // 5. 初始化
  // ============================================================

  // DOM 就绪后处理已有元素
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      processExistingElements();
    });
  } else {
    // DOM 已就绪（脚本可能是 defer 加载的）
    processExistingElements();
  }

  // 立即启动 Observer（即使 DOM 还在 loading 也能捕获新增节点）
  startObserver();

  // console.log('[Distillery] Resource proxy layer initialized');
})();