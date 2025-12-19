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

后端需提供 `agent_manager` 模块，支持将前端上传的文件直接写入 Agent 的 assets 目录。

## 3. 数据结构设计

在 `src/tools/llm-chat/types/agent.ts` 中扩展相关接口：

```typescript
export type AssetType = "image" | "audio" | "video";
export type AssetUsage = "inline" | "background";

export interface AssetOptions {
  autoplay?: boolean; // 是否自动播放 (默认值视 usage 而定)
  loop?: boolean; // 是否循环播放 (默认值视 usage 而定)
  muted?: boolean; // 是否静音 (主要用于 video background)
  coverId?: string; // 视频封面图的 Asset ID (可选)
}

export interface AgentAsset {
  id: string; // Handle, e.g., "sad_bgm", "battle_video"
  path: string; // Relative path, e.g., "assets/music.mp3" (相对于 Agent 目录)
  type: AssetType; // 媒体类型
  description: string; // e.g., "Sad violin music", "Explosion effect"
  group: string; // 分组名称，默认为 "default"
  usage: AssetUsage; // 渲染提示
  options?: AssetOptions; // 播放行为控制
}

export interface ChatAgent {
  // ... existing fields
  assets?: AgentAsset[];
}

export interface AgentPreset {
  // ... existing fields
  assets?: AgentAsset[];
}
```

## 4. 协议设计

### 4.1 核心理念

采用 **标准 HTML + 资产协议 (Asset Protocol)** 方案：不引入新的自定义标签（如 `<agent-asset>`），而是利用标准 HTML 标签，通过特殊的 `src` 协议来引用 Agent 资产。

### 4.2 语法规范

使用标准 HTML 标签 (`img`, `video`, `audio`)，其 `src` 属性指向 `asset://{handle}`：

- **Image**: `<img src="asset://handle" style="..." />`
- **Video**: `<video src="asset://handle" controls />`
- **Audio**: `<audio src="asset://handle" controls />`

### 4.3 解析机制

Markdown 渲染器在处理 HTML 标签时，拦截 `asset://` 协议，根据 Agent 的 `assets` 配置查找对应的文件路径，并拼接为完整 URL。

解析流程：

1. **LLM 输出**: `<img src="asset://my_sticker" />`
2. **预处理**:
   - 解析 `asset://my_sticker`
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

- `[Image: handle] (src="asset://handle") Description`

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

在 HTML 渲染阶段，正则匹配 `src="asset://([\w-]+)"`，查找当前 Agent 的 `assets` 列表，结合当前消息的 `agentId` 获取真实路径并替换。

```typescript
function resolveAssetUrls(htmlContent: string, agentAssets: AgentAsset[], agentId: string): string {
  return htmlContent.replace(/src="asset:\/\/([\w-]+)"/g, (match, handle) => {
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
    src="asset://stamp_approved"
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

## 9. 开发计划

### Phase 1: Core & Data

- 后端: 创建 `agent_manager.rs` 并注册 `save_agent_asset` 命令。
- 前端: 更新 `AgentAsset` 类型定义，增加 `path`, `type` 和 `options`。
- 宏: 升级宏逻辑，支持 `{{assets}}` 注入。

### Phase 2: Editor UI

- 开发 `AgentAssetsManager.vue`，实现文件拖拽上传至 Agent 目录。
- 集成到 `EditAgentDialog.vue`。

### Phase 3: Renderer & Environment

- 在 `MessageContent.vue` 中实现 `asset://` 协议解析。
- 在 `ChatArea` 中实现 **Environment Layer** (背景层 + BGM 控制器)。
- 实现 `inline` 和 `background` 的事件通信机制。

### Phase 4: Optimization

- 资源预加载策略 (特别是视频背景)。
- BGM 的淡入淡出效果。
