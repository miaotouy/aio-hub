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
  title: "知识资料管理、子智能体任务与 Git 工作台",
  summary:
    "汇总 0.6.6-r.2 以来的更新：分开管理思绪与知识文档，使用子智能体后台任务和备用模型，并在 Git 工作台查看分支、搜索代码。媒体生成与字幕 OCR 也有新功能，升级时提供旧数据迁移引导。",
  publishedAt: "2026-10-23",
  body,
  contributionIds: ["knowledge-migration"],
  highlights: [
    "思绪与知识文档分开管理，旧数据可跟随引导迁移",
    "聊天支持斜杠命令，虚拟渠道可配置主备模型",
    "子智能体后台执行任务，可以查进度和追加要求",
    "Git 工作台可以看分支、搜代码、创建并推送标签",
    "媒体任务可以排队，本地视频可以离线识别字幕",
  ],
  unknownBaselinePolicy: "show-current",
};
