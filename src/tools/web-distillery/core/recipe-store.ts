import type { SiteRecipe } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { getLocalISOString } from "@/utils/time";
import { createConfigManager } from "@/utils/configManager";
import { minimatch } from "minimatch";
import { builtinRecipes } from "./builtin-recipes";

const logger = createModuleLogger("web-distillery/recipe-store");

export class RecipeStore {
  private static instance: RecipeStore;
  private recipes: SiteRecipe[] = []; // 用户自定义配方
  private allRecipes: SiteRecipe[] = []; // 合并后的所有配方
  private isLoaded = false;
  private configManager = createConfigManager<Record<string, any>>({
    moduleName: "web-distillery",
    fileName: "recipes.json",
    createDefault: () => ({
      recipes: [],
    }),
  });

  private constructor() {}

  public static getInstance(): RecipeStore {
    if (!RecipeStore.instance) {
      RecipeStore.instance = new RecipeStore();
    }
    return RecipeStore.instance;
  }

  /** 加载所有配方 */
  public async load(): Promise<SiteRecipe[]> {
    if (this.isLoaded) return this.allRecipes;

    const config = await this.configManager.load();
    this.recipes = config.recipes || [];

    // 合并内置配方
    this.mergeRecipes();

    this.isLoaded = true;
    logger.info("Recipes loaded", {
      userCount: this.recipes.length,
      totalCount: this.allRecipes.length,
    });
    return this.allRecipes;
  }

  /** 合并用户配方与内置配方 */
  private mergeRecipes(): void {
    // 基础是内置配方
    const merged = [...builtinRecipes];

    // 用户配方覆盖内置配方 (如果 domain + pathPattern 相同)
    for (const userRecipe of this.recipes) {
      const index = merged.findIndex((r) => r.domain === userRecipe.domain && r.pathPattern === userRecipe.pathPattern);

      if (index >= 0) {
        // 替换内置配方
        merged[index] = userRecipe;
      } else {
        // 新增用户配方
        merged.push(userRecipe);
      }
    }

    this.allRecipes = merged;
  }

  /** 保存所有配方 */
  private async save(): Promise<void> {
    await this.configManager.save({
      recipes: this.recipes,
    });
    logger.info("Recipes saved");
  }

  /** 获取所有配方 (包含内置和用户自定义) */
  public async getAll(): Promise<SiteRecipe[]> {
    await this.load();
    return this.allRecipes;
  }

  /** 根据 URL 匹配最有优势的配方 */
  public async findBestMatch(url: string, content?: string): Promise<SiteRecipe | null> {
    await this.load();
    try {
      const isLocalFile = url.startsWith("file://");
      const target = new URL(url);
      const domain = target.hostname;
      const path = target.pathname;

      // 1. 基于 URL 寻找候选配方
      const candidates = this.allRecipes.filter((r) => {
        if (r.disabled) return false;

        // 如果是本地文件，且配方没有指定 domain 或者 domain 匹配了 path 中的关键字
        if (isLocalFile) {
          return !r.domain || path.toLowerCase().includes(r.domain.toLowerCase());
        }

        return r.domain === domain;
      });

      // 2. 匹配 pathPattern (使用 glob)
      const patternMatches = candidates.filter((r) => {
        if (!r.pathPattern) return false;
        return minimatch(path, r.pathPattern, { nocase: true });
      });

      if (patternMatches.length > 0) {
        return patternMatches[0];
      }

      // 3. 回退到仅域名匹配的（无 pathPattern 的）
      const domainMatch = candidates.find((r) => !r.pathPattern);
      if (domainMatch) return domainMatch;

      // 4. 内容嗅探 (Content Sniffing) - 特别针对本地文件或 URL 匹配失败的情况
      if (content) {
        const contentMatch = this.allRecipes.find((r) => {
          if (r.disabled || !r.contentPatterns?.length) return false;
          return r.contentPatterns.some((pattern) => {
            try {
              const regex = new RegExp(pattern, "i");
              return regex.test(content);
            } catch (e) {
              return content.includes(pattern);
            }
          });
        });
        if (contentMatch) {
          logger.info("Matched recipe via content sniffing", { id: contentMatch.id, name: contentMatch.name });
          return contentMatch;
        }
      }

      return null;
    } catch (e) {
      logger.error("Failed to match recipe", e, { url });
      return null;
    }
  }

  /** 新增或更新配方 */
  public async upsert(recipe: SiteRecipe): Promise<void> {
    await this.load();
    const index = this.recipes.findIndex((r) => r.id === recipe.id);
    if (index >= 0) {
      this.recipes[index] = { ...this.recipes[index], ...recipe, updatedAt: getLocalISOString() };
    } else {
      // 检查是否是内置配方的 ID
      const isBuiltin = recipe.id.startsWith("builtin-");
      if (isBuiltin) {
        // 内置配方通常只更新状态（如 disabled）
        this.recipes.push({
          ...recipe,
          updatedAt: getLocalISOString(),
        });
      } else {
        this.recipes.push({
          ...recipe,
          createdAt: recipe.createdAt || getLocalISOString(),
          updatedAt: getLocalISOString(),
        });
      }
    }

    this.mergeRecipes(); // 重新合并
    await this.save();
  }

  /** 删除配方 */
  public async delete(id: string): Promise<void> {
    await this.load();
    this.recipes = this.recipes.filter((r) => r.id !== id);
    await this.save();
  }
}

export const recipeStore = RecipeStore.getInstance();
