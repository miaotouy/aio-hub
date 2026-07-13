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

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

console.log("⚙️ [Build] 正在加载环境变量...");

//  加载环境变量
const envPaths = [".env.local", ".env"];
let loaded = false;
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[Build] 成功加载环境配置: ${envPath}`);
    loaded = true;
  }
}

if (!loaded) {
  console.log(
    "[Build] 未找到本地 .env 或 .env.local 文件，将使用系统环境变量。"
  );
}

// 检查是否仅就地修改配置 (用于 CI 无 key 降级)
if (process.argv.includes("--patch-config")) {
  console.log("[Build] 🛠️ 正在就地修改 tauri.conf.json 以支持无签名构建...");
  try {
    const tauriConfPath = path.resolve(
      process.cwd(),
      "src-tauri",
      "tauri.conf.json"
    );
    if (fs.existsSync(tauriConfPath)) {
      const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
      let modified = false;
      if (tauriConf.plugins?.updater?.pubkey) {
        delete tauriConf.plugins.updater.pubkey;
        console.log(
          "[Build] 已从 tauri.conf.json 中移除 plugins.updater.pubkey"
        );
        modified = true;
      }
      if (tauriConf.bundle) {
        tauriConf.bundle.createUpdaterArtifacts = false;
        console.log(
          "[Build] 已将 tauri.conf.json 中的 bundle.createUpdaterArtifacts 设为 false"
        );
        modified = true;
      }
      if (modified) {
        fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2));
        console.log("[Build] tauri.conf.json 修改成功。");
      } else {
        console.log("[Build] tauri.conf.json 无需修改。");
      }
    }
    process.exit(0);
  } catch (err) {
    console.error("[Build] ❌ 就地修改 tauri.conf.json 失败:", err);
    process.exit(1);
  }
}

// 检查关键变量和参数
const hasKey = !!process.env.TAURI_SIGNING_PRIVATE_KEY;
const isLocal = process.argv.includes("--local");
let tempConfPath: string | null = null;

const tauriArgs = ["tauri", "build"];

// 获取 Git 提交短哈希
function getGitCommitHash(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch (err) {
    console.warn("[Build] ⚠️ 获取 Git 提交哈希失败:", err);
    return null;
  }
}

// 动态计算本地构建版本号
let localVersion: string | null = null;
if (isLocal) {
  const gitHash = getGitCommitHash();
  if (gitHash) {
    try {
      const tauriConfPath = path.resolve(
        process.cwd(),
        "src-tauri",
        "tauri.conf.json"
      );
      if (fs.existsSync(tauriConfPath)) {
        const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
        const originalVersion = tauriConf.version;
        if (originalVersion.includes("-")) {
          localVersion = `${originalVersion}.build.${gitHash}`;
        } else {
          localVersion = `${originalVersion}-build.${gitHash}`;
        }
        console.log(
          `[Build] 🏷️ 检测到 --local 参数，将动态版本号设为: ${localVersion}`
        );
      }
    } catch (err) {
      console.error("[Build] ❌ 计算本地版本号失败:", err);
    }
  }
}

if (hasKey) {
  console.log(
    "[Build] 🔑 检测到 TAURI_SIGNING_PRIVATE_KEY，已成功注入构建环境。将进行带签名的完整构建。"
  );
} else {
  console.warn("[Build] ⚠️ 未检测到 TAURI_SIGNING_PRIVATE_KEY。");
}

// 如果需要无签名构建，或者需要注入本地版本号，则生成临时配置文件
if (!hasKey || localVersion) {
  console.log("[Build] 🛠️ 正在动态生成临时构建配置...");

  try {
    const tauriConfPath = path.resolve(
      process.cwd(),
      "src-tauri",
      "tauri.conf.json"
    );
    if (fs.existsSync(tauriConfPath)) {
      const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));

      // 1. 如果无签名，动态移除 pubkey 和禁用 updater 产物生成，避免构建报错
      if (!hasKey) {
        if (tauriConf.plugins?.updater?.pubkey) {
          delete tauriConf.plugins.updater.pubkey;
          console.log("[Build] 已从临时配置中移除 plugins.updater.pubkey");
        }
        if (tauriConf.bundle) {
          tauriConf.bundle.createUpdaterArtifacts = false;
          console.log("[Build] 已将 bundle.createUpdaterArtifacts 设为 false");
        }
      }

      // 2. 如果是本地构建，注入带 Git 哈希的版本号
      if (localVersion) {
        tauriConf.version = localVersion;
        console.log(`[Build] 已将临时配置中的版本号修改为: ${localVersion}`);
      }

      tempConfPath = path.resolve(
        process.cwd(),
        "src-tauri",
        "tauri.conf.build.json"
      );
      fs.writeFileSync(tempConfPath, JSON.stringify(tauriConf, null, 2));
      console.log(`[Build] 已生成临时构建配置: ${tempConfPath}`);

      // 使用临时配置文件
      tauriArgs.push("-c", tempConfPath);
    }
  } catch (err) {
    console.error("[Build] ❌ 生成临时配置失败，将尝试直接构建:", err);
  }
}

// 构造并执行 Tauri Build 命令
// 过滤掉我们自定义 of --local 参数，避免传给 tauri build 报错
const extraArgs = process.argv.slice(2).filter((arg) => arg !== "--local");
if (extraArgs.length > 0) {
  tauriArgs.push(...extraArgs);
}

console.log(
  `[Build] 正在启动 Tauri Build: bun run ${tauriArgs.join(" ")}...\n`
);

const child = spawn("bun", ["run", ...tauriArgs], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

const cleanup = () => {
  if (tempConfPath && fs.existsSync(tempConfPath)) {
    try {
      fs.unlinkSync(tempConfPath);
      console.log(`\n[Build] 🧹 已清理临时配置文件: ${tempConfPath}`);
    } catch (err) {
      console.error(`\n[Build] ❌ 清理临时配置文件失败: ${tempConfPath}`, err);
    }
  }
};

child.on("exit", (code) => {
  cleanup();
  process.exit(code || 0);
});

// 捕获异常退出以确保清理
process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});
