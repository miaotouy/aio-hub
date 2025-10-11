# 模型图标预设目录

这个目录用于存放 LLM 模型的预设图标文件。

## 目录结构

```
public/model-icons/
├── README.md           # 本说明文件
├── openai.svg         # OpenAI 图标
├── anthropic.svg      # Anthropic (Claude) 图标
├── google.svg         # Google (Gemini) 图标
├── deepseek.svg       # DeepSeek 图标
├── moonshot.svg       # Moonshot AI 图标
├── zhipu.svg          # 智谱 AI 图标
├── groq.svg           # Groq 图标
└── xai.svg            # xAI (Grok) 图标
```

## 图标要求

### 文件格式
- 推荐使用 **SVG** 格式（矢量图，可无限缩放）
- 支持 PNG、JPG、JPEG、WEBP、GIF 等格式

### 文件大小
- SVG 文件建议小于 50KB
- 位图文件（PNG/JPG）建议小于 200KB

### 尺寸规范
- SVG：无特定尺寸要求（矢量图可自适应）
- 位图：建议 **128x128** 或 **256x256** 像素
- 保持 **正方形** 比例（1:1）

### 命名规范
- 使用小写字母和连字符
- 例如：`openai.svg`、`claude-ai.png`、`google-gemini.svg`

## 添加新图标

### 方法 1: 直接添加文件
1. 将图标文件放入此目录
2. 确保文件名符合命名规范
3. 在应用的"模型图标配置"页面中添加匹配规则

### 方法 2: 使用配置页面
1. 打开应用设置 → 模型图标配置
2. 点击"查看预设"按钮
3. 使用界面添加新的配置规则

## 匹配规则说明

配置系统支持 4 种匹配类型：

### 1. Provider（提供商级别）
- **匹配值示例**: `openai`, `anthropic`, `gemini`
- **优先级**: 10（最低）
- **说明**: 为整个提供商的所有模型设置统一图标

### 2. Model Prefix（模型前缀）
- **匹配值示例**: `gpt-`, `claude-`, `gemini-`
- **优先级**: 20（中等）
- **说明**: 为特定前缀的所有模型设置图标

### 3. Model（精确模型）
- **匹配值示例**: `gpt-4o`, `claude-opus-4`, `gemini-2.0-flash`
- **优先级**: 30（最高）
- **说明**: 为特定模型设置专属图标

### 4. Model Group（模型分组）
- **匹配值示例**: `GPT-4`, `Claude 3.5`
- **优先级**: 可自定义
- **说明**: 为一组相关模型设置图标（需要自定义逻辑）

## 图标来源建议

### 官方来源
- **OpenAI**: https://openai.com/brand/
- **Anthropic**: https://www.anthropic.com/
- **Google**: https://about.google/brand-resource-center/
- **DeepSeek**: https://www.deepseek.com/
- **其他**: 各厂商官方品牌资源页面

### 图标库
- **Simple Icons**: https://simpleicons.org/
- **Iconify**: https://icon-sets.iconify.design/
- **Flaticon**: https://www.flaticon.com/
- **Icons8**: https://icons8.com/

### 自定义设计
使用 Figma、Adobe Illustrator 等工具创建自己的图标

## 注意事项

1. **版权问题**: 请确保使用的图标有合法授权
2. **品牌规范**: 使用官方图标时请遵守其品牌使用指南
3. **文件优化**: 使用工具压缩图标文件以提升加载速度
   - SVG: [SVGO](https://github.com/svg/svgo)
   - PNG: [TinyPNG](https://tinypng.com/)
4. **深色模式**: 建议提供在深色和浅色背景下都清晰的图标

## 示例配置

```json
{
  "id": "provider-openai",
  "matchType": "provider",
  "matchValue": "openai",
  "iconPath": "/model-icons/openai.svg",
  "priority": 10,
  "enabled": true,
  "description": "OpenAI 提供商图标"
}
```

## 常见问题

### Q: 图标不显示怎么办？
A: 检查以下几点：
- 图标文件路径是否正确
- 文件格式是否支持
- 浏览器控制台是否有错误信息
- 配置规则是否启用

### Q: 如何为新模型添加图标？
A: 
1. 将图标文件放入此目录
2. 进入"模型图标配置"页面
3. 添加新配置，选择合适的匹配类型
4. 填写匹配值和图标路径

### Q: 优先级如何影响匹配？
A: 当多个规则都匹配时，系统会使用优先级最高的规则。建议：
- Provider 级别: 10
- Model Prefix: 20
- 精确 Model: 30

### Q: 可以使用外部 URL 的图标吗？
A: 可以，在图标路径中填写完整的 HTTP(S) URL 即可。但建议使用本地图标以提升加载速度和可靠性。

## 技术支持

如有问题或建议，请联系开发团队或提交 Issue。