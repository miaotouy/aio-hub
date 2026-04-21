/**
 * inject/selector-picker.js - 元素拾取器脚本
 * 注入到子 Webview 中，实现可视化元素选择
 */
(function () {
  if (window.__distillerySelectorPicker) return;

  const style = `
    #distillery-overlay {
      position: fixed;
      pointer-events: none;
      z-index: 2147483647;
      background: rgba(64, 158, 255, 0.2);
      border: 2px solid #409EFF;
      transition: all 0.05s ease;
      display: none;
    }
    .distillery-persistent-highlight {
      position: absolute;
      pointer-events: none;
      z-index: 2147483646;
      border: 2px dashed;
    }
    .distillery-persistent-highlight.mode-include {
      background: rgba(64, 158, 255, 0.05);
      border-color: rgba(64, 158, 255, 0.5);
    }
    .distillery-persistent-highlight.mode-exclude {
      background: rgba(245, 108, 108, 0.05);
      border-color: rgba(245, 108, 108, 0.5);
    }
    #distillery-overlay.mode-exclude {
      background: rgba(245, 108, 108, 0.15);
      border-color: #F56C6C;
    }
    #distillery-overlay.mode-action {
      background: rgba(103, 194, 58, 0.2);
      border-color: #67C23A;
    }
    #distillery-label {
      position: absolute;
      top: -24px;
      left: 0;
      background: #409EFF;
      color: white;
      padding: 2px 6px;
      font-size: 12px;
      border-radius: 2px;
      white-space: nowrap;
      pointer-events: none;
    }
    #distillery-overlay.mode-exclude #distillery-label {
      background: #F56C6C;
    }
    #distillery-overlay.mode-action #distillery-label {
      background: #67C23A;
    }
  `;

  const container = document.createElement('div');
  const shadow = container.attachShadow({ mode: 'open' });

  const styleEl = document.createElement('style');
  styleEl.textContent = style;
  shadow.appendChild(styleEl);

  const overlay = document.createElement('div');
  overlay.id = 'distillery-overlay';
  const label = document.createElement('div');
  label.id = 'distillery-label';
  overlay.appendChild(label);
  shadow.appendChild(overlay);

  document.body.appendChild(container);

  let lastElement = null;
  let currentOptions = { mode: 'include', continuous: true };
  let persistentHighlights = new Map(); // selector -> element

  function updatePersistentHighlights() {
    // 清理已经不存在的元素的高亮
    for (const [selector, highlightEl] of persistentHighlights.entries()) {
      const targetEl = document.querySelector(selector);
      if (!targetEl) {
        highlightEl.remove();
        persistentHighlights.delete(selector);
        continue;
      }
      const rect = targetEl.getBoundingClientRect();
      highlightEl.style.top = (rect.top + window.scrollY) + 'px';
      highlightEl.style.left = (rect.left + window.scrollX) + 'px';
      highlightEl.style.width = rect.width + 'px';
      highlightEl.style.height = rect.height + 'px';
    }
  }

  function addPersistentHighlight(selector, mode) {
    if (persistentHighlights.has(selector)) return;

    const targetEl = document.querySelector(selector);
    if (!targetEl) return;

    const highlightEl = document.createElement('div');
    highlightEl.className = `distillery-persistent-highlight mode-${mode}`;
    const rect = targetEl.getBoundingClientRect();
    highlightEl.style.top = (rect.top + window.scrollY) + 'px';
    highlightEl.style.left = (rect.left + window.scrollX) + 'px';
    highlightEl.style.width = rect.width + 'px';
    highlightEl.style.height = rect.height + 'px';

    shadow.appendChild(highlightEl);
    persistentHighlights.set(selector, highlightEl);
  }

  function removePersistentHighlight(selector) {
    const el = persistentHighlights.get(selector);
    if (el) {
      el.remove();
      persistentHighlights.delete(selector);
    }
  }

  function clearAllPersistentHighlights() {
    for (const el of persistentHighlights.values()) {
      el.remove();
    }
    persistentHighlights.clear();
  }

  function getSelector(el) {
    if (el.id && !/^\d/.test(el.id)) return '#' + el.id;
    if (el === document.body) return 'body';
    if (el === document.documentElement) return 'html';

    // 尝试寻找带有 data- 属性的元素
    const dataAttr = Array.from(el.attributes).find(attr => attr.name.startsWith('data-') && attr.value);
    if (dataAttr) {
      return `${el.tagName.toLowerCase()}[${dataAttr.name}="${dataAttr.value}"]`;
    }

    let path = [];
    let current = el;
    while (current && current.parentElement) {
      let selector = current.tagName.toLowerCase();

      // 尝试使用 class，但排除掉过于通用的 class
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).filter(c =>
          c && !/^(el-|v-|is-|active|selected|hover)/.test(c)
        );
        if (classes.length > 0) {
          selector += '.' + classes[0];
        }
      }

      let siblings = Array.from(current.parentElement.children).filter(e => e.tagName === current.tagName);
      if (siblings.length > 1) {
        let index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
      path.unshift(selector);
      current = current.parentElement;

      // 如果路径已经包含 ID，则停止向上回溯
      if (current && current.id && !/^\d/.test(current.id)) {
        path.unshift('#' + current.id);
        break;
      }
    }
    return path.join(' > ');
  }

  function onMouseMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === lastElement || el === container) return;

    lastElement = el;
    const rect = el.getBoundingClientRect();

    overlay.style.display = 'block';
    overlay.style.top = (rect.top + window.scrollY) + 'px';
    overlay.style.left = (rect.left + window.scrollX) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    const selector = getSelector(el);
    label.textContent = (currentOptions.mode === 'exclude' ? '- ' : '+ ') + selector;

    // 发送 hover 消息
    if (window.__DISTILLERY_BRIDGE__) {
      window.__DISTILLERY_BRIDGE__.send({
        type: 'element-hovered',
        data: {
          selector: selector,
          tagName: el.tagName,
          textPreview: el.innerText.substring(0, 100).trim()
        }
      });
    }
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el) {
      const selector = getSelector(el);
      if (window.__DISTILLERY_BRIDGE__) {
        window.__DISTILLERY_BRIDGE__.send({
          type: 'element-selected',
          data: {
            selector: selector,
            tagName: el.tagName,
            innerText: el.innerText.substring(0, 100).trim(),
            mode: currentOptions.mode
          }
        });
      }

      if (!currentOptions.continuous) {
        window.__distillerySelectorPicker.disable();
      }
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      window.__distillerySelectorPicker.disable();
      if (window.__DISTILLERY_BRIDGE__) {
        window.__DISTILLERY_BRIDGE__.send({ type: 'picker-cancelled' });
      }
    }
  }

  window.__distillerySelectorPicker = {
    enable: (options) => {
      currentOptions = Object.assign({ mode: 'include', continuous: true }, options);

      // 更新样式类
      overlay.className = '';
      if (currentOptions.mode === 'exclude') overlay.classList.add('mode-exclude');
      if (currentOptions.mode === 'action') overlay.classList.add('mode-action');

      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('keydown', onKeyDown, true);
      overlay.style.display = 'none';
      console.log('Distillery Selector Picker Enabled', currentOptions);
    },
    disable: () => {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeyDown, true);
      overlay.style.display = 'none';
      lastElement = null;
      console.log('Distillery Selector Picker Disabled');
    }
  };
})();
