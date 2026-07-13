// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * AIO Hub Plugin SDK
 *
 * 这个文件汇总并导出了所有插件可以使用的公共服务和工具。
 * 它是主应用与插件之间的正式契约。
 */

// 导出核心类型定义
export type {
  ServiceMetadata,
  MethodMetadata,
  MethodParameter,
  ToolConfig,
  ToolRegistry,
  ToolContext,
  StartupConfig,
} from "./types";

export type {
  PluginContext,
  PluginProxy,
  PluginManifest,
  PluginSettingsAPI,
  PluginEnvironmentAPI,
} from "./plugin-types";

// 导出配置服务
export { pluginConfigService } from "./plugin-config.service";
export { pluginStateService } from "./plugin-state.service";
export { pluginEnvironmentService } from "./plugin-environment.service";
export { startupManager } from "./startup-manager";
export { pluginManager } from "./plugin-manager";

// 导出执行器服务
import { execute, executeMany } from "./executor";
export { execute, executeMany };

// 导出 Tauri 插件 API
export {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";

// 导出常用工具 (Utils)
export * from "@/utils/customMessage";
export * from "@/utils/errorHandler";
export * from "@/utils/logger";
export * from "@/utils/time";
export * from "@/utils/fileUtils";
export * from "@/utils/fileTypeDetector";
export * from "@/utils/base64";
export * from "@/utils/hash";
export * from "@/utils/encoding";
export * from "@/utils/serialization";
export * from "@/utils/apiRequest";
export * from "@/utils/appPath";
export * from "@/utils/appSettings";
export * from "@/utils/themeColors";
export * from "@/utils/modelIdUtils";
export * from "@/utils/configManager";
export * from "@/utils/singleton";
export * from "@/utils/sse-parser";

// 导出常用 Composables
export * from "@/composables/useTheme";
export * from "@/composables/useAssetManager";
export * from "@/composables/useNotification";
export * from "@/composables/useImageViewer";
export * from "@/composables/useModelMetadata";
export * from "@/composables/useLlmProfiles";
export * from "@/composables/useLlmRequest";
export * from "@/composables/useFileInteraction";
export * from "@/composables/useSendToChat";

// 导出核心 Store (按需)
export { useAppSettingsStore } from "@/stores/appSettingsStore";

// 导出类型定义
export * from "./plugin-types";
export * from "./types";

// 导出 UI 组件
export * as ui from "./plugin-ui";

// 导出 OCR 平台服务
export * from "@/tools/smart-ocr/platform";

// 你可以在这里添加更多想要暴露给插件的内部服务
