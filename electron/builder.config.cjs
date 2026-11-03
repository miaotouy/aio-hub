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

const path = require("node:path");
const packageInfo = require("../package.json");
const local = process.env.AIO_ELECTRON_LOCAL_BUILD === "1";

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "com.mty.aiohub.electron",
  productName: "AIO Hub Electron",
  executableName: "AIO Hub Electron",
  directories: {
    app: "dist-electron",
    output: "release-electron",
    buildResources: "src-tauri/icons",
  },
  electronVersion: packageInfo.devDependencies.electron,
  // Builds target the current host architecture and reuse the locked runtime.
  electronDist: path.join(
    path.dirname(require.resolve("electron/package.json")),
    "dist"
  ),
  asar: true,
  // Bun bundles all host dependencies. Prevent workspace node_modules collection.
  beforeBuild: async () => false,
  files: [
    "main.cjs",
    "preload.cjs",
    "icon.png",
    "package.json",
    "renderer/**/*",
    "!node_modules/**/*",
  ],
  extraResources: [
    { from: "public/canvases", to: "canvases" },
    { from: "public/skills", to: "skills" },
  ],
  artifactName: "AIO-Hub-Electron-${version}-${os}-${arch}.${ext}",
  publish: null,
  win: {
    target: ["nsis", "portable"],
    icon: "src-tauri/icons/icon.ico",
    signExecutable: !local,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    installerLanguages: ["en_US", "zh_CN"],
    displayLanguageSelector: true,
    installerIcon: "src-tauri/icons/installer.ico",
    uninstallerIcon: "src-tauri/icons/installer.ico",
    license: "LICENSE",
    shortcutName: "AIO Hub Electron",
    artifactName: "AIO-Hub-Electron-${version}-${arch}-Setup.${ext}",
    deleteAppDataOnUninstall: false,
  },
  portable: {
    artifactName: "AIO-Hub-Electron-${version}-${arch}-Portable.${ext}",
  },
  mac: {
    target: ["dmg"],
    icon: "src-tauri/icons/icon.icns",
    category: "public.app-category.developer-tools",
    ...(local ? { identity: null } : {}),
  },
  linux: {
    target: ["AppImage", "deb"],
    icon: "src-tauri/icons/128x128.png",
    category: "Utility",
    maintainer: "miaotouy <miaotouy@users.noreply.github.com>",
  },
};
