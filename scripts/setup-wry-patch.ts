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

import { mkdir, stat, cp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const WRY_PATCH_DIR = join(process.cwd(), "src-tauri", "patches", "wry");
const WRY_OVERRIDES_DIR = join(
  process.cwd(),
  "src-tauri",
  "patches",
  "wry-overrides"
);
const LIB_RS_PATH = join(WRY_PATCH_DIR, "src", "lib.rs");
const CARGO_TOML_PATH = join(WRY_PATCH_DIR, "Cargo.toml");

const WRY_VERSION = "0.55.1";
const DOWNLOAD_URL = `https://static.crates.io/crates/wry/wry-${WRY_VERSION}.crate`;

async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function getInstalledWryVersion() {
  if (!(await fileExists(CARGO_TOML_PATH))) {
    return null;
  }

  const cargoToml = await readFile(CARGO_TOML_PATH, "utf8");
  return cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? null;
}

async function main() {
  console.log("🦉 [Gugu] 正在检查 wry 补丁目录完整性...");

  // 1. 源码缺失或版本不符时，重新补全官方源码
  const installedVersion = await getInstalledWryVersion();
  const needsDownload =
    !(await fileExists(LIB_RS_PATH)) || installedVersion !== WRY_VERSION;

  if (!needsDownload) {
    console.log("⏭️  wry 官方源码已完整，跳过下载。");
  } else {
    if (installedVersion) {
      console.log(
        `🔄 检测到 wry 版本变更: ${installedVersion} -> ${WRY_VERSION}，准备刷新源码...`
      );
      await rm(WRY_PATCH_DIR, { recursive: true, force: true });
    }
    console.log("🔍 发现 wry 源码不完整，准备自动补全官方依赖...");

    // 2. 创建临时工作目录
    const tempDir = join(tmpdir(), `wry-patch-setup-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    const archivePath = join(tempDir, `wry-${WRY_VERSION}.tar.gz`);

    try {
      // 3. 下载官方 .crate 包 (其实就是 .tar.gz)
      console.log(`🌐 正在从 crates.io 下载官方 wry ${WRY_VERSION} 源码包...`);
      const response = await fetch(DOWNLOAD_URL);
      if (!response.ok) {
        throw new Error(`下载失败，HTTP 状态码: ${response.status}`);
      }
      const buffer = await response.arrayBuffer();
      await Bun.write(archivePath, buffer);
      console.log("✅ 下载完成。");

      // 4. 解压源码包
      console.log("📦 正在解压源码包...");
      const tarProcess = Bun.spawn(["tar", "-xf", archivePath, "-C", tempDir]);
      await tarProcess.exited;

      if (tarProcess.exitCode !== 0) {
        throw new Error(
          "解压失败，请确保系统已安装 tar 工具（Windows 10+ / macOS / Linux 默认内置）"
        );
      }
      console.log("✅ 解压完成。");

      // 5. 补全官方源码到 patches/wry 目录
      console.log("🚚 正在补全官方源码文件...");
      const extractedDir = join(tempDir, `wry-${WRY_VERSION}`);

      // 确保目标目录存在
      await mkdir(WRY_PATCH_DIR, { recursive: true });

      // 使用系统内置命令进行目录复制
      const isWindows = process.platform === "win32";
      let copyProcess;
      if (isWindows) {
        copyProcess = Bun.spawn([
          "robocopy",
          extractedDir,
          WRY_PATCH_DIR,
          "/E",
        ]);
      } else {
        copyProcess = Bun.spawn([
          "cp",
          "-R",
          `${extractedDir}/.`,
          WRY_PATCH_DIR,
        ]);
      }
      await copyProcess.exited;
      console.log("✅ 官方源码补全成功。");
    } catch (error) {
      console.error("❌ 自动补全 wry 源码失败:", error);
      process.exit(1);
    } finally {
      // 清理临时目录
      try {
        await rm(tempDir, { recursive: true, force: true });
      } catch (e) {
        // 忽略清理临时目录的错误
      }
    }
  }

  // 6. 无论是否需要下载，都应用 overrides 覆盖
  console.log("🔄 正在应用本地补丁覆盖文件...");
  if (await fileExists(WRY_OVERRIDES_DIR)) {
    await cp(WRY_OVERRIDES_DIR, WRY_PATCH_DIR, {
      recursive: true,
      force: true,
    });
    console.log("✨ wry 补丁应用完毕！现在可以顺利进行 Cargo 编译了。");
  } else {
    console.error("❌ 错误：未找到 wry-overrides 目录，无法应用补丁！");
    process.exit(1);
  }
}

main();
