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

import * as tauri from "@tauri-apps/plugin-dialog";
import { getElectronBridge, request } from "../electron/client";
export * from "@tauri-apps/plugin-dialog";

export const open: typeof tauri.open = getElectronBridge()
  ? (options) => request("dialog.open", { options })
  : tauri.open;
export const save: typeof tauri.save = getElectronBridge()
  ? (options) => request("dialog.save", { options })
  : tauri.save;
