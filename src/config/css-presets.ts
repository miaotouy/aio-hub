/**
 * 内置的 CSS 预设配置
 */

import type { CssPreset } from '@/types/css-override';

/**
 * 内置 CSS 预设列表
 */
export const builtInCssPresets: CssPreset[] = [
  {
    id: 'cyberpunk',
    name: '赛博朋克',
    description: '未来感科技风格，霓虹色彩与发光效果',
    content: `/* 赛博朋克主题 */
:root {
  --primary-color: #00ffff !important;
  --success-color: #00ff00 !important;
  --warning-color: #ffff00 !important;
  --danger-color: #ff00ff !important;
  --info-color: #00ffff !important;
}

/* 霓虹发光效果 */
.el-button--primary,
.n-button--primary {
  box-shadow: 0 0 10px var(--primary-color),
              0 0 20px var(--primary-color),
              0 0 30px var(--primary-color) !important;
  animation: neon-pulse 1.5s infinite alternate;
}

@keyframes neon-pulse {
  from { box-shadow: 0 0 5px var(--primary-color); }
  to { box-shadow: 0 0 20px var(--primary-color); }
}

/* 边框霓虹效果 */
.el-card,
.n-card {
  border: 2px solid var(--primary-color) !important;
  box-shadow: 0 0 10px rgba(0, 255, 255, 0.5) !important;
}`,
  },
  {
    id: 'minimalist',
    name: '简约纯净',
    description: '去除所有阴影和装饰，极简设计',
    content: `/* 简约纯净主题 */
* {
  box-shadow: none !important;
  text-shadow: none !important;
}

/* 平面化按钮 */
.el-button,
.n-button {
  border-radius: 2px !important;
  transition: all 0.2s ease !important;
}

.el-button:hover,
.n-button:hover {
  transform: translateY(-1px) !important;
}

/* 简化卡片 */
.el-card,
.n-card {
  border: 1px solid var(--border-color) !important;
  border-radius: 4px !important;
}

/* 移除动画 */
* {
  animation: none !important;
  transition-duration: 0.15s !important;
}`,
  },
  {
    id: 'high-contrast',
    name: '高对比度',
    description: '提升可读性，适合视觉辅助',
    content: `/* 高对比度主题 */
:root {
  --text-primary: #000000 !important;
  --text-secondary: #333333 !important;
  --bg-color: #ffffff !important;
  --card-bg: #f5f5f5 !important;
}

/* 强化边框 */
.el-button,
.el-input,
.el-card,
.n-button,
.n-input,
.n-card {
  border: 2px solid #000000 !important;
}

/* 加粗文字 */
body,
.el-button,
.n-button {
  font-weight: 600 !important;
}

/* 增大字号 */
body {
  font-size: 15px !important;
}`,
  },
  {
    id: 'dark-enhancement',
    name: '暗色增强',
    description: '优化暗色模式，降低亮度护眼',
    content: `/* 暗色增强主题 */
:root {
  --bg-color: #0a0a0a !important;
  --card-bg: #151515 !important;
  --border-color: #2a2a2a !important;
}

/* 降低纯白色亮度 */
* {
  color: #e0e0e0 !important;
}

/* 优化输入框 */
.el-input__inner,
.n-input__input-el {
  background-color: #1a1a1a !important;
  border-color: #333333 !important;
  color: #d0d0d0 !important;
}

/* 柔和的悬停效果 */
.el-button:hover,
.n-button:hover {
  filter: brightness(1.2) !important;
}`,
  },
  {
    id: 'retro-terminal',
    name: '复古终端',
    description: '经典绿色终端风格',
    content: `/* 复古终端主题 */
@import url('https://fonts.googleapis.com/css2?family=Courier+Prime&display=swap');

:root {
  --primary-color: #00ff00 !important;
  --bg-color: #000000 !important;
  --text-primary: #00ff00 !important;
  --card-bg: #0a0a0a !important;
}

/* 终端字体 */
body,
.el-button,
.el-input,
.n-button,
.n-input {
  font-family: 'Courier Prime', 'Courier New', monospace !important;
}

/* 扫描线效果 */
body::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    transparent 50%,
    rgba(0, 255, 0, 0.05) 50%
  );
  background-size: 100% 4px;
  pointer-events: none;
  z-index: 9999;
}

/* 闪烁光标效果 */
.el-input__inner:focus,
.n-input__input-el:focus {
  animation: terminal-blink 1s infinite;
}

@keyframes terminal-blink {
  0%, 49% { border-right: 2px solid #00ff00; }
  50%, 100% { border-right: 2px solid transparent; }
}`,
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