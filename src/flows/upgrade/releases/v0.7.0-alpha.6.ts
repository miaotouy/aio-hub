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
  title: "Git Committer 泳道图与内置子智能体释出",
  summary:
    "Git Committer 新增分支泳道图、全文搜索与右键菜单，实现内置子智能体按需释出与调度管控，输入框支持斜杠命令与批量模型导入，窗口自动化引入中心坐标系。",
  publishedAt: "2026-10-04",
  body,
  highlights: [
    "Git Committer 分支泳道图、文件搜索与完整右键菜单",
    "内置开箱即用子智能体按需释出与调度管控",
    "LLM 对话输入框斜杠命令支持与模型批量导入",
    "窗口自动化中心坐标系重构与双模按键点击",
    "Windows 安装器自定义数据目录与重新安装提示",
  ],
  unknownBaselinePolicy: "show-current",
};
