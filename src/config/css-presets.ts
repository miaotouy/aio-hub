/**
 * 内置的 CSS 预设配置
 * 适配新的主题外观系统 (ThemeAppearance)
 */

import type { CssPreset } from '@/types/css-override';

/**
 * 内置 CSS 预设列表
 */
export const builtInCssPresets: CssPreset[] = [
  {
    id: 'acrylic-blur',
    name: '通透毛玻璃',
    description: '增强UI的通透感和模糊效果，现代感十足',
    content: `/* 通透毛玻璃预设 */
:root {
  /* 强制开启高斯模糊 */
  --ui-blur: 10px !important;

  /* 调整各层级透明度以达到最佳效果 */
  --sidebar-opacity: 0.1 !important;
  --card-opacity: 0.15 !important;
  --header-opacity: 0.15 !important;
  --input-opacity: 0.15 !important;
  --overlay-opacity: 0.35 !important; /* 弹窗稍不透明以保证可读性 */
  --border-opacity: 0.2 !important;

  /* 编辑器背景需要特别调整 */
  --vscode-editor-background: rgba(var(--card-bg-rgb), 0.3) !important;
}

/* 为主要组件添加模糊背景 */
.glass-card, .glass-sidebar, .glass-overlay {
  backdrop-filter: blur(var(--ui-blur)) !important;
  -webkit-backdrop-filter: blur(var(--ui-blur)) !important;
}`,
  },
  {
    id: 'color-overlay-sunset',
    name: '日落光辉',
    description: '模拟日落时的暖色调光辉叠加在UI上',
    content: `/* 日落光辉颜色叠加预设 */
body::after {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(to top right, rgba(255, 110, 19, 0.2), rgba(252, 206, 49, 0.2));
  mix-blend-mode: soft-light; /* 使用柔光混合模式 */
  pointer-events: none;
  z-index: -1; /* 确保在UI内容之下，壁纸之上 */
}

html.dark body::after {
  mix-blend-mode: overlay; /* 暗色模式下用叠加效果更好 */
  background: linear-gradient(to top right, rgba(255, 110, 19, 0.3), rgba(252, 206, 49, 0.3));
}`,
  },
  {
    id: 'cyberpunk-enhanced',
    name: '赛博朋克 (增强)',
    description: '未来感科技风格，通过滤镜增强霓虹色彩',
    content: `/* 赛博朋克增强预设 */
:root {
  /* 使用滤镜增强主题色，使其更亮，而不是直接覆盖 */
  --primary-color-filter: drop-shadow(0 0 5px var(--el-color-primary)) brightness(1.2);
  --danger-color-filter: drop-shadow(0 0 5px var(--el-color-danger)) brightness(1.2);
}

.el-button--primary, .el-tag--primary {
  filter: var(--primary-color-filter);
}
.el-button--danger, .el-tag--danger {
  filter: var(--danger-color-filter);
}

/* 卡片和主要容器的霓虹边框 */
.el-card, .main-sidebar, .title-bar {
  border: 1px solid var(--el-color-primary-light-5) !important;
  box-shadow: 0 0 10px rgba(var(--el-color-primary-rgb), 0.2) !important;
  transition: all 0.3s ease;
}
.el-card:hover {
  box-shadow: 0 0 15px rgba(var(--el-color-primary-rgb), 0.4) !important;
}`,
  },
  {
    id: 'minimalist-pure',
    name: '简约纯净',
    description: '去除所有阴影和不必要的装饰，极简设计',
    content: `/* 简约纯净预设 */
* {
  box-shadow: none !important;
  text-shadow: none !important;
  border-radius: 4px !important; /* 统一圆角 */
  animation: none !important;
  transition-duration: 0.15s !important;
}

/* 简化边框 */
.el-card, .el-input, .el-button {
  border: 1px solid var(--border-color) !important;
}

/* 移除标题栏和侧边栏的边框 */
.title-bar, .main-sidebar {
  border: none !important;
}`,
  },
  {
    id: 'high-contrast-accessible',
    name: '高对比度 (可访问性)',
    description: '通过滤镜提升对比度，强化文本，适用于亮暗两种模式',
    content: `/* 高对比度可访问性预设 */
:root {
  filter: contrast(1.15);
}
body {
  font-weight: 500 !important; /* 全局字体加粗 */
}
/* 强化所有元素的边框 */
* {
  border-width: 1px !important;
  border-style: solid !important;
  border-color: var(--border-color) !important;
}
/* 对文本输入和按钮进行特殊强化 */
.el-input__wrapper, .el-button {
  border-width: 2px !important;
}`,
  },
  {
    id: 'retro-terminal-v2',
    name: '复古终端 v2',
    description: '经典的绿色终端风格，适配新主题系统',
    content: `/* 复古终端 v2 预设 */
@import url('https://fonts.googleapis.com/css2?family=Fira+Code&display=swap');
:root {
  --el-font-family: 'Fira Code', 'Courier New', monospace !important;
}
body, input, textarea, button {
  font-family: var(--el-font-family) !important;
  text-shadow: 0 0 2px rgba(0, 255, 0, 0.5);
  color: #0f0;
}
/* 覆盖 Element Plus 的颜色变量 */
:root {
  --el-color-primary: #0f0 !important;
  --el-text-color-primary: #0f0 !important;
  --el-text-color-regular: #0f0 !important;
  --el-bg-color: #050a05 !important;
  --el-fill-color-blank: #050a05 !important;
}
html.dark {
  --el-bg-color: #050a05 !important;
  --el-fill-color-blank: #050a05 !important;
}

/* 扫描线效果 */
body::before {
  content: '';
  position: fixed;
  top: 0; left: 0;
  width: 100%; height: 100%;
  background: linear-gradient(transparent 50%, rgba(0, 0, 0, 0.2) 50%);
  background-size: 100% 4px;
  pointer-events: none;
  z-index: 9999;
  animation: scanline 10s linear infinite;
}
@keyframes scanline {
  from { background-position-y: 0; }
  to { background-position-y: 100px; }
}`,
  },
  {
    id: 'dynamic-starry-sky',
    name: '动态星空',
    description: '使用纯CSS动画在背景中生成一片动态的星空',
    content: `/* 动态星空背景预设 */
@keyframes move-twink-back {
    from {background-position:0 0;}
    to {background-position:-10000px 5000px;}
}
@keyframes move-clouds-back {
    from {background-position:0 0;}
    to {background-position:10000px 0;}
}

.stars, .twinkling, .clouds {
  position:fixed;
  top:0;
  left:0;
  right:0;
  bottom:0;
  width:100%;
  height:100%;
  display:block;
  z-index: -2; /* 确保在壁纸层 */
}

.stars {
  background:#000 url(https://www.script-tutorials.com/demos/360/images/stars.png) repeat top center;
}

.twinkling{
  background:transparent url(https://www.script-tutorials.com/demos/360/images/twinkling.png) repeat top center;
  animation:move-twink-back 200s linear infinite;
}

/* 注入到 body 伪元素，避免创建额外 DOM */
body::before {
  content: '';
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: transparent url(https://www.script-tutorials.com/demos/360/images/twinkling.png) repeat top center;
  animation: move-twink-back 200s linear infinite;
  z-index: -2;
}
body::after {
  content: '';
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: #000 url(https://www.script-tutorials.com/demos/360/images/stars.png) repeat top center;
  z-index: -3; /* 在闪烁层之下 */
}
`,
  },
];

/**
 * 根据 ID 获取预设
 */
export function getPresetById(id: string): CssPreset | undefined {
  return builtInCssPresets.find((preset) => preset.id === id);
}

/**
 * 默认的用户 CSS 配置
 */
export const defaultUserCssSettings = {
  enabled: false,
  basedOnPresetId: null,
  customContent: '',
};