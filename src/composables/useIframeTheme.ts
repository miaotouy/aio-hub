import { ref, computed, watch, onMounted } from 'vue';
import { useTheme } from '@/composables/useTheme';
import { useThemeAppearance } from '@/composables/useThemeAppearance';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('useIframeTheme');

// 需要传递给 iframe 的核心 CSS 变量列表
const THEME_VARIABLES = [
  // 基础颜色
  '--bg-color',
  '--bg-color-rgb',
  '--container-bg',
  '--container-bg-rgb',
  '--card-bg',
  '--card-bg-rgb',
  '--text-color',
  '--text-color-rgb',
  '--text-color-light',

  // 边框
  '--border-color',
  '--border-color-rgb',
  '--border-color-light',
  '--border-opacity',

  // 功能色
  '--primary-color',
  '--primary-hover-color',
  '--success-color',
  '--warning-color',
  '--danger-color',
  '--info-color',
  '--error-color',

  // 滚动条
  '--scrollbar-thumb-color',
  '--scrollbar-thumb-hover-color',
  '--scrollbar-track-color',
  '--scrollbar-thumb-opacity',
  '--scrollbar-thumb-hover-opacity',

  // UI 特效
  '--ui-blur',

  // 代码块 (如果 iframe 展示代码)
  '--code-block-bg',
  '--code-block-opacity',

  // Element Plus 兼容变量 (部分组件可能需要)
  '--el-text-color-primary',
  '--el-text-color-regular',
  '--el-text-color-secondary',
  '--el-border-color',
  '--el-color-primary',
];

/**
 * 为 iframe 内容注入当前应用的主题样式
 * @param contentRef 原始 HTML 内容的 ref 或 getter
 * @returns 注入了样式后的 HTML 内容
 */
export function useIframeTheme(contentRef: () => string | undefined) {
  const { isDark } = useTheme();
  const { appearanceSettings } = useThemeAppearance();
  const themeCssText = ref('');

  /**
   * 从主文档中提取主题相关的 CSS 变量，并生成样式表文本
   */
  function updateThemeCss() {
    const rootStyles = getComputedStyle(document.documentElement);
    const cssLines: string[] = [];

    // 提取定义的变量
    for (const varName of THEME_VARIABLES) {
      const value = rootStyles.getPropertyValue(varName).trim();
      if (value) {
        cssLines.push(`${varName}: ${value};`);
      }
    }

    // 获取字体设置，确保一致性
    const bodyStyles = getComputedStyle(document.body);
    const fontFamily = bodyStyles.fontFamily;
    const fontSize = bodyStyles.fontSize;
    const lineHeight = bodyStyles.lineHeight;

    const variablesCss = cssLines.join('\n');

    const finalCss = `
      :root {
        ${variablesCss}
        color-scheme: ${isDark.value ? 'dark' : 'light'};
      }
      
      html, body {
        height: 100%;
        margin: 0;
        padding: 0;
      }

      body {
        background-color: var(--bg-color, #ffffff);
        color: var(--text-color, #333333);
        font-family: ${fontFamily};
        font-size: ${fontSize};
        line-height: ${lineHeight};
        padding: 16px;
        box-sizing: border-box;
        transition: background-color 0.3s, color 0.3s;
        /* 优化字体渲染 */
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
      }

      /* 链接样式 */
      a {
        color: var(--primary-color, #409eff);
        text-decoration: none;
      }
      a:hover {
        text-decoration: underline;
      }

      /* 滚动条样式适配 - 与主应用保持一致 */
      ::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      ::-webkit-scrollbar-track {
        background: var(--scrollbar-track-color, transparent);
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb {
        background: var(--scrollbar-thumb-color, rgba(144, 147, 153, 0.3));
        border-radius: 4px;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: var(--scrollbar-thumb-hover-color, rgba(144, 147, 153, 0.5));
      }
      ::-webkit-scrollbar-corner {
        background: transparent;
      }

      /* 代码块样式基础适配 */
      pre, code {
        font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
      }
      pre {
        background-color: var(--code-block-bg, rgba(0, 0, 0, 0.05));
        padding: 1em;
        border-radius: 4px;
        overflow-x: auto;
      }
      
      /* 引用块样式 */
      blockquote {
        border-left: 4px solid var(--primary-color);
        margin: 1em 0;
        padding-left: 1em;
        color: var(--text-color-light);
      }
      
      /* 表格样式 */
      table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
      }
      th, td {
        border: 1px solid var(--border-color);
        padding: 8px;
        text-align: left;
      }
      th {
        background-color: var(--table-header-bg, rgba(128, 128, 128, 0.1));
      }
    `;
    themeCssText.value = finalCss;
    logger.debug('Generated theme CSS for iframe');
  }

  onMounted(() => {
    // 等待一小段时间，确保主应用样式已完全计算
    // 增加一点延迟以确保在复杂页面加载时也能获取到正确样式
    setTimeout(updateThemeCss, 100);
  });

  watch([isDark, appearanceSettings], () => {
    // 使用 requestAnimationFrame 确保在下一帧样式更新后获取
    requestAnimationFrame(() => {
      updateThemeCss();
    });
  }, { deep: true });

  // 为 HTML 内容注入主题样式
  const themedContent = computed(() => {
    const content = contentRef();
    if (!content) return '';

    // 如果没有生成 CSS，先尝试生成一次
    if (!themeCssText.value) {
      updateThemeCss();
    }

    const css = themeCssText.value;
    // 即使没有 CSS (极少数情况)，也返回内容

    const styleTag = `<style id="injected-theme-style">${css}</style>`;

    // 检查是否已有 </head> 标签
    if (content.includes('</head>')) {
      return content.replace('</head>', `${styleTag}</head>`);
    } else if (content.includes('<head>')) {
      return content.replace('<head>', `<head>${styleTag}`);
    } else if (content.includes('<body')) { // 匹配 <body ...> 或 <body>
      // 在 body 前插入 head
      return content.replace(/<body/i, `<head>${styleTag}</head><body`);
    } else {
      // 没有 head 和 body 标签, 可能是片段, 包裹起来
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${styleTag}
          </head>
          <body>
            ${content}
          </body>
        </html>
      `;
    }
  });

  return {
    themedContent,
    updateThemeCss
  };
}