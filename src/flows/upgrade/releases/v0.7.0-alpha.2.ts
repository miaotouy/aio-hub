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
  title: "LLM 执行路由与消息状态细化",
  summary:
    "模型执行路由支持手工分配并应用探测结果，消息新增等待中阶段，聚合渠道与默认协议路由落地。",
  publishedAt: "2026-08-15",
  body,
  highlights: [
    "模型执行路由手工分配与探测结果应用",
    "聚合渠道类型与渠道级默认协议路由",
    "聊天消息新增等待中阶段",
    "appVersion 宏补充应用版本信息",
    "DeepSeek V4 思考控制与话题命名对齐",
  ],
  unknownBaselinePolicy: "show-current",
};
