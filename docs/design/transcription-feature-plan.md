# 附件转写与衍生数据管理系统设计方案

## 1. 目标与背景

旨在为系统中的附件（图片、音频等）提供自动或手动的转写/OCR 能力，主要解决以下问题：

1.  **能力补全**：为不支持多模态的场景提供文本替代方案。
2.  **上下文压缩**：在长对话中，允许使用转写文本替代原始附件以节省 Token。
3.  **结构化扩展**：建立通用的“衍生数据”管理机制，为未来可能的向量索引、摘要等功能铺路。

## 2. 核心架构设计

采用 **“索引-内容分离”** 架构，但在核心索引中保留状态指针。

### 2.1 数据结构变更 (Rust & TypeScript)

修改 `AssetMetadata` 结构，增加 `derived` 字段作为衍生数据的注册表。

**Rust (`src-tauri/src/commands/asset_manager.rs`):**

```rust
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DerivedDataInfo {
    pub path: Option<String>,     // 内容文件的相对路径 (e.g., "derived/images/2025-12/xxx/transcription.md")
    pub updated_at: String,       // ISO 8601 时间戳
    pub provider: Option<String>, // e.g., "gemini-1.5-pro", "whisper-local"
    pub error: Option<String>,    // 错误信息，仅在失败时存在
}

// 需要在 AssetMetadata 结构体中添加 derived 字段
// 注意：AssetMetadata 已存在，需在原有基础上扩展
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetMetadata {
    // ... 原有字段 (width, height, duration, sha256)

    #[serde(skip_serializing_if = "Option::is_none")]
    pub derived: Option<HashMap<String, DerivedDataInfo>>,
}
```

**TypeScript (`src/types/asset-management.ts`):**

```typescript
export interface DerivedDataInfo {
  /** 内容文件的相对路径 */
  path?: string;
  /** ISO 8601 时间戳 */
  updatedAt: string;
  /** 提供者信息 (e.g., "gemini-1.5-pro") */
  provider?: string;
  /** 错误信息 */
  error?: string;
}

export interface AssetMetadata {
  // ... 原有字段

  /** 衍生数据注册表 (Key: 衍生类型, e.g., "transcription") */
  derived?: Record<string, DerivedDataInfo>;
}
```

### 2.2 文件存储策略

衍生数据跟随资产的存储结构（按月滚动），存放在专门的 `derived` 子目录中，保持目录结构清晰。

- **路径规则**：`{asset_base_path}/derived/{year-month}/{asset_id}/{type}.md`
- **示例**：
  - 原始资产：`assets/images/2025-12/abc-123.png`
  - 转写内容：`assets/derived/images/2025-12/abc-123/transcription.md`

### 2.3 后端能力扩展 (Rust)

需要在 `asset_manager.rs` 中新增命令：

- **`update_asset_derived_data`**:
  - 输入：`asset_id`, `key` (e.g., "transcription"), `data` (DerivedDataInfo)
  - 逻辑：读取 Catalog -> 找到 Asset -> 更新 Metadata -> 写回 Catalog。

## 3. 前端功能模块与交互

### 3.1 配置系统集成 (`ChatSettings`)

在 `src/tools/llm-chat/composables/useChatSettings.ts` 中扩展配置结构，并在设置面板中新增“附件与转写”分组。

**配置项设计 (`src/tools/llm-chat/composables/useChatSettings.ts`)：**

```typescript
// 新增接口定义
export interface TranscriptionConfig {
  /** 是否启用转写功能 */
  enabled: boolean;
  /** 是否在附件导入时自动开始转写 */
  autoTranscribe: boolean;
  /** 发送消息时，是否默认优先使用转写内容（替代原始媒体） */
  preferTranscribed: boolean;
  /** 转写使用的模型 ID (指向 LlmModelSelector) */
  modelIdentifier: string;
  /** 自定义转写 Prompt (可选) */
  customPrompt: string;
}

// 在 ChatSettings 接口中扩展
export interface ChatSettings {
  // ... 其他配置
  /** 转写设置 */
  transcription: TranscriptionConfig;
}

// 默认值更新
export const DEFAULT_SETTINGS: ChatSettings = {
  // ...
  transcription: {
    enabled: true,
    autoTranscribe: false,
    preferTranscribed: true,
    modelIdentifier: "",
    customPrompt:
      "请详细描述这张图片的内容，包括主要物体、文字信息（OCR）和场景细节。输出格式为 Markdown。",
  },
};
```

