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

import { ElectronChannel } from "../electron/channel";
import * as tauri from "@tauri-apps/api/core";
import { request, getElectronBridge, unsupported } from "../electron/client";
export * from "@tauri-apps/api/core";
export const invoke: typeof tauri.invoke = getElectronBridge()
  ? (((command: string, args?: unknown, options?: unknown) =>
      request("command", {
        command,
        args,
        options,
        // Result events and invoke replies use separate queues; retain listeners through the event fence.
        ...(command === "dir_search"
          ? { __eventDrain: new ElectronChannel() }
          : {}),
      })) as typeof tauri.invoke)
  : tauri.invoke;
export const convertFileSrc: typeof tauri.convertFileSrc = getElectronBridge()
  ? (path, protocol = "asset") => {
      if (protocol !== "asset") return unsupported("资源协议 " + protocol);
      return getElectronBridge()!.assetUrl(path);
    }
  : tauri.convertFileSrc;
export const isTauri: typeof tauri.isTauri = getElectronBridge()
  ? () => false
  : tauri.isTauri;
export const Channel: typeof tauri.Channel = getElectronBridge()
  ? (ElectronChannel as unknown as typeof tauri.Channel)
  : tauri.Channel;
