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
  title: "LLM 凭据隔离与会话草稿",
  summary:
    "LLM 凭据分离到独立混淆存储，新增虚拟新会话草稿与首次启动默认智能体流程，并接入 TypeSafe AI System One 决策渠道。",
  publishedAt: "2026-09-22",
  body,
  highlights: [
    "LLM 凭据独立混淆存储与哈希索引",
    "虚拟新会话草稿，首条消息发送前不落库",
    "首次启动默认智能体创建与模型选择改进",
    "接入 TypeSafe AI System One 决策渠道",
    "Git Committer 媒体文件差异预览",
  ],
  unknownBaselinePolicy: "show-current",
};
