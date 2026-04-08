/**
 * 插件管理服务
 *
 * 提供插件的加载、卸载等运行时管理功能
 */

import { toolRegistryManager } from "./registry";
import { createPluginLoader, PluginLoader } from "./plugin-loader";
import type { PluginProxy } from "./plugin-types";
import { useToolsStore } from "@/stores/tools";
import type { ToolConfig } from "@/services/types";
import { markRaw, h, ref, reactive, type Component } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { pluginStateService } from "./plugin-state.service";
import { pluginConfigService } from "./plugin-config.service";
import type { PluginContext, PluginStorageAPI } from "./plugin-types";
import { useContextPipelineStore } from "@/tools/llm-chat/stores/contextPipelineStore";
import { getAppConfigDir } from "@/utils/appPath";
import { emit, listen } from "@tauri-apps/api/event";

const logger = createModuleLogger("services/plugin-manager");
const errorHandler = createModuleErrorHandler("services/plugin-manager");

/**
 * 检查字符串是否为单个 Emoji
 */
function isEmoji(str: string): boolean {
  // 简单判断：长度较短且包含 emoji 范围的 Unicode
  const emojiRegex = /^[\p{Emoji}\p{Emoji_Component}]+$/u;
  return str.length <= 4 && emojiRegex.test(str);
}

/**
 * 解析插件图标 URL
 *
 * @param pluginPath 插件安装路径
 * @param iconConfig 图标配置
 */
export async function resolvePluginIconUrl(pluginPath: string, iconConfig?: string): Promise<string | undefined> {
  if (!iconConfig) return undefined;

  // 判断是否为 Emoji
  if (isEmoji(iconConfig)) return iconConfig;

  // 处理文件路径（SVG 或图片）
  const isDevMode = pluginPath.startsWith("/plugins") || pluginPath.startsWith("plugins");

  try {
    const { join } = await import("@tauri-apps/api/path");
    const { exists } = await import("@tauri-apps/plugin-fs");

    if (isDevMode) {
      // 开发模式：直接使用 Vite 路径
      // 确保路径以 / 开头
      const basePluginPath = pluginPath.startsWith("/") ? pluginPath : `/${pluginPath}`;
      return `${basePluginPath}/${iconConfig}`;
    } else {
      // 生产模式：处理图标路径
      // 注意：插件在构建后，public 目录下的资源通常会被移动到根目录
      let iconPath = await join(pluginPath, iconConfig);

      // 如果 manifest 中配置了 public/ 前缀，但在安装目录下找不到该文件，尝试去掉 public/ 前缀
      if (!(await exists(iconPath)) && iconConfig.startsWith("public/")) {
        const fallbackConfig = iconConfig.replace("public/", "");
        const fallbackPath = await join(pluginPath, fallbackConfig);
        if (await exists(fallbackPath)) {
          iconPath = fallbackPath;
        }
      }

      // 返回本地绝对路径，让 Avatar 组件通过 read_file_binary 处理
      return iconPath;
    }
  } catch (error) {
    logger.error("解析插件图标 URL 失败", error, { pluginPath, iconConfig });
    return undefined;
  }
}

/**
 * 为插件创建图标组件
 *
 * @param pluginPath 插件安装路径（开发模式为 Vite 虚拟路径，生产模式为文件系统绝对路径）
 * @param iconConfig 图标配置（可以是 Emoji、SVG 路径或图片路径）
 */
