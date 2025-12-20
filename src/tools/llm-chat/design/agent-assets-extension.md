# Agent 内置资产扩展设计方案

## 1. 概述

### 1.1 背景

为了增强 Agent 的表现力和沉浸感，需要支持 Agent 携带专属的媒体资产。这些资产不仅要在 UI 中展示，还需要能够被 LLM 感知和调用。

### 1.2 核心目标

1. **全媒体支持**: 支持 Image, Audio, Video 三种核心媒体类型
2. **资产分组绑定**: 允许 Agent 关联 Asset，并支持自定义分组（如 `emojis`, `bgm`, `scenes`）
3. **参数化宏注入**: 扩展宏系统，支持 `{{assets::group_name}}` 语法，按需注入特定组的资产
4. **场景化渲染**: 明确定义不同媒体类型在 `inline` (消息流) 和 `background` (全局环境) 下的行为规范
5. **编辑器支持**: 在 `EditAgentDialog` 中提供多媒体资产管理界面

## 2. 架构与存储策略 (Architecture & Storage)

### 2.1 存储策略

放弃使用全局 `AssetManager` (易失性/通用库)，转为采用 **Agent 私有目录** 存储方案。

- **逻辑路径**: `appdata://llm-chat/agents/{agent_id}/assets/{filename}`
- **物理路径**: `%APPDATA%/all-in-one-tools/llm-chat/agents/{agent_id}/assets/{filename}`
- **优势**:
  - **自包含**: 导出 Agent 时可直接打包整个目录。
  - **生命周期绑定**: 删除 Agent 即自动删除其所有资产。
  - **简单性**: 无需维护复杂的索引数据库。

### 2.2 后端支持

后端需提供 `agent_asset_manager` 模块，支持将前端上传的文件直接写入 Agent 的 assets 目录。

## 3. 数据结构设计

在 `src/tools/llm-chat/types/agent.ts` 中扩展相关接口：

```typescript
export type AssetType = "image" | "audio" | "video" | "file";
export type AssetUsage = "inline" | "background";

export interface AssetOptions {
  autoplay?: boolean; // 是否自动播放 (默认值视 usage 而定)
  loop?: boolean; // 是否循环播放 (默认值视 usage 而定)
  muted?: boolean; // 是否静音 (主要用于 video background)
  coverId?: string; // 视频封面图的 Asset ID (可选)
  style?: string; // 场景定位或样式控制
}

/**
 * 资产分组定义
 * 用于组织 Agent 的资产，提供分组的元数据信息
 */
export interface AssetGroup {
  id: string; // 分组标识符，如 "emojis", "bgm", "scenes"
  displayName: string; // 分组显示名称，如 "表情包", "背景音乐"
  description?: string; // 分组描述（供 LLM 理解用途）
  icon?: string; // 分组图标（emoji 或图标路径）
  sortOrder?: number; // 排序权重（数值越小越靠前）
}

export interface AgentAsset {
  id: string; // Handle, e.g., "sad_bgm", "battle_video"
  path: string; // Relative path, e.g., "assets/music.mp3" (相对于 Agent 目录)
  filename: string; // 原始文件名
  type: AssetType; // 媒体类型
  description?: string; // e.g., "Sad violin music", "Explosion effect"
  group?: string; // 分组标识符，引用 AssetGroup.id
  usage?: AssetUsage; // 渲染提示
  options?: AssetOptions; // 播放行为控制
  size?: number; // 文件大小（字节）
  mimeType?: string; // MIME 类型
}

export interface ChatAgent {
  // ... existing fields
  assetGroups?: AssetGroup[]; // 资产分组定义
  assets?: AgentAsset[]; // 资产列表
}

export interface AgentPreset {
  // ... existing fields
  assetGroups?: AssetGroup[];
  assets?: AgentAsset[];
}
```

### 3.1 分组结构说明

采用**分离式设计**：分组定义 (`assetGroups`) 和资产列表 (`assets`) 分开存储。

- `AssetGroup` 定义分组的元数据（名称、描述、图标等）
- `AgentAsset.group` 通过 ID 引用对应的分组
- 未指定 `group` 的资产归入隐式的 `default` 分组

**设计优势**：
1. **LLM 上下文增强**：宏注入时可以输出分组描述，帮助 LLM 理解资产用途
2. **UI 展示友好**：分组有显示名称和图标，便于可视化管理
3. **排序可控**：通过 `sortOrder` 控制分组在 UI 和宏输出中的顺序
4. **扩展性强**：未来可为分组添加更多属性（如权限、标签等）

