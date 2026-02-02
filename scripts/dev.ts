import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

/**
 * AIO Hub 智能开发启动脚本
 * 支持多实例运行、端口偏移和数据目录隔离
 */

// 1. 加载环境变量
const envPaths = [".env.local", ".env"];
for (const envPath of envPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`[Dev] 加载环境配置: ${envPath}`);
  }
}

// 2. 获取基础配置
const idSuffix = process.env.AIO_ID_SUFFIX || "";
const basePort = parseInt(process.env.AIO_PORT || "1420");
const baseProxyPort = parseInt(process.env.AIO_PROXY_PORT || "16655");
const productName = process.env.AIO_PRODUCT_NAME || "AIO Hub (Dev)";

// 3. 计算偏移
const getOffset = (str: string) => {
  if (!str) return 0;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash % 100);
};

const offset = idSuffix ? getOffset(idSuffix) : 0;
const port = basePort + offset;
const hmrPort = port + 1;
const proxyPort = baseProxyPort + offset;

console.log(`\n[Dev] 🚀 启动配置:`);
console.log(`      实例后缀: ${idSuffix || "(无)"}`);
console.log(`      Vite 端口: ${port}`);
console.log(`      HMR 端口: ${hmrPort}`);
console.log(`      LLMAPI 代理端口: ${proxyPort}`);
if (idSuffix) {
  console.log(`      数据目录: ./.dev-data/${idSuffix}`);
}
console.log("");

// 4. 准备环境变量
// Vite 变量 (VITE_ 开头会被暴露给前端)
process.env.VITE_PORT = port.toString();
process.env.VITE_HMR_PORT = hmrPort.toString();
process.env.VITE_AIO_PROXY_PORT = proxyPort.toString();

// Tauri 变量 (Tauri 会自动识别 TAURI_DEV_URL)
process.env.TAURI_DEV_URL = `http://localhost:${port}`;
process.env.AIO_ID_SUFFIX = idSuffix;

// 5. 构造 Tauri 命令
const tauriArgs = ["tauri", "dev"];

// 动态生成临时配置文件，避免 Shell 转义问题并确保 CLI 正确识别配置
const devConfPath = path.resolve(process.cwd(), "src-tauri", "tauri.conf.dev.json");
const devConf = {
  build: {
    devUrl: `http://localhost:${port}`,
  },
  productName: idSuffix ? `${productName} [${idSuffix}]` : productName,
  identifier: idSuffix ? `com.mty.aiohub.${idSuffix}` : undefined,
};

fs.writeFileSync(devConfPath, JSON.stringify(devConf, null, 2));
console.log(`[Dev] 已生成临时配置: ${devConfPath}`);

// 使用 -c 参数指向临时配置 (Tauri CLI 期望路径相对于 src-tauri 或为绝对路径)
tauriArgs.push("-c", devConfPath);

// 6. 处理数据目录隔离
if (idSuffix) {
  const dataDir = path.resolve(process.cwd(), ".dev-data", idSuffix);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  // 通过环境变量传递数据目录给 Rust 进程，避免命令行转义和参数位置问题
  process.env.AIO_DATA_DIR = dataDir;
}

// 7. 执行
console.log(`[Dev] 正在启动 Tauri...`);
const child = spawn("bun", ["run", ...tauriArgs], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});

child.on("exit", (code) => {
  process.exit(code || 0);
});
