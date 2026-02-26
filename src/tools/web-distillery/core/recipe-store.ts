import { BaseDirectory, readFile, writeFile, mkdir } from "@tauri-apps/plugin-fs";
import type { SiteRecipe } from "../types";
import { createModuleLogger } from "@/utils/logger";
import { minimatch } from "minimatch";

const logger = createModuleLogger("web-distillery/recipe-store");
const RECIPE_FILE = "web-distillery/recipes.json";

export class RecipeStore {
  private static instance: RecipeStore;
  private recipes: SiteRecipe[] = [];
  private isLoaded = false;

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

    try {
      // 确保目录存在
      await mkdir("web-distillery", { baseDir: BaseDirectory.AppData, recursive: true });

      const content = await readFile(RECIPE_FILE, { baseDir: BaseDirectory.AppData });
      const decoder = new TextDecoder();
      this.recipes = JSON.parse(decoder.decode(content));
      this.isLoaded = true;
      logger.info("Recipes loaded", { count: this.recipes.length });
    } catch (e) {
      // 如果文件不存在，初始化为空数组
      this.recipes = [];
      this.isLoaded = true;
      logger.warn("No recipes found, initializing empty");
    }
    return this.recipes;
  }

  /** 保存所有配方 */
  private async save(): Promise<void> {
    try {
      const encoder = new TextEncoder();
      const content = encoder.encode(JSON.stringify(this.recipes, null, 2));
      await writeFile(RECIPE_FILE, content, { baseDir: BaseDirectory.AppData });
      logger.info("Recipes saved");
    } catch (e) {
      logger.error("Failed to save recipes", e);
    }
  }

  /** 获取所有配方 */
  public async getAll(): Promise<SiteRecipe[]> {
    await this.load();
    return this.recipes;
  }

  /** 根据 URL 匹配最有优势的配方 */
  public async findBestMatch(url: string): Promise<SiteRecipe | null> {
    await this.load();
    const target = new URL(url);
    const domain = target.hostname;
    const path = target.pathname;

    // 1. 过滤同域名的
    const candidates = this.recipes.filter((r) => r.domain === domain);
    if (candidates.length === 0) return null;

    // 2. 匹配 pathPattern (使用 glob)
    // 优先选择有 pathPattern 且匹配中的
    const patternMatches = candidates.filter((r) => {
      if (!r.pathPattern) return false;
      return minimatch(path, r.pathPattern);
    });

    if (patternMatches.length > 0) {
      // 进一步选择最匹配的（例如 pattern 最长的，这里简单取第一个）
      return patternMatches[0];
    }

    // 3. 回退到仅域名匹配的（无 pathPattern 的）
    return candidates.find((r) => !r.pathPattern) || null;
  }

  /** 新增或更新配方 */
  public async upsert(recipe: SiteRecipe): Promise<void> {
    await this.load();
    const index = this.recipes.findIndex((r) => r.id === recipe.id);
    if (index >= 0) {
      this.recipes[index] = { ...this.recipes[index], ...recipe, updatedAt: new Date().toISOString() };
    } else {
      this.recipes.push(recipe);
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
