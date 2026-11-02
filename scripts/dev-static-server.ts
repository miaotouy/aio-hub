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

import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";

interface PublishedBuild {
  current: string;
  previous?: string;
}

const snapshotPattern = /^build-[a-f0-9-]+$/;
const managedPattern = /^(build|work)-[a-f0-9-]+$/;

function snapshotPath(root: string, name: string): string {
  if (!managedPattern.test(name)) throw new Error("无效的前端构建目录。");
  const directory = path.resolve(root, name);
  if (path.dirname(directory) !== path.resolve(root))
    throw new Error("前端构建目录越界。");
  return directory;
}

export function createSnapshot(
  root: string,
  kind: "build" | "work" = "build"
): string {
  fs.mkdirSync(root, { recursive: true });
  const directory = snapshotPath(root, `${kind}-${randomUUID()}`);
  fs.mkdirSync(directory);
  return directory;
}

export function removeSnapshot(root: string, directory: string): void {
  const target = snapshotPath(root, path.basename(directory));
  if (target !== path.resolve(directory)) throw new Error("前端构建目录越界。");
  fs.rmSync(target, { recursive: true, force: true });
}

function readPublishedBuild(root: string): PublishedBuild | undefined {
  try {
    const published: PublishedBuild = JSON.parse(
      fs.readFileSync(path.join(root, "current.json"), "utf8")
    );
    if (
      !snapshotPattern.test(published.current) ||
      (published.previous && !snapshotPattern.test(published.previous))
    )
      throw new Error("无效的前端发布记录。");
    snapshotPath(root, published.current);
    if (published.previous) snapshotPath(root, published.previous);
    return published;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

/** 仅完整构建可成为当前版本；切换入口后保留上一版，供旧页面请求延迟加载的资源。 */
export function publishSnapshot(root: string, directory: string): void {
  const target = snapshotPath(root, path.basename(directory));
  if (
    target !== path.resolve(directory) ||
    !fs.existsSync(path.join(target, "index.html"))
  ) {
    throw new Error("前端构建缺少 index.html，继续使用上一版产物。");
  }
  const previous = readPublishedBuild(root)?.current;
  const published: PublishedBuild = {
    current: path.basename(target),
    previous,
  };
  const temporary = path.join(root, `current-${randomUUID()}.json`);
  fs.writeFileSync(temporary, JSON.stringify(published));
  fs.renameSync(temporary, path.join(root, "current.json"));

  for (const entry of fs.readdirSync(root)) {
    if (
      snapshotPattern.test(entry) &&
      entry !== published.current &&
      entry !== previous
    ) {
      try {
        removeSnapshot(root, snapshotPath(root, entry));
      } catch (error) {
        // Windows 上仍在读取的文件留到下一次发布清理，当前版本已可用。
        console.warn(
          "[StaticDev] 旧资源目录暂时无法清理:",
          (error as Error).message
        );
      }
    }
  }
}

/** 同一实例仅允许一个构建写入者；异常退出遗留的锁按进程存活状态回收。 */
export function acquireBuildLock(root: string): () => void {
  fs.mkdirSync(root, { recursive: true });
  const lockPath = path.join(root, "build.lock");
  if (fs.existsSync(lockPath)) {
    const pid = Number(fs.readFileSync(lockPath, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0)
      throw new Error("构建锁无效，请移除开发产物目录中的 build.lock 后重试。");
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch (error) {
      alive = (error as NodeJS.ErrnoException).code !== "ESRCH";
    }
    if (alive)
      throw new Error(
        "该实例正在构建。请等待构建完成；监听模式下请先停止监听。"
      );
    fs.unlinkSync(lockPath);
  }
  fs.writeFileSync(lockPath, String(process.pid), { flag: "wx" });
  let released = false;
  return () => {
    if (released) return;
    released = true;
    fs.unlinkSync(lockPath);
  };
}

const mimeTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".gz": "application/gzip",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

function findFile(
  root: string,
  name: string,
  requestPath: string
): string | undefined {
  const directory = snapshotPath(root, name);
  const file = path.resolve(directory, `.${requestPath}`);
  const relative = path.relative(directory, file);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;
  try {
    // realpath 同时阻止 public 内的目录链接将服务范围带出构建目录。
    const real = fs.realpathSync(file);
    const realRelative = path.relative(directory, real);
    if (realRelative.startsWith("..") || path.isAbsolute(realRelative))
      return undefined;
    return fs.statSync(real).isFile() ? real : undefined;
  } catch {
    return undefined;
  }
}

export function createStaticServer(root: string) {
  return createServer((request, response) => {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    const finish = (status: number, message: string) => {
      response.writeHead(status, {
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end(request.method === "HEAD" ? undefined : message);
    };
    try {
      if (request.method !== "GET" && request.method !== "HEAD") {
        response.setHeader("Allow", "GET, HEAD");
        return finish(405, "Method not allowed");
      }
      const host = new URL(`http://${request.headers.host}`).hostname;
      if (host !== "127.0.0.1" && host !== "localhost")
        return finish(403, "Forbidden");
      const requestPath = decodeURIComponent(
        new URL(request.url || "/", "http://localhost").pathname
      );
      // 组件 ID 含冒号，仅作为 SPA 路由消费，避免交给 Windows 文件系统解析 ADS。
      const componentRoute =
        /^\/detached-component\/[^/]+$/.test(requestPath) &&
        request.headers.accept?.includes("text/html");
      if (
        /[\\\0]/.test(requestPath) ||
        requestPath.split("/").includes("..") ||
        (requestPath.includes(":") && !componentRoute)
      )
        return finish(403, "Forbidden");
      const published = readPublishedBuild(root);
      if (!published) return finish(503, "前端产物尚未就绪。");
      const target =
        requestPath === "/" || (componentRoute && requestPath.includes(":"))
          ? "/index.html"
          : requestPath;
      let file = findFile(root, published.current, target);
      if (!file && published.previous && path.extname(target) !== ".html") {
        file = findFile(root, published.previous, target);
      }
      if (
        !file &&
        !path.extname(target) &&
        request.headers.accept?.includes("text/html")
      ) {
        file = findFile(root, published.current, "/index.html");
      }
      if (!file) return finish(404, "Not found");
      response.writeHead(200, {
        "Content-Type":
          mimeTypes[path.extname(file).toLowerCase()] ||
          "application/octet-stream",
        "Content-Length": fs.statSync(file).size,
      });
      if (request.method === "HEAD") return response.end();
      const stream = fs.createReadStream(file);
      stream.on("error", () => response.destroy());
      response.on("close", () => stream.destroy());
      stream.pipe(response);
    } catch (error) {
      if (error instanceof URIError) return finish(400, "Bad request");
      console.error("[StaticDev] 静态资源读取失败:", (error as Error).message);
      finish(500, "静态资源读取失败，请检查开发终端。");
    }
  });
}
