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

import body from "./v0.7.0-alpha.3.md?raw";
import type { ReleaseNoteManifest } from "../types";

export const releaseNoteV070Alpha3: ReleaseNoteManifest = {
  version: "0.7.0-alpha.3",
  revision: 1,
  channel: "prerelease",
  title: "媒体快捷提示词与模型刷新预览",
  summary:
    "媒体生成新增快捷提示词库，生成时可以继续编辑草稿。刷新模型前可预览配置变化，并修复工具可见性设置未保存的问题。",
  publishedAt: "2026-08-29",
  body,
  highlights: [
    "常用多模态提示词可以保存并按光标位置插入",
    "媒体生成过程中可以继续修改草稿",
    "刷新模型前可以预览能力与配置变化",
    "嵌入模型和思考模型增加专属配置",
    "工具可见性设置可以正确保存",
  ],
  unknownBaselinePolicy: "show-current",
};
