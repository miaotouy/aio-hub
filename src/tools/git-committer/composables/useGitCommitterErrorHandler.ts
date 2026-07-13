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

import { createModuleErrorHandler } from "@/utils/errorHandler";

/**
 * Git Committer 模块级错误处理器
 *
 * 所有后端调用统一通过 `errorHandler.wrapAsync(() => invoke(...))` 包裹。
 * 禁止直接导入全局 `errorHandler` 单例。
 */
export const errorHandler = createModuleErrorHandler("git-committer");
