<script setup lang="ts">
import { ref } from "vue";
import { useWebDistilleryStore } from "../stores/store";
import { recipeStore } from "../core/recipe-store";
import type { SiteRecipe, ActionStep } from "../types";
import { actionRunner } from "../core/action-runner";
import { webviewBridge } from "../core/webview-bridge";
import { customMessage } from "@/utils/customMessage";
import {
  Plus,
  Trash,
  Play,
  MousePointer2,
  Save,
  Clock,
  MousePointerClick,
  ChevronDown,
  ChevronUp,
  Type,
} from "lucide-vue-next";
import { nanoid } from "nanoid";

const store = useWebDistilleryStore();

// 当前正在编辑的配方状态
const recipe = ref<SiteRecipe>({
  id: nanoid(),
  name: "新配方",
  domain: "",
  pathPattern: "",
  actions: [],
  extractSelectors: [],
  excludeSelectors: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  useCount: 0,
});

// 如果 store 中已有当前 URL，初始化域名
if (store.url) {
  try {
    const url = new URL(store.url);
    recipe.value.domain = url.hostname;
    recipe.value.name = `${url.hostname} 的提取配方`;
  } catch (e) {}
}

const isPicking = ref(false);

// 添加动作
function addAction(type: ActionStep["type"]) {
  const newStep: any = { type };
  if (type === "click" || type === "input" || type === "hover" || type === "remove") {
    newStep.selector = "";
  }
  if (type === "input") {
    newStep.value = "";
  }
  if (type === "wait") {
    newStep.value = 1000;
  }
  if (type === "scroll") {
    newStep.distance = 500;
  }
  recipe.value.actions = recipe.value.actions || [];
  recipe.value.actions.push(newStep);
}

// 删除动作
function removeAction(index: number) {
  recipe.value.actions?.splice(index, 1);
}

// 移动动作
function moveAction(index: number, direction: "up" | "down") {
  const actions = recipe.value.actions || [];
  if (direction === "up" && index > 0) {
    [actions[index], actions[index - 1]] = [actions[index - 1], actions[index]];
  } else if (direction === "down" && index < actions.length - 1) {
    [actions[index], actions[index + 1]] = [actions[index + 1], actions[index]];
  }
}

// 开启拾取器
async function startPicking(index: number | "include" | "exclude") {
  isPicking.value = true;
  customMessage.info("请在浏览器窗口中点击选择目标元素");

  await webviewBridge.enablePicker((data) => {
    if (typeof index === "number") {
      const step = recipe.value.actions?.[index];
      if (step && "selector" in step) {
        step.selector = data.selector;
      }
    } else if (index === "include") {
      recipe.value.extractSelectors = recipe.value.extractSelectors || [];
      recipe.value.extractSelectors.push(data.selector);
    } else if (index === "exclude") {
      recipe.value.excludeSelectors = recipe.value.excludeSelectors || [];
      recipe.value.excludeSelectors.push(data.selector);
    }

    stopPicking();
  });
}

async function stopPicking() {
  await webviewBridge.disablePicker();
  isPicking.value = false;
}

// 测试执行
async function testActions() {
  if (!recipe.value.actions?.length) return;
  customMessage.info("正在测试执行动作序列...");
  await actionRunner.runSequence(recipe.value.actions);
}

// 保存配方
async function saveRecipe() {
  if (!recipe.value.domain) {
    customMessage.error("必须填写域名");
    return;
  }
  recipe.value.updatedAt = new Date().toISOString();
  await recipeStore.upsert(recipe.value);
  customMessage.success("配方已保存");
}

const actionIcons: Record<string, any> = {
  click: MousePointerClick,
  scroll: ChevronDown,
  wait: Clock,
  input: Type,
  hover: MousePointer2,
  remove: Trash,
  "wait-idle": Clock,
};
</script>

