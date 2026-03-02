# CSS 变量宏使用示例

## 概述

`{{cssvar::变量名}}` 宏允许在预设消息中动态获取当前主题的 CSS 变量实际值，帮助 LLM 更准确地理解和使用主题配色。

## 基础用法

### 在视觉化输出指南中使用

**原始指南（静态）**：
```markdown
## 可用的 CSS 变量

- `--primary-color`: 主题色
- `--card-bg`: 卡片背景
- `--primary-text`: 主文字颜色
```

**增强后的指南（动态）**：
```markdown
## 当前主题的 CSS 变量实际值

- `--primary-color` = {{cssvar::--primary-color}} (主题色)
- `--card-bg` = {{cssvar::--card-bg}} (卡片背景)
- `--primary-text` = {{cssvar::--primary-text}} (主文字颜色)
- `--secondary-bg` = {{cssvar::--secondary-bg}} (次级背景)
- `--border-color` = {{cssvar::--border-color}} (边框颜色)
```

## 高级示例：智能警告系统

在预设消息中添加动态警告，根据当前主题提供针对性建议：

```markdown
### 🎨 当前主题配色信息

**主题色**: {{cssvar::--primary-color}}
**卡片背景**: {{cssvar::--card-bg}}
**文字颜色**: {{cssvar::--primary-text}}

⚠️ **重要提示**：
- 主题色（{{cssvar::--primary-color}}）是用于**强调和点缀**的，不适合作为大面积背景色
- 如果需要容器背景，请使用 `var(--card-bg)` 或 `var(--secondary-bg)`
- 文字颜色应使用 `var(--primary-text)` 以确保在所有主题下可读

### ✅ 正确示例
```css
.container {
  background: var(--card-bg);
  color: var(--primary-text);
  border-left: 4px solid var(--primary-color); /* 主题色用于强调 */
}
```

### ❌ 错误示例
```css
.container {
  background: var(--primary-color); /* 错误：主题色不适合做背景 */
  color: white; /* 错误：硬编码颜色，无法适配主题 */
}
```
```

## 实际效果对比

### 浅色主题下
宏展开后：
```
主题色: #3b82f6
卡片背景: rgba(255, 255, 255, 0.8)
文字颜色: #1f2937
```

### 深色主题下
宏展开后：
```
主题色: #60a5fa
卡片背景: rgba(31, 41, 55, 0.8)
文字颜色: #f9fafb
```

## 完整的视觉化输出指南模板

```markdown
# 视觉化输出指南

## 当前环境信息

**主题模式**: {{cssvar::--theme-mode}}
**操作系统**: {{os}}

## CSS 变量速查表

| 用途 | 变量名 | 当前值 | 说明 |
|:---|:---|:---|:---|
| **背景** | `--primary-bg` | {{cssvar::--primary-bg}} | 主背景 |
| | `--secondary-bg` | {{cssvar::--secondary-bg}} | 次级背景 |
| | `--card-bg` | {{cssvar::--card-bg}} | 卡片背景 |
| **文字** | `--primary-text` | {{cssvar::--primary-text}} | 主文字 |
| | `--text-color-secondary` | {{cssvar::--text-color-secondary}} | 次要文字 |
| **语义色** | `--primary-color` | {{cssvar::--primary-color}} | 主题色 |
| | `--success-color` | {{cssvar::--success-color}} | 成功（绿） |
| | `--warning-color` | {{cssvar::--warning-color}} | 警告（黄） |
| | `--danger-color` | {{cssvar::--danger-color}} | 危险（红） |
| **边框** | `--border-color` | {{cssvar::--border-color}} | 通用边框 |

## 设计原则

1. **语义化优先**: 使用语义化的变量名（如 `--card-bg`），而不是直接使用颜色值
2. **主题色克制**: 主题色（当前为 {{cssvar::--primary-color}}）仅用于强调，不做大面积背景
3. **对比度保证**: 确保文字与背景有足够的对比度，使用 `--primary-text` 而非硬编码颜色
```

## 注意事项

1. **执行时机**: 宏在每次 LLM 请求时执行，会自动获取最新的主题值
2. **变量前缀**: 支持带或不带 `--` 前缀，`{{cssvar::primary-color}}` 和 `{{cssvar::--primary-color}}` 等效
3. **未定义处理**: 如果变量不存在，会返回 `(未定义: 变量名)` 提示
4. **性能影响**: 宏执行开销极小，可以放心在多处使用

## 最佳实践

1. **集中定义**: 在一个预设消息中集中定义所有常用变量的当前值
2. **配合示例**: 结合正确/错误示例，让 LLM 更好地理解使用场景
3. **动态警告**: 根据主题特性（如浅色/深色）提供针对性建议
4. **保持更新**: 当添加新的 CSS 变量时，同步更新指南中的宏调用