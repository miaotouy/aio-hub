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
  title: "模型元数据物化与媒体生成器增强",
  summary:
    "模型元数据 v3 分层存储并物化，媒体生成器补充快捷提示词库与下载超时，聚合渠道图标与思考模型 token 预留落地。",
  publishedAt: "2026-08-29",
  body,
  highlights: [
    "模型元数据 v3 规则核心与物化存储",
    "媒体生成器多模态快捷提示词库",
    "聚合渠道显式图标与思考模型 token 预留",
    "监控消息类型独选与虚拟列表修复",
    "发布说明缺失检查降级为非阻断警告",
  ],
  unknownBaselinePolicy: "show-current",
};
