<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="env-container">
    <!-- 顶部常驻区域 -->
    <div class="env-header-sticky">
      <div class="env-description">
        <p>为此技能的脚本执行配置环境变量。脚本运行时会自动注入这些变量。</p>
      </div>

      <!-- 迁移提示 -->
      <el-alert
        v-if="envMigrated"
        title="已将环境变量迁移到 .env 文件"
        type="success"
        :closable="true"
        show-icon
        class="env-migrate-alert"
      />

      <!-- 操作按钮栏 -->
      <div class="env-toolbar">
        <el-button
          type="primary"
          size="small"
          :icon="Save"
          @click="handleSaveEnv"
          :loading="envSaving"
        >
          保存配置
        </el-button>
        <el-button size="small" :icon="Plus" plain @click="addCustomEnvEntry">
          添加自定义变量
        </el-button>
        <template v-if="envExampleResult.exists">
          <el-button
            size="small"
            :icon="RefreshCw"
            plain
            @click="handleSyncFromExample"
            :loading="envSyncing"
          >
            同步变量项
          </el-button>
          <el-button
            size="small"
            :icon="RotateCcw"
            plain
            @click="handleResetDefaults"
          >
            还原默认值
          </el-button>
        </template>
      </div>
    </div>

    <!-- 中间滚动区域 -->
    <div class="env-list-scroll">
      <div class="env-scroll-content">
        <!-- 有 .env.example 时：分组展示 -->
        <template
          v-if="
            envExampleResult.exists && envExampleResult.definitions.length > 0
          "
        >
          <template v-for="(group, groupIndex) in envGroups" :key="groupIndex">
            <!-- 分组标题 -->
            <div v-if="group.name" class="env-group-header">
              <span class="env-group-title">{{ group.name }}</span>
            </div>

            <!-- 分组内的变量 -->
            <div v-for="def in group.items" :key="def.key" class="env-var-card">
              <div class="env-var-header">
                <span class="env-var-key">{{ def.key }}</span>
                <span v-if="def.defaultValue" class="env-var-default"
                  >默认: {{ def.defaultValue }}</span
                >
                <span v-else class="env-var-default empty">默认: (空)</span>
              </div>
              <div v-if="def.description" class="env-var-description">
                {{ def.description }}
              </div>
              <el-input
                v-model="envValues[def.key]"
                :placeholder="def.defaultValue || '请输入值'"
                size="small"
                class="env-var-input"
                :show-password="isSensitiveVar(def.key)"
                :type="isSensitiveVar(def.key) ? 'password' : 'text'"
              />
            </div>
          </template>
        </template>

        <!-- 自定义变量区域 -->
        <div
          v-if="customEnvEntries.length > 0 || !envExampleResult.exists"
          class="env-custom-section"
        >
          <div v-if="envExampleResult.exists" class="env-group-header">
            <span class="env-group-title">自定义变量</span>
          </div>

          <div class="env-list">
            <div
              v-for="(_, index) in customEnvEntries"
              :key="index"
              class="env-row"
            >
              <el-input
                v-model="customEnvEntries[index].key"
                placeholder="变量名 (如 ENDPOINT)"
                size="small"
                class="env-key-input"
              />
              <el-input
                v-model="customEnvEntries[index].value"
                placeholder="变量值"
                size="small"
                class="env-value-input"
                :show-password="isSensitiveVar(customEnvEntries[index].key)"
                :type="
                  isSensitiveVar(customEnvEntries[index].key)
                    ? 'password'
                    : 'text'
                "
              />
              <el-button
                size="small"
                :icon="X"
                circle
                plain
                type="danger"
                @click="removeCustomEnvEntry(index)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { Plus, RotateCcw, RefreshCw, X, Save } from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { useSkillManagerStore } from "../stores/skillManagerStore";
import { customMessage } from "@/utils/customMessage";
import {
  isSensitiveVar,
  type EnvVarDefinition,
} from "../services/envExampleParser";
import {
  loadEnvExample,
  loadEnvFile,
  saveEnvFile,
  migrateFromConfig,
  syncFromExample,
  resetToDefaults,
} from "../services/envFileManager";
import type { EnvExampleParseResult } from "../services/envExampleParser";
import type { SkillManifest } from "../types";

const props = defineProps<{
  manifest: SkillManifest;
}>();

const store = useSkillManagerStore();

interface EnvEntry {
  key: string;
  value: string;
}

/** .env.example 解析结果 */
const envExampleResult = ref<EnvExampleParseResult>({
  definitions: [],
  exists: false,
});
/** 基于 definitions 的变量值（key -> value） */
const envValues = ref<Record<string, string>>({});
/** 自定义变量（不在 .env.example 中的） */
const customEnvEntries = ref<EnvEntry[]>([]);
/** 是否执行了迁移 */
const envMigrated = ref(false);
/** 同步中 */
const envSyncing = ref(false);
/** 保存中 */
const envSaving = ref(false);

