/**
 * 插件加载器
 *
 * 负责从文件系统加载插件，支持开发模式和生产模式
 */

// 扩展 Window 接口以支持插件组件缓存
declare global {
  interface Window {
    __PLUGIN_COMPONENTS__?: Map<string, () => Promise<{ default: any }>>;
  }
}

import { path } from "@tauri-apps/api";
import { getAppConfigDir } from "@/utils/appPath";
import { readTextFile, readDir, exists } from "@tauri-apps/plugin-fs";
import { satisfies } from "compare-versions";
import type {
  PluginManifest,
  PluginLoadOptions,
  PluginLoadResult,
  JsPluginExport,
  PluginProxy,
  PlatformKey,
} from "./plugin-types";
import { createJsPluginProxy } from "./js-plugin-adapter";
import type { JsPluginAdapter } from "./js-plugin-adapter";
import { createSidecarPluginProxy } from "./sidecar-plugin-adapter";
import { createNativePluginProxy } from "./native-plugin-adapter";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { pluginConfigService } from "./plugin-config.service";
import { pluginStateService } from "./plugin-state.service";
import { getAppContext } from "@/config/appContext";

const logger = createModuleLogger("services/plugin-loader");
const errorHandler = createModuleErrorHandler("services/plugin-loader");

/**
 * 插件加载器类
 */
export class PluginLoader {
  private devMode: boolean;
  private devPluginsDir: string;
  private prodPluginsDir: string | null = null;

  constructor(options: PluginLoadOptions) {
    // 注意：this.devMode 代表主程序是否处于开发模式
    // 它决定了是否要去尝试加载源码目录中的插件
    this.devMode = options.devMode;
    this.devPluginsDir = options.devPluginsDir || "/plugins";
    this.prodPluginsDir = options.prodPluginsDir || null;

    logger.info("插件加载器初始化", {
      isAppDevMode: this.devMode,
      devPluginsDir: this.devPluginsDir,
      prodPluginsDir: this.prodPluginsDir,
    });
  }

  /**
   * 加载所有插件
   */
  async loadAll(): Promise<PluginLoadResult> {
    logger.info("开始加载所有插件");

    const result: PluginLoadResult = {
      plugins: [],
      failed: [],
    };

    // 开发模式：同时加载开发和生产插件
    if (this.devMode) {
      const devResult = await this.loadDevPlugins();
      const prodResult = await this.loadProdPlugins();

      result.plugins.push(...devResult.plugins, ...prodResult.plugins);
      result.failed.push(...devResult.failed, ...prodResult.failed);

      logger.info("开发模式：同时加载开发和生产插件", {
        devPlugins: devResult.plugins.length,
        prodPlugins: prodResult.plugins.length,
        total: result.plugins.length,
        failed: result.failed.length,
      });
    } else {
      // 生产模式：仅加载生产插件
      return await this.loadProdPlugins();
    }

    return result;
  }

