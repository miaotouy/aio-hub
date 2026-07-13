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
 * 工具默认顺序配置
 *
 * 当用户没有手动调整工具顺序时，将按照此列表的顺序进行排列。
 * 未出现在此列表中的工具将自动排在末尾。
 */
export const DEFAULT_TOOLS_ORDER = [
  // AI 工具
  "/llm-chat",
  "/web-canvas",
  "/media-generator",
  "/smart-ocr",
  "/realtime-subtitle-ocr",
  "/transcription",
  "/translator",
  "/web-distillery",
  "/knowledge-base",
  "/st-worldbook-editor",
  "/skill-manager",

  // 文本处理
  "/code-formatter",
  "/json-formatter",
  "/config-converter",
  "/regex-applier",
  "/data-filter",
  "/text-diff",

  // 媒体工具
  "/ffmpeg-tools",
  "/danmaku-player",
  "/color-picker",
  "/sketch-pad",
  "/media-info-reader",

  // 文件管理
  "/aio-file-operator",
  "/asset-manager",
  "/symlink-mover",
  "/directory-tree",
  "/directory-janitor",
  "/dir-search",
  "/content-deduplicator",

  // 自动化
  "/window-automator",

  // 开发工具
  "/api-tester",
  "/llm-inspector",
  "/git-analyzer",
  "/git-committer",
  "/system-pulse",
  "/token-calculator",
  "/embedding-playground",
  "/vcp-connector",
  "/service-monitor",
  "/rich-text-renderer-tester",
  "/component-tester",
  "/tool-calling-tester",
];
