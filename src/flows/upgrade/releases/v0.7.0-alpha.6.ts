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

import body from "./v0.7.0-alpha.6.md?raw";
import type { ReleaseNoteManifest } from "../types";

export const releaseNoteV070Alpha6: ReleaseNoteManifest = {
  version: "0.7.0-alpha.6",
  revision: 1,
  channel: "prerelease",
  title: "Git 分支泳道、斜杠命令与安装目录设置",
  summary:
    "Git Committer 新增分支泳道图和文件、代码搜索。聊天支持斜杠命令与批量添加模型，Windows 安装时可以自选数据目录。",
  publishedAt: "2026-10-04",
  body,
  highlights: [
    "通过分支泳道图查看分支与合并关系",
    "在工作区搜索文件名和代码内容",
    "聊天输入 / 即可使用快捷命令",
    "按需使用内置子智能体，集中查看 Skill 说明",
    "Windows 安装时可以选择数据存放位置",
  ],
  unknownBaselinePolicy: "show-current",
};
