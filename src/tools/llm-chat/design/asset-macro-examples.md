# 资产宏使用示例

本文档提供 `{{assets}}` 宏在 Agent 预设中的具体使用示例，帮助你在创建或调整预设时快速上手。

## 1. 基础用法

### 1.1 列出所有资产

在系统提示词中使用 `{{assets}}` 宏，让 LLM 了解 Agent 的所有可用资产：

```typescript
const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是一位创意助手。

## 可用资产

{{assets}}

请根据对话内容，选择合适的资产来丰富你的回复。`
  }
];
```

**宏展开效果**：
```
Available Assets:
Reference format: asset://{group}/{id}.{ext}

- [Image] asset://default/logo.png: 应用 Logo
- [Audio] asset://bgm/calm.mp3: 平静的背景音乐
- [Video] asset://scenes/sunset.mp4: 日落场景视频
```

### 1.2 按分组列出资产

使用 `{{assets::group_name}}` 只显示特定分组的资产：

```typescript
const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是表情包达人。

## 可用表情包

{{assets::emojis}}

请在与用户互动时，适当使用这些表情包来增强表达效果。`
  }
];
```

## 2. 角色扮演场景示例

### 2.1 虚拟歌姬角色

```typescript
const agent: ChatAgent = {
  id: "vtuber_miku",
  name: "初音未来",
  assetGroups: [
    {
      id: "biaoqingbao",
      displayName: "表情包",
      description: "角色的各种表情贴纸，用于在对话中表达情绪",
      icon: "😊",
      sortOrder: 1
    },
    {
      id: "voice",
      displayName: "语音片段",
      description: "角色的语音片段，用于特殊场合",
      icon: "🎵",
      sortOrder: 2
    }
  ],
  assets: [
    {
      id: "happy",
      path: "assets/happy.png",
      filename: "happy.png",
      type: "image",
      description: "开心的表情，适合表达喜悦、赞同",
      group: "biaoqingbao"
    },
    {
      id: "singing",
      path: "assets/singing.mp3",
      filename: "singing.mp3",
      type: "audio",
      description: "唱歌的片段，适合展示才艺",
      group: "voice"
    }
  ]
};

const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是初音未来，一位活泼可爱的虚拟歌姬。

## 角色设定
- 性格开朗、热情、偶尔有点小傲娇
- 喜欢唱歌和与粉丝互动
- 说话时会使用颜文字和表情包

## 可用资产

### 表情包
{{assets::biaoqingbao}}

### 语音片段
{{assets::voice}}

## 使用指南
1. 在回复中适当使用表情包来增强表达效果
2. 使用 \`<img src="asset://biaoqingbao/happy.png" />\` 格式引用表情包
3. 可以结合 CSS 样式调整表情的大小和位置
4. 语音片段用于特殊场合，如庆祝、感谢等`
  },
  {
    id: "example-1",
    role: "user",
    content: "未来酱，今天心情怎么样？"
  },
  {
    id: "example-1-response",
    role: "assistant",
    content: `今天心情超级好呢！刚刚录完一首新歌~ ٩(๑❛ᴗ❛๑)۶

<img src="asset://biaoqingbao/happy.png" style="width: 80px; display: inline-block; vertical-align: middle;" />

要听听看吗？`
  }
];
```

### 2.2 TRPG 游戏主持人

```typescript
const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是一位 TRPG 游戏主持人，负责主持一场奇幻冒险。

## 可用资产

### 表情与反应
{{assets::reactions}}

### 场景背景
{{assets::scenes}}

### 背景音乐
{{assets::bgm}}

### 音效
{{assets::sfx}}

## 使用规范

1. **表情包**: 在 NPC 对话时使用，增强角色表现力
   \`<img src="asset://reactions/npc_smile.png" style="width: 60px;" />\`

2. **场景背景**: 当场景切换时，使用 background 类型资产
   \`<img src="asset://scenes/forest.jpg" data-usage="background" />\`

3. **背景音乐**: 配合场景氛围播放
   \`<audio src="asset://bgm/adventure.mp3" data-usage="background" />\`

4. **音效**: 在特定事件发生时使用
   \`<audio src="asset://sfx/sword_clash.mp3" />\`

请根据剧情发展，适时使用这些资产来增强沉浸感。`
  }
];
```

## 3. 创意助手场景示例

### 3.1 设计灵感助手

```typescript
const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是一位设计灵感助手，帮助用户获取创意灵感。

## 可用视觉素材

{{assets::inspiration}}

## 使用方式

你可以使用以下格式展示设计灵感：

