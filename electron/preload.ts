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

import { contextBridge, ipcRenderer, webUtils } from "electron";
import {
  IPC_REQUEST,
  IPC_EVENT,
  IPC_ASSET,
  IPC_CHANNEL,
  IPC_FILE_WATCH,
} from "./shared";
import { installDiagnostics } from "../src/dev/control/diagnostics";
import type {
  ElectronBridge,
  HostMetadata,
  HostReply,
  HostEvent,
} from "./shared";

const bootstrap = process.argv.find((arg) =>
  arg.startsWith("--aio-bootstrap=")
);
if (process.isMainFrame && bootstrap) {
  const { metadata, assetToken } = JSON.parse(
    decodeURIComponent(bootstrap.slice("--aio-bootstrap=".length))
  ) as { metadata: HostMetadata; assetToken: string };
  const bridge: ElectronBridge = {
    platform: "electron",
    metadata,
    async request(
      operation: string,
      args?: Record<string, unknown>
    ): Promise<HostReply> {
      return ipcRenderer.invoke(IPC_REQUEST, operation, args);
    },
    subscribe(event: string, callback: (event: HostEvent) => void) {
      const listener = (
        _event: Electron.IpcRendererEvent,
        message: HostEvent
      ) => {
        if (message.event === event) callback(message);
      };
      ipcRenderer.on(IPC_EVENT, listener);
      return () => ipcRenderer.removeListener(IPC_EVENT, listener);
    },
    subscribeChannel(
      token: string,
      callback: (payload: unknown) => void,
      onClose?: (requestId: string) => void
    ) {
      const listener = (
        _event: Electron.IpcRendererEvent,
        message: { token: string; payload: unknown; closed?: string }
      ) => {
        if (message.token !== token) return;
        if (message.closed) onClose?.(message.closed);
        else callback(message.payload);
      };
      ipcRenderer.on(IPC_CHANNEL, listener);
      return () => ipcRenderer.removeListener(IPC_CHANNEL, listener);
    },
    subscribeFileWatch(
      id: string,
      callback: (message: import("./file-watches").FileWatchMessage) => void
    ) {
      const listener = (
        _event: Electron.IpcRendererEvent,
        message: import("./file-watches").FileWatchMessage
      ) => {
        if (message.id === id) callback(message);
      };
      ipcRenderer.on(IPC_FILE_WATCH, listener);
      return () => ipcRenderer.removeListener(IPC_FILE_WATCH, listener);
    },
    assetUrl(filePath: string) {
      ipcRenderer.send(IPC_ASSET, filePath);
      return (
        "asset://local/" + encodeURIComponent(filePath) + "?token=" + assetToken
      );
    },
  };
  contextBridge.exposeInMainWorld("aiohub", bridge);
  if (metadata.devControl)
    contextBridge.executeInMainWorld({ func: installDiagnostics });
  // A file path is read only from real Chromium File objects, never from renderer-provided strings.
  document.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
  });
  document.addEventListener("drop", (event) => {
    const paths = Array.from(event.dataTransfer?.files ?? [])
      .map((file) => webUtils.getPathForFile(file))
      .filter(Boolean);
    if (paths.length) {
      event.preventDefault();
      void bridge.request("events.emit", {
        event: "tauri-file-drop",
        payload: paths,
        target: metadata.label,
      });
    }
  });
}