/** 按分组组织的变量定义 */
const envGroups = computed(() => {
  const defs = envExampleResult.value.definitions;
  const groups: { name: string | undefined; items: EnvVarDefinition[] }[] = [];
  let currentGroup: {
    name: string | undefined;
    items: EnvVarDefinition[];
  } | null = null;

  for (const def of defs) {
    if (!currentGroup || def.group !== currentGroup.name) {
      currentGroup = { name: def.group, items: [] };
      groups.push(currentGroup);
    }
    currentGroup.items.push(def);
  }

  return groups;
});

/** 加载环境变量数据 */
async function loadEnvData() {
  const skillId = props.manifest.name;

  // 1. 加载 .env.example
  envExampleResult.value = await loadEnvExample(skillId);

  // 2. 尝试迁移旧数据
  const configVars = store.getSkillEnvVars(skillId);
  if (Object.keys(configVars).length > 0) {
    const migrated = await migrateFromConfig(
      skillId,
      configVars,
      envExampleResult.value.definitions
    );
    if (migrated) {
      envMigrated.value = true;
      // 清理 config 中的旧数据
      store.setSkillEnvVars(skillId, {});
    }
  }

  // 3. 加载 .env 文件
  const fileVars = await loadEnvFile(skillId);

  // 4. 分离 definitions 中的变量和自定义变量
  const definedKeys = new Set(
    envExampleResult.value.definitions.map((d) => d.key)
  );

  // 填充 definitions 对应的值
  const values: Record<string, string> = {};
  for (const def of envExampleResult.value.definitions) {
    values[def.key] = fileVars[def.key] ?? def.defaultValue;
  }
  envValues.value = values;

  // 填充自定义变量
  const customEntries: EnvEntry[] = [];
  for (const [key, value] of Object.entries(fileVars)) {
    if (!definedKeys.has(key)) {
      customEntries.push({ key, value });
    }
  }
  customEnvEntries.value = customEntries;
}

function addCustomEnvEntry() {
  customEnvEntries.value.push({ key: "", value: "" });
}

function removeCustomEnvEntry(index: number) {
  customEnvEntries.value.splice(index, 1);
}

/** 保存环境变量到 .env 文件 */
async function handleSaveEnv() {
  envSaving.value = true;
  try {
    // 合并所有变量
    const allVars: Record<string, string> = { ...envValues.value };
    for (const entry of customEnvEntries.value) {
      const key = entry.key.trim();
      if (key) {
        allVars[key] = entry.value;
      }
    }

    const defs = envExampleResult.value.exists
      ? envExampleResult.value.definitions
      : undefined;
    const success = await saveEnvFile(props.manifest.name, allVars, defs);
    if (success) {
      customMessage.success("环境变量已保存到 .env 文件");
    }
  } finally {
    envSaving.value = false;
  }
}

/** 同步 .env.example 中的变量项 */
async function handleSyncFromExample() {
  envSyncing.value = true;
  try {
    const addedKeys = await syncFromExample(
      props.manifest.name,
      envExampleResult.value.definitions
    );
    if (addedKeys.length > 0) {
      customMessage.success(`已补充 ${addedKeys.length} 个新变量`);
      await loadEnvData();
    } else {
      customMessage.info("所有变量已是最新，无需同步");
    }
  } finally {
    envSyncing.value = false;
  }
}

/** 还原默认值 */
async function handleResetDefaults() {
  try {
    await ElMessageBox.confirm(
      "确定要将所有变量值重置为 .env.example 中的默认值吗？自定义变量不受影响。",
      "还原默认值",
      {
        confirmButtonText: "确定还原",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );

    const success = await resetToDefaults(
      props.manifest.name,
      envExampleResult.value.definitions
    );
    if (success) {
      customMessage.success("已还原为默认值");
      await loadEnvData();
    }
  } catch {
    // 用户取消
  }
}

// 监听技能改变
watch(
  () => props.manifest.name,
  () => {
    envMigrated.value = false;
    loadEnvData();
  },
  { immediate: true }
);
</script>

<style scoped>
.env-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部常驻区域 */
.env-header-sticky {
  flex-shrink: 0;
  padding: 20px 24px 12px 24px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--card-bg);
}

.env-description p {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.env-migrate-alert {
  margin-top: 12px;
  margin-bottom: 4px;
}

.env-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

/* 中间滚动区域 */
.env-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.env-scroll-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.env-group-header {
  margin-top: 8px;
  margin-bottom: 4px;
}

.env-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.env-var-card {
  padding: 12px 16px;
  background: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
}

.env-var-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.env-var-key {
  font-size: 13px;
  font-weight: 600;
  font-family: var(--el-font-family-mono);
  color: var(--text-color);
}

.env-var-default {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-left: auto;
}

.env-var-default.empty {
  opacity: 0.6;
}

.env-var-description {
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.4;
  margin-bottom: 8px;
}

.env-var-input {
  width: 100%;
}

.env-custom-section {
  margin-top: 4px;
}

.env-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.env-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.env-key-input {
  flex: 2;
}

.env-value-input {
  flex: 3;
}

.env-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

/* 中间滚动区域 */
.env-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px 32px 24px;
}

/* Scrollbar Customization */
.env-list-scroll::-webkit-scrollbar {
  width: 6px;
}

.env-list-scroll::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}

.env-list-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--el-color-info-rgb), 0.3);
}
</style>
