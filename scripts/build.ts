import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

console.log("⚙️ [Build] 正在加载环境变量...");

// 1. 加载环境变量
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

// 2. 检查关键变量是否存在
const hasKey = !!process.env.TAURI_SIGNING_PRIVATE_KEY;
let tempConfPath: string | null = null;

const tauriArgs = ["tauri", "build"];

if (hasKey) {
  console.log(
    "[Build] 🔑 检测到 TAURI_SIGNING_PRIVATE_KEY，已成功注入构建环境。将进行带签名的完整构建。"
  );
} else {
  console.warn("[Build] ⚠️ 未检测到 TAURI_SIGNING_PRIVATE_KEY。");
  console.log(
    "[Build] 🛠️ 为了防止 Tauri 因“配置了公钥但缺少私钥”而报错，正在动态生成无签名构建配置..."
  );

  try {
    const tauriConfPath = path.resolve(
      process.cwd(),
      "src-tauri",
      "tauri.conf.json"
    );
    if (fs.existsSync(tauriConfPath)) {
      const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));

      // 动态移除 pubkey 和禁用 updater 产物生成，避免构建报错
      if (tauriConf.plugins?.updater?.pubkey) {
        delete tauriConf.plugins.updater.pubkey;
        console.log("[Build] 已从临时配置中移除 plugins.updater.pubkey");
      }
      if (tauriConf.bundle) {
        tauriConf.bundle.createUpdaterArtifacts = false;
        console.log("[Build] 已将 bundle.createUpdaterArtifacts 设为 false");
      }

      tempConfPath = path.resolve(
        process.cwd(),
        "src-tauri",
        "tauri.conf.build.json"
      );
      fs.writeFileSync(tempConfPath, JSON.stringify(tauriConf, null, 2));
      console.log(`[Build] 已生成临时无签名构建配置: ${tempConfPath}`);

      // 使用临时配置文件
      tauriArgs.push("-c", tempConfPath);
    }
  } catch (err) {
    console.error("[Build] ❌ 生成临时配置失败，将尝试直接构建:", err);
  }
}

// 3. 构造并执行 Tauri Build 命令
const extraArgs = process.argv.slice(2);
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
