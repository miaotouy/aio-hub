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

import type {
  WatchEvent,
  DebouncedWatchOptions,
  UnwatchFn,
} from "../native/fs";
import { createModuleLogger } from "@/utils/logger";
import { getElectronBridge, request } from "./client";
const logger = createModuleLogger("platform/electron/file-watches");
export async function watchFiles(
  paths: string | string[] | URL | URL[],
  callback: (event: WatchEvent) => void,
  options?: DebouncedWatchOptions
): Promise<UnwatchFn> {
  const host = getElectronBridge();
  if (!host) throw new Error("Electron 文件监听桥未就绪");
  const id = crypto.randomUUID();
  let active = true;
  const stop = host.subscribeFileWatch(id, (message) => {
    if (!active) return;
    if (message.error)
      logger.warn(message.error.message, { code: message.error.code });
    callback(message.event as WatchEvent);
  });
  try {
    await request("fs.watch.start", { id, paths, options });
  } catch (error) {
    active = false;
    stop();
    throw error;
  }
  return () => {
    if (!active) return;
    active = false;
    stop();
    void request("fs.watch.stop", { id }).catch((error) =>
      logger.debug("文件监听清理失败", { error })
    );
  };
}