async function createPluginIcon(pluginPath: string, iconConfig?: string): Promise<Component> {
  try {
    const iconUrl = await resolvePluginIconUrl(pluginPath, iconConfig);

    if (!iconUrl) {
      // 默认插件图标
      return markRaw({
        setup() {
          return () =>
            h("svg", { viewBox: "0 0 24 24", style: "width: 1em; height: 1em;" }, [
              h("path", {
                fill: "currentColor",
                d: "M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z",
              }),
            ]);
        },
      });
    }

    // 判断是否为 Emoji
    if (isEmoji(iconUrl)) {
      return markRaw({
        setup() {
          return () => h("span", { style: "line-height: 1;" }, iconUrl);
        },
      });
    }

    // 对于图片（SVG 或普通图片），我们需要处理本地路径加载问题
    // 生产模式下，iconUrl 可能是 C:\... 绝对路径，直接用 img 标签会报错
    return markRaw({
      setup() {
        const processedSrc = ref("");

        // 异步转换路径
        const init = async () => {
          // 判断是否为本地绝对路径 (Windows)
          const isLocalPath = /^[a-zA-Z]:[\\/]/.test(iconUrl) || iconUrl.startsWith("\\\\");
          if (isLocalPath) {
            const { convertFileSrc } = await import("@tauri-apps/api/core");
            processedSrc.value = convertFileSrc(iconUrl);
          } else {
            processedSrc.value = iconUrl;
          }
        };

        init();

        return () => {
          if (!processedSrc.value) return h("div", { style: "width: 1em; height: 1em;" });

          return h("img", {
            src: processedSrc.value,
            style: {
              width: "1em",
              height: "1em",
              display: "block",
              objectFit: "contain",
              borderRadius: "2px",
            },
          });
        };
      },
    });
  } catch (error) {
    errorHandler.error(error, "创建插件图标失败", {
      context: { pluginPath, iconConfig },
    });
    // 返回默认图标
    return markRaw({
      template:
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>',
    });
  }
}

/**
 * 为插件创建组件加载函数
 *
 * 开发模式：支持 .vue 文件，通过 Vite 的 import.meta.glob 动态导入，享受 HMR
 * 生产模式：仅支持编译后的 .js/.mjs 文件，通过 convertFileSrc 加载
 *
 * @param pluginPath 插件安装路径（开发模式为 Vite 虚拟路径，生产模式为文件系统绝对路径）
 * @param componentFile 组件文件相对于插件根目录的路径（例如 "MyComponent.vue" 或 "dist/MyComponent.js"）
 */
