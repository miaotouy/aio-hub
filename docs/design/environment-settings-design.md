# 运行环境与外部依赖配置中心设计方案 (Environment Settings Design)

> **状态**: Implemented Phase 1 (第一期已施工)  
> **作者**: 咕咕 (Gugu_Kilo)  
> **日期**: 2026-06-15  
> **定位**: 全局运行环境与外部依赖（如 FFmpeg、Python、Git 等）的统一管理中心，支持“全局默认 + 工具级自定义覆盖”模式。

> **2026-06-15 施工记录**: 第一期已落地桌面端全局 `environment` 设置、运行环境设置页、FFmpeg/FFprobe/Git 检测卡片、`useFFmpeg` 统一入口，并完成 `ffmpeg-tools`、`transcription`、`llm-chat` 转写覆盖配置、`token-calculator` 的 FFmpeg 路径接入。文档转换依赖、Skill 运行时、Git 相关 Rust command 的读取迁移留到后续阶段。

---

## 1. 背景与痛点 (Background & Pain Points)

目前 AIO Hub 中有多个工具模块依赖外部可执行文件（主要是 FFmpeg）：

1. **`ffmpeg-tools`** (多媒体工作台): 在其私有配置中维护 `ffmpegPath`。
2. **`llm-chat`** (聊天转录): 在其私有配置中维护 `transcription.ffmpegPath`。
3. **`transcription`** (音视频转录): 在其私有配置中维护 `ffmpegPath`。
4. **`token-calculator`** (Token 计算器): 硬编码了 `"ffmpeg"`。

### 进一步调查：现有外部程序/运行时路径配置

除 FFmpeg 外，仓库中还存在下列已经落地或隐性依赖的外部程序配置点：

| 依赖/集成                   | 当前位置                                                                                                                                                                                    | 当前配置方式                                                                                                       | 建议纳入方式                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| **FFmpeg**                  | `src/tools/ffmpeg-tools/config.ts`、`src/tools/transcription/config.ts`、`src/tools/llm-chat/components/settings/settingsConfig.ts`、`src/tools/token-calculator/components/InputPanel.vue` | 多处私有 `ffmpegPath` + 一处硬编码 `"ffmpeg"`                                                                      | 第一优先级统一到 `environment.ffmpegPath`，工具级字段保留为空值覆盖机制                   |
| **FFprobe**                 | `src-tauri/src/commands/ffmpeg_processor.rs`                                                                                                                                                | 由 `ffmpegPath` 的父目录推断 `ffprobe`，否则回退 `"ffprobe"`                                                       | 与 FFmpeg 一起纳入 `environment.ffprobePath`，避免 Windows 下 `ffprobe.exe` 推断不完整    |
| **LibreOffice / soffice**   | `src/tools/asset-manager/config.ts`、`src-tauri/src/commands/document_converter/libreoffice.rs`                                                                                             | 资产管理器私有 `documentConversion.libreOfficePath`，并支持常见安装路径/PATH 自动检测                              | 第二优先级纳入 `environment.documentConverters.libreOfficePath`，资产管理器保留工具级覆盖 |
| **AbiWord**                 | `src/tools/asset-manager/config.ts`、`src-tauri/src/commands/document_converter/abiword.rs`                                                                                                 | 资产管理器私有 `documentConversion.abiWordPath`，并支持常见安装路径/PATH 自动检测                                  | 与 LibreOffice 同组纳入 `environment.documentConverters.abiWordPath`                      |
| **Microsoft Word COM**      | `src-tauri/src/commands/document_converter/microsoft_word.rs`                                                                                                                               | Windows 上通过 `powershell.exe` + COM 调用，无 Word 可执行文件路径配置                                             | 不作为路径配置；在运行环境页展示为“系统能力检测”更合适                                    |
| **macOS textutil**          | `src-tauri/src/commands/document_converter/textutil.rs`                                                                                                                                     | macOS 系统命令 `"textutil"`，无路径配置                                                                            | 不作为第一期路径字段；可作为系统能力检测项                                                |
| **Skill 脚本运行时**        | `src/tools/skill-manager/stores/skillManagerStore.ts`、`src/tools/skill-manager/components/SkillScanSettings.vue`、`src-tauri/src/commands/skill_manager.rs`                                | Skill 管理器私有 `runtimeSettings.{javascript,python,shell,powershell}.command`，JS/TS 空值时自动检测 `bun > node` | 建议抽象为通用 `environment.runtimes`，但迁移时需保留 Skill 管理器现有 UI 与配置兼容      |
| **Git CLI**                 | `src-tauri/src/commands/git_analyzer.rs`、`src-tauri/src/commands/skill_manager.rs`                                                                                                         | Git 分析器少量操作硬编码 `"git"`；Skill 从 Git 仓库安装时硬编码 `"git clone"`                                      | 纳入 `environment.gitPath`，同时让相关 Tauri command 接收可选 git 路径或读取统一设置      |
| **PowerShell**              | `src-tauri/src/commands/skill_manager.rs`、`src-tauri/src/commands/document_converter/microsoft_word.rs`、`src-tauri/src/commands/system_pulse.rs`                                          | Skill 运行时可配置；其他 Windows 系统能力硬编码 `"powershell"`/`"powershell.exe"`                                  | 仅 Skill 运行时先纳入；系统诊断类命令暂不纳入用户配置                                     |
| **mpv JSON IPC**            | `src/tools/danmaku-player/composables/useExternalPlayer.ts`、`src/tools/danmaku-player/core/externalPlayerApi.ts`                                                                           | 弹幕播放器私有 `mpvIpcPath`，默认 `\\.\pipe\mpv`                                                                   | 不是可执行文件路径，不建议放入通用运行时路径；可归入“外部应用连接配置”独立分组            |
| **插件 Sidecar 可执行文件** | `src/services/sidecar-plugin-adapter.ts`、`src-tauri/src/commands/sidecar_plugin.rs`                                                                                                        | 插件 manifest 声明平台可执行文件，相对插件目录运行                                                                 | 属于插件私有清单，不应进入全局环境设置                                                    |

