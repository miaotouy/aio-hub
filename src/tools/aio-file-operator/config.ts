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
 * aio-file-operator 默认配置
 */
import type { AioFileOperatorConfig } from "./types";

/** 默认允许的沙箱目录（用户可配置） */
export const DEFAULT_ALLOWED_DIRECTORIES: string[] = [
  // 桌面
  "Desktop",
  // 文档
  "Documents",
  // 下载
  "Downloads",
];

/** 默认最大文件大小：10MB */
export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

/** 默认配置 */
export const DEFAULT_CONFIG: AioFileOperatorConfig = {
  allowedDirectories: DEFAULT_ALLOWED_DIRECTORIES,
  blackListRules: [],
  sandboxMode: "whitelist",
  maxFileSize: DEFAULT_MAX_FILE_SIZE,
  enableAuditLog: true,
  overwritePolicy: "follow",
  logPanelWidth: 350,
  isLogCollapsed: false,
};
