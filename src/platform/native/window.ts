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

import * as tauri from "@tauri-apps/api/window";
import * as electron from "../electron/window";
import { getElectronBridge } from "../electron/client";
export * from "@tauri-apps/api/window";
export const getCurrentWindow: typeof tauri.getCurrentWindow =
  getElectronBridge()
    ? (electron.getCurrentWindow as unknown as typeof tauri.getCurrentWindow)
    : tauri.getCurrentWindow;
export const getAllWindows: typeof tauri.getAllWindows = getElectronBridge()
  ? (electron.getAllWindows as unknown as typeof tauri.getAllWindows)
  : tauri.getAllWindows;
export const Window: typeof tauri.Window = getElectronBridge()
  ? (electron.ElectronWindow as unknown as typeof tauri.Window)
  : tauri.Window;
export const currentMonitor: typeof tauri.currentMonitor = getElectronBridge()
  ? (electron.currentMonitor as typeof tauri.currentMonitor)
  : tauri.currentMonitor;
