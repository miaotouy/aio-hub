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

import body from "./v0.7.0-r.1.md?raw";
import type { ReleaseNoteManifest } from "../types";

export const releaseNoteV070R1: ReleaseNoteManifest = {
  version: "0.7.0-r.1",
  revision: 1,
  channel: "prerelease",
  title: "0.6.6-r.2 以来的累计更新",
  summary:
    "汇总上次发布以来的知识体系重构、对话与渠道增强、子智能体后台任务、Git 工作台及多媒体工具更新，并提供旧数据迁移说明。",
  publishedAt: "2026-10-23",
  body,
  contributionIds: ["knowledge-migration"],
  highlights: [
    "思绪与知识文档分开管理，新增检索管线与迁移引导",
    "斜杠命令、自定义工具栏与虚拟渠道主备组合",
    "子智能体后台任务、伴生进度与跨窗口同步",
    "Git 分支泳道、仓库搜索与标签创建推送",
    "媒体任务队列、序列帧合成与本地视频字幕 OCR",
  ],
  unknownBaselinePolicy: "show-current",
};
