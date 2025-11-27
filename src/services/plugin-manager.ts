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
import { markRaw, h, type Component } from "vue";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { pluginStateService } from "./plugin-state.service";

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
 * 为插件创建图标组件
 *
 * @param pluginPath 插件安装路径（开发模式为 Vite 虚拟路径，生产模式为文件系统绝对路径）
 * @param iconConfig 图标配置（可以是 Emoji、SVG 路径或图片路径）
 */
async function createPluginIcon(pluginPath: string, iconConfig?: string): Promise<Component> {
  if (!iconConfig) {
    // 默认插件图标
    return markRaw({
      template:
        '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>',
    });
  }

  // 判断是否为 Emoji
  if (isEmoji(iconConfig)) {
    return markRaw({
      setup() {
        // 移除硬编码的 font-size，让 CSS 来控制
        return () => h("span", iconConfig);
      },
    });
  }

  // 处理文件路径（SVG 或图片）
  const isDevMode = pluginPath.startsWith("/plugins/");

  try {
    let iconUrl: string;

    if (isDevMode) {
      // 开发模式：直接使用 Vite 路径
      iconUrl = `${pluginPath}/${iconConfig}`;
    } else {
      // 生产模式：使用 convertFileSrc
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      const { join } = await import("@tauri-apps/api/path");

      const iconPath = await join(pluginPath, iconConfig);
      // 在 Windows 上，路径分隔符是 '\'，需要替换为 '/' 才能在 URL 中正常工作
      iconUrl = convertFileSrc(iconPath.replace(/\\/g, "/"), "plugin");
    }

    // 判断是 SVG 还是图片
    if (iconConfig.toLowerCase().endsWith(".svg")) {
      // SVG 图标：直接嵌入
      return markRaw({
        setup() {
          return () =>
            h("img", {
              src: iconUrl,
              style: "width: 1em; height: 1em; display: block;",
            });
        },
      });
    } else {
      // 其他图片格式
      return markRaw({
        setup() {
          return () =>
            h("img", {
              src: iconUrl,
              style: "width: 1.2em; height: 1.2em; border-radius: 2px; display: block;",
            });
        },
      });
    }
  } catch (error) {
    errorHandler.error(error, "创建插件图标失败", { context: { pluginPath, iconConfig } });
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
  const isDevMode = pluginPath.startsWith("plugins/");

  return async () => {
    try {
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
            `未找到插件组件: ${componentPath}\n可用组件: ${Array.from(window.__PLUGIN_COMPONENTS__.keys()).join(", ")}`
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
        // 生产模式：使用 convertFileSrc（保持原有逻辑）
        const { convertFileSrc } = await import("@tauri-apps/api/core");
        const { join } = await import("@tauri-apps/api/path");

        // 构建组件的完整路径
        const componentPath = await join(pluginPath, componentFile);

        logger.info("加载生产模式插件组件", {
          pluginPath,
          componentFile,
          fullPath: componentPath,
        });

        // 使用 convertFileSrc 将本地文件路径转换为可访问的 URL
        // 'plugin' 作为协议名称，确保与其他资源区分
        // 在 Windows 上，路径分隔符是 '\'，需要替换为 '/' 才能在 URL 中正常工作
        const componentUrl = convertFileSrc(componentPath.replace(/\\/g, "/"), "plugin");

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
      throw new Error(
        `加载插件组件失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };
}

/**
 * 从插件代理注册UI到工具store
 */
async function registerPluginUi(plugin: PluginProxy): Promise<void> {
  const { manifest, installPath } = plugin;

  if (!manifest.ui) {
    return; // 没有UI配置，跳过
  }

  const toolsStore = useToolsStore();

  // 创建插件图标
  const icon = await createPluginIcon(installPath, manifest.ui.icon);

  // 构造 ToolConfig 对象
  const toolConfig: ToolConfig = {
    name: manifest.ui.displayName || manifest.name,
    path: `/plugin-${manifest.id}`,
    icon,
    component: createPluginComponentLoader(installPath, manifest.ui.component),
    description: manifest.description,
    category: "插件工具",
  };

  toolsStore.addTool(toolConfig);

  logger.info(`插件UI已注册: ${manifest.id}`, {
    name: toolConfig.name,
    path: toolConfig.path,
    hasCustomIcon: !!manifest.ui.icon,
  });
}

/**
 * 从工具store移除插件UI
 */
function unregisterPluginUi(pluginId: string): void {
  const toolsStore = useToolsStore();
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
          // 只为启用的插件注册 UI
          if (plugin.enabled) {
            await registerPluginUi(plugin);
          } else {
            logger.info(`跳过禁用插件的UI注册: ${plugin.manifest.id}`);
          }
        } catch (error) {
          errorHandler.error(error, '注册插件UI失败', { context: { pluginId: plugin.manifest.id } });
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
      errorHandler.error(error, '移除插件UI失败', { context: { pluginId } });
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
    return allRegistries.filter(
      (registry): registry is PluginProxy => "manifest" in registry && "enabled" in registry
    );
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
              // 只为启用的插件注册 UI
              if (plugin.enabled) {
                await registerPluginUi(plugin);
              } else {
                logger.info(`跳过禁用插件的UI注册: ${plugin.manifest.id}`);
              }
            } catch (error) {
              errorHandler.error(error, '注册插件UI失败', { context: { pluginId: plugin.manifest.id } });
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
