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

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createServer } from "node:net";
import { loadDevSettings, applyDevEnvironment } from "./dev-settings";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.includes("--help") || args.includes("-h")) {
  console.log(`用法: bun run dev [--static] [--watch]

--static 使用生产构建产物，手动刷新前端。
--watch  配合 --static 自动构建源码变更，保持手动刷新。

静态模式: bun run dev:static
监听构建: bun run dev:static:watch
重新构建: bun run dev:static:build`);
  process.exit(0);
}
const staticFrontend = args.includes("--static");
const watch = args.includes("--watch");
if (
  args.some((arg) => arg !== "--static" && arg !== "--watch") ||
  (watch && !staticFrontend)
) {
  console.error("[Dev] 支持 --static，以及配合静态模式使用的 --watch。");
  process.exit(1);
}

const settings = loadDevSettings();
const { idSuffix, dataDir, port, hmrPort, proxyPort, productName } = settings;
applyDevEnvironment(settings, staticFrontend);

if (staticFrontend) {
  // 提前检查，避免 Tauri 将已有的 HMR 服务误当作该实例的静态服务。
  await new Promise<void>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(port, "127.0.0.1", () =>
      probe.close((error) => (error ? reject(error) : resolve()))
    );
  }).catch((error: NodeJS.ErrnoException) => {
    console.error(
      `[Dev] 静态服务端口 ${port} 无法使用 (${error.code})，请关闭占用服务或调整 AIO_PORT。`
    );
    process.exit(1);
  });
}
console.log(`\n[Dev] 🚀 启动配置:`);
console.log(
  `      前端模式: ${staticFrontend ? "生产构建 + 手动刷新" : "Vite HMR"}`
);
console.log(`      实例后缀: ${idSuffix || "(无)"}`);
console.log(`      前端端口: ${port}`);
if (!staticFrontend) console.log(`      HMR 端口: ${hmrPort}`);
console.log(`      LLMAPI 代理端口: ${proxyPort}`);
if (dataDir) console.log(`      数据目录: ${dataDir}`);
console.log("");
// 5. 构造 Tauri 命令
const tauriArgs = ["tauri", "dev"];

// 动态生成临时配置文件，避免 Shell 转义问题并确保 CLI 正确识别配置
const devConfPath = path.resolve(
  process.cwd(),
  "src-tauri",
  staticFrontend ? `tauri.conf.dev.static.${port}.json` : "tauri.conf.dev.json"
);
const devConf = {
  build: {
    devUrl: process.env.TAURI_DEV_URL,
    ...(staticFrontend
      ? {
          beforeDevCommand: `bun scripts/dev-static.ts serve${watch ? " --watch" : ""}`,
        }
      : {}),
  },
  productName: idSuffix ? `${productName} [${idSuffix}]` : productName,
  identifier: idSuffix ? `com.mty.aiohub.${idSuffix}` : undefined,
};

fs.writeFileSync(devConfPath, JSON.stringify(devConf, null, 2));
console.log(`[Dev] 已生成临时配置: ${devConfPath}`);

// 使用 -c 参数指向临时配置 (Tauri CLI 期望路径相对于 src-tauri 或为绝对路径)
tauriArgs.push("-c", devConfPath);

// 7. 执行
console.log(`[Dev] 正在启动 Tauri...`);
const child = spawn(process.execPath, ["run", ...tauriArgs], {
  stdio: "inherit",
  env: process.env,
});

child.on("error", (error) => {
  console.error("[Dev] Tauri 启动失败:", error.message);
  process.exitCode = 1;
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping || !child.pid) return;
    stopping = true;
    if (process.platform === "win32") {
      const cleanup = spawn(
        "taskkill",
        ["/PID", String(child.pid), "/T", "/F"],
        {
          stdio: "ignore",
          windowsHide: true,
        }
      );
      cleanup.once("exit", () => process.exit(0));
      cleanup.once("error", () => process.exit(1));
    } else {
      child.kill("SIGTERM");
    }
  });
}
child.on("exit", (code) => {
  if (!stopping) process.exit(code ?? 1);
});