另外还存在若干平台工具命令（如 Windows `explorer`、macOS `open`、Linux `xdg-open`、`secret-tool`、`glxinfo`、`pkg-config`、`zenity`、`kdialog`、`notify-send` 等）。这些当前主要用于系统集成、诊断或平台能力探测，通常不需要暴露路径配置；更适合在“诊断信息”里展示可用性，而不是作为用户常规设置项。

### 核心痛点：

- **重复配置，体验割裂**：用户需要在多个工具中重复配置同一个 FFmpeg 路径。
- **模块强耦合与循环依赖**：如果让 `llm-chat` 直接引用 `ffmpeg-tools` 的 Store，会导致核心工具与具体工具强耦合，甚至在打包和运行时产生双向循环依赖（Circular Dependency）。
- **缺乏未来扩展性**：随着项目发展，未来会引入更多外部依赖（如 Python 解释器、Git 路径、Node/Bun 路径、本地 OCR 引擎等）。如果每个依赖都零散地塞在通用设置里，设置页面将变得臃肿且难以维护。

---

## 2. 设计目标 (Design Goals)

- **统一管理 (Unified Management)**：建立全局“运行环境与外部依赖”配置中心，将所有外部可执行文件路径收归一处。
- **智能回退 (Inheritance & Override)**：全局提供默认配置，工具级保留自定义覆盖能力。如果工具未配置私有路径，则自动回退到全局默认路径。
- **高内聚低耦合 (Decoupling)**：所有工具仅依赖全局设置 Store，工具之间互不依赖，彻底消除循环依赖风险。
- **极佳的扩展性 (Extensibility)**：为未来引入 Python、Git 等其他外部依赖打下坚实的基石。

---

## 3. 架构设计 (Architecture Overview)

