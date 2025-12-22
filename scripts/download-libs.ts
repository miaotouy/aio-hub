/**
 * 自动下载常用公共库到 public/libs 目录
 * 使用方式: bun run scripts/download-libs.ts
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const LIBS_DIR = join(process.cwd(), "public", "libs");

const LIBS_TO_DOWNLOAD = [
  {
    name: "d3.min.js",
    url: "https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js",
  },
  {
    name: "mermaid.min.js",
    url: "https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js",
  },
  {
    name: "jquery.min.js",
    url: "https://cdn.jsdelivr.net/npm/jquery@3/dist/jquery.min.js",
  },
  {
    name: "lodash.min.js",
    url: "https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js",
  },
  {
    name: "echarts.min.js",
    url: "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js",
  },
  {
    name: "three.min.js",
    url: "https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js",
  },
  {
    name: "chart.min.js",
    url: "https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js",
  },
  {
    name: "anime.min.js",
    url: "https://cdn.jsdelivr.net/npm/animejs@3/lib/anime.min.js",
  },
  {
    name: "gsap.min.js",
    url: "https://cdn.jsdelivr.net/npm/gsap@3/dist/gsap.min.js",
  },
  {
    name: "p5.min.js",
    url: "https://cdn.jsdelivr.net/npm/p5@1/lib/p5.min.js",
  },
];

async function downloadFile(url: string, dest: string) {
  console.log(`正在下载: ${url} -> ${dest}`);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const buffer = await response.arrayBuffer();
    await Bun.write(dest, buffer);
    console.log(`✅ 下载完成: ${dest}`);
  } catch (error) {
    console.error(`❌ 下载失败: ${url}`, error);
  }
}

async function main() {
  // 确保目录存在
  await mkdir(LIBS_DIR, { recursive: true });

  console.log("🚀 开始下载公共库资源...");
  
  const tasks = LIBS_TO_DOWNLOAD.map(lib => 
    downloadFile(lib.url, join(LIBS_DIR, lib.name))
  );

  await Promise.all(tasks);
  console.log("\n✨ 所有资源处理完毕！");
}

main();