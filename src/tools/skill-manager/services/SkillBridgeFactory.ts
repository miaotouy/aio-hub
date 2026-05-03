/**
 * SkillBridgeFactory — 桥接工厂
 *
 * 实现 ToolRegistryFactory 接口，从 SkillLoader 获取清单，
 * 为每个已启用的 Skill 创建 SkillProxy 实例。
 *
 * 参考 VcpBridgeFactory 的工厂模式设计。
 */
import { toolRegistryManager } from "@/services/registry";
import type { ToolRegistry, ToolRegistryFactory } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";
import type { SkillManifest } from "../types";
import { skillLoader } from "./SkillLoader";
import { SkillProxy } from "./SkillProxy";
import { skillManagerProxy } from "./SkillManagerProxy";
import { useSkillManagerStore } from "../stores/skillManagerStore";

const logger = createModuleLogger("skill-manager/bridge-factory");

export class SkillBridgeFactory implements ToolRegistryFactory {
  readonly factoryId = "skill-bridge";

  private skillManifests: SkillManifest[] = [];
  private isInitializing = false;
  private isRefreshing = false;

  /**
   * 实现 ToolRegistryFactory 接口
   * 返回每个已启用 Skill 的 SkillProxy 实例
   */
  async createRegistries(): Promise<ToolRegistry[]> {
    const store = useSkillManagerStore();

    // 确保配置已加载
    await store.loadConfig();

    // 如果 Skill 功能未启用，返回空数组
    if (!store.config.enabled) {
      return [];
    }

    // 首次调用时扫描清单
    if (this.skillManifests.length === 0) {
      await this.refreshManifests();
    }

    // 先返回系统级代理，再返回每个 Skill 的代理
    const registries: ToolRegistry[] = [skillManagerProxy];

    const skillRegistries = this.skillManifests
      .filter((m) => !store.config.disabledSkillIds.includes(m.name))
      .map((manifest) => new SkillProxy(manifest));

    registries.push(...skillRegistries);

    logger.info(
      `SkillBridgeFactory: 生成了 ${registries.length} 个工具（1 个系统代理 + ${skillRegistries.length} 个技能代理）`,
    );
    return registries;
  }

  /**
   * 刷新技能清单（重新扫描文件系统）
   */
  async refreshManifests(): Promise<void> {
    if (this.isInitializing) return;
    this.isInitializing = true;

    try {
      this.skillManifests = await skillLoader.scanAll();
      const store = useSkillManagerStore();
      store.setManifests(this.skillManifests);
      logger.info(`扫描到 ${this.skillManifests.length} 个技能`);
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * 触发完整的重新加载和注册
   */
  async refresh(): Promise<void> {
    if (this.isRefreshing || this.isInitializing) {
      logger.debug("SkillBridgeFactory 正在忙碌，跳过刷新");
      return;
    }

    this.isRefreshing = true;
    logger.info("正在刷新 Skill 桥接工具...");

    try {
      await this.refreshManifests();

      if (toolRegistryManager.hasFactory(this.factoryId)) {
        await toolRegistryManager.unregisterFactory(this.factoryId);
      }

      await toolRegistryManager.register(this);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 清理资源
   */
  async teardown(): Promise<void> {
    logger.info("正在清理 SkillBridgeFactory...");

    if (toolRegistryManager.hasFactory(this.factoryId)) {
      await toolRegistryManager.unregisterFactory(this.factoryId);
    }
    this.skillManifests = [];
  }
}

export const skillBridgeFactory = new SkillBridgeFactory();
