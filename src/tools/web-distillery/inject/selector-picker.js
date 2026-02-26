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
      transition: all 0.1s ease;
      display: none;
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

  function getSelector(el) {
    if (el.id) return '#' + el.id;
    if (el === document.body) return 'body';

    let path = [];
    while (el.parentElement) {
      let selector = el.tagName.toLowerCase();
      let siblings = Array.from(el.parentElement.children).filter(e => e.tagName === el.tagName);
      if (siblings.length > 1) {
        let index = siblings.indexOf(el) + 1;
        selector += `:nth-of-type(${index})`;
      }
      path.unshift(selector);
      el = el.parentElement;
    }
    return path.join(' > ');
  }

  function onMouseMove(e) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === lastElement || el === container) return;

    lastElement = el;
    const rect = el.getBoundingClientRect();

    overlay.style.display = 'block';
    overlay.style.top = rect.top + 'px';
    overlay.style.left = rect.left + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';

    label.textContent = el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ').join('.') : '');
  }

  function onClick(e) {
    e.preventDefault();
    e.stopPropagation();

    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (el) {
      const selector = getSelector(el);
      // 发送消息到主窗口
      window.__TAURI_INTERNALS__.invoke("distillery_message", {
        payload: JSON.stringify({
          type: 'element-selected',
          data: {
            selector: selector,
            tagName: el.tagName,
            innerText: el.innerText.substring(0, 100)
          }
        })
      });
    }
  }

  window.__distillerySelectorPicker = {
    enable: () => {
      document.addEventListener('mousemove', onMouseMove, true);
      document.addEventListener('click', onClick, true);
      overlay.style.display = 'none';
      console.log('Distillery Selector Picker Enabled');
    },
    disable: () => {
      document.removeEventListener('mousemove', onMouseMove, true);
      document.removeEventListener('click', onClick, true);
      overlay.style.display = 'none';
      console.log('Distillery Selector Picker Disabled');
    }
  };
})();
