<script setup lang="ts">
import { inject, ref, computed, watch, onUnmounted } from "vue";
import { MagicStick, Folder, Collection } from "@element-plus/icons-vue";
import MacroSelector from "../../MacroSelector.vue";
import type { MacroDefinition } from "../../../../macro-engine";
import { MacroProcessor } from "../../../../macro-engine/MacroProcessor";
import type { ChatAgent } from "../../../../types";

const editForm = inject<any>("agent-edit-form");
const mode = inject<any>("mode");
const assetsDialogVisible = inject<any>("assets-dialog-visible");
const macroSelectorVisible = ref(false);

// 资产分组统计
const assetGroupStats = computed(() => {
  const counts: Record<string, number> = {};
  // 初始化自定义分组
  editForm.assetGroups.forEach((g: any) => (counts[g.id] = 0));
  counts["default"] = 0;

  // 统计资产
  editForm.assets.forEach((asset: any) => {
    const gid = asset.group && counts[asset.group] !== undefined ? asset.group : "default";
    counts[gid]++;
  });
  return counts;
});

const sortedAssetGroups = computed(() => {
  return [...editForm.assetGroups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
});

// 虚拟时间预览相关
const virtualTimeEnabled = inject<any>("virtual-time-enabled");
const activeTab = inject<any>("active-tab");
const macroPreviewInput = ref("{{time}} | {{datetime_cn}} | {{shichen}}");
const macroPreviewResult = ref("");
let previewTimer: ReturnType<typeof setInterval> | null = null;

const parseMacroPreview = async (input: string): Promise<string> => {
  if (!input.trim()) return "";
  const extraContext = {
    agent:
      virtualTimeEnabled.value && editForm.virtualTimeConfig
        ? ({
            virtualTimeConfig: {
              virtualBaseTime: editForm.virtualTimeConfig.virtualBaseTime,
              realBaseTime: editForm.virtualTimeConfig.realBaseTime,
              timeScale: editForm.virtualTimeConfig.timeScale,
            },
          } as ChatAgent)
        : undefined,
  };
  const macroPattern = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)(?:::([^}]*))?\}\}/g;
  let result = input;
  const matches = Array.from(input.matchAll(macroPattern));
  const replacements = new Map<string, string>();

  for (const match of matches) {
    const fullMatch = match[0];
    const macroName = match[1];
    const argsStr = match[2];
    const args = argsStr ? argsStr.split("::") : undefined;
    if (replacements.has(fullMatch)) continue;
    try {
      const value = await MacroProcessor.executeDirectly(macroName, args, extraContext);
      replacements.set(fullMatch, value !== null ? value : `[无效宏: ${macroName}]`);
    } catch (e) {
      replacements.set(fullMatch, `[错误: ${macroName}]`);
    }
  }
  for (const [key, value] of replacements) {
    result = result.split(key).join(value);
  }
  return result;
};

const updateMacroPreview = async () => {
  macroPreviewResult.value = await parseMacroPreview(macroPreviewInput.value);
};

const startPreviewTimer = () => {
  stopPreviewTimer();
  updateMacroPreview();
  previewTimer = setInterval(updateMacroPreview, 1000);
};

const stopPreviewTimer = () => {
  if (previewTimer) {
    clearInterval(previewTimer);
    previewTimer = null;
  }
};

const shouldTimerBeRunning = computed(
  () => virtualTimeEnabled.value && activeTab.value === "capabilities"
);

watch(
  () => [
    shouldTimerBeRunning.value,
    editForm.virtualTimeConfig?.virtualBaseTime,
    editForm.virtualTimeConfig?.realBaseTime,
    editForm.virtualTimeConfig?.timeScale,
    macroPreviewInput.value,
  ],
  ([isRunning]) => {
    if (isRunning) startPreviewTimer();
    else stopPreviewTimer();
  },
  { deep: true, immediate: true }
);

onUnmounted(stopPreviewTimer);

const setRealBaseToNow = () => {
  if (editForm.virtualTimeConfig) {
    editForm.virtualTimeConfig.realBaseTime = new Date().toISOString();
  }
};

const handleInsertMacro = (macro: MacroDefinition) => {
  const insertText = macro.example || `{{${macro.name}}}`;
  macroPreviewInput.value += insertText;
  macroSelectorVisible.value = false;
};
</script>

