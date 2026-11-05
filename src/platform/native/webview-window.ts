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

import * as tauri from "@tauri-apps/api/webviewWindow";
import * as electron from "../electron/window";
import { getElectronBridge } from "../electron/client";
export * from "@tauri-apps/api/webviewWindow";
export const getCurrentWebviewWindow: typeof tauri.getCurrentWebviewWindow =
  getElectronBridge()
    ? (electron.getCurrentWindow as unknown as typeof tauri.getCurrentWebviewWindow)
    : tauri.getCurrentWebviewWindow;
export const getAllWebviewWindows: typeof tauri.getAllWebviewWindows =
  getElectronBridge()
    ? (electron.getAllWindows as unknown as typeof tauri.getAllWebviewWindows)
    : tauri.getAllWebviewWindows;
export const WebviewWindow: typeof tauri.WebviewWindow = getElectronBridge()
  ? (electron.ElectronWindow as unknown as typeof tauri.WebviewWindow)
  : tauri.WebviewWindow;

export type WebviewWindow = tauri.WebviewWindow;