```mermaid
graph TD
    subgraph 全局基础设施层 (Infrastructure)
        appSettingsStore[appSettingsStore 全局设置]
        useFFmpeg[useFFmpeg 全局 Composable] --> appSettingsStore
    end

    subgraph 业务工具层 (Tools)
        llm-chat[llm-chat 聊天工具] -->|调用| useFFmpeg
        transcription[transcription 转录工具] -->|调用| useFFmpeg
        ffmpeg-tools[ffmpeg-tools 工具] -->|调用| useFFmpeg
        token-calculator[token-calculator 工具] -->|调用| useFFmpeg
    end

    style appSettingsStore fill:#d4edda,stroke:#28a745,stroke-width:2px
    style useFFmpeg fill:#cce5ff,stroke:#007bff,stroke-width:2px
```

---

## 4. 详细实现方案 (Detailed Implementation)

### 4.1. 数据结构设计 (`src/utils/appSettings.ts`)

在全局 `AppSettings` 中，我们不新增零散的顶层字段，而是统一收纳进一个 `environment` 对象中：

```typescript
// src/utils/appSettings.ts

export interface EnvironmentSettings {
  ffmpegPath?: string; // FFmpeg 可执行文件路径 (默认 "ffmpeg")
  ffprobePath?: string; // FFprobe 可执行文件路径 (默认 "ffprobe")
  gitPath?: string; // Git 可执行文件路径 (未来扩展)
  runtimes?: EnvironmentRuntimeSettings; // 脚本运行时命令 (未来扩展)
  documentConverters?: DocumentConverterEnvironmentSettings; // 文档转换依赖 (未来扩展)
}

export interface EnvironmentRuntimeSettings {
  javascriptCommand?: string; // JS/TS 运行时，空值表示自动检测 bun > node
  pythonCommand?: string; // Python 解释器命令
  shellCommand?: string; // bash/sh 命令
  powershellCommand?: string; // PowerShell 命令
}

export interface DocumentConverterEnvironmentSettings {
  libreOfficePath?: string; // LibreOffice soffice 路径
  abiWordPath?: string; // AbiWord 路径
}

export interface AppSettings {
  // ... 现有字段
  environment?: EnvironmentSettings; // 统一的运行环境与外部依赖配置
}

// 默认环境配置
export const defaultEnvironmentSettings: EnvironmentSettings = {
  ffmpegPath: "ffmpeg",
  ffprobePath: "ffprobe",
  gitPath: "git",
  runtimes: {
    javascriptCommand: "",
    pythonCommand: "",
    shellCommand: "",
    powershellCommand: "",
  },
  documentConverters: {
    libreOfficePath: "",
    abiWordPath: "",
  },
};

// 默认全局配置中加入 environment
export const defaultAppSettings: AppSettings = {
  // ... 现有默认值
  environment: defaultEnvironmentSettings,
};
```

#### 深度合并逻辑适配：

在 `appSettingsManager` 的 `mergeConfig` 中，需要对 `environment` 进行深度合并，确保用户升级时不会丢失未配置的默认字段：

```typescript
// src/utils/appSettings.ts -> appSettingsManager

const mergedEnvironment = {
  ...defaultConfig.environment,
  ...loadedConfig.environment,
  runtimes: {
    ...defaultConfig.environment?.runtimes,
    ...loadedConfig.environment?.runtimes,
  },
  documentConverters: {
    ...defaultConfig.environment?.documentConverters,
    ...loadedConfig.environment?.documentConverters,
  },
};

return {
  ...defaultConfig,
  ...loadedConfig,
  environment: mergedEnvironment,
  // ... 其他合并
};
```

---

### 4.2. 统一的 `useFFmpeg` Composable 封装 (`src/composables/useFFmpeg.ts`)

新建全局的 `useFFmpeg` Composable，作为所有工具调用 FFmpeg 的统一入口。它支持传入一个可选的“工具私有路径”参数，自动进行回退计算：