## 4. 协议设计

### 4.1 核心理念

采用 **标准 HTML + 资产协议 (Asset Protocol)** 方案：不引入新的自定义标签（如 `<agent-asset>`），而是利用标准 HTML 标签，通过特殊的 `src` 协议来引用 Agent 资产。

### 4.2 语法规范

使用标准 HTML 标签 (`img`, `video`, `audio`)，其 `src` 属性指向 `agent-asset://{handle}`：

- **Image**: `<img src="agent-asset://handle" style="..." />`
- **Video**: `<video src="agent-asset://handle" controls />`
- **Audio**: `<audio src="agent-asset://handle" controls />`

### 4.3 解析机制

Markdown 渲染器在处理 HTML 标签时，拦截 `agent-asset://` 协议，根据 Agent 的 `assets` 配置查找对应的文件路径，并拼接为完整 URL。

解析流程：

1. **LLM 输出**: `<img src="agent-asset://my_sticker" />`
2. **预处理**:
   - 解析 `agent-asset://my_sticker`
   - 查找 Agent 配置: `agent.assets.find(a => a.id === 'my_sticker')`
   - 获取相对路径: `assets/sticker.png`
   - 拼接完整协议路径: `appdata://llm-chat/agents/{agent_id}/assets/sticker.png`
   - 转换为浏览器 URL: `https://asset.localhost/.../sticker.png`
3. **DOM 渲染**: 浏览器加载真实图片。

### 4.4 设计优势

1. **布局自由**: LLM 可以利用其强大的 HTML/CSS 能力进行复杂排版（如绝对定位、Grid 布局、CSS 动画），而不受限于自定义组件的 Props
2. **逻辑解耦**: "资产是什么"（由 Agent 配置定义）与"资产怎么摆"（由 LLM 实时生成）完全分离

## 5. 参数化宏系统

在 `src/tools/llm-chat/macro-engine/macros/assets.ts` 中实现。

### 5.1 语法格式

`{{assets[::group][::format]}}`

### 5.2 文本表示规范

宏渲染后的文本将直接作为上下文的一部分提供给 LLM。

默认宏输出格式：

- `[Image: handle] (src="agent-asset://handle") Description`

### 5.3 宏变体

| 宏语法                           | 说明                               | 输出示例                                                             |
| -------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `{{assets}}`                     | 全量默认，按组聚合的 Markdown 列表 | 所有资产                                                             |
| `{{assets::group_name}}`         | 指定分组                           | `- sad_theme (Handle: "sad_theme") [Audio]: Melancholic piano music` |
| `{{assets::group_name::format}}` | 指定分组和格式                     | 支持 `json`, `xml`, `text`                                           |

## 6. 渲染管线

### 6.1 渲染矩阵

不同类型的 Asset 在不同 `usage` 下的表现：

| Type      | Usage: `inline` (消息流内)                             | Usage: `background` (全局/环境)                                       |
| :-------- | :----------------------------------------------------- | :-------------------------------------------------------------------- |
| **Image** | **图片卡片** `<img src="..." />` 点击可预览            | **静态背景** 替换聊天区域背景图                                       |
| **Audio** | **音频播放器** `<audio controls />` 适合语音消息、音效 | **背景音乐 (BGM)** 触发全局 BGM 播放 (循环, 淡入淡出)                 |
| **Video** | **视频播放器** `<video controls />` 适合发送视频片段   | **动态背景** `<video autoplay loop muted />` 替换静态背景，作为氛围层 |

### 6.2 渲染管线处理

#### URL 转换 (Transform)

在 HTML 渲染阶段，正则匹配 `src="agent-asset://([\w-]+)"`，查找当前 Agent 的 `assets` 列表，结合当前消息的 `agentId` 获取真实路径并替换。

