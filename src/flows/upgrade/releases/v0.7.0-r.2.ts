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

import body from "./v0.7.0-r.2.md?raw";
import type { ReleaseNoteManifest } from "../types";

export const releaseNoteV070R2: ReleaseNoteManifest = {
  version: "0.7.0-r.2",
  revision: 1,
  channel: "prerelease",
  title: "预设消息组合、聊天分支保存与 GitHub 仓库分析",
  summary:
    "预设消息支持片段组合与版本切换，公共正文只需维护一份；聊天高级编辑可保存到新分支。新增 GitHub 公开仓库分析、生成图转参考图，并改善 Markdown 表格显示与长列表生成性能。",
  publishedAt: "2026-10-27",
  body,
  highlights: [
    "预设消息支持片段组合与版本切换，公共正文只维护一份",
    "消息工具栏支持自定义布局，高级编辑结果可保存到新分支",
    "修复 Markdown 表格显示，改善长列表流式生成卡顿",
    "Git 分析支持 GitHub 公开仓库、工程指标与 AI 洞察",
    "生成的图片可以一键加入参考图",
  ],
  unknownBaselinePolicy: "show-current",
};