```typescript
// src/composables/useFFmpeg.ts

import { computed, type Ref, type ComputedRef } from "vue";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { invoke } from "@tauri-apps/api/core";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("composables/useFFmpeg");
const errorHandler = createModuleErrorHandler("composables/useFFmpeg");

export function useFFmpeg(
  toolPrivatePath?: Ref<string | undefined> | ComputedRef<string | undefined>
) {
  const settingsStore = useAppSettingsStore();

  // 1. 全局默认路径
  const globalFfmpegPath = computed(
    () => settingsStore.settings.environment?.ffmpegPath ?? "ffmpeg"
  );
  const globalFfprobePath = computed(
    () => settingsStore.settings.environment?.ffprobePath ?? "ffprobe"
  );

  // 2. 实际生效的 FFmpeg 路径：如果传入了工具私有路径且不为空，则使用私有路径；否则回退到全局默认路径
  const activeFfmpegPath = computed(() => {
    const privatePath = toolPrivatePath?.value;
    if (privatePath && privatePath.trim() !== "") {
      return privatePath;
    }
    return globalFfmpegPath.value;
  });

  // 3. 是否正在使用全局配置（用于 UI 提示，比如显示“已跟随全局配置”）
  const isUsingGlobal = computed(() => {
    const privatePath = toolPrivatePath?.value;
    return !privatePath || privatePath.trim() === "";
  });

  /**
   * 检查当前配置的 FFmpeg 是否可用
   */
  const checkAvailability = async (pathToCheck?: string): Promise<boolean> => {
    const targetPath = pathToCheck ?? activeFfmpegPath.value;
    try {
      return await invoke<boolean>("check_ffmpeg_availability", {
        path: targetPath,
      });
    } catch (error) {
      logger.error("检查 FFmpeg 可用性失败", error);
      return false;
    }
  };

  return {
    globalFfmpegPath,
    globalFfprobePath,
    activeFfmpegPath,
    isUsingGlobal,
    checkAvailability,
  };
}
```

---

### 4.3. UI 界面设计：新增“运行环境”设置面板

在全局设置（`src/views/Settings.vue`）中，新增一个专门的设置子页面：**“运行环境 (Environment)”**。

实际实现位置为 `src/views/Settings/environment/EnvironmentSettings.vue`，并通过 `src/config/settings.ts` 注册为全局设置模块。第一期卡片包含 FFmpeg、FFprobe、Git 三项；每张卡片支持路径输入、文件选择、版本检测和下载指引。检测后端没有新增单独的 FFmpeg 版本 command，而是新增通用 `check_command_version(path, versionArg)`，避免后续 Python/Git/LibreOffice 重复写同类 command。

#### 界面视觉设计：

采用 **“依赖卡片网格 (Dependency Card Grid)”** 的设计，每一个外部依赖都是一个独立的卡片，包含：

1. **依赖名称与图标**（如 FFmpeg 带有 Video 图标，Git 带有 GitBranch 图标）。
2. **路径输入框**：支持手动输入，并配有“文件选择器”按钮。
3. **状态指示灯与检测按钮**：
   - 点击“检测”按钮，调用 `checkAvailability`。
   - 检测成功：指示灯变绿，显示 `“可用 (版本: xxx)”`。
   - 检测失败：指示灯变红，显示 `“未检测到”`，并提供一键下载/安装指引链接。

```vue
<!-- 伪代码示意：src/views/Settings/environment/EnvironmentSettings.vue -->
<template>
  <div class="environment-settings">
    <div class="section-title">运行环境与外部依赖</div>

    <el-row :gutter="20">
      <!-- FFmpeg 卡片 -->
      <el-col :span="12">
        <el-card class="dependency-card">
          <div class="card-header">
            <div class="title-area">
              <el-icon><Video /></el-icon>
              <span>FFmpeg 多媒体引擎</span>
            </div>
            <el-tag :type="isFfmpegOk ? 'success' : 'danger'" size="small">
              {{ isFfmpegOk ? "已就绪" : "未检测到" }}
            </el-tag>
          </div>

          <div class="card-body">
            <el-form label-position="top">
              <el-form-item label="FFmpeg 执行路径">
                <el-input
                  v-model="ffmpegPath"
                  placeholder="例如: ffmpeg 或 C:\ffmpeg\bin\ffmpeg.exe"
                >
                  <template #append>
                    <el-button @click="selectFile">选择文件</el-button>
                  </template>
                </el-input>
              </el-form-item>
            </el-form>

            <div class="actions">
              <el-button type="primary" size="small" @click="testFfmpeg"
                >检测环境</el-button
              >
              <el-link type="info" href="https://ffmpeg.org" target="_blank"
                >下载指引</el-link
              >
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
```

