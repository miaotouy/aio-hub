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

import body from "./v0.7.0-alpha.4.md?raw";
import type { ReleaseNoteManifest } from "../types";

export const releaseNoteV070Alpha4: ReleaseNoteManifest = {
  version: "0.7.0-alpha.4",
  revision: 1,
  channel: "prerelease",
  title: "Git Committer 与色彩整理、实时字幕工作台升级",
  summary:
    "Git Committer 补齐提交详情与差异导航，色彩整理迁移 Rust 并行分析，实时字幕 OCR 重构为编辑器式工作台并支持本地视频离线识别。",
  publishedAt: "2026-09-15",
  body,
  highlights: [
    "Git Committer 提交详情、差异导航与仓库级 AI 提示词",
    "色彩整理批量分析迁移 Rust 并行处理",
    "实时字幕 OCR 工作台重构与本地视频离线识别",
    "FFmpeg 工作台执行计划与片段裁剪",
    "首页 Doodle 与工具分类栏自定义",
  ],
  unknownBaselinePolicy: "show-current",
};
