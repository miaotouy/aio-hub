# Agent 内置资产扩展 (Agent Assets Extension) 功能说明

本文档描述了 LLM Chat 工具中 Agent 专属资产管理、引用协议及渲染机制的实现。

## 1. 核心概念

Agent 资产是指与特定智能体绑定的媒体文件（如表情包、背景音乐、场景图、视频片段等）。这些资产允许 Agent 在回复中展现出更丰富的表现力和沉浸感。

## 2. 存储与管理

### 2.1 存储结构

资产存储在 Agent 的私有目录下，确保数据的独立性：

- **路径**: `appdata://llm-chat/agents/{agent_id}/assets/`
- **管理**: 用户可以通过 `AgentAssetsManager.vue` 界面进行资产的上传、删除、重命名和分组。

### 2.2 数据模型 (`AgentAsset`)

资产包含以下核心元数据：

- **Handle (ID)**: 唯一标识符，用于协议引用。
- **Type**: 媒体类型（`image`, `audio`, `video`, `file`）。
- **Group**: 逻辑分组（如 `stickers`, `bgm`）。
- **Usage**: 渲染用途（`inline` 行内渲染，`background` 背景环境）。

## 3. 引用协议 (`agent-asset://`)

### 3.1 协议格式

推荐格式：`agent-asset://{group}/{id}.{ext}`

### 3.2 路径解析流程

1.  **正则匹配**: 渲染器识别消息中的 `agent-asset://` 链接。
2.  **资产检索**: 根据 `agentId` 和协议中的 `group`/`id` 查找对应的 `AgentAsset` 记录。
3.  **物理转换**: 调用 `agentAssetUtils.getAssetInternalUrl` 将虚拟协议转换为 Tauri 可识别的 `asset://` 协议路径。
4.  **安全渲染**: 最终转换为浏览器可加载的真实 URL（如 `https://asset.localhost/...`）。

## 4. LLM 交互机制

### 4.1 资产宏 (`{{assets}}`)

系统通过宏引擎将可用资产信息注入到 Agent 的 System Prompt 中：

- **展开结果**: 向 LLM 描述资产的引用格式、类型及用途。
- **引导**: LLM 会根据上下文，在合适的时候输出 `![ok](agent-asset://emojis/ok.png)` 或 `<audio src="agent-asset://bgm/sad.mp3" autoplay></audio>`。

## 5. 渲染场景

### 5.1 消息流渲染

在消息气泡中，系统会自动处理：

- **图片**: 渲染为可点击预览的图片。
- **音视频**: 渲染为带控制条的行内播放器。

### 5.2 HTML 交互渲染 (`HtmlInteractiveViewer`)

在 LLM 生成的完整网页或交互卡片中，可以使用 `agent-asset://` 协议引用资源。解析器会在 HTML 注入前完成路径替换，确保资源在沙盒环境中正常加载。

## 6. 开发参考

- **协议转换**: `src/tools/llm-chat/utils/agentAssetUtils.ts`
- **宏实现**: `src/tools/llm-chat/macro-engine/macros/assets.ts`
- **UI 组件**: `AgentAssetsManager.vue` (管理), `MessageContent.vue` (渲染)
