import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PRESET_ICONS } from "../src/config/preset-icons";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SOURCE_DIR = path.resolve(
  PROJECT_ROOT,
  "node_modules/@lobehub/icons-static-svg/icons"
);
const TARGET_DIR = path.resolve(PROJECT_ROOT, "public/model-icons");
const GENERATED_LIST_PATH = path.resolve(
  PROJECT_ROOT,
  "src/config/generated-icon-list.ts"
);

// 确保目标目录存在
if (!fs.existsSync(TARGET_DIR)) {
  fs.mkdirSync(TARGET_DIR, { recursive: true });
}

console.log("🔄 开始同步图标...");
console.log(`📂 源目录: ${SOURCE_DIR}`);
console.log(`📂 目标目录: ${TARGET_DIR}`);

let syncedCount = 0;
let newCount = 0;
let customCount = 0;
let totalSourceCount = 0;

const customIcons: string[] = [];

// 获取源目录中所有可用的图标
let sourceFiles: string[] = [];
try {
  if (fs.existsSync(SOURCE_DIR)) {
    sourceFiles = fs.readdirSync(SOURCE_DIR).filter((file) => file.endsWith(".svg"));
    totalSourceCount = sourceFiles.length;
  }
} catch (error) {
  console.error("❌ 读取源目录失败:", error);
  process.exit(1);
}

if (totalSourceCount === 0) {
  console.error(
    "❌ 源目录中未找到图标。请确认 @lobehub/icons-static-svg 是否已安装？"
  );
  process.exit(1);
}

console.log(`📦 在源库中发现 ${totalSourceCount} 个图标。`);

// 将所有图标从源同步到目标
for (const fileName of sourceFiles) {
  const sourcePath = path.join(SOURCE_DIR, fileName);
  const targetPath = path.join(TARGET_DIR, fileName);

  const isNew = !fs.existsSync(targetPath);
  
  try {
    fs.copyFileSync(sourcePath, targetPath);
    syncedCount++;
    if (isNew) {
      newCount++;
      // console.log(`✨ 新增图标: ${fileName}`);
    }
  } catch (error) {
    console.error(`❌ 复制 ${fileName} 失败:`, error);
  }
}

// 检查自定义图标（存在于目标目录但不存在于源目录）
const targetFiles = fs.readdirSync(TARGET_DIR).filter((file) => file.endsWith(".svg"));
for (const fileName of targetFiles) {
  if (!sourceFiles.includes(fileName)) {
    customCount++;
    customIcons.push(fileName);
  }
}

// 生成图标列表文件
console.log("📝 正在生成图标列表文件...");
const fileContent = `/**
 * 自动生成的图标列表文件
 * 由 scripts/sync-icons.ts 生成，请勿手动修改
 */

export const AVAILABLE_ICONS = ${JSON.stringify(targetFiles, null, 2)} as const;

export type AvailableIcon = typeof AVAILABLE_ICONS[number];
`;

try {
  fs.writeFileSync(GENERATED_LIST_PATH, fileContent, "utf-8");
  console.log(`✅ 已生成: ${GENERATED_LIST_PATH}`);
} catch (error) {
  console.error("❌ 生成图标列表文件失败:", error);
}

// 检查 PRESET_ICONS 的覆盖率
let presetMissingCount = 0;
const presetMissingIcons: string[] = [];

for (const icon of PRESET_ICONS) {
  const iconName = icon.path;
  const targetPath = path.join(TARGET_DIR, iconName);
  
  if (!fs.existsSync(targetPath)) {
    presetMissingCount++;
    presetMissingIcons.push(iconName);
  }
}

console.log("\n📊 同步摘要:");
console.log(`✅ 总同步数: ${syncedCount}`);
console.log(`✨ 新增数量: ${newCount}`);
console.log(`🎨 自定义图标 (已保留): ${customCount}`);

if (presetMissingCount > 0) {
  console.warn(`\n⚠️ 警告: PRESET_ICONS 中定义的 ${presetMissingCount} 个图标缺失！`);
  presetMissingIcons.forEach((icon) => console.log(`  - ${icon}`));
} else {
  console.log("\n✅ 所有 PRESET_ICONS 都存在。");
}

if (customIcons.length > 0) {
  console.log("\n🎨 自定义图标列表 (源库中不存在):");
  customIcons.forEach((icon) => console.log(`  - ${icon}`));
}

console.log("\n✨ 完成！");
