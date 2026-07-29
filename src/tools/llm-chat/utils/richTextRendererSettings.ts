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

import type { ChatSettings } from "../types/settings";

/**
 * 将 LLM Chat 的全局渲染偏好映射为 RichTextRenderer props。
 *
 * 所有聊天渲染入口都应复用此函数，避免普通消息、压缩消息、工具预览等
 * 场景各自维护一份不完整的设置透传列表。
 */
export function buildRichTextRendererSettings(
  uiPreferences: ChatSettings["uiPreferences"]
) {
  return {
    version: uiPreferences.rendererVersion,
    defaultRenderHtml: uiPreferences.defaultRenderHtml,
    seamlessMode: uiPreferences.seamlessMode,
    defaultCodeBlockExpanded: uiPreferences.defaultCodeBlockExpanded,
    defaultToolCallCollapsed: uiPreferences.defaultToolCallCollapsed,
    enableCdnLocalizer: uiPreferences.enableCdnLocalizer,
    allowExternalScripts: uiPreferences.allowExternalScripts,
    allowDangerousHtml: uiPreferences.allowDangerousHtml,
    throttleMs: uiPreferences.rendererThrottleMs,
    smoothingEnabled: uiPreferences.smoothingEnabled,
    throttleEnabled: uiPreferences.throttleEnabled,
    safetyGuardEnabled: uiPreferences.safetyGuardEnabled,
    enableEnterAnimation: uiPreferences.enableEnterAnimation,
    showTokenCount: uiPreferences.showTokenCountForBlocks,
  };
}
