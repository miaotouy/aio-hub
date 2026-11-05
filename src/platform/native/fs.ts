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

import * as tauri from "@tauri-apps/plugin-fs";
import { watchFiles } from "../electron/file-watches";
import { getElectronBridge, request } from "../electron/client";
export * from "@tauri-apps/plugin-fs";

export const copyFile: typeof tauri.copyFile = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.copyFile>>>("fs", {
        method: "copyFile",
        args,
      })
  : tauri.copyFile;
export const exists: typeof tauri.exists = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.exists>>>("fs", {
        method: "exists",
        args,
      })
  : tauri.exists;
export const lstat: typeof tauri.lstat = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.lstat>>>("fs", {
        method: "lstat",
        args,
      })
  : tauri.lstat;
export const mkdir: typeof tauri.mkdir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.mkdir>>>("fs", {
        method: "mkdir",
        args,
      })
  : tauri.mkdir;
export const readDir: typeof tauri.readDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.readDir>>>("fs", {
        method: "readDir",
        args,
      })
  : tauri.readDir;
export const readFile: typeof tauri.readFile = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.readFile>>>("fs", {
        method: "readFile",
        args,
      })
  : tauri.readFile;
export const readTextFile: typeof tauri.readTextFile = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.readTextFile>>>("fs", {
        method: "readTextFile",
        args,
      })
  : tauri.readTextFile;
export const remove: typeof tauri.remove = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.remove>>>("fs", {
        method: "remove",
        args,
      })
  : tauri.remove;
export const rename: typeof tauri.rename = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.rename>>>("fs", {
        method: "rename",
        args,
      })
  : tauri.rename;
export const stat: typeof tauri.stat = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.stat>>>("fs", {
        method: "stat",
        args,
      })
  : tauri.stat;
export const writeFile: typeof tauri.writeFile = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.writeFile>>>("fs", {
        method: "writeFile",
        args,
      })
  : tauri.writeFile;
export const writeTextFile: typeof tauri.writeTextFile = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.writeTextFile>>>("fs", {
        method: "writeTextFile",
        args,
      })
  : tauri.writeTextFile;
export const watch: typeof tauri.watch = getElectronBridge()
  ? (paths, callback, options) =>
      watchFiles(paths, callback, { delayMs: 2000, ...options })
  : tauri.watch;
export const watchImmediate: typeof tauri.watchImmediate = getElectronBridge()
  ? (paths, callback, options) =>
      watchFiles(paths, callback, { ...options, delayMs: 0 })
  : tauri.watchImmediate;
