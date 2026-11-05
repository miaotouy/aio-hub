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

import * as tauri from "@tauri-apps/api/path";
import { getElectronBridge, request } from "../electron/client";
export * from "@tauri-apps/api/path";

export const appConfigDir: typeof tauri.appConfigDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.appConfigDir>>>("path", {
        method: "appConfigDir",
        args,
      })
  : tauri.appConfigDir;
export const appDataDir: typeof tauri.appDataDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.appDataDir>>>("path", {
        method: "appDataDir",
        args,
      })
  : tauri.appDataDir;
export const basename: typeof tauri.basename = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.basename>>>("path", {
        method: "basename",
        args,
      })
  : tauri.basename;
export const dirname: typeof tauri.dirname = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.dirname>>>("path", {
        method: "dirname",
        args,
      })
  : tauri.dirname;
export const downloadDir: typeof tauri.downloadDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.downloadDir>>>("path", {
        method: "downloadDir",
        args,
      })
  : tauri.downloadDir;
export const extname: typeof tauri.extname = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.extname>>>("path", {
        method: "extname",
        args,
      })
  : tauri.extname;
export const homeDir: typeof tauri.homeDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.homeDir>>>("path", {
        method: "homeDir",
        args,
      })
  : tauri.homeDir;
export const join: typeof tauri.join = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.join>>>("path", {
        method: "join",
        args,
      })
  : tauri.join;
export const localDataDir: typeof tauri.localDataDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.localDataDir>>>("path", {
        method: "localDataDir",
        args,
      })
  : tauri.localDataDir;
export const resolveResource: typeof tauri.resolveResource = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.resolveResource>>>("path", {
        method: "resolveResource",
        args,
      })
  : tauri.resolveResource;
export const resolve: typeof tauri.resolve = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.resolve>>>("path", {
        method: "resolve",
        args,
      })
  : tauri.resolve;
export const normalize: typeof tauri.normalize = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.normalize>>>("path", {
        method: "normalize",
        args,
      })
  : tauri.normalize;
export const isAbsolute: typeof tauri.isAbsolute = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.isAbsolute>>>("path", {
        method: "isAbsolute",
        args,
      })
  : tauri.isAbsolute;
export const tempDir: typeof tauri.tempDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.tempDir>>>("path", {
        method: "tempDir",
        args,
      })
  : tauri.tempDir;
export const documentDir: typeof tauri.documentDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.documentDir>>>("path", {
        method: "documentDir",
        args,
      })
  : tauri.documentDir;
export const desktopDir: typeof tauri.desktopDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.desktopDir>>>("path", {
        method: "desktopDir",
        args,
      })
  : tauri.desktopDir;
export const audioDir: typeof tauri.audioDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.audioDir>>>("path", {
        method: "audioDir",
        args,
      })
  : tauri.audioDir;
export const videoDir: typeof tauri.videoDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.videoDir>>>("path", {
        method: "videoDir",
        args,
      })
  : tauri.videoDir;
export const pictureDir: typeof tauri.pictureDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.pictureDir>>>("path", {
        method: "pictureDir",
        args,
      })
  : tauri.pictureDir;
export const resourceDir: typeof tauri.resourceDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.resourceDir>>>("path", {
        method: "resourceDir",
        args,
      })
  : tauri.resourceDir;
export const cacheDir: typeof tauri.cacheDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.cacheDir>>>("path", {
        method: "cacheDir",
        args,
      })
  : tauri.cacheDir;
export const configDir: typeof tauri.configDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.configDir>>>("path", {
        method: "configDir",
        args,
      })
  : tauri.configDir;
export const dataDir: typeof tauri.dataDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.dataDir>>>("path", {
        method: "dataDir",
        args,
      })
  : tauri.dataDir;
export const appCacheDir: typeof tauri.appCacheDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.appCacheDir>>>("path", {
        method: "appCacheDir",
        args,
      })
  : tauri.appCacheDir;
export const appLocalDataDir: typeof tauri.appLocalDataDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.appLocalDataDir>>>("path", {
        method: "appLocalDataDir",
        args,
      })
  : tauri.appLocalDataDir;
export const appLogDir: typeof tauri.appLogDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.appLogDir>>>("path", {
        method: "appLogDir",
        args,
      })
  : tauri.appLogDir;
export const executableDir: typeof tauri.executableDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.executableDir>>>("path", {
        method: "executableDir",
        args,
      })
  : tauri.executableDir;
export const fontDir: typeof tauri.fontDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.fontDir>>>("path", {
        method: "fontDir",
        args,
      })
  : tauri.fontDir;
export const runtimeDir: typeof tauri.runtimeDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.runtimeDir>>>("path", {
        method: "runtimeDir",
        args,
      })
  : tauri.runtimeDir;
export const publicDir: typeof tauri.publicDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.publicDir>>>("path", {
        method: "publicDir",
        args,
      })
  : tauri.publicDir;
export const templateDir: typeof tauri.templateDir = getElectronBridge()
  ? (...args) =>
      request<Awaited<ReturnType<typeof tauri.templateDir>>>("path", {
        method: "templateDir",
        args,
      })
  : tauri.templateDir;

export const sep: typeof tauri.sep = getElectronBridge()
  ? () => (getElectronBridge()!.metadata.os.platform === "windows" ? "\\" : "/")
  : tauri.sep;
export const delimiter: typeof tauri.delimiter = getElectronBridge()
  ? () => (getElectronBridge()!.metadata.os.platform === "windows" ? ";" : ":")
  : tauri.delimiter;