<template>
  <div class="agent-section">
    <!-- 资产管理 -->
    <div class="section-group" data-setting-id="assets">
      <div class="section-group-title">资产管理</div>
      <div class="form-hint" style="margin-bottom: 12px">
        管理该智能体的专属资产（图片、音频等）。上传后可通过宏或 ID 在对话中引用。
      </div>
      <div style="display: flex; align-items: center; gap: 16px">
        <el-button
          type="primary"
          plain
          @click="assetsDialogVisible = true"
          :disabled="mode === 'create'"
        >
          打开资产管理器
        </el-button>
        <span v-if="mode === 'create'" style="font-size: 12px; color: var(--el-color-warning)">
          请先保存智能体后再管理资产
        </span>
        <span v-else style="font-size: 12px; color: var(--el-text-color-secondary)">
          当前包含 {{ editForm.assets.length }} 个资产
        </span>
      </div>

      <!-- 资产分组预览 -->
      <div
        class="asset-groups-preview"
        v-if="editForm.assets.length > 0 || editForm.assetGroups.length > 0"
      >
        <div v-for="group in sortedAssetGroups" :key="group.id" class="group-preview-item">
          <div class="group-icon">
            <span v-if="group.icon">{{ group.icon }}</span>
            <el-icon v-else><Folder /></el-icon>
          </div>
          <div class="group-info">
            <div class="group-name" :title="group.displayName">{{ group.displayName }}</div>
            <div class="group-count">{{ assetGroupStats[group.id] }} 个资产</div>
          </div>
        </div>
        <div v-if="assetGroupStats['default'] > 0" class="group-preview-item">
          <div class="group-icon">
            <el-icon><Collection /></el-icon>
          </div>
          <div class="group-info">
            <div class="group-name">未分组</div>
            <div class="group-count">{{ assetGroupStats["default"] }} 个资产</div>
          </div>
        </div>
      </div>
    </div>

    <el-divider />

    <!-- 虚拟时间线 -->
    <div class="section-group" data-setting-id="virtualTime">
      <div class="section-group-title">虚拟时间线</div>
      <div class="form-hint" style="margin-bottom: 12px" v-pre>
        设定智能体的虚拟时间流逝规则。启用后，{{ time }} 等宏将基于此配置计算时间。
      </div>
      <el-form-item label="启用虚拟时间">
        <el-switch v-model="virtualTimeEnabled" />
      </el-form-item>

      <template v-if="virtualTimeEnabled && editForm.virtualTimeConfig">
        <el-form-item label="虚拟基准点">
          <el-date-picker
            v-model="editForm.virtualTimeConfig.virtualBaseTime"
            type="datetime"
            placeholder="设定虚拟世界的起始时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="现实基准点">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-date-picker
              v-model="editForm.virtualTimeConfig.realBaseTime"
              type="datetime"
              placeholder="对应现实世界的时刻"
              style="flex: 1"
            />
            <el-button @click="setRealBaseToNow">设为现在</el-button>
          </div>
        </el-form-item>
        <el-form-item label="时间流速">
          <el-input-number
            v-model="editForm.virtualTimeConfig.timeScale"
            :step="0.1"
            :precision="2"
          />
        </el-form-item>

        <!-- 预览 -->
        <div class="macro-preview-box">
          <div class="preview-title">实时预览</div>
          <div class="macro-input-wrapper">
            <el-input
              v-model="macroPreviewInput"
              placeholder="输入要测试的宏，如 {{time}}"
              clearable
            />
            <el-popover
              v-model:visible="macroSelectorVisible"
              placement="bottom-end"
              :width="400"
              trigger="click"
            >
              <template #reference>
                <el-button plain :icon="MagicStick">插入宏</el-button>
              </template>
              <MacroSelector filter="contextFree" @insert="handleInsertMacro" />
            </el-popover>
          </div>
          <div class="macro-preview-result">
            {{ macroPreviewResult || "（输入宏后显示结果）" }}
          </div>
          <div class="form-hint" v-pre>
            支持：{{ time }}, {{ date }}, {{ datetime }}, {{ shichen }} 等
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.section-group {
  margin-bottom: 24px;
}
.section-group-title {
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 12px;
}
.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
}
.asset-groups-preview {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.group-preview-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}
.group-icon {
  font-size: 20px;
  color: var(--el-text-color-secondary);
}
.group-info {
  flex: 1;
  overflow: hidden;
}
.group-name {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.group-count {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
.macro-preview-box {
  margin-top: 16px;
  padding: 16px;
  background: var(--container-bg);
  border-radius: 8px;
  border: 1px solid var(--el-border-color-lighter);
}
.preview-title {
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.macro-input-wrapper {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}
.macro-preview-result {
  padding: 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 14px;
  word-break: break-all;
  min-height: 40px;
}
</style>
