<template>
  <div class="skill-scan-settings">
    <!-- 终端/Shell 偏好 -->
    <div class="section">
      <div class="section-header">
        <div class="section-title-row">
          <h3>终端 / Shell 偏好</h3>
        </div>
        <p class="section-desc">
          配置默认终端和命令链接风格。这些信息会自动注入到 Agent
          的环境上下文中，让 AI 正确生成宿主兼容的命令。
        </p>
      </div>
      <div class="terminal-prefs-grid">
        <div class="pref-item">
          <label class="pref-label">默认 Shell</label>
          <el-select
            :model-value="store.config.terminalPreferences.defaultShell"
            @update:model-value="
              (val: string) => handleTerminalPrefChange('defaultShell', val)
            "
            size="small"
          >
            <el-option label="自动检测" value="auto-detect" />
            <el-option label="PowerShell" value="powershell" />
            <el-option label="cmd.exe" value="cmd" />
            <el-option label="bash" value="bash" />
            <el-option label="zsh" value="zsh" />
          </el-select>
        </div>
        <div class="pref-item">
          <label class="pref-label">命令链接风格</label>
          <el-select
            :model-value="store.config.terminalPreferences.commandChainStyle"
            @update:model-value="
              (val: string) =>
                handleTerminalPrefChange('commandChainStyle', val)
            "
            size="small"
          >
            <el-option label="自动 (根据 Shell 类型推断)" value="auto" />
            <el-option label="分号 `;` (PowerShell 风格)" value="semicolon" />
            <el-option
              label="双与 `&&` (cmd/bash/zsh 风格)"
              value="ampersand"
            />
          </el-select>
        </div>
      </div>
    </div>

    <!-- 运行环境配置 -->
    <div class="section">
      <div class="section-header">
        <div class="section-title-row">
          <h3>脚本执行环境</h3>
        </div>
        <p class="section-desc">
          配置 Skill 脚本的执行引擎。留空 = 自动检测（JS/TS 自动检测
          <code>bun</code> > <code>node</code>，其余按默认命令）
        </p>
      </div>
      <div class="runtime-grid">
        <div v-for="rt in runtimeList" :key="rt.key" class="runtime-item">
          <label class="runtime-label">{{ rt.label }}</label>
          <el-input
            :model-value="store.config.runtimeSettings[rt.key].command"
            @update:model-value="
              (val: string | number) => handleRuntimeChange(rt.key, String(val))
            "
            :placeholder="rt.placeholder"
            size="small"
            clearable
          />
        </div>
      </div>
    </div>

    <!-- 外部扫描总开关 -->
    <div class="section">
      <div class="section-header">
        <div class="section-title-row">
          <h3>外部兼容扫描</h3>
          <el-switch
            v-model="externalScanEnabled"
            @change="handleExternalScanToggle"
          />
        </div>
        <p class="section-desc">
          扫描其他 AI 工具（Claude Code、Cursor 等）安装的 Skill，实现跨工具兼容
        </p>
      </div>
    </div>

    <!-- 已知工具路径 -->
    <div class="section" v-if="externalScanEnabled">
      <h3 class="subsection-title">已知工具路径</h3>
      <div class="path-list">
        <div
          v-for="pathItem in knownPaths"
          :key="pathItem.id"
          class="path-item"
        >
          <div class="path-info">
            <div class="path-header">
              <span class="path-label">{{ pathItem.label }}</span>
            </div>
            <code class="path-value" :title="pathItem.defaultPath">{{
              pathItem.defaultPath || "未检测到路径"
            }}</code>
          </div>
          <el-switch
            :model-value="getPathEnabled(pathItem.id)"
            @change="(val: boolean) => handleKnownPathToggle(pathItem.id, val)"
            size="small"
          />
        </div>
      </div>
    </div>

    <!-- 自定义路径 -->
    <div class="section" v-if="externalScanEnabled">
      <div class="section-title-row">
        <h3 class="subsection-title">自定义路径</h3>
        <el-button size="small" @click="handleAddCustomPath">
          <Plus :size="14" style="margin-right: 4px" />
          添加自定义路径
        </el-button>
      </div>

      <div v-if="customPaths.length === 0" class="empty-hint">
        <p>暂无自定义路径，点击上方按钮添加</p>
      </div>

      <div class="path-list" v-else>
        <div
          v-for="(pathItem, index) in customPaths"
          :key="pathItem.id"
          class="path-item"
        >
          <div class="path-info">
            <el-input
              v-model="pathItem.path"
              placeholder="输入 Skill 目录的完整路径"
              size="small"
              @change="handleCustomPathChange"
            />
          </div>
          <div class="path-actions">
            <el-switch
              v-model="pathItem.enabled"
              @change="handleCustomPathChange"
              size="small"
            />
            <el-button
              size="small"
              type="danger"
              :icon="Trash2"
              circle
              @click="handleRemoveCustomPath(index)"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- 首次加载时同步已知路径 -->
    <div v-if="loading" class="loading-overlay">
      <LoaderCircle class="spinner-icon" :size="16" />
      <span>正在加载预设路径...</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { Plus, Trash2, LoaderCircle } from "lucide-vue-next";