  /**
   * 加载开发模式下的插件（从项目源码加载）
   */
  private async loadDevPlugins(): Promise<PluginLoadResult> {
    logger.info("开发模式：从源码目录加载插件", { dir: this.devPluginsDir });

    const result: PluginLoadResult = {
      plugins: [],
      failed: [],
    };

    try {
      // 使用 Vite 的 import.meta.glob 扫描插件目录
      // 基于 manifest.json 来发现所有插件（包括 JS 和 Sidecar）
      const manifestModules = import.meta.glob<{
        default: PluginManifest;
      }>("/plugins/*/manifest.json", { eager: false });

      // 扫描 JS 插件的入口文件
      const pluginModules = import.meta.glob<{
        default: JsPluginExport;
        manifest: PluginManifest;
      }>("/plugins/*/index.ts", { eager: false });

      // 扫描所有插件的 Vue 组件（支持 .vue 和 .js/.mjs）
      const componentModules = import.meta.glob<{
        default: any;
      }>("/plugins/*/*.{vue,js,mjs}", { eager: false });

      // 存储组件加载器，供 plugin-manager 使用
      if (!window.__PLUGIN_COMPONENTS__) {
        window.__PLUGIN_COMPONENTS__ = new Map();
      }

      // 注册所有发现的组件
      for (const [path, loader] of Object.entries(componentModules)) {
        // 排除 index.ts/js 和 manifest.json
        if (path.includes("/index.") || path.includes("/manifest.json")) {
          continue;
        }
        window.__PLUGIN_COMPONENTS__.set(path, loader);
      }

      logger.info(`发现 ${window.__PLUGIN_COMPONENTS__.size} 个插件组件`, {
        components: Array.from(window.__PLUGIN_COMPONENTS__.keys()),
      });

      // 使用 manifest.json 作为插件发现的基础
      const manifestPaths = Object.keys(manifestModules);
      logger.info(`发现 ${manifestPaths.length} 个开发插件`, {
        paths: manifestPaths,
      });

      // 加载每个插件
      for (const manifestPath of manifestPaths) {
        const pluginId = this.extractPluginIdFromPath(manifestPath);

        try {
          // 加载 manifest
          const manifestModule = await manifestModules[manifestPath]();
          const manifest = manifestModule.default;

          // 开发模式下的安装路径（去掉 /manifest.json 和开头的 /）
          const devInstallPath = manifestPath.startsWith("/")
            ? manifestPath.substring(1).replace("/manifest.json", "")
            : manifestPath.replace("/manifest.json", "");

          let proxy: PluginProxy;

          // 根据插件类型选择不同的加载方式
          if (manifest.type === "javascript") {
            // 加载 JS 插件
            const pluginModulePath = manifestPath.replace(
              "/manifest.json",
              "/index.ts"
            );

            // 检查 index.ts 是否存在
            if (!pluginModules[pluginModulePath]) {
              const err = new Error(`JS 插件必须包含 index.ts 文件`);
              errorHandler.error(err, "JS 插件缺少 index.ts", {
                context: { pluginId },
              });
              throw err;
            }

            proxy = createJsPluginProxy(manifest, devInstallPath, true);

            // 加载插件模块
            const pluginModule = await pluginModules[pluginModulePath]();
            const pluginExport = pluginModule.default;

            // 设置插件导出对象
            (proxy as unknown as JsPluginAdapter).setPluginExport(pluginExport);
          } else if (manifest.type === "sidecar") {
            // 加载 Sidecar 插件
            proxy = createSidecarPluginProxy(manifest, devInstallPath, true);
          } else if (manifest.type === "native") {
            // 加载原生插件
            proxy = createNativePluginProxy(manifest, devInstallPath, true);
          } else {
            logger.warn(
              `开发模式下跳过未知类型的插件: ${pluginId}, type: ${manifest.type}`
            );
            continue;
          }

          // 校验插件兼容性（仅提示，不阻止加载）
          validatePluginCompatibility(manifest, proxy);

          // 根据持久化状态决定是否启用插件
          // 注意：使用 proxy.id (可能带 -dev 后缀) 而不是 manifest.id
          const shouldEnable = await pluginStateService.isEnabled(proxy.id);
          if (shouldEnable) {
            // 注意：这里我们不再自动在 loader 中 enable 插件
            // 而是让管理层 (PluginManager) 统一处理激活逻辑
            // 这样可以确保 context 的创建时机和注入逻辑一致
          } else {
            logger.info(`插件 ${proxy.id} 根据持久化状态保持禁用`);
          }

          // 初始化插件配置
          try {
            // 使用 proxy.id (带 -dev 后缀) 初始化配置，确保开发版配置独立
            await pluginConfigService.initPluginConfig(manifest, proxy.id);
          } catch (error) {
            logger.warn(`插件配置初始化失败: ${manifest.id}`, { error });
            // 配置初始化失败不应阻止插件加载
          }

          logger.info(`成功加载开发插件: ${proxy.id}`, {
            name: manifest.name,
            version: manifest.version,
            devMode: true,
          });

          // 将插件代理添加到结果列表
          result.plugins.push(proxy);
        } catch (error) {
          errorHandler.error(error, "加载开发插件失败", {
            context: { pluginId },
          });
          result.failed.push({
            id: pluginId,
            path: manifestPath,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    } catch (error) {
      errorHandler.error(error, "加载开发插件过程中发生错误");
    }

    logger.info("开发插件加载完成", {
      loaded: result.plugins.length,
      failed: result.failed.length,
    });

    return result;
  }

  /**
   * 加载生产模式下的插件（从安装目录加载）
   */
  private async loadProdPlugins(): Promise<PluginLoadResult> {
    logger.info("从安装目录加载插件", { dir: this.prodPluginsDir });

    const result: PluginLoadResult = {
      plugins: [],
      failed: [],
    };

    if (!this.prodPluginsDir) {
      logger.warn("未配置生产插件目录，跳过加载");
      return result;
    }

    try {
      // 检查插件目录是否存在
      const dirExists = await exists(this.prodPluginsDir);
      if (!dirExists) {
        logger.warn("插件目录不存在，跳过加载", { dir: this.prodPluginsDir });
        return result;
      }

      // 读取插件目录
      const entries = await readDir(this.prodPluginsDir);

      // 遍历每个插件目录
      for (const entry of entries) {
        if (!entry.isDirectory) continue;

        const pluginId = entry.name;
        const pluginPath = await path.join(this.prodPluginsDir, pluginId);

        try {
          // 读取 manifest.json
          const manifestPath = await path.join(pluginPath, "manifest.json");
          const manifestExists = await exists(manifestPath);

          if (!manifestExists) {
            logger.warn(`插件目录缺少 manifest.json: ${pluginId}`);
            continue;
          }

          const manifestContent = await readTextFile(manifestPath);
          const manifest: PluginManifest = JSON.parse(manifestContent);

          // 根据插件类型加载
          if (manifest.type === "javascript") {
            // 加载 JS 插件
            const proxy = await this.loadProdJsPlugin(manifest, pluginPath);
            if (proxy) {
              result.plugins.push(proxy);
            }
          } else if (manifest.type === "sidecar") {
            // 加载 Sidecar 插件
            const proxy = await this.loadProdSidecarPlugin(
              manifest,
              pluginPath
            );
            if (proxy) {
              result.plugins.push(proxy);
            }
          } else if (manifest.type === "native") {
            // 加载原生插件
            const proxy = await this.loadProdNativePlugin(manifest, pluginPath);
            if (proxy) {
              result.plugins.push(proxy);
            }
          } else {
            logger.warn(`未知的插件类型: ${manifest.type}`, { pluginId });
          }
        } catch (error) {
          errorHandler.error(error, "加载生产插件失败", {
            context: { pluginId },
          });
          result.failed.push({
            id: pluginId,
            path: pluginPath,
            error: error instanceof Error ? error : new Error(String(error)),
          });
        }
      }
    } catch (error) {
      errorHandler.error(error, "加载生产插件过程中发生错误");
    }

    logger.info("生产插件加载完成", {
      loaded: result.plugins.length,
      failed: result.failed.length,
    });

    return result;
  }

  /**
   * 加载生产环境下的 JS 插件
   */
  private async loadProdJsPlugin(
    manifest: PluginManifest,
    pluginPath: string
  ): Promise<import("./plugin-types").PluginProxy | null> {
    try {
      if (!manifest.main) {
        throw new Error("JS 插件缺少 main 字段");
      }

      // 1. 确定入口文件路径
      let mainFile = manifest.main;
      let entryPath = await path.join(pluginPath, mainFile);

      // 自动修正：如果在生产环境下 main 指向 .ts（例如 manifest 没被 build.js 处理过）
      // 尝试在当前目录下寻找同名的 .js
      if (mainFile.endsWith(".ts") && !(await exists(entryPath))) {
        const jsFile = mainFile.replace(/\.ts$/, ".js");
        const jsPath = await path.join(pluginPath, jsFile);
        if (await exists(jsPath)) {
          logger.info(`自动修正入口路径 (.ts -> .js): ${jsFile}`);
          mainFile = jsFile;
          entryPath = jsPath;
        }
      }

      // 检查入口文件是否存在
      if (!(await exists(entryPath))) {
        const err = new Error(`找不到插件入口文件: ${mainFile}`);
        logger.error(err.message, { pluginId: manifest.id, entryPath });

        // 创建一个损坏状态的插件代理，以便在 UI 中显示并允许卸载
        const proxy = createJsPluginProxy(manifest, pluginPath, false);
        (proxy as any).isBroken = true;
        (proxy as any).error = err;
        return proxy;
      }

      // 3. 使用 ESM 动态导入加载插件
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      // 转换路径为浏览器可加载的 URL，处理 Windows 分隔符
      const assetUrl = convertFileSrc(entryPath.replace(/\\/g, "/"));

      logger.info(`开始通过 ESM 加载插件: ${manifest.id}`, { assetUrl });

      // 动态导入模块
      const module = await import(/* @vite-ignore */ assetUrl);
      const pluginExport = module.default || module;

      // 创建插件代理（标记为生产模式）
      // 注意：代理对象依然使用原始 pluginPath 记录安装位置
      const proxy = createJsPluginProxy(manifest, pluginPath, false);

      if (!pluginExport || typeof pluginExport !== "object") {
        throw new Error("插件未正确导出对象");
      }

      // 设置插件导出对象
      (proxy as unknown as JsPluginAdapter).setPluginExport(pluginExport);

      // 校验插件兼容性（仅提示，不阻止加载）
      validatePluginCompatibility(manifest, proxy);

      // 根据持久化状态决定是否启用插件
      const shouldEnable = await pluginStateService.isEnabled(proxy.id);
      if (shouldEnable) {
        // 同样，交给 PluginManager 统一 enable
      } else {
        logger.info(`插件 ${proxy.id} 根据持久化状态保持禁用`);
      }

      // 初始化插件配置
      try {
        await pluginConfigService.initPluginConfig(manifest, proxy.id);
      } catch (error) {
        logger.warn(`插件配置初始化失败: ${manifest.id}`, { error });
        // 配置初始化失败不应阻止插件加载
      }

      logger.info(`成功加载生产插件: ${proxy.id}`, {
        name: manifest.name,
        version: manifest.version,
        devMode: false,
      });

      return proxy;
    } catch (error) {
      errorHandler.error(error, "加载生产插件失败", {
        context: { pluginId: manifest.id },
      });

      // 即使执行失败，也返回一个损坏的代理对象，以便在 UI 中卸载
      const proxy = createJsPluginProxy(manifest, pluginPath, false);
      (proxy as any).isBroken = true;
      (proxy as any).error =
        error instanceof Error ? error : new Error(String(error));
      return proxy;
    }
  }

  /**
   * 加载生产环境下的 Sidecar 插件
   */
  private async loadProdSidecarPlugin(
    manifest: PluginManifest,
    pluginPath: string
  ): Promise<import("./plugin-types").PluginProxy | null> {
    try {
      // 创建 Sidecar 插件代理（标记为生产模式）
      const proxy = createSidecarPluginProxy(manifest, pluginPath, false);

      // 校验插件兼容性（仅提示，不阻止加载）
      validatePluginCompatibility(manifest, proxy);

      // 记录加载状态，启用逻辑由 PluginManager 统一处理
      logger.debug(`Sidecar 插件 ${proxy.id} 已加载`);

      // 初始化插件配置
      try {
        await pluginConfigService.initPluginConfig(manifest, proxy.id);
      } catch (error) {
        logger.warn(`插件配置初始化失败: ${manifest.id}`, { error });
        // 配置初始化失败不应阻止插件加载
      }

      logger.info(`成功加载 Sidecar 插件: ${proxy.id}`, {
        name: manifest.name,
        version: manifest.version,
        devMode: false,
      });

      return proxy;
    } catch (error) {
      errorHandler.error(error, "加载 Sidecar 插件失败", {
        context: { pluginId: manifest.id },
      });
      throw error;
    }
  }

  /**
   * 加载生产环境下的原生插件
   */
  private async loadProdNativePlugin(
    manifest: PluginManifest,
    pluginPath: string
  ): Promise<import("./plugin-types").PluginProxy | null> {
    try {
      // 创建原生插件代理（标记为生产模式）
      const proxy = createNativePluginProxy(manifest, pluginPath, false);

      // 校验插件兼容性（仅提示，不阻止加载）
      validatePluginCompatibility(manifest, proxy);

      // 记录加载状态，启用逻辑由 PluginManager 统一处理
      logger.debug(`原生插件 ${proxy.id} 已加载`);

      // 初始化插件配置
      try {
        await pluginConfigService.initPluginConfig(manifest, proxy.id);
      } catch (error) {
        logger.warn(`插件配置初始化失败: ${manifest.id}`, { error });
        // 配置初始化失败不应阻止插件加载
      }

      logger.info(`成功加载原生插件: ${proxy.id}`, {
        name: manifest.name,
        version: manifest.version,
        devMode: false,
      });

      return proxy;
    } catch (error) {
      errorHandler.error(error, "加载原生插件失败", {
        context: { pluginId: manifest.id },
      });
      throw error;
    }
  }

  /**
   * 从文件路径中提取插件 ID
   */
  private extractPluginIdFromPath(pluginPath: string): string {
    // 例如: /plugins/my-plugin/index.ts -> my-plugin
    const match = pluginPath.match(/\/plugins\/([^\/]+)\//);
    return match ? match[1] : "unknown";
  }

  /**
   * 卸载插件
   * @param pluginId 要卸载的插件 ID（可能包含 -dev 后缀）
   * @returns 卸载是否成功
   */
  async uninstall(pluginId: string): Promise<boolean> {
    logger.info(`开始卸载插件: ${pluginId}`);

    // 如果是开发模式插件（ID 以 -dev 结尾），不允许卸载
    if (pluginId.endsWith("-dev")) {
      logger.warn("开发模式插件无法卸载");
      throw new Error("开发模式插件无法卸载，请手动删除源码目录中的插件文件夹");
    }

    try {
      // 导入 Tauri API
      const { invoke } = await import("@tauri-apps/api/core");

      // 调用后端命令删除插件目录到回收站
      await invoke("uninstall_plugin", { pluginId });

      logger.info(`插件 ${pluginId} 已移入回收站`);
      return true;
    } catch (error) {
      errorHandler.error(error, "卸载插件失败", { context: { pluginId } });
      throw error;
    }
  }
}

/**
 * 获取当前平台标识
 */
export function getCurrentPlatform(): PlatformKey {
  const platform = window.navigator.platform.toLowerCase();
  const arch = navigator.userAgent.includes("x64") ? "x64" : "arm64";

  if (platform.includes("win")) {
    return `win32-${arch}` as PlatformKey;
  } else if (platform.includes("mac")) {
    return `darwin-${arch}` as PlatformKey;
  } else if (platform.includes("linux")) {
    return `linux-${arch}` as PlatformKey;
  }

  throw new Error(`不支持的平台: ${platform}`);
}

/**
 * 当前插件系统支持的最高 API 版本
 */
export const CURRENT_API_VERSION = 2;

/**
 * 净化版本号，剥离预发布后缀
 * 例如: "0.6.3-alpha.9" -> "0.6.3"
 */
function cleanVersion(version: string): string {
  return version.split("-")[0];
}

/**
 * 校验插件兼容性（仅提示，不阻止加载）
 *
 * 将兼容性警告信息挂载到插件代理对象的 compatibilityWarning 属性上。
 * 应用版本不匹配 → 日志 warn + 轻量提示
 * 系统平台不匹配 → 日志 warn + 较显眼提示
 *
 * @param manifest 插件清单
 * @param proxy 插件代理对象（用于挂载警告信息）
 */
export function validatePluginCompatibility(
  manifest: PluginManifest,
  proxy: PluginProxy
): void {
  const { host, type } = manifest;
  const warnings: string[] = [];

  // 1. 校验应用版本 (appVersion)
  if (host?.appVersion) {
    const currentAppVersion = getAppContext().appVersion;
    const cleanCurrentVersion = cleanVersion(currentAppVersion);

    try {
      // 先用净化后的主版本号匹配
      const isCleanSatisfied = satisfies(cleanCurrentVersion, host.appVersion);
      if (!isCleanSatisfied) {
        // 主版本号都不满足，说明版本确实不够
        warnings.push(
          `应用版本可能不兼容。当前版本为 ${currentAppVersion}，插件推荐版本为 ${host.appVersion}`
        );
        logger.warn(`插件 ${manifest.id} 应用版本不兼容`, {
          currentVersion: currentAppVersion,
          cleanVersion: cleanCurrentVersion,
          required: host.appVersion,
        });
      } else {
        // 主版本号满足，但预发布版本可能不满足严格 semver
        try {
          const isStrictSatisfied = satisfies(
            currentAppVersion,
            host.appVersion
          );
          if (!isStrictSatisfied) {
            logger.info(`插件 ${manifest.id} 当前应用为预发布版本`, {
              currentVersion: currentAppVersion,
              required: host.appVersion,
            });
          }
        } catch {
          // 严格匹配失败忽略，不影响加载
        }
      }
    } catch (err) {
      logger.warn(`插件 ${manifest.id} 版本范围解析失败`, {
        appVersion: host.appVersion,
        err,
      });
    }
  }

  // 2. 校验 API 版本 (apiVersion)
  if (host?.apiVersion !== undefined) {
    if (host.apiVersion > CURRENT_API_VERSION) {
      warnings.push(
        `插件 API 版本可能不兼容。当前系统支持的最高 API 版本为 ${CURRENT_API_VERSION}，插件要求 API 版本为 ${host.apiVersion}`
      );
      logger.warn(`插件 ${manifest.id} API 版本不兼容`, {
        currentApiVersion: CURRENT_API_VERSION,
        requiredApiVersion: host.apiVersion,
      });
    }
  }

  // 3. 校验系统类型/平台兼容性
  let currentPlatform: PlatformKey;
  try {
    currentPlatform = getCurrentPlatform();
  } catch (err) {
    warnings.push(
      `无法识别当前操作系统平台: ${err instanceof Error ? err.message : String(err)}`
    );
    logger.warn(`插件 ${manifest.id} 无法识别当前平台`, { err });
    // 无法识别平台时，挂载警告并返回
    if (warnings.length > 0) {
      (proxy as any).compatibilityWarning = warnings.join("；");
    }
    return;
  }

  // 3.1 校验显式声明的 platforms 字段
  if (host?.platforms && host.platforms.length > 0) {
    if (!host.platforms.includes(currentPlatform)) {
      const supportedList = host.platforms.join(", ");
      warnings.push(
        `系统平台可能不兼容。当前平台为 ${currentPlatform}，插件支持的平台为: ${supportedList}`
      );
      logger.warn(`插件 ${manifest.id} 系统平台不兼容`, {
        currentPlatform,
        supportedPlatforms: host.platforms,
      });
    }
  }

  // 3.2 针对 native 和 sidecar 插件，自动校验是否包含当前平台的配置
  if (type === "native") {
    if (!manifest.native) {
      warnings.push(`原生插件缺少 native 配置块`);
      logger.warn(`插件 ${manifest.id} 缺少 native 配置块`);
    } else if (!manifest.native.library[currentPlatform]) {
      warnings.push(
        `原生插件缺少当前平台 (${currentPlatform}) 的二进制文件，可能无法正常工作`
      );
      logger.warn(`插件 ${manifest.id} 缺少当前平台的二进制文件`, {
        currentPlatform,
        availablePlatforms: Object.keys(manifest.native.library),
      });
    }
  } else if (type === "sidecar") {
    if (!manifest.sidecar) {
      warnings.push(`Sidecar 插件缺少 sidecar 配置块`);
      logger.warn(`插件 ${manifest.id} 缺少 sidecar 配置块`);
    } else if (!manifest.sidecar.executable[currentPlatform]) {
      warnings.push(
        `Sidecar 插件缺少当前平台 (${currentPlatform}) 的可执行文件，可能无法正常工作`
      );
      logger.warn(`插件 ${manifest.id} 缺少当前平台的可执行文件`, {
        currentPlatform,
        availablePlatforms: Object.keys(manifest.sidecar.executable),
      });
    }
  }

  // 挂载兼容性警告
  if (warnings.length > 0) {
    (proxy as any).compatibilityWarning = warnings.join("；");
  }
}

/**
 * 创建插件加载器实例
 */
export async function createPluginLoader(): Promise<PluginLoader> {
  const devMode = import.meta.env.DEV;

  // 无论开发模式还是生产模式，都配置生产插件目录
  // 开发模式下也可能需要测试生产插件的加载
  const appDataDir = await getAppConfigDir();
  const prodPluginsDir = await path.join(appDataDir, "plugins");

  return new PluginLoader({
    devMode,
    devPluginsDir: "/plugins",
    prodPluginsDir,
  });
}
