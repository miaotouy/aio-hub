import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// 1. 获取版本号与参数
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf-8"));
const isLocal = process.argv.includes("--local");
let version = packageJson.version;
const productName = "AIO-Hub";

if (isLocal) {
  try {
    const gitHash = execSync("git rev-parse --short HEAD", {
      encoding: "utf-8",
    }).trim();
    if (gitHash) {
      if (version.includes("-")) {
        version = `${version}.build.${gitHash}`;
      } else {
        version = `${version}-build.${gitHash}`;
      }
    }
  } catch (err) {
    console.warn("⚠️ 获取 Git 提交哈希失败，将使用默认版本号:", err);
  }
}

console.log(`🚀 开始构建 ${productName} v${version} 便携版...`);

try {
  // 2. 运行 Tauri 构建
  console.log("📦 正在执行 Tauri Build...");
  const buildCmd = isLocal
    ? "bun run tauri:build --local"
    : "bun run tauri:build";
  execSync(buildCmd, { stdio: "inherit" });

  // 3. 定位生成的 exe
  const releaseDir = path.join(process.cwd(), "src-tauri", "target", "release");
  const sourceExe = path.join(releaseDir, "aiohub.exe");

  if (!fs.existsSync(sourceExe)) {
    throw new Error(`找不到构建出的 exe: ${sourceExe}`);
  }

  // 4. 准备输出目录 (放在 target/release/portable 下，避免被 Git 追踪)
  const outDir = path.join(releaseDir, "portable");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 5. 复制并重命名
  const targetName = `${productName}-v${version}-Portable.exe`;
  const targetPath = path.join(outDir, targetName);

  console.log(`🚚 正在导出便携版到: ${targetPath}`);
  fs.copyFileSync(sourceExe, targetPath);

  // 6. 创建标识文件 (可选，但为了双重保险)
  fs.writeFileSync(
    path.join(outDir, "portable.flag"),
    "This file enables portable mode for AIO Hub."
  );

  console.log("\n✨ 便携版构建完成！");
  console.log(`📂 发布包位置: ${outDir}`);
  console.log(
    `💡 提示: 直接运行 ${targetName} 即可，它会自动在同级创建 data 目录。`
  );
} catch (error) {
  console.error("❌ 构建失败:", error);
  process.exit(1);
}
