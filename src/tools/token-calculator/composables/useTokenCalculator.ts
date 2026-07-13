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
 * Token 计算 Composable 适配器
 *
 * 负责将核心计算引擎与 Vue 响应式系统（如果需要）或其它 UI 服务连接。
 * 注意：本文件导出的 tokenCalculatorEngine 实例来自核心引擎。
 */

export { tokenCalculatorEngine } from "../core/tokenCalculatorEngine";
export type { TokenCalculationResult } from "../core/tokenCalculatorEngine";