---

### 4.4. 各个工具的适配改造 (Tool Adaptation)

#### 1. `ffmpeg-tools` (多媒体工作台)

- **设置界面**：其私有设置中的 `ffmpegPath` 默认值设为空 `""`。
- **输入框 Placeholder**：动态绑定为 `globalFfmpegPath`。
  ```vue
  <el-input
    v-model="store.config.ffmpegPath"
    :placeholder="`跟随全局配置 (当前: ${globalFfmpegPath})`"
  />
  ```
- **业务逻辑**：在执行任务时，使用 `activeFfmpegPath` 作为执行路径。

#### 2. `llm-chat` (聊天转录) 与 `transcription` (音视频转录)

- **设置界面**：移除或保留私有 `ffmpegPath`（默认值设为空 `""`）。
- **输入框 Placeholder**：同样动态绑定为 `globalFfmpegPath`。
- **业务逻辑**：

  ```typescript
  import { useFFmpeg } from "@/composables/useFFmpeg";

  const { activeFfmpegPath } = useFFmpeg(computed(() => chatConfig.ffmpegPath));
  // 传入 chatConfig.ffmpegPath 作为私有路径，activeFfmpegPath 会自动处理回退
  ```

#### 3. `token-calculator` (Token 计算器)

- **业务逻辑**：

  ```typescript
  import { useFFmpeg } from "@/composables/useFFmpeg";
  const { activeFfmpegPath } = useFFmpeg();

  // 替换原本硬编码的 "ffmpeg"
  const metadata = await invoke<any>("get_media_metadata", {
    ffmpegPath: activeFfmpegPath.value,
    inputPath: path,
  });
  ```

### 4.5. 第一期实现偏差与后续 TODO

- **FFprobe 接入增强**：计划中仅描述 `environment.ffprobePath` 字段。实际施工时同步扩展 `get_full_media_info`，新增可选 `ffprobePath` 参数；新调用优先使用全局 FFprobe 路径，旧调用保持兼容。
- **检测状态实现**：计划中写作 `checkAvailability` 返回布尔值。设置页需要展示版本摘要，因此后端新增通用 `check_command_version` 返回 `{ available, version, error }`。
- **范围收敛**：第一期没有迁移 LibreOffice / AbiWord、Skill 脚本运行时、Git 分析器/Skill 安装命令的后端读取逻辑；这些字段先在 `environment` 数据结构中预留。
- **工具级覆盖策略**：`ffmpeg-tools` 默认 `ffmpegPath` 已改为空字符串，代表跟随全局；已有用户私有配置仍会保留并继续覆盖全局。
- **进度事件修正**：转写压缩监听从旧的 `task_id` 读取改为 `taskId`，与 Rust `#[serde(rename_all = "camelCase")]` 事件载荷保持一致。

---

## 5. 未来扩展性 (Future Extensibility)

当未来需要引入新的外部依赖（例如 Python 解释器或 LibreOffice）时，我们只需要：

1. 在 `EnvironmentSettings` 或其子分组接口中增加对应字段。
2. 在 `EnvironmentSettings.vue` 页面中新增对应依赖卡片。
3. 封装一个轻量级的 `useRuntime` / `useDocumentConverter` 等 Composable。
4. 对已有工具配置采用“空值继承全局、非空覆盖全局”的兼容迁移。

整个过程完全符合 **开闭原则 (Open-Closed Principle)**，对现有代码没有任何破坏性改动，架构极其优雅、健壮。
