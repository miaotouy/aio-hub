import { mkdir, stat, copyFile } from "node:fs/promises";
import { join } from "node:path";

const LIBS_DIR = join(process.cwd(), "public", "libs");
const NODE_MODULES_DIR = join(process.cwd(), "node_modules");

// 检查是否强制下载
const FORCE_DOWNLOAD = process.argv.includes("--force") || process.argv.includes("-f");

interface LibDownload {
  name: string;
  url: string;
  nodeModulesPath?: string; // 在 node_modules 中的相对路径
}

const LIBS_TO_DOWNLOAD: LibDownload[] = [
  {
    name: "d3.min.js",
    url: "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js",
    nodeModulesPath: "d3/dist/d3.min.js",
  },
  {
    name: "mermaid.min.js",
    url: "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js",
    nodeModulesPath: "mermaid/dist/mermaid.min.js",
  },
  {
    name: "jquery.min.js",
    url: "https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js",
    nodeModulesPath: "jquery/dist/jquery.min.js",
  },
  {
    name: "lodash.min.js",
    url: "https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js",
    nodeModulesPath: "lodash/lodash.min.js",
  },
  {
    name: "echarts.min.js",
    url: "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js",
    nodeModulesPath: "echarts/dist/echarts.min.js",
  },
  {
    name: "three.min.js",
    url: "https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js",
    nodeModulesPath: "three/build/three.min.js",
  },
  {
    name: "chart.min.js",
    url: "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js",
    nodeModulesPath: "chart.js/dist/chart.umd.min.js",
  },
  {
    name: "anime.min.js",
    url: "https://cdn.jsdelivr.net/npm/animejs@3/lib/anime.min.js",
    nodeModulesPath: "animejs/lib/anime.min.js",
  },
  {
    name: "gsap.min.js",
    url: "https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js",
    nodeModulesPath: "gsap/dist/gsap.min.js",
  },
  {
    name: "p5.min.js",
    url: "https://cdn.jsdelivr.net/npm/p5@1/lib/p5.min.js",
    nodeModulesPath: "p5/lib/p5.min.js",
  },
];

async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function processLib(lib: LibDownload, dest: string) {
  // 1. 检查目标文件是否已存在
  if (!FORCE_DOWNLOAD && (await fileExists(dest))) {
    console.log(`⏭️  跳过已存在的文件: ${lib.name}`);
    return;
  }

  // 2. 尝试从 node_modules 复制
  if (lib.nodeModulesPath) {
    const localPath = join(NODE_MODULES_DIR, lib.nodeModulesPath);
    if (await fileExists(localPath)) {
      console.log(`📦 从 node_modules 复制: ${lib.name}`);
      try {
        await copyFile(localPath, dest);
        console.log(`✅ 复制完成: ${lib.name}`);
        return;
      } catch (error) {
        console.warn(`⚠️ 复制失败: ${lib.name}, 将尝试下载`, error);
      }
    } else {
      console.log(`🔍 本地未找到: ${lib.name} (${lib.nodeModulesPath})`);
    }
  }

  // 3. 下载
  console.log(`🌐 正在从 CDN 下载: ${lib.url} -> ${dest}`);
  try {
    const response = await fetch(lib.url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const buffer = await response.arrayBuffer();
    await Bun.write(dest, buffer);
    console.log(`✅ 下载完成: ${lib.name}`);
  } catch (error) {
    console.error(`❌ 下载失败: ${lib.name}`, error);
  }
}

async function main() {
  // 确保目录存在
  await mkdir(LIBS_DIR, { recursive: true });

  console.log("🚀 开始同步公共库资源...");

  const tasks = LIBS_TO_DOWNLOAD.map((lib) => processLib(lib, join(LIBS_DIR, lib.name)));

  await Promise.all(tasks);
  console.log("\n✨ 所有资源处理完毕！");
}

main();
