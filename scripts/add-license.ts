import fs from "fs";
import path from "path";

const COPYRIGHT_HOLDER = "miaotouy(Github@miaotouy)";
const COPYRIGHT_YEARS = "2025-2026";

const LICENSE_TEXT_LINES = [
  `Copyright ${COPYRIGHT_YEARS} ${COPYRIGHT_HOLDER}`,
  "",
  'Licensed under the Apache License, Version 2.0 (the "License");',
  "you may not use this file except in compliance with the License.",
  "You may obtain a copy of the License at",
  "",
  "    http://www.apache.org/licenses/LICENSE-2.0",
  "",
  "Unless required by applicable law or agreed to in writing, software",
  'distributed under the License is distributed on an "AS IS" BASIS,',
  "WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.",
  "See the License for the specific language governing permissions and",
  "limitations under the License.",
];

// 生成不同文件类型的许可证头部
function getLicenseHeader(ext: string): string {
  if (ext === ".vue") {
    const content = LICENSE_TEXT_LINES.map((line) =>
      `  ${line}`.trimEnd()
    ).join("\n");
    return `<!--\n${content}\n-->\n\n`;
  } else {
    // .ts, .js, .rs
    return (
      LICENSE_TEXT_LINES.map((line) => (line ? `// ${line}` : "//")).join(
        "\n"
      ) + "\n\n"
    );
  }
}

// 检查文件是否已经包含许可证声明
function hasLicense(content: string): boolean {
  return (
    content.includes("Licensed under the Apache License, Version 2.0") ||
    content.includes("http://www.apache.org/licenses/LICENSE-2.0")
  );
}

// 递归扫描目录
function scanDirectory(dir: string, fileList: string[] = []): string[] {
  if (!fs.existsSync(dir)) return fileList;

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      // 排除常见的非源码目录
      if (
        file === "node_modules" ||
        file === "dist" ||
        file === "target" ||
        file === ".git" ||
        file === "mobile"
      ) {
        continue;
      }
      scanDirectory(filePath, fileList);
    } else {
      const ext = path.extname(file);
      // 排除声明文件 .d.ts
      if (file.endsWith(".d.ts")) {
        continue;
      }
      if ([".ts", ".js", ".vue", ".rs"].includes(ext)) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const scanDirs = [
    path.join(process.cwd(), "src"),
    path.join(process.cwd(), "src-tauri/src"),
    path.join(process.cwd(), "scripts"),
  ];

  console.log("🔍 Scanning files for Apache-2.0 license headers...");
  if (isDryRun) {
    console.log("⚠️  Running in DRY-RUN mode. No files will be modified.\n");
  }

  let totalScanned = 0;
  let totalAdded = 0;
  let totalSkipped = 0;

  for (const dir of scanDirs) {
    const relativeDir = path.relative(process.cwd(), dir);
    console.log(`📁 Scanning directory: ${relativeDir}`);

    const files = scanDirectory(dir);
    for (const file of files) {
      totalScanned++;
      const relativePath = path.relative(process.cwd(), file);
      const ext = path.extname(file);

      try {
        const content = fs.readFileSync(file, "utf-8");

        if (hasLicense(content)) {
          totalSkipped++;
          continue;
        }

        totalAdded++;
        const header = getLicenseHeader(ext);
        const newContent = header + content;

        if (isDryRun) {
          console.log(`[PENDING] Would add license to: ${relativePath}`);
        } else {
          fs.writeFileSync(file, newContent, "utf-8");
          console.log(`[ADDED] License added to: ${relativePath}`);
        }
      } catch (err) {
        console.error(`❌ Error processing ${relativePath}:`, err);
      }
    }
  }

  console.log("\n📊 Summary:");
  console.log(`-----------------------------`);
  console.log(`Total files scanned: ${totalScanned}`);
  console.log(`Licenses added:      ${totalAdded}`);
  console.log(`Licenses skipped:    ${totalSkipped}`);
  console.log(`-----------------------------`);

  if (isDryRun && totalAdded > 0) {
    console.log(`\n💡 Run without '--dry-run' to apply these changes:`);
    console.log(`   bun run scripts/add-license.ts`);
  }
}

main().catch(console.error);
