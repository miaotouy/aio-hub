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

import * as tauri from "@tauri-apps/api/event";
import * as electron from "../electron/events";
import { getElectronBridge } from "../electron/client";
export * from "@tauri-apps/api/event";
export const listen: typeof tauri.listen = getElectronBridge()
  ? (electron.listen as typeof tauri.listen)
  : tauri.listen;
export const once: typeof tauri.once = getElectronBridge()
  ? (electron.once as typeof tauri.once)
  : tauri.once;
export const emit: typeof tauri.emit = getElectronBridge()
  ? (electron.emit as typeof tauri.emit)
  : tauri.emit;
export const emitTo: typeof tauri.emitTo = getElectronBridge()
  ? (electron.emitTo as typeof tauri.emitTo)
  : tauri.emitTo;
