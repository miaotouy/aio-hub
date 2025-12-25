# Agent 内置资产扩展 (Agent Assets Extension)

## 1. 概述

### 1.1 背景

为了增强 Agent 的表现力和沉浸感，系统支持 Agent 携带专属的媒体资产（Stickers, BGM, 背景图等）。这些资产可以被 LLM 在回复中通过特定协议引用，并在前端渲染为富媒体内容。

### 1.2 核心特性

- **私有化存储**: 资产存储在 Agent 的专属目录下，生命周期与 Agent 绑定。
- **全媒体支持**: 支持 `image`, `audio`, `video`, `file` 四种媒体类型。
- **资产分组**: 支持自定义分组（如 `emojis`, `bgm`, `scenes`），便于管理和 LLM 理解。
- **参数化宏**: 通过 `{{assets}}` 宏向 LLM 注入可用资产列表。
- **自定义协议**: 采用 `agent-asset://` 协议进行引用，支持 HTML 和 Markdown 语法。

## 2. 存储架构

资产采用 **Agent 私有目录** 存储方案，确保数据的自包含性和易于迁移。

- **逻辑路径**: `appdata://llm-chat/agents/{agent_id}/assets/{filename}`
- **物理路径**: `%APPDATA%/all-in-one-tools/llm-chat/agents/{agent_id}/assets/{filename}`
- **目录结构**:
  ```text
  /agents/{agent_id}/
  ├── agent.json          # Agent 配置文件
  └── assets/             # 资产目录
      ├── sticker_ok.png
      ├── bgm_sad.mp3
      └── thumbnails/     # 自动生成的缩略图 (可选)
  ```

## 3. 数据模型

### 3.1 AgentAsset (资产定义)

定义在 `src/tools/llm-chat/types/agent.ts`：

| 字段          | 类型           | 说明                                                   |
| :------------ | :------------- | :----------------------------------------------------- |
| `id`          | `string`       | **Handle**，唯一标识符，用于协议引用 (如 `sticker_ok`) |
| `path`        | `string`       | 相对 Agent 目录的路径 (如 `assets/xxx.png`)            |
| `type`        | `AssetType`    | `image` \| `audio` \| `video` \| `file`                |
| `group`       | `string`       | 分组 ID，引用 `AssetGroup.id`                          |
| `usage`       | `AssetUsage`   | `inline` (消息流内) \| `background` (全局环境)         |
| `description` | `string`       | 资产描述，供 LLM 理解用途                              |
| `options`     | `AssetOptions` | 播放控制 (autoplay, loop, muted, coverId, style)       |

### 3.2 AssetGroup (分组定义)

用于组织资产，提供元数据信息：

- `id`: 分组标识符。
- `displayName`: UI 显示名称。
- `description`: 供 LLM 理解的分组用途。
- `sortOrder`: 排序权重。

## 4. 引用协议 (agent-asset://)

### 4.1 语法规范

推荐格式：`agent-asset://{group}/{id}.{ext}`

- **图片 (HTML/MD)**: `<img src="agent-asset://emojis/happy.png" />` 或 `![alt](agent-asset://emojis/happy.png)`
- **音频 (HTML)**: `<audio src="agent-asset://bgm/forest_rain.mp3" controls></audio>`
- **视频 (HTML)**: `<video src="agent-asset://scenes/intro.mp4" controls></video>`

### 4.2 解析优先级 (Match Strategy)

为了保证兼容性，解析器按以下顺序查找匹配资产：

1. **精确匹配**: `group` + `id` 均匹配。
2. **文件名匹配**: `group` + `filename` (不带后缀) 匹配。
3. **ID 回退**: 仅 `id` 匹配 (旧版本兼容)。
4. **文件名回退**: 仅 `filename` (不带后缀) 匹配。

### 4.3 渲染管线

1. **内容拦截**: 在消息渲染前，`processMessageAssetsSync` 正则匹配内容中的 `agent-asset://` 链接。
2. **路径转换**: 结合当前 `agentId` 和 `AgentAsset.path`，构建完整物理路径。
3. **URL 转换**: 使用 Tauri 的 `convertFileSrc` 将物理路径转换为浏览器可访问的 `asset://` URL。

## 5. 宏系统 (Macro Engine)

### 5.1 `{{assets}}` 宏

用于向 LLM 描述当前可用的资产。

- **全量注入**: `{{assets}}` - 按分组列出所有资产。
- **指定分组**: `{{assets::group_id}}` - 仅列出特定分组的资产。

### 5.2 输出格式

宏展开后的文本示例：

```text
Assets in group "emojis":
Reference format: agent-asset://{group}/{id}.{ext}

- [Image] agent-asset://emojis/happy.png: 开心的表情，适合表达喜悦
- [Image] agent-asset://emojis/sad.png: 难过的表情
```

## 6. 渲染行为规范

目前系统主要支持资产在消息流内的 **行内渲染 (Inline Rendering)**。`background` 用法在数据结构中已预留，但具体的环境层交互（如动态切换背景、全局 BGM 控制）尚在规划中。

| 类型      | Usage: `inline` (消息流内) | 说明                                            |
| :-------- | :------------------------- | :---------------------------------------------- |
| **Image** | 标准图片展示               | 渲染为 `<img>` 标签，支持点击预览               |
| **Audio** | 行内音频播放器             | 渲染为 `<audio controls>`，适合语音消息或短音效 |
| **Video** | 行内视频播放器             | 渲染为 `<video controls>`，适合短视频片段       |
| **File**  | 文件卡片                   | 提供文件下载或预览入口                          |

## 7. 高级应用：富文本与单页应用 (SPA)

除了在聊天气泡中直接展示外，Agent 资产还可以被用于 LLM 生成的完整 HTML 页面或富文本内容中（通过 `HtmlInteractiveViewer` 渲染）。

### 7.1 工作原理

1. **预处理**: 消息内容在传递给 `HtmlInteractiveViewer` 之前，`agent-asset://` 协议链接已被 `processMessageAssetsSync` 转换为浏览器可访问的真实 URL (如 `https://asset.localhost/...`)。
2. **CSP 许可**: `HtmlInteractiveViewer` 的 Content Security Policy (CSP) 已配置允许加载 `asset:` 和 `http(s)://asset.localhost` 来源的资源。
3. **无缝集成**: LLM 生成的 HTML/CSS/JS 代码可以像引用普通网络资源一样引用 Agent 资产。

### 7.2 使用示例

LLM 可以生成一个包含背景音乐和角色的简单网页游戏或演示卡片：

```html
<!DOCTYPE html>
<html>
  <head>
    <style>
      body {
        /* 引用图片资产作为背景 */
        background-image: url("agent-asset://scenes/dungeon_bg.jpg");
        background-size: cover;
        color: white;
      }
      .character {
        /* 引用图片资产作为元素 */
        background-image: url("agent-asset://sprites/hero_idle.png");
        width: 64px;
        height: 64px;
      }
    </style>
  </head>
  <body>
    <div class="character"></div>
    <!-- 引用音频资产 -->
    <audio autoplay loop src="agent-asset://bgm/battle_theme.mp3"></audio>
  </body>
</html>
```

## 8. 开发参考

- **核心工具**: `src/tools/llm-chat/utils/agentAssetUtils.ts` (路径解析与协议转换)
- **宏实现**: `src/tools/llm-chat/macro-engine/macros/assets.ts`
- **UI 组件**:
  - `AgentAssetsManager.vue`: 资产管理界面。
  - `MessageContent.vue`: 消息渲染入口。
