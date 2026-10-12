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
import { parseArgs } from "node:util";
import { INSTANCE_ID_PATTERN } from "./dev-control/protocol";
import { loadDevSettings, applyDevEnvironment } from "./dev-settings";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.includes("--help") || args.includes("-h")) {
  console.log(`用法: bun run dev [--static] [--watch] [--agent] [--agent-instance <名称>]

--static 使用生产构建产物，手动刷新前端。
--watch  配合 --static 自动构建源码变更，保持手动刷新。
--agent  开启本机页面控制，使用独立数据目录。
--agent-instance 指定控制实例名称，配合 --agent。

静态模式: bun run dev:static
监听构建: bun run dev:static:watch
重新构建: bun run dev:static:build`);
  process.exit(0);
}
const { values } = parseArgs({
  args,
  strict: true,
  options: {
    static: { type: "boolean" },
    watch: { type: "boolean" },
    agent: { type: "boolean" },
    "agent-instance": { type: "string" },
  },
});
const staticFrontend = values.static ?? false;
const watch = values.watch ?? false;
const agent = values.agent ?? false;
if ((watch && !staticFrontend) || (values["agent-instance"] && !agent)) {
  console.error("[Dev] --watch 配合 --static；--agent-instance 配合 --agent。");
  process.exit(1);
}
if (values["agent-instance"])
  process.env.AIO_ID_SUFFIX = values["agent-instance"];
process.env.AIO_DEV_CONTROL = agent ? "1" : "0";
const settings = loadDevSettings({ agent });
if (agent && !INSTANCE_ID_PATTERN.test(settings.idSuffix)) {
  console.error("[Dev] 控制实例名称需要 1–64 位字母、数字、下划线或连字符。");
  process.exit(1);
}
const control = agent
  ? await (
      await import("./dev-control/launch")
    ).prepareDevControl(settings, staticFrontend)
  : undefined;
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
  staticFrontend
    ? `tauri.conf.dev.static.${port}.json`
    : agent
      ? `tauri.conf.dev.agent.${port}.json`
      : "tauri.conf.dev.json"
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

void control
  ?.waitUntilReady(() => {
    console.log(
      `[Dev] 页面控制已就绪: ${idSuffix}，使用 bun scripts/dev-control/cli.ts observe --instance ${idSuffix}`
    );
  })
  .catch((error: unknown) => {
    control?.fail(error);
    console.error(
      "[Dev] 页面控制启动失败:",
      error instanceof Error ? error.message : error
    );
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "UNSAFE_LISTENER" &&
      child.pid
    ) {
      spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    }
  });

child.on("error", (error) => {
  control?.dispose();
  console.error("[Dev] Tauri 启动失败:", error.message);
  process.exitCode = 1;
});
let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    if (stopping || !child.pid) return;
    stopping = true;
    control?.dispose();
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
  control?.dispose();
  if (!stopping) process.exit(code ?? 1);
});
