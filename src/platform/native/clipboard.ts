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

import * as tauri from "@tauri-apps/plugin-clipboard-manager";
import { getElectronBridge, request, unsupported } from "../electron/client";
export * from "@tauri-apps/plugin-clipboard-manager";

export const readText: typeof tauri.readText = getElectronBridge()
  ? () => request("clipboard.readText")
  : tauri.readText;
export const writeText: typeof tauri.writeText = getElectronBridge()
  ? (text) => request("clipboard.writeText", { text })
  : tauri.writeText;
export const writeImage: typeof tauri.writeImage = getElectronBridge()
  ? async () => unsupported("图片剪贴板")
  : tauri.writeImage;
export const readImage: typeof tauri.readImage = getElectronBridge()
  ? async () => unsupported("图片剪贴板")
  : tauri.readImage;
export const clear: typeof tauri.clear = getElectronBridge()
  ? () => request("clipboard.clear")
  : tauri.clear;