**设置面板 UI (`src/tools/llm-chat/components/settings/settingsConfig.ts`):**

在 `settingsConfig` 数组中新增一个 `SettingsSection`，建议位于“模型设置”之后：

```typescript
{
  title: "附件与转写",
  icon: FileText, // 需引入 lucide-vue-next 的 FileText 图标
  items: [
    {
      id: "transEnabled",
      label: "启用转写功能",
      layout: "inline",
      component: "ElSwitch",
      modelPath: "transcription.enabled",
      hint: "开启后，可对图片/音频附件进行转写，提取文本内容",
      keywords: "transcription enable 启用 转写",
    },
    {
      id: "transAutoTranscribe",
      label: "自动转写",
      layout: "inline",
      component: "ElSwitch",
      modelPath: "transcription.autoTranscribe",
      hint: "附件导入时自动开始转写任务（需配置模型）",
      keywords: "transcription auto 自动 转写",
      visible: (settings) => settings.transcription.enabled,
    },
    {
      id: "transPreferTranscribed",
      label: "优先发送转写内容",
      layout: "inline",
      component: "ElSwitch",
      modelPath: "transcription.preferTranscribed",
      hint: "发送消息时，如果存在转写内容，优先使用转写文本替代原始图片/音频以节省 Token",
      keywords: "transcription prefer text 优先 转写",
      visible: (settings) => settings.transcription.enabled,
    },
    {
      id: "transModel",
      label: "转写模型",
      component: "LlmModelSelector",
      modelPath: "transcription.modelIdentifier",
      hint: "用于执行转写任务的多模态模型（推荐使用 Gemini Pro Vision 或 GPT-4o）",
      keywords: "transcription model 转写 模型",
      visible: (settings) => settings.transcription.enabled,
    },
    {
      id: "transCustomPrompt",
      label: "自定义 Prompt",
      component: "ElInput",
      props: { type: "textarea", rows: 4, placeholder: "输入自定义转写提示词" },
      modelPath: "transcription.customPrompt",
      hint: "用于指导模型如何转写附件内容。<br />默认值：<code>请详细描述这张图片的内容，包括主要物体、文字信息（OCR）和场景细节。输出格式为 Markdown。</code>",
      keywords: "transcription prompt 提示词",
      visible: (settings) => settings.transcription.enabled,
      action: "resetTranscriptionPrompt",
      slots: {
        append: () =>
          h(
            ElButton,
            {
              onClick: () => { }, // 在主组件处理重置
              size: "small",
              class: "reset-trans-prompt-btn",
              title: "重置为默认提示词",
            },
            () => [h(ElIcon, null, () => h(RefreshLeft)), "重置"]
          ),
      },
    },
  ],
},
```

### 3.2 转写管理器 (`useTranscriptionManager`)

负责协调整个转写流程，作为单例 Composable 提供服务。

**核心职责：**

1.  **调度与状态管理**：
    - 维护一个转写任务队列，支持并发控制。
    - **前端状态推断逻辑**：
      - **Processing**: 任务在内存队列中 -> UI 显示 Loading。
      - **Success**: `derived.transcription.path` 存在且文件有效 -> UI 显示成功图标。
      - **Error**: `derived.transcription.error` 存在 -> UI 显示错误图标。
      - **None**: 无记录且不在队列中 -> UI 不显示或显示可操作入口。

2.  **状态监听**：监听 `Asset` 导入事件，如果开启 `autoTranscribe`，自动加入队列。

3.  **执行逻辑**：
    - 检查 Asset 是否支持转写（Image/Audio）。
    - 调用 LLM (VLM) 接口。Prompt 示例："请详细描述这张图片的内容，包括主要物体、文字信息（OCR）和场景细节。输出格式为 Markdown。"
    - 流式更新或一次性写入文件。

4.  **结果持久化**：
    - 调用 `write_text_file` 保存内容。
    - 调用 `update_asset_derived_data` 更新索引（写入 path 或 error）。

### 3.3 UI 交互改造

#### A. 附件卡片 (`AttachmentCard.vue`)

改造现有的卡片组件，增加转写相关的交互入口。