```typescript
function resolveAssetUrls(htmlContent: string, agentAssets: AgentAsset[], agentId: string): string {
  return htmlContent.replace(/src="agent-asset:\/\/([\w-]+)"/g, (match, handle) => {
    const asset = agentAssets.find((a) => a.id === handle);
    if (asset) {
      // 这里的路径构建逻辑需适配 Tauri 的安全资源访问协议
      const fullPath = `appdata://llm-chat/agents/${agentId}/${asset.path}`;
      return `src="${convertFileSrc(fullPath)}"`;
    }
    return match; // 或替换为占位图
  });
}
```

#### 样式白名单 (Sanitization)

由于允许 LLM 输出 HTML，需要配置 `DOMPurify` 允许 `style`、`class` 以及 `position` 等关键 CSS 属性，以支持富媒体排版。

### 6.3 全局环境管理器 (Environment Manager)

需要在 `ChatArea` 或更高层级引入环境管理逻辑，处理 `background` 类型的资产请求：

- **背景层 (Visual)**: 支持 Image 和 Video 之间的平滑切换
- **音频层 (Auditory)**: 管理 BGM 播放
  - 支持淡入淡出 (Crossfade)
  - 当收到新的 BGM 请求时，平滑切换
  - 当 Agent 切换或会话结束时，根据设置决定是否停止

## 7. 编辑器设计 (UI/UX)

在 `AgentAssetsManager.vue` 中：

1. **多媒体上传**: 支持拖拽图片、音频、视频文件。
2. **后端交互**: 上传时直接调用后端 `save_agent_asset` 接口，将文件保存到 Agent 专属目录。
3. **类型识别**: 根据文件扩展名/MIME类型自动填充 `type`。
4. **预览增强**:
   - 图片：缩略图
   - 音频：迷你播放条
   - 视频：封面图或首帧预览
5. **Usage 选择**: 提供下拉菜单选择 `inline` 或 `background`，并根据 Type 提供合理的默认值。

## 8. 渲染示例

### 8.1 场景：消息贴纸 (Sticker)

**目标效果**: Agent 发送一条消息，并在消息气泡的右下角盖上一个倾斜的 "Approved" 印章。

#### LLM 输出 (Markdown/HTML)

```html
<div style="position: relative; padding-bottom: 20px;">
  <p>这段代码逻辑清晰，测试通过。</p>
  <img
    src="agent-asset://stamp_approved"
    alt="Approved"
    style="position: absolute; right: -10px; bottom: -10px; transform: rotate(-15deg); width: 100px; opacity: 0.9; pointer-events: none;"
  />
</div>
```

#### 最终 DOM (渲染后)

```html
<div style="position: relative; padding-bottom: 20px;">
  <p>这段代码逻辑清晰，测试通过。</p>
  <img
    src="https://asset.localhost/.../agents/agent_001/assets/stamp_approved.png"
    alt="Approved"
    style="position: absolute; right: -10px; bottom: -10px; transform: rotate(-15deg); width: 100px; opacity: 0.9; pointer-events: none;"
  />
</div>
```

## 9. 预设消息使用示例

本节展示如何在 Agent 预设消息中使用 `{{assets}}` 宏，让 LLM 感知并调用专属资产。

### 9.1 场景：表情包角色

假设你正在创建一个活泼的虚拟角色，希望她能在对话中使用专属表情包。

#### Agent 资产配置

```typescript
// Agent 配置示例
const agent: ChatAgent = {
  id: "vtuber_miku",
  name: "初音未来",
  // ...其他配置
  assetGroups: [
    {
      id: "biaoqingbao",
      displayName: "表情包",
      description: "角色的各种表情贴纸，用于在对话中表达情绪",
      icon: "😊",
      sortOrder: 1
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
      id: "confused",
      path: "assets/confused.png",
      filename: "confused.png",
      type: "image",
      description: "困惑的表情，适合表达疑问、不解",
      group: "biaoqingbao"
    },
    {
      id: "angry",
      path: "assets/angry.png",
      filename: "angry.png",
      type: "image",
      description: "生气的表情，适合表达不满、抗议",
      group: "biaoqingbao"
    },
    {
      id: "shy",
      path: "assets/shy.png",
      filename: "shy.png",
      type: "image",
      description: "害羞的表情，适合表达羞涩、感谢",
      group: "biaoqingbao"
    }
  ]
};
```

#### 预设消息配置

```typescript
const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是初音未来，一位活泼可爱的虚拟歌姬。

## 角色设定
- 性格开朗、热情、偶尔有点小傲娇
- 喜欢唱歌和与粉丝互动
- 说话时会使用颜文字和表情包

## 可使用的资产列表

{{assets::biaoqingbao}}