<template>
  <div class="recipe-editor">
    <div class="editor-header">
      <div class="header-main">
        <input v-model="recipe.name" class="name-input" placeholder="配方名称" />
        <div class="header-actions">
          <el-button type="primary" size="small" @click="saveRecipe">
            <template #icon><Save :size="14" /></template>
            保存配方
          </el-button>
        </div>
      </div>
      <div class="header-meta">
        <div class="meta-item">
          <span class="label">域名</span>
          <input v-model="recipe.domain" placeholder="example.com" />
        </div>
        <div class="meta-item">
          <span class="label">路径通配符</span>
          <input v-model="recipe.pathPattern" placeholder="/articles/*" />
        </div>
      </div>
    </div>

    <div class="editor-body">
      <!-- 动作序列部分 -->
      <section class="editor-section">
        <div class="section-header">
          <span class="section-title">动作序列 (Action Steps)</span>
          <div class="section-actions">
            <el-dropdown trigger="click" @command="addAction">
              <el-button size="small" circle><Plus :size="14" /></el-button>
              <template #header>添加动作</template>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="click">点击元素</el-dropdown-item>
                  <el-dropdown-item command="input">输入文本</el-dropdown-item>
                  <el-dropdown-item command="scroll">滚动页面</el-dropdown-item>
                  <el-dropdown-item command="wait">等待时间/元素</el-dropdown-item>
                  <el-dropdown-item command="hover">悬停元素</el-dropdown-item>
                  <el-dropdown-item command="remove">移除元素</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
            <el-button size="small" type="success" :disabled="!recipe.actions?.length" @click="testActions">
              <Play :size="14" />
            </el-button>
          </div>
        </div>

        <div class="action-list">
          <div v-if="!recipe.actions?.length" class="empty-state">尚无动作，点击上方 + 号添加</div>
          <div v-for="(step, index) in recipe.actions" :key="index" class="action-item">
            <div class="action-index">{{ index + 1 }}</div>
            <div class="action-icon">
              <component :is="actionIcons[step.type]" :size="14" />
            </div>
            <div class="action-content">
              <div class="action-type-label">{{ step.type.toUpperCase() }}</div>

              <!-- 根据类型显示不同输入 -->
              <div v-if="'selector' in step" class="selector-input-wrap">
                <input v-model="step.selector" placeholder="CSS 选择器" class="selector-input" />
                <button class="picker-btn" @click="startPicking(index)" :class="{ active: isPicking }">
                  <MousePointer2 :size="12" />
                </button>
              </div>

              <div v-if="step.type === 'input'" class="value-input-wrap">
                <input v-model="step.value" placeholder="输入内容" class="value-input" />
              </div>

              <div v-if="step.type === 'wait'" class="value-input-wrap">
                <input type="number" v-model.number="step.value" class="number-input" />
                <span class="unit">ms</span>
              </div>

              <div v-if="step.type === 'scroll'" class="value-input-wrap">
                <input type="number" v-model.number="step.distance" class="number-input" />
                <span class="unit">px</span>
              </div>
            </div>

            <div class="action-item-ops">
              <div class="move-btns">
                <button @click="moveAction(index, 'up')"><ChevronUp :size="12" /></button>
                <button @click="moveAction(index, 'down')"><ChevronDown :size="12" /></button>
              </div>
              <button class="delete-btn" @click="removeAction(index)">
                <Trash :size="14" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- 提取规则部分 -->
      <section class="editor-section">
        <div class="section-header">
          <span class="section-title">内容区域 (提取/剔除)</span>
        </div>

        <div class="rule-group">
          <div class="rule-type">包含 (Include)</div>
          <div class="rule-tags">
            <el-tag
              v-for="(s, i) in recipe.extractSelectors"
              :key="i"
              closable
              @close="recipe.extractSelectors?.splice(i, 1)"
            >
              {{ s }}
            </el-tag>
            <el-button size="small" @click="startPicking('include')">+ 拾取</el-button>
          </div>
        </div>

        <div class="rule-group">
          <div class="rule-type">剔除 (Exclude)</div>
          <div class="rule-tags">
            <el-tag
              v-for="(s, i) in recipe.excludeSelectors"
              :key="i"
              type="danger"
              closable
              @close="recipe.excludeSelectors?.splice(i, 1)"
            >
              {{ s }}
            </el-tag>
            <el-button size="small" @click="startPicking('exclude')">+ 拾取</el-button>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.recipe-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--sidebar-bg);
}

.editor-header {
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
}

.header-main {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.name-input {
  flex: 1;
  font-size: 16px;
  font-weight: 600;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-color);
}

.header-meta {
  display: flex;
  gap: 16px;
}

.meta-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.meta-item .label {
  font-size: 11px;
  color: var(--text-color-light);
  text-transform: uppercase;
}

.meta-item input {
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-color);
}

.editor-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-light);
}

.section-actions {
  display: flex;
  gap: 8px;
}

.action-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.action-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  position: relative;
}

.action-index {
  font-size: 10px;
  color: var(--text-color-light);
  width: 14px;
}

.action-icon {
  color: var(--primary-color);
  opacity: 0.8;
}

.action-content {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-type-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--text-color-light);
  width: 45px;
}

.selector-input-wrap {
  flex: 1;
  display: flex;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.selector-input {
  flex: 1;
  background: transparent;
  border: none;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-color);
  font-family: var(--font-mono);
}

.picker-btn {
  background: var(--border-color);
  border: none;
  padding: 0 8px;
  cursor: pointer;
  color: var(--text-color-light);
}

.picker-btn:hover,
.picker-btn.active {
  background: var(--primary-color);
  color: white;
}

.value-input-wrap {
  width: 100px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.value-input,
.number-input {
  width: 100%;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 4px 8px;
  font-size: 12px;
  color: var(--text-color);
}

.unit {
  font-size: 10px;
  color: var(--text-color-light);
}

.action-item-ops {
  display: flex;
  align-items: center;
  gap: 4px;
}

.move-btns {
  display: flex;
  flex-direction: column;
}

.move-btns button {
  background: transparent;
  border: none;
  color: var(--text-color-light);
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.delete-btn {
  background: transparent;
  border: none;
  color: var(--el-color-danger);
  cursor: pointer;
  opacity: 0.6;
}

.delete-btn:hover {
  opacity: 1;
}

.rule-group {
  margin-bottom: 12px;
}

.rule-type {
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 8px;
}

.rule-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.empty-state {
  text-align: center;
  padding: 24px;
  color: var(--text-color-light);
  font-size: 12px;
  border: 1px dashed var(--border-color);
  border-radius: 6px;
}
</style>
