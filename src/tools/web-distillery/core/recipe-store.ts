import type { SiteRecipe } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { createConfigManager } from "@/utils/configManager";
import { minimatch } from "minimatch";

const logger = createModuleLogger("web-distillery/recipe-store");

export class RecipeStore {
  private static instance: RecipeStore;
  private recipes: SiteRecipe[] = [];
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
    if (this.isLoaded) return this.recipes;

    const config = await this.configManager.load();
    this.recipes = config.recipes || [];
    this.isLoaded = true;
    logger.info("Recipes loaded", { count: this.recipes.length });
    return this.recipes;
  }

  /** 保存所有配方 */
  private async save(): Promise<void> {
    await this.configManager.save({
      recipes: this.recipes,
    });
    logger.info("Recipes saved");
  }

  /** 获取所有配方 */
  public async getAll(): Promise<SiteRecipe[]> {
    await this.load();
    return this.recipes;
  }

  /** 根据 URL 匹配最有优势的配方 */
  public async findBestMatch(url: string): Promise<SiteRecipe | null> {
    await this.load();
    try {
      const target = new URL(url);
      const domain = target.hostname;
      const path = target.pathname;

      // 1. 过滤同域名的
      const candidates = this.recipes.filter((r) => r.domain === domain);
      if (candidates.length === 0) return null;

      // 2. 匹配 pathPattern (使用 glob)
      const patternMatches = candidates.filter((r) => {
        if (!r.pathPattern) return false;
        return minimatch(path, r.pathPattern);
      });

      if (patternMatches.length > 0) {
        return patternMatches[0];
      }

      // 3. 回退到仅域名匹配的（无 pathPattern 的）
      return candidates.find((r) => !r.pathPattern) || null;
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
      this.recipes[index] = { ...this.recipes[index], ...recipe, updatedAt: new Date().toISOString() };
    } else {
      this.recipes.push({
        ...recipe,
        createdAt: recipe.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
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
