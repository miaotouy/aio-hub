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
  revision: 1,
  channel: "prerelease",
  title: "统一升级引导基础设施",
  summary: "引入 Guided Flow、版本生命周期记录和本地版本说明入口。",
  publishedAt: "2026-07-25",
  body,
  highlights: [
    "统一的分步引导容器",
    "可恢复的版本说明流程",
    "关于页本地版本说明入口",
  ],
  unknownBaselinePolicy: "show-current",
};