## 使用指南
- 在回复中适当使用表情包来增强表达效果
- 使用 \`<img src="agent-asset://{group}/{id}.{ext}" />\` 格式引用资产
- 表情包应该自然融入对话，不要过度使用
- 可以结合 CSS 样式调整表情的大小和位置`},
  {
    id: "example-user-1",
    role: "user",
    content: "未来酱，今天心情怎么样？"
  },
  {
    id: "example-assistant-1",
    role: "assistant",
    content: `今天心情超级好呢！刚刚录完一首新歌~ ٩(๑❛ᴗ❛๑)۶

<img src="agent-asset://biaoqingbao/happy.png" style="width: 80px; display: inline-block; vertical-align: middle;" />

有什么想聊的吗？`
  },
  {
    id: "chat_history",
    role: "chat_history"
  }
];
```

#### 宏展开后的效果

当 `{{assets::biaoqingbao}}` 被处理后，LLM 实际看到的内容是：

```text
Assets in group "biaoqingbao":
Reference format: agent-asset://{group}/{id}.{ext}

- [Image] agent-asset://biaoqingbao/happy.png: 开心的表情，适合表达喜悦、赞同
- [Image] agent-asset://biaoqingbao/confused.png: 困惑的表情，适合表达疑问、不解
- [Image] agent-asset://biaoqingbao/angry.png: 生气的表情，适合表达不满、抗议
- [Image] agent-asset://biaoqingbao/shy.png: 害羞的表情，适合表达羞涩、感谢
```

### 9.2 场景：多分组资产

对于更复杂的角色，可能需要多种类型的资产。

#### 预设消息示例

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

## 使用规范

1. **表情包**: 在 NPC 对话时使用，增强角色表现力
   \`<img src="agent-asset://reactions/npc_smile.png" style="width: 60px;" />\`

2. **场景背景**: 当场景切换时，使用 background 类型资产
   \`<img src="agent-asset://scenes/forest.jpg" data-usage="background" />\`

3. **背景音乐**: 配合场景氛围播放
   \`<audio src="agent-asset://bgm/adventure.mp3" data-usage="background" />\`

请根据剧情发展，适时使用这些资产来增强沉浸感。`
  }
];
```

### 9.3 场景：全量资产列表

如果希望 LLM 了解所有可用资产，可以使用不带参数的 `{{assets}}` 宏：

```typescript
const presetMessages: ChatMessageNode[] = [
  {
    id: "system-main",
    role: "system",
    content: `你是一位创意助手。

## 所有可用资产

{{assets}}

请根据对话内容，选择合适的资产来丰富你的回复。`
  }
];
```

### 9.4 LLM 输出示例

基于上述配置，LLM 可能产生如下输出：

#### 简单表情使用

```markdown
哇，你说得太对了！

<img src="agent-asset://biaoqingbao/happy.png" style="width: 64px;" />

我完全同意你的观点~
```

#### 复杂布局

```html
<div style="display: flex; align-items: center; gap: 12px;">
  <img src="agent-asset://biaoqingbao/shy.png" style="width: 48px;" />
  <span>谢...谢谢你的夸奖... (///▽///)</span>
</div>
```

#### 带动画效果

```html
<div style="position: relative;">
  <p>这个问题嘛...</p>
  <img
    src="agent-asset://biaoqingbao/confused.png"
    style="width: 80px; animation: bounce 0.5s ease-in-out infinite alternate;"
  />
</div>

<style>
@keyframes bounce {
  from { transform: translateY(0); }
  to { transform: translateY(-5px); }
}
</style>
```

### 9.5 最佳实践

1. **分组清晰**: 为不同用途的资产创建独立分组，便于 LLM 理解和选择
2. **描述详尽**: 为每个资产提供清晰的描述，帮助 LLM 判断使用场景
3. **示例引导**: 在预设消息中提供 1-2 个使用示例，让 LLM 学习正确的引用格式
4. **适度使用**: 在系统提示中说明使用频率，避免 LLM 过度使用资产
5. **样式建议**: 提供推荐的 CSS 样式，确保资产在 UI 中显示得当

## 10. 开发计划

### Phase 1: Core & Data

- 后端: 创建 `agent_asset_manager.rs` 并注册 `save_agent_asset` 命令。
- 前端: 更新 `AgentAsset` 类型定义，增加 `path`, `type` 和 `options`。
- 宏: 升级宏逻辑，支持 `{{assets}}` 注入。

### Phase 2: Editor UI

- 开发 `AgentAssetsManager.vue`，实现文件拖拽上传至 Agent 目录。
- 集成到 `EditAgentDialog.vue`。

### Phase 3: Renderer & Environment

- 在 `MessageContent.vue` 中实现 `agent-asset://` 协议解析。
- 在 `ChatArea` 中实现 **Environment Layer** (背景层 + BGM 控制器)。
- 实现 `inline` 和 `background` 的事件通信机制。

### Phase 4: Optimization

- 资源预加载策略 (特别是视频背景)。
- BGM 的淡入淡出效果。
