# 翻译工作台 (Translation Workbench) 设计文档草案

## 1. 概述 (Overview)

翻译工作台 (Translation Workbench) 是一个高度可定制化、支持多服务商的集成翻译工具。它旨在取代传统的单一翻译工具，为用户提供一个灵活、强大且可扩展的翻译环境。

### 核心特性

- **多引擎对比**: 支持同时调用多个翻译服务（包括 LLM 和传统翻译 API），并在界面上并排对比结果。
- **预设槽位系统**: 独创的“装备栏”式预设系统，允许用户创建、保存和切换多种翻译渠道组合，以适应不同场景（如快速查词、学术精翻等）。
- **模式切换**: 提供“单一模式”和“对比模式”的动态切换，满足不同用户的查阅习惯。
- **可扩展的提供商架构**: 采用可插拔的提供商 (Provider) 架构，未来可以轻松接入新的翻译服务。
- **统一配置**: 无缝集成项目中已有的 LLM 服务配置，并为传统翻译服务建立独立的配置体系。

## 2. 核心架构 (Core Architecture)

本工具采用三层架构：**配置层 (Presets)** -> **抽象层 (Providers)** -> **实现层 (APIs)**。用户通过操作最上层的“预设槽位”，来驱动整个翻译流程。

```mermaid
graph TD
    subgraph 用户界面 (UI)
        A[选择 "预设槽位" P1] --> B[选择 "对比模式"];
        B --> C[输入文本, 点击翻译];
    end

    subgraph 预设系统 (Preset System)
        C --> D{读取预设 P1 的配置};
        D --> E[获取渠道列表 [Channel A, Channel B]];
    end

    subgraph 提供商抽象层 (Provider Layer)
        E -- Channel A 配置 --> F{分发到 Provider};
        E -- Channel B 配置 --> F;
        F -- type: 'llm' --> G[LlmTranslationProvider];
        F -- type: 'traditional' --> H[TraditionalTranslationProvider];
    end

    subgraph 实现层 (API Layer)
        G --> I[调用 useLlmRequest];
        H --> J[调用 fetch (e.g. DeepL API)];
    end

    subgraph 结果处理
        I & J --> K[聚合所有结果];
        K --> L[根据 "对比模式" 渲染UI];
    end
```

## 3. 数据结构设计 (Data Structure Design)

### 3.1. 预设槽位 (Preset Slot)

预设是用户自定义的翻译配置组合，将存储在 `src/tools/translator/presets.json` 中。

```typescript
// src/tools/translator/types.ts

/**
 * 翻译渠道配置
 */
export interface TranslationChannel {
  id: string; // 渠道的唯一实例 ID, e.g., 'channel-1688888888'
  displayName: string; // 在 UI 上显示的名称, e.g., "DeepSeek Pro"
  providerType: "llm" | "traditional"; // 提供商类型

  // LLM 类型所需
  llmProfileId?: string; // 对应 llm-profiles.json 中的 id
  modelId?: string;

  // 传统 API 类型所需
  traditionalProfileId?: string; // 对应 translation-profiles.json 中的 id

  // 可选的单次请求覆盖参数
  perRequestOverrides?: {
    prompt?: string; // 例如，为特定渠道定制一个专门的 prompt
  };
}

/**
 * 预设槽位配置
 */
export interface PresetSlot {
  id: string; // 预设的唯一 ID, e.g., 'preset-academic'
  name: string; // 预设名称, e.g., "学术精翻"
  icon?: string; // 预设图标
  channels: TranslationChannel[]; // 包含的翻译渠道列表
}
```

### 3.2. 传统翻译服务配置

用于存储非 LLM 的翻译服务配置，将存储在 `src/config/translation-profiles.json` 中。

```typescript
// src/types/translation-profiles.ts

export type TraditionalProviderType = "deepl" | "google" | "microsoft" | "custom";

export interface TraditionalProfile {
  id: string;
  name: string;
  type: TraditionalProviderType;
  enabled: boolean;
  apiKey: string;
  baseUrl?: string;
  // 其他服务商特定的配置...
}
```

## 4. 模块设计 (Module Design)

### 4.1. 提供商抽象层 (Provider Abstraction Layer)

- **`useTranslationProfiles.ts`**: 新建的 Composable，负责管理 `translation-service/profiles.json`，提供对传统翻译服务配置的增删改查能力。
- **`translator.registry.ts`**:
  - 定义统一的 `TranslationProvider` 接口：`interface TranslationProvider { translate(text: string, options: TranslationChannel): Promise<{ content: string; error?: Error; }> }`
  - 实现 `LlmTranslationProvider`：内部调用 `useLlmRequest`，将 `TranslationChannel` 配置转换为 `LlmRequestOptions`。
  - 实现 `TraditionalTranslationProvider`：根据 `providerType` 调用不同的传统 API 客户端。

### 4.2. 预设系统 (Preset System)

- **`useTranslatorPresets.ts`**: 新建的 Composable，负责管理 `translator/presets.json`，提供对预设槽位的增删改查和当前激活预设的管理。

### 4.3. UI/视图层 (UI/View Layer)

- **`Translator.vue`**: 主视图组件，负责整体布局。
- **`PresetSelector.vue`**: 顶部预设选择器和管理入口组件。
- **`ResultDisplay.vue`**: 结果展示组件，内部处理“单一/对比”模式的渲染逻辑切换。
- **`PresetEditor.vue`**: 用于创建和编辑预设槽位的对话框或独立视图。

## 5. 开发阶段规划 (Development Phases)

### 阶段一：奠定基础 (Foundation)

1.  **创建文件结构**: 搭建 `translator` 工具目录及核心文件。
2.  **定义核心类型**: 完成 `types.ts` 中 `PresetSlot`, `TranslationChannel` 等核心数据结构的定义。
3.  **构建 Provider 抽象**:
    - 创建 `useTranslationProfiles` Composable 及对应的配置文件。
    - 在 `translator.registry.ts` 中定义 `TranslationProvider` 接口。
    - 优先实现 `LlmTranslationProvider`，使其能够调用已有的 LLM 服务。
4.  **基础 UI**: 实现一个最简 UI，包含输入框和单一结果展示区，验证 `LlmTranslationProvider` 工作正常。

### 阶段二：实现核心功能 (Core Features)

1.  **预设系统**:
    - 实现 `useTranslatorPresets` Composable，完成对预设的读写。
    - 构建 `PresetEditor.vue` 和 `PresetSelector.vue`，让用户可以管理和切换预设。
2.  **并发与多结果**:
    - 实现基于当前激活预设的并发翻译逻辑。
    - 实现“单一/对比”模式的 UI 切换。
    - 将结果展示区与并发请求结果联动。

### 阶段三：完善与扩展 (Polish & Expansion)

1.  **历史记录**: 实现翻译历史的查看与本地持久化。
2.  **扩展提供商**: 添加至少一个 `TraditionalTranslationProvider` 的完整实现（例如 DeepL）。
3.  **UI 占位**: 在界面上集成 `DropZone` 组件，为未来的图片/文档翻译功能预留入口。