import { useSkillManagerStore } from "../stores/skillManagerStore";
import { skillLoader } from "../services/SkillLoader";
import type {
  ExternalScanPath,
  WellKnownPath,
  RuntimeSettings,
  TerminalPreferences,
} from "../types";

const store = useSkillManagerStore();
const loading = ref(false);
const knownPaths = ref<WellKnownPath[]>([]);

const runtimeList: {
  key: keyof RuntimeSettings;
  label: string;
  placeholder: string;
}[] = [
  {
    key: "javascript",
    label: "JavaScript / TypeScript",
    placeholder: "留空自动检测（bun > node）",
  },
  { key: "python", label: "Python", placeholder: "留空自动检测（python）" },
  { key: "shell", label: "Shell / Bash", placeholder: "留空自动检测（bash）" },
  {
    key: "powershell",
    label: "PowerShell",
    placeholder: "留空自动检测（powershell）",
  },
];

const externalScanEnabled = computed({
  get: () => store.config.externalScanEnabled,
  set: (val: boolean) => {
    store.updateConfig({ externalScanEnabled: val });
  },
});

const customPaths = computed(() => {
  // 过滤出不在已知预设列表中的路径（即用户自定义的）
  const knownIds = new Set(knownPaths.value.map((p) => p.id));
  return store.config.externalScanPaths.filter((p) => !knownIds.has(p.id));
});

function getPathEnabled(id: string): boolean {
  const found = store.config.externalScanPaths.find((p) => p.id === id);
  return found?.enabled ?? false;
}

async function handleRuntimeChange(key: keyof RuntimeSettings, value: string) {
  const settings = store.config.runtimeSettings;
  if (settings[key]) {
    settings[key].command = value;
    await store.saveConfig();
  }
}

async function handleKnownPathToggle(id: string, enabled: boolean) {
  const existing = store.config.externalScanPaths.find((p) => p.id === id);
  if (existing) {
    existing.enabled = enabled;
  } else {
    const known = knownPaths.value.find((p) => p.id === id);
    if (known) {
      store.config.externalScanPaths.push({
        id: known.id,
        path: known.defaultPath,
        enabled,
      });
    }
  }
  await store.saveConfig();
}

async function handleExternalScanToggle(val: boolean) {
  if (val && store.config.externalScanPaths.length === 0) {
    // 首次开启：同步已知路径到配置（默认关闭）
    const paths: ExternalScanPath[] = knownPaths.value.map((kp) => ({
      id: kp.id,
      path: kp.defaultPath,
      enabled: false,
    }));
    store.config.externalScanPaths = paths;
  }
  store.config.externalScanEnabled = val;
  await store.saveConfig();
}

async function handleAddCustomPath() {
  // 生成唯一 ID
  const id = `custom_${Date.now()}`;
  store.config.externalScanPaths.push({
    id,
    path: "",
    enabled: true,
    label: "自定义路径",
  });
  await store.saveConfig();
}

async function handleRemoveCustomPath(index: number) {
  const customList = customPaths.value;
  if (index >= 0 && index < customList.length) {
    const realIndex = store.config.externalScanPaths.indexOf(customList[index]);
    if (realIndex >= 0) {
      store.config.externalScanPaths.splice(realIndex, 1);
    }
  }
  await store.saveConfig();
}

async function handleCustomPathChange() {
  await store.saveConfig();
}

async function handleTerminalPrefChange(
  key: keyof TerminalPreferences,
  value: string
) {
  const prefs = store.config.terminalPreferences;
  if (key === "defaultShell") {
    prefs.defaultShell = value as TerminalPreferences["defaultShell"];
  } else if (key === "commandChainStyle") {
    prefs.commandChainStyle = value as TerminalPreferences["commandChainStyle"];
  }
  await store.saveConfig();
}

onMounted(async () => {
  loading.value = true;
  try {
    knownPaths.value = await skillLoader.getWellKnownPaths();
  } finally {
    loading.value = false;
  }
});
</script>

<style scoped>
.skill-scan-settings {
  height: 100%;
  overflow-y: auto;
  padding: 0 16px 16px 16px;
  position: relative;
  scrollbar-gutter: stable;
}

.section {
  margin-bottom: 24px;
}

.section-header {
  margin-bottom: 16px;
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}

.section-title-row h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
}

.subsection-title {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.section-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.section-desc code {
  font-size: 11px;
  background-color: var(--sidebar-bg);
  padding: 1px 5px;
  border-radius: 3px;
}

.path-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.path-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
}

.path-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.path-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.path-value {
  font-size: 12px;
  color: var(--text-color-secondary);
  background-color: var(--sidebar-bg);
  padding: 2px 6px;
  border-radius: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-height: 1.2em;
  width: 100%;
  box-sizing: border-box;
}

.path-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.empty-hint {
  padding: 20px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.empty-hint p {
  margin: 0;
}

.loading-overlay {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.spinner-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.terminal-prefs-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pref-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 14px;
  border-radius: 8px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
}

.pref-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
}

.runtime-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.runtime-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 14px;
  border-radius: 8px;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
}

.runtime-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color-secondary);
}
</style>
