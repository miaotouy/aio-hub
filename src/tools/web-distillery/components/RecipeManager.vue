<script setup lang="ts">
import { ref, onMounted, computed } from "vue";
import { recipeStore } from "../core/recipe-store";
import type { SiteRecipe } from "../types";
import { Search, Trash, Edit, Globe, Calendar, Activity, ChevronRight } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { useWebDistilleryStore } from "../stores/store";

const store = useWebDistilleryStore();
const recipes = ref<SiteRecipe[]>([]);
const searchText = ref("");
const isLoading = ref(false);

async function loadRecipes() {
  isLoading.value = true;
  recipes.value = await recipeStore.getAll();
  isLoading.value = false;
}

onMounted(loadRecipes);

const filteredRecipes = computed(() => {
  if (!searchText.value) return recipes.value;
  const lower = searchText.value.toLowerCase();
  return recipes.value.filter((r) => r.name.toLowerCase().includes(lower) || r.domain.toLowerCase().includes(lower));
});

async function deleteRecipe(id: string) {
  try {
    await recipeStore.delete(id);
    await loadRecipes();
    customMessage.success("配方已删除");
  } catch (e) {
    customMessage.error("删除失败");
  }
}

function editRecipe(recipe: SiteRecipe) {
  store.setCurrentRecipe(recipe);
  store.setInteractiveMode(true);
  // 这里逻辑上应该切换到 Workbench 视图并开启编辑
  // 简便起见，先设置 store 状态
  customMessage.info(`正在加载配方: ${recipe.name}`);
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString();
}
</script>

<template>
  <div class="recipe-manager">
    <div class="manager-header">
      <div class="header-content">
        <h2>站点配方库</h2>
        <p>管理已保存的自动化提取规则与动作序列</p>
      </div>
      <div class="search-bar">
        <el-input v-model="searchText" placeholder="搜索域名或配方名称..." clearable>
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>
    </div>

    <div class="manager-body" v-loading="isLoading">
      <div v-if="filteredRecipes.length === 0" class="empty-state">
        <div class="empty-icon">📂</div>
        <h3>暂无配方</h3>
        <p>在"蒸馏工作台"开启 Level 2 交互模式即可创建配方</p>
      </div>

      <div v-else class="recipe-grid">
        <div v-for="recipe in filteredRecipes" :key="recipe.id" class="recipe-card">
          <div class="card-header">
            <div class="recipe-info">
              <h3 class="recipe-name">{{ recipe.name }}</h3>
              <div class="recipe-domain">
                <Globe :size="12" />
                <span>{{ recipe.domain }}</span>
                <span v-if="recipe.pathPattern" class="path-pattern">{{ recipe.pathPattern }}</span>
              </div>
            </div>
            <div class="card-actions">
              <el-button size="small" circle @click="editRecipe(recipe)">
                <Edit :size="14" />
              </el-button>
              <el-popconfirm title="确定删除此配方吗？" @confirm="deleteRecipe(recipe.id)">
                <template #reference>
                  <el-button size="small" type="danger" circle>
                    <Trash :size="14" />
                  </el-button>
                </template>
              </el-popconfirm>
            </div>
          </div>

          <div class="card-body">
            <div class="stats-row">
              <div class="stat-item">
                <Activity :size="12" />
                <span>{{ recipe.actions?.length || 0 }} 个动作</span>
              </div>
              <div class="stat-item">
                <Calendar :size="12" />
                <span>{{ formatDate(recipe.updatedAt) }}</span>
              </div>
            </div>

            <div class="preview-tags">
              <el-tag v-for="s in recipe.extractSelectors?.slice(0, 3)" :key="s" size="small" class="selector-tag">
                {{ s }}
              </el-tag>
              <span v-if="(recipe.extractSelectors?.length || 0) > 3" class="more-count">
                +{{ recipe.extractSelectors!.length - 3 }}
              </span>
            </div>
          </div>

          <div class="card-footer" @click="editRecipe(recipe)">
            <span>去编辑</span>
            <ChevronRight :size="14" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recipe-manager {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--bg-color-page);
}

.manager-header {
  padding: 24px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 20px;
}

.header-content h2 {
  margin: 0 0 8px 0;
  font-size: 20px;
  font-weight: 600;
}

.header-content p {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-light);
}

.search-bar {
  width: 300px;
}

.manager-body {
  flex: 1;
  padding: 24px;
  overflow-y: auto;
}

.recipe-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.recipe-card {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.2s;
}

.recipe-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--el-box-shadow-light);
  border-color: var(--primary-color);
}

.card-header {
  padding: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 1px solid var(--border-color-light);
}

.recipe-name {
  margin: 0 0 6px 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.recipe-domain {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-color-light);
}

.path-pattern {
  background: var(--bg-color-page);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 10px;
}

.card-body {
  padding: 16px;
  flex: 1;
}

.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-light);
}

.preview-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.selector-tag {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more-count {
  font-size: 11px;
  color: var(--text-color-light);
}

.card-footer {
  padding: 10px 16px;
  background-color: var(--bg-color-page);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  font-weight: 500;
  color: var(--primary-color);
  cursor: pointer;
  border-top: 1px solid var(--border-color-light);
}

.card-footer:hover {
  background-color: color-mix(in srgb, var(--primary-color) 5%, transparent);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 0;
  color: var(--text-color-light);
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3 {
  margin-bottom: 8px;
  color: var(--text-color);
}
</style>
