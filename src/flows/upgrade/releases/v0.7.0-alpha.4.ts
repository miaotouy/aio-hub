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
  title: "Git 差异导航、色彩归档与离线字幕 OCR",
  summary:
    "Git Committer 增加差异导航与仓库专属 AI 提交设置，色彩整理支持目录扫描和自定义归档，字幕 OCR 可以离线识别本地视频。",
  publishedAt: "2026-09-15",
  body,
  highlights: [
    "查看 Git 提交详情，在改动之间快速跳转",
    "每个仓库可单独设置 AI 提交提示词和语言",
    "批量扫描图片，通过缩略图筛选后归档",
    "离线识别本地视频字幕，并逐行编辑",
    "FFmpeg 可以裁剪片段并吸附关键帧",
  ],
  unknownBaselinePolicy: "show-current",
};
