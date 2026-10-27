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
  title: "预设消息组合、聊天分支与富文本优化",
  summary:
    "新增跨端预设消息组合、消息工具栏布局与分支保存，完善会话文件重载、GitHub 仓库分析和媒体参考图工作流，并修复 Markdown 解析与长列表流式渲染问题。",
  publishedAt: "2026-10-27",
  body,
  highlights: [
    "预设消息按片段编排，支持多版本切换与完整正文预览",
    "自定义消息工具栏、高级编辑保存到分支与会话文件重载",
    "Markdown 解析修复、长列表流式渲染与内存开销优化",
    "GitHub 公开仓库读取、工程指标与 AI 洞察",
    "生成图片一键加入参考图与提示词优化图片开关",
  ],
  unknownBaselinePolicy: "show-current",
};
