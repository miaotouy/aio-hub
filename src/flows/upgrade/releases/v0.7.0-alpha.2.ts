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

import body from "./v0.7.0-alpha.2.md?raw";
import type { ReleaseNoteManifest } from "../types";

export const releaseNoteV070Alpha2: ReleaseNoteManifest = {
  version: "0.7.0-alpha.2",
  revision: 1,
  channel: "prerelease",
  title: "模型协议配置与聊天等待状态",
  summary:
    "模型执行协议可以手动指定或应用探测结果，聚合渠道支持默认协议设置。聊天新增「等待中」状态，并修复自定义 CSS 启动时未生效的问题。",
  publishedAt: "2026-08-15",
  body,
  highlights: [
    "模型执行协议可以手动指定",
    "聚合渠道可以设置默认协议",
    "消息排队与等待状态更容易分辨",
    "提示词可用 appVersion 宏引用应用版本",
  ],
  unknownBaselinePolicy: "show-current",
};