1.  **状态指示器**：
    - 在卡片角落（或长条布局的信息栏）显示转写状态图标。
    - `pending`/`processing`: 旋转的 Loading 图标（Tooltip: "转写中..."）。
    - `success`: 文档图标（Tooltip: "已转写，点击编辑"）。
    - `error`: 红色警告图标（Tooltip: "转写失败: [错误信息]"）。

2.  **操作菜单**（右键菜单或悬浮按钮）：
    - **"执行转写"**：手动触发转写（适用于未开启自动转写或重试）。
    - **"编辑转写"**：打开 `TranscriptionDialog`。
    - **"使用转写发送"**：Toggle 开关，针对该特定附件临时覆盖全局的 `preferTranscribed` 设置。

#### B. 转写编辑器 (`TranscriptionDialog.vue`)

新建一个模态对话框组件，用于查看和编辑转写内容。

- **布局**：双栏布局（Split View）。
  - **左侧**：原始媒体预览（图片查看器或音频播放器）。
  - **右侧**：Markdown 编辑器（复用现有的 `RichCodeEditor` 或 `ElInput`）。
- **功能**：
  - **保存**：保存修改后的文本到文件。
  - **重新生成**：使用当前配置的模型重新发起转写请求。
  - **复制**：一键复制转写内容。

### 3.4 聊天上下文处理逻辑

核心原则：**不干涉原始意图，仅在构建 Context 时进行透明替换。**

#### 内容解析逻辑 (`resolveAssetContent`)

该逻辑用于决定最终发送给 LLM 的内容，同时用于 Token 计算。

**输入**：`Asset`, `Settings` (全局配置), `Overrides` (单条消息/附件的临时覆盖)
**输出**：`ContentPayload` (Image | Text)

**决策流程：**

1.  **强制覆盖检查**：如果该附件有临时设置（"使用转写发送" = true），则尝试读取转写文件。
2.  **全局配置检查**：如果 `settings.preferTranscribed` = true 且存在成功的转写数据 -> 读取转写文件。
3.  **兜底**：返回原始附件对象。

_注：如果决定使用转写但文件读取失败，应自动降级回原始附件，并记录警告日志。_

#### Token 计算适配 (`chatTokenUtils.ts`)

- 必须调用 `resolveAssetContent` 来确定计算对象。
- 如果发送的是转写文本，读取 Markdown 文件计算 Token（纯文本计算）。
- 如果发送的是原始附件，按原逻辑（图片分辨率/音频时长）估算 Token。

## 4. 实施规划清单

### Phase 1: 基础架构与类型定义

- [ ] **Rust 后端**: 在 `src-tauri/src/commands/asset_manager.rs` 中更新 `AssetMetadata` 结构体，并实现 `update_asset_derived_data` 命令。
- [ ] **TS 类型**: 在 `src/types/asset-management.ts` 中同步更新 `AssetMetadata` 和 `DerivedDataInfo` 接口。
- [ ] **配置系统**: 在 `src/tools/llm-chat/composables/useChatSettings.ts` 中定义 `TranscriptionConfig` 并更新默认设置。

### Phase 2: 核心逻辑实现

- [ ] **转写管理器**: 实现 `src/tools/llm-chat/composables/useTranscriptionManager.ts`，负责任务队列管理、LLM 调用和状态更新。
- [ ] **设置面板**: 在 `src/tools/llm-chat/components/settings/settingsConfig.ts` 中添加配置 UI。

### Phase 3: UI 组件开发

- [ ] **附件卡片**: 改造 `src/tools/llm-chat/components/message/AttachmentCard.vue` (需确认路径)，增加转写状态指示和操作菜单。
- [ ] **转写对话框**: 创建 `src/tools/llm-chat/components/dialogs/TranscriptionDialog.vue`，支持查看和编辑转写内容。

### Phase 4: 业务集成与测试

- [ ] **消息构建**: 在 `src/tools/llm-chat/composables/useMessageBuilder.ts` 中集成 `resolveAssetContent` 逻辑。
- [ ] **Token 计算**: 更新 `src/tools/llm-chat/utils/chatTokenUtils.ts` 以支持转写内容的 Token 估算。
- [ ] **集成测试**: 验证自动/手动转写流程及配置开关的有效性。
