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
 * 自定义 ElMessage 包装
 * 解决无边框窗口中消息被标题栏遮挡的问题
 */

import { ElMessage, MessageOptions } from "element-plus";

/**
 * 标题栏高度 (来自 TitleBar.vue)
 * 默认 offset 是 16px
 * 调整为: 32px (标题栏) + 16px (默认间距) + 6px (额外缓冲) = 54px
 */
const DEFAULT_OFFSET = 54;

/**
 * 包装 ElMessage 方法，自动添加 offset
 */
function createMessageWrapper(type: "info" | "success" | "warning" | "error") {
  return (options: string | MessageOptions) => {
    const finalOptions: MessageOptions =
      typeof options === "string"
        ? { message: options, offset: DEFAULT_OFFSET }
        : { ...options, offset: options.offset ?? DEFAULT_OFFSET };

    return ElMessage[type](finalOptions);
  };
}

/**
 * 通用的 message 函数
 */
function message(options: MessageOptions) {
  const finalOptions = {
    ...options,
    offset: options.offset ?? DEFAULT_OFFSET,
  };
  return ElMessage(finalOptions);
}

/**
 * 导出自定义的 Message API
 * 保持与 ElMessage 完全一致的调用方式
 */
export const customMessage = Object.assign(message, {
  info: createMessageWrapper("info"),
  success: createMessageWrapper("success"),
  warning: createMessageWrapper("warning"),
  error: createMessageWrapper("error"),
  closeAll: ElMessage.closeAll,
});

/**
 * 默认导出
 */
export default customMessage;
