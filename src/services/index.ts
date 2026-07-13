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
 * 服务层统一导出文件
 *
 * 此文件提供了对服务层所有核心模块的统一访问入口。
 */

// 导出类型定义
export type { ToolRegistry } from "./types";
export type { ToolCall, ServiceResult } from "./executor";

// 导出工具注册表单例
export { toolRegistryManager } from "./registry";

// 导出自动注册函数
export { autoRegisterServices } from "./auto-register";

// 导出启动管理器
export { startupManager } from "./startup-manager";

// 导出统一执行器
export { execute, executeMany } from "./executor";
