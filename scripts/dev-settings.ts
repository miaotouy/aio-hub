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

import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/** 桌面开发入口共用的实例配置，构建命令和运行命令使用相同的端口与代理设置。 */
export function loadDevSettings(options: { agent?: boolean } = {}) {
  for (const envPath of [".env.local", ".env"]) {
    if (fs.existsSync(envPath)) dotenv.config({ path: envPath, quiet: true });
  }

  const idSuffix = process.env.AIO_ID_SUFFIX || (options.agent ? "agent" : "");
  let hash = 0;
  for (let i = 0; i < idSuffix.length; i++)
    hash = ((hash << 5) - hash + idSuffix.charCodeAt(i)) | 0;
  const offset = Math.abs(hash % 100);
  const port = Number.parseInt(process.env.AIO_PORT || "1420") + offset;
  const proxyPort =
    Number.parseInt(process.env.AIO_PROXY_PORT || "21655") + offset;
  if (
    ![port, port + 1, proxyPort].every(
      (value) => Number.isInteger(value) && value > 0 && value <= 65535
    )
  ) {
    throw new Error(
      "开发端口需要处于 1–65535 范围内，请检查 AIO_PORT 和 AIO_PROXY_PORT。"
    );
  }

  const configuredDataDir = process.env.AIO_DATA_DIR?.trim() || "";
  return {
    idSuffix,
    port,
    hmrPort: port + 1,
    proxyPort,
    productName: process.env.AIO_PRODUCT_NAME || "AIO Hub (Dev)",
    dataDir: configuredDataDir
      ? path.resolve(configuredDataDir)
      : idSuffix
        ? path.resolve(".dev-data", idSuffix)
        : undefined,
    staticRoot: path.resolve(".dev-data", "static-frontend", String(port)),
  };
}

export function applyDevEnvironment(
  settings: ReturnType<typeof loadDevSettings>,
  staticFrontend = false
) {
  process.env.VITE_PORT = String(settings.port);
  process.env.VITE_HMR_PORT = String(settings.hmrPort);
  process.env.VITE_AIO_PROXY_PORT = String(settings.proxyPort);
  process.env.TAURI_DEV_URL = `http://${staticFrontend ? "127.0.0.1" : "localhost"}:${settings.port}`;
  process.env.AIO_ID_SUFFIX = settings.idSuffix;
  if (settings.dataDir) {
    fs.mkdirSync(settings.dataDir, { recursive: true });
    process.env.AIO_DATA_DIR = settings.dataDir;
  }
}
