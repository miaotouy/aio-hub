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
 * CSS 覆盖功能的相关类型定义
 */

/**
 * 内置的 CSS 预设
 */
export interface CssPreset {
  id: string; // 唯一标识符
  name: string; // 显示名称
  description: string; // 描述
  content: string; // CSS 内容
}

/**
 * 存储在用户设置中的 CSS 配置
 */
export interface UserCssSettings {
  enabled: boolean; // 是否启用自定义 CSS
  basedOnPresetId: string | null; // 基于哪个预设的 ID，null 表示纯自定义
  customContent: string; // 用户的自定义 CSS 内容（基于预设修改时）
  pureCustomContent?: string; // 纯自定义模式下的 CSS 内容
  userPresets: CssPreset[]; // 用户自定义的预设列表
  selectedPresetId: string | null; // 当前选中但未应用的预设 ID
}
