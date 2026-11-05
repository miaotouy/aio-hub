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

import * as tauri from "@tauri-apps/plugin-os";
import { getElectronBridge } from "../electron/client";
export * from "@tauri-apps/plugin-os";

export const platform: typeof tauri.platform = getElectronBridge()
  ? () =>
      getElectronBridge()!.metadata.os.platform as ReturnType<
        typeof tauri.platform
      >
  : tauri.platform;
export const type: typeof tauri.type = getElectronBridge()
  ? () => getElectronBridge()!.metadata.os.type as ReturnType<typeof tauri.type>
  : tauri.type;
export const arch: typeof tauri.arch = getElectronBridge()
  ? () => getElectronBridge()!.metadata.os.arch as ReturnType<typeof tauri.arch>
  : tauri.arch;
export const version: typeof tauri.version = getElectronBridge()
  ? () => getElectronBridge()!.metadata.os.version
  : tauri.version;
export const hostname: typeof tauri.hostname = getElectronBridge()
  ? async () => getElectronBridge()!.metadata.os.hostname
  : tauri.hostname;
export const locale: typeof tauri.locale = getElectronBridge()
  ? async () => getElectronBridge()!.metadata.os.locale
  : tauri.locale;
export const eol: typeof tauri.eol = getElectronBridge()
  ? () =>
      getElectronBridge()!.metadata.os.platform === "windows" ? "\r\n" : "\n"
  : tauri.eol;
export const family: typeof tauri.family = getElectronBridge()
  ? () =>
      getElectronBridge()!.metadata.os.platform === "windows"
        ? "windows"
        : "unix"
  : tauri.family;
