import { RenderPreset } from "../types";

export const emojiPreset: RenderPreset = {
  id: "emoji",
  name: "Emoji 和特殊字符",
  description: "测试 Emoji 和特殊字符渲染",
  content: `# Emoji 渲染测试 🎨

## 常用 Emoji

### 表情符号
😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘

### 手势
👍 👎 👌 ✌️ 🤞 🤘 🤙 👋 🤚 🖐️ ✋ 🖖 👏

### 符号
✅ ❌ ⚠️ 🚀 🎯 💡 🔥 ⭐ 🌟 💯 🎉 🎊

## 状态指示

| 状态 | 图标 | 说明 |
|------|------|------|
| 成功 | ✅ | 操作成功完成 |
| 失败 | ❌ | 操作失败 |
| 警告 | ⚠️ | 需要注意 |
| 进行中 | 🔄 | 正在处理 |
| 待处理 | ⏳ | 等待中 |

## 代码中的 Emoji

\`\`\`javascript
// 使用 Emoji 让代码更生动
const status = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️'
};

console.log(\`操作结果: \${status.success}\`);
\`\`\`

## 特殊字符

### 数学符号
∑ ∏ √ ∞ ≈ ≠ ≤ ≥ ± × ÷

### 箭头
← → ↑ ↓ ↔ ↕ ⇐ ⇒ ⇑ ⇓ ⇔

### 其他符号
© ® ™ § ¶ † ‡ • ◦ ‣ ⁃`,
};
