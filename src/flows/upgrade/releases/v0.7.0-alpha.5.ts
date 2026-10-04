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

import body from "./v0.7.0-alpha.5.md?raw";
import type { ReleaseNoteManifest } from "../types";

export const releaseNoteV070Alpha5: ReleaseNoteManifest = {
  version: "0.7.0-alpha.5",
  revision: 1,
  channel: "prerelease",
  title: "子智能体后台调度与 LLM 凭据隔离",
  summary:
    "引入子智能体后台任务调度与多源身份可观测性，LLM 凭据分离至独立混淆存储，Git Committer 增加媒体预览与横向滚轮导航，Token 计算器支持多格式导入与 DeepSeek 视觉折算。",
  publishedAt: "2026-09-25",
  body,
  highlights: [
    "子智能体后台任务调度系统、任务中心与伴生视图",
    "LLM 凭据独立混淆存储与哈希索引",
    "虚拟新会话草稿与首次启动默认智能体流程优化",
    "Git Committer 媒体差异预览与 unified diff 生成优化",
    "Token 计算器支持 ZIP/TAR 导入与 DeepSeek V4.1 视觉计算",
  ],
  unknownBaselinePolicy: "show-current",
};
