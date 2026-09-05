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
  title: "知识体系重构与统一升级引导",
  summary:
    "思绪与知识文档双域分离，检索管线产品化；引入统一升级引导与旧数据确认式迁移。",
  publishedAt: "2026-08-10",
  body,
  contributionIds: ["knowledge-migration"],
  highlights: [
    "思绪（Recall）与知识文档（Knowledge）双域分离",
    "语义 / 标签 / 联想多候选检索管线",
    "统一升级引导与旧数据确认式迁移",
    "主页门户布局与快捷入口重构",
    "LLM 模型执行路由探测与持久化",
  ],
  unknownBaselinePolicy: "show-current",
};
