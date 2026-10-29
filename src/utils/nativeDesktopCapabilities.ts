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

import { platform } from "@tauri-apps/plugin-os";

/** 与后端按平台注册的原生命令保持一致；浏览器预览按能力缺省处理。 */
export function getNativeDesktopCapabilities() {
  let windows = false;
  try {
    windows = platform() === "windows";
  } catch {
    /* 浏览器缺少原生平台信息。 */
  }
  return { windowAutomation: windows, screenCapture: windows };
}
