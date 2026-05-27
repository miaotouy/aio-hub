<template>
  <BaseDialog
    v-model="visible"
    title="加载设置"
    width="680px"
    max-height="82vh"
    :close-on-backdrop-click="false"
  >
    <template #content>
      <div class="load-config-dialog">
        <section class="preset-section">
          <div class="section-title">快速预设</div>
          <div class="preset-grid">
            <button
              v-for="preset in presets"
              :key="preset.key"
              type="button"
              class="preset-card"
              :class="{ active: activePreset === preset.key }"
              @click="applyPreset(preset.config)"
            >
              <span class="preset-icon">{{ preset.icon }}</span>
              <span class="preset-name">{{ preset.name }}</span>
              <span class="preset-desc">{{ preset.description }}</span>
            </button>
          </div>
          <el-tag v-if="activePreset === 'custom'" size="small" type="info"
            >自定义</el-tag
          >
        </section>

        <section class="option-section">
          <div class="section-title">初始加载包含的数据</div>
          <div class="option-list">
            <label class="option-row">
              <el-checkbox v-model="draft.includeFilePaths" />
              <span class="option-content">
                <span class="option-title">文件路径列表</span>
                <span class="option-desc"
                  >获取每个提交修改了哪些文件，支持文件路径搜索。</span
                >
                <span class="option-note low">开销低，推荐开启</span>
              </span>
            </label>

            <label class="option-row">
              <el-checkbox v-model="draft.includeLineStats" />
              <span class="option-content">
                <span class="option-title">行级统计</span>
                <span class="option-desc"
                  >获取每个文件的增删行数，并在列表中显示 +N/-M。</span
                >
                <span class="option-note high">大仓库建议按需补充</span>
              </span>
            </label>

            <label class="option-row">
              <el-checkbox v-model="draft.includeBranchInference" />
              <span class="option-content">
                <span class="option-title">分支归属推断</span>
                <span class="option-desc">推断每个提交所属的相关分支。</span>
                <span class="option-note medium">分支多时会增加加载耗时</span>
              </span>
            </label>
          </div>
        </section>

        <div class="hint-box">
          行级统计和分支归属可以在加载完成后通过导出面板补充；设置变更会在下一次加载时生效。
        </div>
      </div>
    </template>

    <template #footer>
      <el-space>
        <el-button @click="reset">恢复默认</el-button>
        <el-button type="primary" @click="confirm">确定</el-button>
      </el-space>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { GitLoadConfig } from "../types";

const props = defineProps<{
  config: GitLoadConfig;
}>();

const emit = defineEmits<{
  "update:config": [config: GitLoadConfig];
}>();

const visible = defineModel<boolean>("visible", { required: true });

const defaultConfig: GitLoadConfig = {
  includeFilePaths: true,
  includeLineStats: false,
  includeBranchInference: false,
};

const presets: Array<{
  key: "fast" | "standard" | "complete";
  icon: string;
  name: string;
  description: string;
  config: GitLoadConfig;
}> = [
  {
    key: "fast",
    icon: "⚡",
    name: "极速",
    description: "只看提交消息",
    config: {
      includeFilePaths: false,
      includeLineStats: false,
      includeBranchInference: false,
    },
  },
  {
    key: "standard",
    icon: "🔍",
    name: "标准",
    description: "支持文件搜索",
    config: { ...defaultConfig },
  },
  {
    key: "complete",
    icon: "📊",
    name: "完整",
    description: "小仓库全量统计",
    config: {
      includeFilePaths: true,
      includeLineStats: true,
      includeBranchInference: true,
    },
  },
];

const draft = reactive<GitLoadConfig>({ ...props.config });

const activePreset = computed(() => {
  const found = presets.find((preset) => isSameConfig(preset.config, draft));
  return found?.key ?? "custom";
});

watch(
  () => visible.value,
  (isVisible) => {
    if (isVisible) {
      Object.assign(draft, props.config);
    }
  }
);

watch(
  () => draft.includeLineStats,
  (includeLineStats) => {
    if (includeLineStats) {
      draft.includeFilePaths = true;
    }
  }
);

function isSameConfig(a: GitLoadConfig, b: GitLoadConfig) {
  return (
    a.includeFilePaths === b.includeFilePaths &&
    a.includeLineStats === b.includeLineStats &&
    a.includeBranchInference === b.includeBranchInference
  );
}

function applyPreset(config: GitLoadConfig) {
  Object.assign(draft, config);
}

function reset() {
  Object.assign(draft, defaultConfig);
}

function confirm() {
  emit("update:config", { ...draft });
  visible.value = false;
}
</script>

<style scoped>
.load-config-dialog {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.section-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.preset-section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
}

.preset-card {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-areas:
    "icon name"
    "icon desc";
  gap: 2px 8px;
  align-items: center;
  min-height: 70px;
  padding: 12px;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  background: var(--input-bg);
  color: var(--text-color);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s,
    background-color 0.2s;
}

.preset-card.active {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 10%, var(--input-bg));
}

.preset-icon {
  grid-area: icon;
  font-size: 22px;
}

.preset-name {
  grid-area: name;
  font-weight: 600;
}

.preset-desc {
  grid-area: desc;
  font-size: 12px;
  color: var(--text-color-light);
}

.option-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.option-row {
  display: flex;
  gap: 10px;
  padding: 12px;
  background: var(--card-bg);
  cursor: pointer;
}

.option-row + .option-row {
  border-top: 1px solid var(--border-color-light);
}

.option-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.option-title {
  font-weight: 600;
  color: var(--text-color);
}

.option-desc {
  font-size: 13px;
  color: var(--text-color-light);
}

.option-note {
  width: fit-content;
  font-size: 12px;
}

.option-note.low {
  color: var(--el-color-success);
}

.option-note.medium {
  color: var(--el-color-warning);
}

.option-note.high {
  color: var(--error-color);
}

.hint-box {
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--el-color-primary) 35%, transparent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--el-color-primary) 8%, var(--card-bg));
  color: var(--text-color);
  font-size: 13px;
  line-height: 1.6;
}
</style>
