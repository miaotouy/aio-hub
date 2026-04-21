<script setup lang="ts">
import { ref, onMounted, computed, onErrorCaptured } from "vue";
import { Search, Trash2, Edit, ExternalLink, ShieldCheck, ShieldAlert, BookOpen } from "lucide-vue-next";
import { recipeStore } from "../core/recipe-store";
import type { SiteRecipe } from "../types";
import { useWebDistilleryStore } from "../stores/store";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import InfoCard from "@/components/common/InfoCard.vue";

const errorHandler = createModuleErrorHandler("web-distillery/recipe-manager");
const store = useWebDistilleryStore();

const recipes = ref<SiteRecipe[]>([]);
const isLoading = ref(false);
const searchText = ref("");

async function loadRecipes() {
  isLoading.value = true;
  try {
    recipes.value = await recipeStore.getAll();
  } finally {
    isLoading.value = false;
  }
}

onMounted(async () => {
  try {
    await loadRecipes();
  } catch (err) {
    errorHandler.error(err, "初始化失败");
  }
});

const filteredRecipes = computed(() => {
  if (!searchText.value) return recipes.value;
  const lower = searchText.value.toLowerCase();
  return recipes.value.filter((r) => r.name.toLowerCase().includes(lower) || r.domain.toLowerCase().includes(lower));
});

async function deleteRecipe(id: string) {
  if (id.startsWith("builtin-")) {
    customMessage.warning("内置配方不可删除，您可以选择禁用它");
    return;
  }
  try {
    await recipeStore.delete(id);
    await loadRecipes();
    customMessage.success("配方已删除");
  } catch (e) {
    customMessage.error("删除失败");
  }
}

async function toggleRecipeStatus(recipe: SiteRecipe) {
  try {
    recipe.disabled = !recipe.disabled;
    await recipeStore.upsert(recipe);
    customMessage.success(recipe.disabled ? "配方已禁用" : "配方已启用");
    await loadRecipes();
  } catch (e) {
    customMessage.error("操作失败");
  }
}

function editRecipe(recipe: SiteRecipe) {
  store.setCurrentRecipe(recipe);
  store.switchToInteractive();
  customMessage.info(`正在加载配方: ${recipe.name}`);
}

function openExternal(url: string) {
  window.open(url, "_blank");
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString();
  } catch {
    return dateStr;
  }
}

// 捕获子组件错误
onErrorCaptured((err) => {
  errorHandler.error(err, "组件运行出错");
  return false;
});
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
        <p>在"交互配方"页面即可创建配方</p>
      </div>

      <div v-else class="recipe-grid">
        <InfoCard v-for="recipe in filteredRecipes" :key="recipe.id" class="recipe-card" :class="{ 'is-disabled': recipe.disabled }">
          <template #header>
            <div class="card-header">
              <div class="header-left">
                <BookOpen :size="16" class="recipe-icon" />
                <span class="recipe-name">{{ recipe.name }}</span>
              </div>
              <div class="header-right">
                <el-tag v-if="recipe.id.startsWith('builtin-')" size="small" effect="dark" type="info">内置</el-tag>
                <el-tag v-else size="small" effect="plain" type="success">用户</el-tag>
              </div>
            </div>
          </template>

          <div class="recipe-info">
            <div class="info-row">
              <span class="info-label">域名</span>
              <span class="info-value">{{ recipe.domain }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">动作数</span>
              <span class="info-value">{{ recipe.actions?.length || 0 }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">更新时间</span>
              <span class="info-value">{{ formatDate(recipe.updatedAt) }}</span>
            </div>
          </div>

          <template #footer>
            <div class="card-actions">
              <el-button-group>
                <el-tooltip :content="recipe.disabled ? '启用' : '禁用'" placement="top">
                  <el-button size="small" @click="toggleRecipeStatus(recipe)">
                    <component :is="recipe.disabled ? ShieldAlert : ShieldCheck" :size="14" />
                  </el-button>
                </el-tooltip>
                <el-tooltip content="编辑配方" placement="top">
                  <el-button size="small" @click="editRecipe(recipe)">
                    <Edit :size="14" />
                  </el-button>
                </el-tooltip>
                <el-tooltip v-if="!recipe.id.startsWith('builtin-')" content="删除配方" placement="top">
                  <el-button size="small" type="danger" @click="deleteRecipe(recipe.id)">
                    <Trash2 :size="14" />
                  </el-button>
                </el-tooltip>
              </el-button-group>
              <el-button size="small" text @click="openExternal(`https://${recipe.domain}`)">
                <ExternalLink :size="14" />
              </el-button>
            </div>
          </template>
        </InfoCard>
      </div>
    </div>
  </div>
</template>

<style scoped>
.recipe-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: var(--card-bg);
  border-bottom: var(--border-width) solid var(--border-color);
}

.header-content h2 {
  margin: 0 0 4px 0;
  font-size: 18px;
  color: var(--text-color);
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
  padding: 20px;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-color-light);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.recipe-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
}

.recipe-card {
  transition: transform 0.2s, box-shadow 0.2s;
}

.recipe-card:hover {
  transform: translateY(-2px);
}

.recipe-card.is-disabled {
  opacity: 0.6;
  filter: grayscale(0.5);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.recipe-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.recipe-name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.recipe-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.info-label {
  color: var(--text-color-light);
}

.info-value {
  color: var(--text-color);
  font-family: var(--font-family-mono);
}

.card-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>
