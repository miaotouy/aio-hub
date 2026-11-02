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

import body from "./v0.7.0-alpha.1.md?raw";
import type { ReleaseNoteManifest } from "../types";

export const releaseNoteV070Alpha1: ReleaseNoteManifest = {
  version: "0.7.0-alpha.1",
  revision: 3,
  channel: "prerelease",
  title: "知识资料管理与旧数据迁移",
  summary:
    "思绪记忆和知识文档分开管理，升级时可预览并确认旧数据迁移。主页增加最近使用工具和可排序的快捷入口。",
  publishedAt: "2026-08-10",
  body,
  contributionIds: ["knowledge-migration"],
  highlights: [
    "思绪记忆与来源文档可以分开整理",
    "结合语义、标签和条目关联检索资料",
    "迁移旧数据前可以预览并确认",
    "主页快捷入口可以固定和拖动排序",
  ],
  unknownBaselinePolicy: "show-current",
};