function createPluginComponentLoader(pluginPath: string, componentFile: string) {
  // 判断是否为开发模式插件（路径以 plugins/ 开头）
  const isDevMode = pluginPath.startsWith("/plugins") || pluginPath.startsWith("plugins");

  return async () => {
    try {
      const { join } = await import("@tauri-apps/api/path");

      if (isDevMode) {
        // 开发模式：从 window.__PLUGIN_COMPONENTS__ 获取组件加载器
        const componentPath = `/${pluginPath}/${componentFile}`;

        logger.info("加载开发模式插件组件", {
          pluginPath,
          componentFile,
          componentPath,
        });

        // 检查组件是否已被 glob 扫描
        if (!window.__PLUGIN_COMPONENTS__) {
          throw new Error("插件组件注册表未初始化");
        }

        const componentLoader = window.__PLUGIN_COMPONENTS__.get(componentPath);
        if (!componentLoader) {
          throw new Error(
            `未找到插件组件: ${componentPath}\n可用组件: ${Array.from(window.__PLUGIN_COMPONENTS__.keys()).join(", ")}`,
          );
        }

        // 使用 Vite 的动态导入（享受 HMR）
        const module = await componentLoader();

        if (!module.default) {
          throw new Error(`插件组件 ${componentFile} 必须有默认导出`);
        }

        logger.info("插件组件加载成功（开发模式，支持 HMR）", { componentFile });

        return module.default;
      } else {
        // 生产模式：使用 convertFileSrc
        const { convertFileSrc } = await import("@tauri-apps/api/core");

        // 自动修正：如果组件文件名以 .vue 结尾，尝试寻找同名的 .js
        let finalComponentFile = componentFile;
        if (componentFile.endsWith(".vue")) {
          finalComponentFile = componentFile.replace(/\.vue$/, ".js");
        }

        // 尝试加载配套的 CSS
        try {
          const stylePath = await join(pluginPath, "style.css");
          const { exists } = await import("@tauri-apps/plugin-fs");
          if (await exists(stylePath)) {
            const styleUrl = convertFileSrc(stylePath.replace(/\\/g, "/"));
            if (!document.querySelector(`link[href="${styleUrl}"]`)) {
              const link = document.createElement("link");
              link.rel = "stylesheet";
              link.href = styleUrl;
              document.head.appendChild(link);
              logger.info("已加载插件样式表", { styleUrl });
            }
          }
        } catch (e) {
          logger.warn("尝试加载插件样式表失败", e);
        }

        // 直接使用插件根目录下的组件文件
        const componentPath = await join(pluginPath, finalComponentFile);

        logger.info("加载生产模式插件组件", {
          pluginPath,
          componentFile: finalComponentFile,
          fullPath: componentPath,
        });

        // 使用 convertFileSrc 将本地文件路径转换为可访问的 URL
        const componentUrl = convertFileSrc(componentPath.replace(/\\/g, "/"));

        logger.info("插件组件 URL 已生成", { componentUrl });

        // 动态导入 ESM 模块
        const module = await import(/* @vite-ignore */ componentUrl);

        if (!module.default) {
          throw new Error(`插件组件 ${componentFile} 必须有默认导出`);
        }

        logger.info("插件组件加载成功（生产模式）", { componentFile });

        return module.default;
      }
    } catch (error) {
      errorHandler.error(error, "插件组件加载失败", {
        context: {
          pluginPath,
          componentFile,
        },
      });
      throw new Error(`加载插件组件失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
}

/**
 * 从插件代理注册UI到工具store
 */
async function registerPluginUi(plugin: PluginProxy): Promise<void> {
  const { manifest, installPath, id: pluginId } = plugin;

  if (!manifest.ui) {
    return; // 没有UI配置，跳过
  }

  const toolsStore = useToolsStore();

  // 创建插件图标
  const icon = await createPluginIcon(installPath, manifest.ui.icon);

  // 构造 ToolConfig 对象
  const toolConfig: ToolConfig = {
    name: manifest.ui.displayName || manifest.name,
    // 使用 pluginId 而不是 manifest.id，以区分开发版和生产版
    path: `/plugin-${pluginId}`,
    icon,
    component: createPluginComponentLoader(installPath, manifest.ui.component),
    description: manifest.description,
    category: "插件工具",
  };

  toolsStore.addTool(toolConfig);

  logger.info(`插件UI已注册: ${pluginId}`, {
    name: toolConfig.name,
    path: toolConfig.path,
    hasCustomIcon: !!manifest.ui.icon,
  });
}
/**
 * 从工具store移除插件UI
 */
export function unregisterPluginUi(pluginId: string): void {
  const toolsStore = useToolsStore();
  // 注意：这里的 pluginId 应该是带后缀的（如果是开发版）
  const toolPath = `/plugin-${pluginId}`;

  toolsStore.removeTool(toolPath);

  logger.info(`插件UI已移除: ${pluginId}`, { path: toolPath });
}

/**
 * 插件管理器类
 */
class PluginManager {
  private loader: PluginLoader | null = null;
  private initialized = false;

  // 响应式插件状态追踪
  public pluginStates = reactive<Record<string, { enabled: boolean; isBroken: boolean }>>({});

  constructor() {
    // 构造函数中不再创建 context，延迟到使用时
  }

  /**
   * 创建插件专属的存储 API
   * @param pluginId 插件 ID
   */
  private async createPluginStorageAPI(pluginId: string): Promise<PluginStorageAPI> {
    const { join } = await import("@tauri-apps/api/path");
    const fs = await import("@tauri-apps/plugin-fs");

    // 获取应用配置目录
    const appConfigDir = await getAppConfigDir();
    // 插件数据根目录：appDataDir/plugins-data/pluginId
    const dataDir = await join(appConfigDir, "plugins-data", pluginId);

    // 内部辅助函数：确保目录存在并返回完整路径
    const resolvePath = async (subPath: string) => {
      // 确保基础目录存在
      if (!(await fs.exists(dataDir))) {
        await fs.mkdir(dataDir, { recursive: true });
      }
      return await join(dataDir, subPath);
    };

    return {
      getDataDir: async () => {
        if (!(await fs.exists(dataDir))) {
          await fs.mkdir(dataDir, { recursive: true });
        }
        return dataDir;
      },
      readText: async (path: string) => {
        const fullPath = await resolvePath(path);
        return await fs.readTextFile(fullPath);
      },
      readBinary: async (path: string) => {
        const fullPath = await resolvePath(path);
        return await fs.readFile(fullPath);
      },
      writeText: async (path: string, data: string) => {
        const fullPath = await resolvePath(path);
        // 确保父目录存在
        const parentDir = fullPath.substring(
          0,
          fullPath.lastIndexOf(/[/\\]/.test(fullPath) ? fullPath.match(/[/\\]/)![0] : ""),
        );
        if (parentDir && parentDir !== dataDir && !(await fs.exists(parentDir))) {
          await fs.mkdir(parentDir, { recursive: true });
        }
        await fs.writeTextFile(fullPath, data);
      },
      writeBinary: async (path: string, data: Uint8Array | ArrayBuffer) => {
        const fullPath = await resolvePath(path);
        const uint8Data = data instanceof Uint8Array ? data : new Uint8Array(data);
        await fs.writeFile(fullPath, uint8Data);
      },
      exists: async (path: string) => {
        const fullPath = await resolvePath(path);
        return await fs.exists(fullPath);
      },
      remove: async (path: string) => {
        const fullPath = await resolvePath(path);
        if (await fs.exists(fullPath)) {
          // 判断是文件还是目录
          const metadata = await fs.stat(fullPath);
          if (metadata.isDirectory) {
            await fs.remove(fullPath, { recursive: true });
          } else {
            await fs.remove(fullPath);
          }
        }
      },
      readDir: async (path: string) => {
        const fullPath = await resolvePath(path);
        const entries = await fs.readDir(fullPath);
        return entries.map((e) => ({
          name: e.name,
          isDirectory: e.isDirectory,
        }));
      },
    };
  }

  /**
   * 创建注入给插件的上下文对象
   * @param pluginId 插件 ID
   */
  public createPluginContext(pluginId: string): PluginContext {
    // 在方法内部获取 store 实例，确保 Pinia 已初始化
    const contextPipelineStore = useContextPipelineStore();

    // 预创建 storage（由于 context 接口不能是 Promise，我们通过 Proxy 或延迟加载来处理，
    // 或者直接在这里使用已经初始化的 storage，但 createPluginContext 往往是同步调用的。
    // 为了保持兼容性，我们返回一个包含异步方法的 storage 对象）
    const storagePromise = this.createPluginStorageAPI(pluginId);

    return {
      settings: pluginConfigService.createPluginSettingsAPI(pluginId),
      storage: {
        getDataDir: async () => (await storagePromise).getDataDir(),
        readText: async (path) => (await storagePromise).readText(path),
        readBinary: async (path) => (await storagePromise).readBinary(path),
        writeText: async (path, data) => (await storagePromise).writeText(path, data),
        writeBinary: async (path, data) => (await storagePromise).writeBinary(path, data),
        exists: async (path) => (await storagePromise).exists(path),
        remove: async (path) => (await storagePromise).remove(path),
        readDir: async (path) => (await storagePromise).readDir(path),
      },
      chat: {
        registerProcessor: (processor: any) => {
          logger.info(`插件正在注册上下文处理器: ${processor.id} (Plugin: ${pluginId})`);
          contextPipelineStore.registerProcessor(processor);
        },
        unregisterProcessor: (processorId: string) => {
          logger.info(`插件正在注销上下文处理器: ${processorId} (Plugin: ${pluginId})`);
          contextPipelineStore.unregisterProcessor(processorId);
        },
      },
    };
  }

  /**
   * 初始化插件管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn("插件管理器已初始化");
      return;
    }

    logger.info("初始化插件管理器");

    // 初始化插件状态服务
    await pluginStateService.initialize();

    // 监听来自其他窗口的状态变更
    listen<{ pluginId: string; enabled: boolean }>("plugin-runtime-state-changed", (event) => {
      const { pluginId, enabled } = event.payload;
      logger.info(`收到跨窗口插件状态变更: ${pluginId} -> ${enabled}`);
      this.updateRuntimeState(pluginId, enabled, true);
    }).catch((err) => {
      logger.error("监听插件状态变更失败", err);
    });

    this.loader = await createPluginLoader();
    this.initialized = true;
  }

  /**
   * 加载所有插件
   */
  async loadAllPlugins(): Promise<void> {
    if (!this.loader) {
      throw new Error("插件管理器未初始化");
    }

    const result = await this.loader.loadAll();

    // 注册加载成功的插件到工具注册表
    if (result.plugins.length > 0) {
      await toolRegistryManager.register(...result.plugins);

      // 注册插件UI（仅为启用的插件注册）
      for (const plugin of result.plugins) {
        try {
          // 预先解析图标 URL
          plugin.iconUrl = await resolvePluginIconUrl(plugin.installPath, plugin.manifest.icon);

          // 初始化响应式状态
          const isBroken = (plugin as any).isBroken || false;

          // 根据持久化状态决定是否激活插件
          const shouldEnable = await pluginStateService.isEnabled(plugin.id);
          if (shouldEnable && !isBroken) {
            logger.info(`正在激活插件: ${plugin.id}`);
            await plugin.enable(this.createPluginContext(plugin.id));
          }

          this.pluginStates[plugin.id] = {
            enabled: plugin.enabled,
            isBroken,
          };

          // 注意：plugin.enable() 内部已经调用了 updateRuntimeState()，
          // updateRuntimeState() 已经负责了 registerPluginUi()。
          // 这里不需要再次手动注册，除非插件是禁用的。
          if (!plugin.enabled || isBroken) {
            logger.info(`跳过禁用或损坏插件的UI注册: ${plugin.id}`, {
              enabled: plugin.enabled,
              isBroken,
            });
          }
        } catch (error) {
          errorHandler.error(error, "注册插件UI失败", {
            context: { pluginId: plugin.manifest.id },
          });
        }
      }
    }

    if (result.failed.length > 0) {
      logger.warn(`${result.failed.length} 个插件加载失败`, {
        failed: result.failed.map((f) => ({ id: f.id, error: f.error.message })),
      });
    }
  }

  /**
   * 更新插件的运行状态（由适配器调用）
   * @internal
   * @param isRemote 是否为来自其他窗口的远程同步更新
   */
  public async updateRuntimeState(pluginId: string, enabled: boolean, isRemote: boolean = false): Promise<void> {
    // 防止状态未改变时的重复处理（以及潜在的死循环）
    if (this.pluginStates[pluginId] && this.pluginStates[pluginId].enabled === enabled) {
      return;
    }

    if (this.pluginStates[pluginId]) {
      this.pluginStates[pluginId].enabled = enabled;
    } else {
      this.pluginStates[pluginId] = { enabled, isBroken: false };
    }

    const plugin = this.getPlugin(pluginId);

    // 如果是远程更新，或者状态不一致，同步插件实例的启用状态
    if (plugin && plugin.enabled !== enabled) {
      if (enabled) {
        await plugin.enable(this.createPluginContext(pluginId));
      } else {
        await plugin.disable();
      }
    }

    // 处理 UI 注册/注销
    if (!enabled) {
      unregisterPluginUi(pluginId);
    } else if (plugin && !this.isUiRegistered(pluginId)) {
      registerPluginUi(plugin);
    }

    // 如果不是来自远程的更新（即本窗口发起的），则广播给其他窗口
    if (!isRemote) {
      emit("plugin-runtime-state-changed", { pluginId, enabled }).catch((err) => {
        logger.error("广播插件状态失败", err);
      });
    }
  }

  /**
   * 检查插件 UI 是否已注册
   */
  private isUiRegistered(pluginId: string): boolean {
    const toolsStore = useToolsStore();
    return toolsStore.tools.some((t) => t.path === `/plugin-${pluginId}`);
  }

  /**
   * 卸载插件
   * @param pluginId 插件 ID
   * @param silent 是否静默卸载（不显示确认弹窗），主要用于升级/降级流程
   */
  async uninstallPlugin(pluginId: string, silent: boolean = false): Promise<void> {
    if (!this.loader) {
      throw new Error("插件管理器未初始化");
    }

    logger.info(`开始卸载插件: ${pluginId}`, { silent });

    // 1. 移除插件UI
    try {
      unregisterPluginUi(pluginId);
    } catch (error) {
      errorHandler.error(error, "移除插件UI失败", { context: { pluginId } });
    }

    // 2. 从工具注册表注销
    const unregistered = await toolRegistryManager.unregister(pluginId);
    if (!unregistered) {
      logger.warn(`插件 ${pluginId} 未在工具注册表中找到`);
    }

    // 3. 删除插件文件到回收站
    await this.loader.uninstall(pluginId);

    logger.info(`插件 ${pluginId} 卸载完成`);
  }
  /**
   * 获取所有已安装的插件
   */
  getInstalledPlugins(): PluginProxy[] {
    const allRegistries = toolRegistryManager.getAllTools();

    // 过滤出插件（检查是否有 manifest 属性）
    return allRegistries.filter((registry): registry is PluginProxy => "manifest" in registry && "enabled" in registry);
  }

  /**
   * 检查插件是否已安装
   */
  isPluginInstalled(pluginId: string): boolean {
    return toolRegistryManager.hasTool(pluginId);
  }

  /**
   * 获取插件信息
   * @param pluginId 插件 ID
   * @returns 插件代理对象，如果不存在则返回 undefined
   */
  getPlugin(pluginId: string): PluginProxy | undefined {
    try {
      const registry = toolRegistryManager.getRegistry(pluginId);
      if ("manifest" in registry && "enabled" in registry) {
        return registry as PluginProxy;
      }
    } catch {
      // 工具不存在
    }
    return undefined;
  }

  /**
   * 从 ZIP 文件安装插件
   * @param zipPath ZIP 文件路径
   * @returns 安装结果
   */
  async installPluginFromZip(zipPath: string): Promise<{
    pluginId: string;
    pluginName: string;
    version: string;
    installPath: string;
  }> {
    logger.info(`开始从 ZIP 文件安装插件: ${zipPath}`);

    try {
      // 调用后端命令安装插件
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{
        pluginId: string;
        pluginName: string;
        version: string;
        installPath: string;
      }>("install_plugin_from_zip", { zipPath });

      logger.info(`插件安装成功`, result);

      // 重新加载插件
      if (this.loader) {
        const loadResult = await this.loader.loadAll();

        // 注册新加载的插件
        if (loadResult.plugins.length > 0) {
          await toolRegistryManager.register(...loadResult.plugins);

          // 注册插件UI（仅为启用的插件注册）
          for (const plugin of loadResult.plugins) {
            try {
              // 预先解析图标 URL
              plugin.iconUrl = await resolvePluginIconUrl(plugin.installPath, plugin.manifest.icon);

              // 激活插件
              const shouldEnable = await pluginStateService.isEnabled(plugin.id);
              if (shouldEnable) {
                await plugin.enable(this.createPluginContext(plugin.id));
              }

              // 只为启用的插件注册 UI
              if (plugin.enabled) {
                await registerPluginUi(plugin);
              } else {
                logger.info(`跳过禁用插件的UI注册: ${plugin.id}`);
              }
            } catch (error) {
              errorHandler.error(error, "注册插件UI失败", {
                context: { pluginId: plugin.manifest.id },
              });
            }
          }
        }
      }

      return result;
    } catch (error) {
      errorHandler.error(error, `从 ZIP 安装插件失败`);
      throw error;
    }
  }
}

// 导出单例实例
export const pluginManager = new PluginManager();
