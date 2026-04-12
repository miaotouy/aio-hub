import git from "isomorphic-git";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import {
  readFile,
  writeFile,
  mkdir,
  remove,
  stat,
  readDir,
  exists,
} from "@tauri-apps/plugin-fs";

const logger = createModuleLogger("Canvas/GitService");
const errorHandler = createModuleErrorHandler("Canvas/GitService");

/**
 * 封装 isomorphic-git 的内部服务
 * 用于管理画布的版本控制
 */
export class GitInternalService {
  private fs: any;

  constructor(private basePath: string) {
    // isomorphic-git 需要一个符合 fs 接口的对象
    // 这里我们需要适配 Tauri 的 fs 插件
    this.fs = {
      promises: {
        readFile: async (path: string) => {
          return await readFile(path);
        },
        writeFile: async (path: string, data: Uint8Array | string) => {
          const uint8 =
            typeof data === "string" ? new TextEncoder().encode(data) : data;
          return await writeFile(path, uint8);
        },
        mkdir: async (path: string) => {
          if (!(await exists(path))) {
            return await mkdir(path, { recursive: true });
          }
        },
        rmdir: async (path: string) => {
          return await remove(path, { recursive: true });
        },
        unlink: async (path: string) => {
          return await remove(path);
        },
        stat: async (path: string) => {
          const s = await stat(path);
          return {
            isFile: () => s.isFile,
            isDirectory: () => s.isDirectory,
            isSymbolicLink: () => s.isSymlink,
            mode: s.mode,
            size: s.size,
            mtimeMs: s.mtime?.getTime() ?? Date.now(),
          };
        },
        lstat: async (path: string) => {
          const s = await stat(path);
          return {
            isFile: () => s.isFile,
            isDirectory: () => s.isDirectory,
            isSymbolicLink: () => s.isSymlink,
            mode: s.mode,
            size: s.size,
            mtimeMs: s.mtime?.getTime() ?? Date.now(),
          };
        },
        readdir: async (path: string) => {
          const entries = await readDir(path);
          return entries.map((e) => e.name);
        },
        readlink: async (path: string) => {
          // Tauri fs 目前对 readlink 的支持有限，这里简单实现或占位
          return path;
        },
        symlink: async (target: string, path: string) => {
          // Tauri fs 目前对 symlink 的支持有限
          logger.warn("GitInternalService: symlink is not fully supported", {
            target,
            path,
          });
        },
      },
    };
  }

  /**
   * 初始化 Git 仓库
   */
  async init() {
    return await errorHandler.wrapAsync(async () => {
      logger.info("正在初始化 Git 仓库", { path: this.basePath });
      await git.init({ fs: this.fs, dir: this.basePath });
    }, { userMessage: "初始化版本控制失败" });
  }

  /**
   * 添加文件到暂存区
   */
  async add(filepath: string | string[]) {
    return await errorHandler.wrapAsync(async () => {
      const files = Array.isArray(filepath) ? filepath : [filepath];
      for (const file of files) {
        await git.add({ fs: this.fs, dir: this.basePath, filepath: file });
      }
    }, { userMessage: "添加文件到版本控制失败" });
  }

  /**
   * 提交更改
   */
  async commit(message: string, author = { name: "AIO Hub Canvas", email: "canvas@aiohub.internal" }) {
    return await errorHandler.wrapAsync(async () => {
      logger.info("正在提交更改", { message });
      return await git.commit({
        fs: this.fs,
        dir: this.basePath,
        message,
        author,
      });
    }, { userMessage: "提交更改失败" });
  }

  /**
   * 获取提交日志
   */
  async log(depth = 10) {
    return await errorHandler.wrapAsync(async () => {
      return await git.log({
        fs: this.fs,
        dir: this.basePath,
        depth,
      });
    }, { userMessage: "获取版本历史失败" });
  }
}