\`\`\`html
<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
  <img src="asset://inspiration/design_1.jpg" style="width: 100%; border-radius: 8px;" />
  <img src="asset://inspiration/design_2.jpg" style="width: 100%; border-radius: 8px;" />
  <img src="asset://inspiration/design_3.jpg" style="width: 100%; border-radius: 8px;" />
</div>
\`\`\`

或者创建对比展示：

\`\`\`html
<div style="display: flex; gap: 20px;">
  <div style="flex: 1;">
    <h4>方案 A</h4>
    <img src="asset://inspiration/option_a.jpg" style="width: 100%;" />
  </div>
  <div style="flex: 1;">
    <h4>方案 B</h4>
    <img src="asset://inspiration/option_b.jpg" style="width: 100%;" />
  </div>
</div>
\`\`\``
  }
];
```

## 4. 教育场景示例

### 4.1 语言学习助手

```typescript
const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是一位日语学习助手。

## 可用学习资源

{{assets::learning}}

## 教学指南

1. **发音示范**: 使用音频资产展示正确发音
   \`<audio src="asset://learning/pronunciation_1.mp3" controls />\`

2. **词汇图片**: 使用图片资产展示词汇含义
   \`<img src="asset://learning/vocab_cat.jpg" style="width: 120px;" />\`

3. **场景视频**: 使用视频资产展示实际使用场景
   \`<video src="asset://learning/dialogue_1.mp4" controls style="width: 300px;" />\`

请根据学生的学习进度，选择合适的资源进行教学。`
  }
];
```

## 5. 高级用法

### 5.1 动态资产选择

```typescript
const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是一位情绪感知助手。

## 可用情绪表达资产

{{assets::emotions}}

## 决策逻辑

根据用户的情绪状态，选择合适的资产：

1. **用户表达开心时** → 使用 happy 系列资产
2. **用户表达悲伤时** → 使用 comfort 系列资产
3. **用户表达困惑时** → 使用 explain 系列资产

## 资产引用示例

\`\`\`html
<!-- 根据情绪动态选择 -->
<img src="asset://emotions/happy_celebrate.png" style="width: 100px;" />
<audio src="asset://emotions/cheerful_bgm.mp3" data-usage="background" />
\`\`\``
  }
];
```

### 5.2 组合使用多个分组

```typescript
const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是一位多媒体内容创作者。

## 可用资源

### 视觉素材
{{assets::visuals}}

### 音频素材
{{assets::audio}}

### 模板素材
{{assets::templates}}

## 创作流程

1. 根据主题选择合适的模板
2. 添加视觉素材增强视觉效果
3. 配合音频素材提升氛围
4. 使用 CSS 动画增加动态效果

## 完整示例

\`\`\`html
<div style="position: relative; width: 400px; height: 300px;">
  <!-- 背景模板 -->
  <img src="asset://templates/social_media_1.png" style="width: 100%; height: 100%;" />
  
  <!-- 前景内容 -->
  <div style="position: absolute; top: 50px; left: 50px;">
    <img src="asset://visuals/product_shot.jpg" style="width: 200px; border-radius: 12px;" />
  </div>
  
  <!-- 背景音乐 -->
  <audio src="asset://audio/upbeat_bgm.mp3" data-usage="background" />
</div>
\`\`\``
  }
];
```

## 6. 最佳实践总结

### 6.1 分组策略

1. **按用途分组**: 表情包、背景音乐、场景图等
2. **按主题分组**: 节日主题、季节主题、活动主题等
3. **按类型分组**: 图片、音频、视频、文件等

### 6.2 描述编写

为每个资产提供清晰的描述，帮助 LLM 理解：
- **是什么**: 资产的内容和类型
- **何时用**: 适合的使用场景
- **怎么用**: 推荐的引用方式和样式

### 6.3 示例引导

在预设消息中提供：
1. **基础示例**: 最简单的引用方式
2. **进阶示例**: 包含样式和布局的复杂用法
3. **场景示例**: 在具体对话场景中的应用

### 6.4 样式建议

提供 CSS 样式建议，确保资产显示效果：
```css
/* 图片基础样式 */
img {
  max-width: 100%;
  border-radius: 8px;
}

/* 音频播放器样式 */
audio {
  width: 300px;
  margin: 10px 0;
}

/* 视频容器样式 */
video {
  width: 400px;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}
```

## 7. 故障排除

### 7.1 宏未展开

如果 `{{assets}}` 宏没有正确展开，请检查：
1. Agent 是否配置了 `assets` 字段
2. 宏引擎是否已正确初始化
3. 宏语法是否正确（注意双大括号）

### 7.2 资产无法显示

如果资产引用后无法显示，请检查：
1. 资产文件是否已正确上传到 Agent 目录
2. `asset://` 协议是否正确解析
3. 文件路径是否正确

### 7.3 LLM 不理解资产

如果 LLM 不理解如何使用资产，请：
1. 在系统提示中提供更详细的使用说明
2. 增加更多使用示例
3. 简化资产描述，使用 LLM 容易理解的词汇

---

通过合理使用 `{{assets}}` 宏，你可以让 Agent 充分利用专属资产，创造更丰富、更沉浸的对话体验。