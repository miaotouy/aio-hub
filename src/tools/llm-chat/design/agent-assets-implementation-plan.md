# Agent 内置资产扩展实施计划

## 1. 核心架构变更

### 1.1 资产存储策略 (Assets Storage Strategy)

放弃使用全局 `AssetManager` (易失性/通用库)，转为采用 **Agent 私有目录** 存储方案。

- **路径规范**: `appdata://llm-chat/agents/{agent_id}/assets/{filename}`
- **物理路径**: `%APPDATA%/all-in-one-tools/llm-chat/agents/{agent_id}/assets/{filename}`
- **优势**:
  - **自包含**: 导出 Agent 时可直接打包整个目录。
  - **生命周期绑定**: 删除 Agent 即自动删除其所有资产。
  - **简单性**: 无需维护复杂的索引数据库。

### 1.2 协议解析流 (Protocol Resolution Flow)

1.  **LLM 输出**: `<img src="asset://my_sticker" />`
2.  **宏/渲染前处理 (`MessageContent.vue`)**:
    - 解析 `asset://my_sticker`
    - 查找 Agent 配置: `agent.assets.find(a => a.id === 'my_sticker')`
    - 获取相对路径: `assets/sticker.png`
    - 拼接完整协议路径: `appdata://llm-chat/agents/{agent_id}/assets/sticker.png`
    - 转换为浏览器 URL: `https://asset.localhost/.../sticker.png` (通过 `convertFileSrc`)
3.  **DOM 渲染**: 浏览器加载真实图片。

## 2. 后端开发 (Rust)

### 2.1 新增模块 `agent_manager`

新建 `src-tauri/src/commands/agent_manager.rs`，专门处理 Agent 专属文件操作。

#### Command: `save_agent_asset`

将前端上传的二进制数据保存到指定 Agent 的 assets 目录。

```rust
#[tauri::command]
pub async fn save_agent_asset(
    app: AppHandle,
    agent_id: String,
    file_name: String,
    data: Vec<u8>
) -> Result<String, String>
```

- **逻辑**:
  1. 获取应用数据目录。
  2. 构建路径 `llm-chat/agents/{agent_id}/assets/`。
  3. 确保目录存在 (`fs::create_dir_all`)。
  4. 写入文件 (`fs::write`)。
  5. 返回相对路径 `assets/{file_name}`。

### 2.2 注册与导出

- 更新 `src-tauri/src/commands/mod.rs`: 导出 `agent_manager`。
- 更新 `src-tauri/src/lib.rs`: 注册 `save_agent_asset` 命令。

## 3. 前端开发 (Vue/TS)

### 3.1 类型定义 (`src/tools/llm-chat/types/agent.ts`)

```typescript
export type AssetType = "image" | "audio" | "video";
export type AssetUsage = "inline" | "background";

export interface AssetOptions {
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  coverId?: string; // 视频封面图的 handle
}

export interface AgentAsset {
  id: string; // Handle, e.g., "sad_bgm"
  path: string; // Relative path, e.g., "assets/music.mp3"
  type: AssetType;
  description: string;
  group: string; // default: "default"
  usage: AssetUsage;
  options?: AssetOptions;
}

export interface ChatAgent {
  // ... existing
  assets?: AgentAsset[];
}
```

### 3.2 组件开发

#### A. `AgentAssetsManager.vue` (New)

- **位置**: `src/tools/llm-chat/components/agent/AgentAssetsManager.vue`
- **功能**:
  - 列表展示现有资产。
  - 上传区域 (DropZone):
    - 接收文件 -> 读取 ArrayBuffer -> 调用 `save_agent_asset`。
    - 成功后生成 `AgentAsset` 对象并 emit update。
  - 编辑区域: 修改 Handle (id), Description, Group, Options。
  - 预览: 图片直接显示，音视频提供简单播放控件。

#### B. `EditAgentDialog.vue` (Update)

- 集成 `AgentAssetsManager` 组件。
- 在保存 Agent 时，确保 `assets` 字段被正确持久化。

#### C. `MessageContent.vue` (Update)

- **预处理逻辑**:
  - 在传递给 `RichTextRenderer` 之前，处理 `content` 字符串。
  - 正则匹配 `src="asset://([\w-]+)"`。
  - 替换为 `convertFileSrc` 处理后的真实 URL。
  - **关键点**: 需要获取当前消息所属的 `agentId` (如果是用户消息则无需处理，或者是 Assistant 消息但需回溯 Agent ID)。通常从 `props.message.agentId` 获取。

### 3.3 宏引擎 (`src/tools/llm-chat/macro-engine/macros/assets.ts`)

- 实现 `{{assets}}` 宏。
- 格式化输出 Agent 的资产列表，作为 System Prompt 的一部分注入。
- 格式示例:
  ```text
  Available Assets:
  - [Image] sticker_ok (id: sticker_ok): A cute ok sticker
  - [Audio] bgm_sad (id: bgm_sad): Sad violin music
  ```

## 4. 安全与渲染管线

### 4.1 DOMPurify 白名单

- 检查 `src/tools/rich-text-renderer/RichTextRenderer.vue`。
- 确保允许 `img`, `video`, `audio` 标签。
- 确保允许 `style` 属性 (用于定位和简单动画)。

### 4.2 资源访问权限

- 确保 Tauri 的 `fs` scope 配置允许访问 `appdata` 目录 (通常默认允许)。
- `asset://` 协议本质上是前端的虚拟协议，最终转换为 `https://asset.localhost/...`，这是 Tauri 的标准资源访问方式，安全且高效。

## 5. 执行步骤 (Step-by-Step)

1.  **Backend**: 创建 `agent_manager.rs` 并注册命令。
2.  **Types**: 更新 `agent.ts` 类型定义。
3.  **UI - Manager**: 开发 `AgentAssetsManager.vue`。
4.  **UI - Integration**: 将管理器集成到 `EditAgentDialog.vue`。
5.  **Logic - Macro**: 实现 `assets` 宏。
6.  **Logic - Renderer**: 在 `MessageContent.vue` 中实现协议解析。
7.  **Verification**: 测试上传、宏注入、渲染全流程。
