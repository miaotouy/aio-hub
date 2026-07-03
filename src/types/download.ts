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
 * 下载历史记录项
 */
export interface DownloadItem {
  id: string;
  filename: string;
  filepath: string;
  size: number;
  timestamp: number;
  status: "success" | "failed" | "pending";
  error?: string;
}

/**
 * 下载事件的标准负载结构
 */
export interface DownloadCompletedPayload {
  id: string; // UUID，下载任务唯一标识
  filename: string; // 文件名
  filepath: string; // 完整保存路径
  size: number; // 文件大小（字节）
  status: "success" | "failed";
  error?: string; // 失败原因（仅当 status='failed' 时）
  timestamp: number; // 完成时间戳
  sourceWindow?: string; // 触发下载的窗口标签（可选，用于调试）
}

/**
 * 全局下载事件常量
 */
export const DOWNLOAD_EVENTS = {
  COMPLETED: "global:download_completed",
  PROGRESS: "global:download_progress", // 预留，用于大文件流式下载
} as const;
