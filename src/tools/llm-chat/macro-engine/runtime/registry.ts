// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { MacroPhase, MacroType, type MacroDefinition } from "./definitions";
import type { ContextLogger } from "../../core/pipeline/ports";

/** Owner-local registry; Renderer supplies its reactive map wrapper. */
export function createMacroRegistryRuntime({
  logger,
  wrapRegistryMap,
}: {
  logger: ContextLogger;
  wrapRegistryMap(
    map: Map<string, MacroDefinition>
  ): Map<string, MacroDefinition>;
}) {
  /**
   * 宏注册中心（单例）
   */
  class MacroRegistry {
    private static instance: MacroRegistry;
    private macros: Map<string, MacroDefinition> = wrapRegistryMap(new Map());
    private constructor() {}

    /**
     * 获取单例实例
     */
    static getInstance(): MacroRegistry {
      if (!MacroRegistry.instance) {
        MacroRegistry.instance = new MacroRegistry();
      }
      return MacroRegistry.instance;
    }

    /**
     * 注册宏
     */
    register(macro: MacroDefinition): void {
      if (this.macros.has(macro.name)) {
        logger.warn("宏已存在，将被覆盖", { name: macro.name });
      }
      this.macros.set(macro.name, macro);
      // logger.debug('注册宏', { name: macro.name, type: macro.type, phase: macro.phase });
    }

    /**
     * 批量注册宏
     */
    registerMany(macros: MacroDefinition[]): void {
      macros.forEach((macro) => {
        if (this.macros.has(macro.name)) {
          logger.warn("宏已存在，将被覆盖", { name: macro.name });
        }
        this.macros.set(macro.name, macro);
      });

      logger.debug("批量注册宏", {
        count: macros.length,
        names: macros.map((m) => m.name),
      });
    }

    /**
     * 获取宏定义
     */
    getMacro(name: string): MacroDefinition | undefined {
      return this.macros.get(name);
    }

    /**
     * 获取所有宏
     */
    getAllMacros(): MacroDefinition[] {
      return Array.from(this.macros.values());
    }

    /**
     * 按阶段获取宏
     */
    getMacrosByPhase(phase: MacroPhase): MacroDefinition[] {
      return Array.from(this.macros.values()).filter((m) => m.phase === phase);
    }

    /**
     * 按类型获取宏
     */
    getMacrosByType(type: MacroType): MacroDefinition[] {
      return Array.from(this.macros.values()).filter((m) => m.type === type);
    }

    /**
     * 检查宏是否存在
     */
    hasMacro(name: string): boolean {
      return this.macros.has(name);
    }

    /**
     * 取消注册宏
     */
    unregister(name: string): boolean {
      const existed = this.macros.has(name);
      if (existed) {
        this.macros.delete(name);
        logger.debug("取消注册宏", { name });
      }
      return existed;
    }

    /**
     * 清空所有宏
     */
    clear(): void {
      this.macros.clear();
      logger.info("清空所有宏注册");
    }

    /**
     * 获取宏数量
     */
    get count(): number {
      return this.macros.size;
    }
  }

  /**
   * 获取全局宏注册中心实例
   */
  function getMacroRegistry(): MacroRegistry {
    return MacroRegistry.getInstance();
  }
  return { MacroRegistry, getMacroRegistry };
}
