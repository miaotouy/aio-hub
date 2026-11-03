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

import * as tauri from "@tauri-apps/api/webview";
import { getElectronBridge, unsupported } from "../electron/client";
export * from "@tauri-apps/api/webview";

export const getCurrentWebview: typeof tauri.getCurrentWebview =
  getElectronBridge()
    ? ((() => ({
        label: getElectronBridge()!.metadata.label,
        onDragDropEvent: async () => unsupported("WebView 拖放监听"),
      })) as unknown as typeof tauri.getCurrentWebview)
    : tauri.getCurrentWebview;
export const getAllWebviews: typeof tauri.getAllWebviews = getElectronBridge()
  ? async () => unsupported("独立 WebView")
  : tauri.getAllWebviews;
export const Webview: typeof tauri.Webview = getElectronBridge()
  ? (class {
      constructor() {
        unsupported("独立 WebView");
      }
    } as unknown as typeof tauri.Webview)
  : tauri.Webview;
