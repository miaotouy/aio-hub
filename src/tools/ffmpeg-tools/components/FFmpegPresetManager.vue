<template>
  <div class="preset-manager">
    <!-- 预设选择器 + 操作栏 -->
    <div class="preset-toolbar">
      <el-select
        v-model="selectedPresetId"
        :placeholder="placeholder"
        clearable
        filterable
        class="preset-selector"
        size="default"
        @change="handlePresetChange"
      >
        <el-option-group label="📦 内置预设">
          <el-option v-for="preset in builtinPresets" :key="preset.id" :label="preset.name" :value="preset.id">
            <div class="preset-option">
              <div class="preset-option-label">{{ preset.name }}</div>
              <div v-if="preset.description" class="preset-option-desc">{{ preset.description }}</div>
            </div>
          </el-option>
        </el-option-group>
        <el-option-group v-if="userPresets.length > 0" label="⭐ 我的预设">
          <el-option v-for="preset in userPresets" :key="preset.id" :label="preset.name" :value="preset.id">
            <div class="preset-option">
              <div class="preset-option-label">{{ preset.name }}</div>
              <div v-if="preset.description" class="preset-option-desc">{{ preset.description }}</div>
            </div>
          </el-option>
        </el-option-group>
      </el-select>

      <div class="preset-actions">
        <el-tooltip content="保存当前参数为预设">
          <el-button :icon="Save" size="small" @click="handleSaveAsPreset" />
        </el-tooltip>
        <el-tooltip content="管理预设">
          <el-button :icon="Settings" size="small" @click="dialogVisible = true" />
        </el-tooltip>
      </div>
    </div>

    <!-- 导出/导入操作 -->
    <div v-if="selectedPreset" class="preset-info">
      <div class="preset-info-text">
        <span class="preset-info-name">{{ selectedPreset.name }}</span>
        <span v-if="selectedPreset.description" class="preset-info-desc">— {{ selectedPreset.description }}</span>
        <el-tag v-if="selectedPreset.isSystem" size="small" type="info" effect="plain">内置</el-tag>
        <el-tag v-else size="small" type="warning" effect="plain">自定义</el-tag>
      </div>
      <div class="preset-info-actions">
        <el-button size="small" :icon="Download" link @click="handleExportPreset">导出</el-button>
      </div>
    </div>

    <!-- 保存为预设弹窗 -->
    <el-dialog v-model="saveDialogVisible" title="保存为预设" width="420">
      <el-form label-position="top">
        <el-form-item label="预设名称">
          <el-input v-model="saveForm.name" placeholder="输入预设名称" maxlength="30" show-word-limit />
        </el-form-item>
        <el-form-item label="描述（可选）">
          <el-input
            v-model="saveForm.description"
            placeholder="简要说明这个预设的用途"
            type="textarea"
            :rows="2"
            maxlength="100"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="saveDialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="!saveForm.name.trim()" @click="confirmSave">保存</el-button>
      </template>
    </el-dialog>

    <!-- 管理预设弹窗 -->
    <el-dialog v-model="dialogVisible" title="管理预设" width="600">
      <div class="manager-body">
        <!-- 内置预设只读展示 -->
        <div class="preset-group">
          <div class="preset-group-title">📦 内置预设 ({{ builtinPresets.length }})</div>
          <div class="preset-group-list">
            <div v-for="preset in builtinPresets" :key="preset.id" class="preset-group-item">
              <div class="preset-item-info">
                <div class="preset-item-name">{{ preset.name }}</div>
                <div v-if="preset.description" class="preset-item-desc">{{ preset.description }}</div>
              </div>
              <el-button size="small" :icon="Download" link @click="handleExportPreset(preset)">导出</el-button>
            </div>
          </div>
        </div>

        <!-- 自定义预设可删除 -->
        <div v-if="userPresets.length > 0" class="preset-group">
          <div class="preset-group-title">⭐ 我的预设 ({{ userPresets.length }})</div>
          <div class="preset-group-list">
            <div v-for="preset in userPresets" :key="preset.id" class="preset-group-item">
              <div class="preset-item-info">
                <div class="preset-item-name">
                  <el-input
                    v-if="renamingId === preset.id"
                    v-model="renameForm.name"
                    size="small"
                    class="rename-input"
                    @keyup.enter="confirmRename(preset.id)"
                    @blur="confirmRename(preset.id)"
                    ref="renameInputRef"
                  />
                  <template v-else>{{ preset.name }}</template>
                </div>
                <div v-if="preset.description" class="preset-item-desc">{{ preset.description }}</div>
              </div>
              <div class="preset-item-actions">
                <el-button size="small" :icon="Download" link @click="handleExportPreset(preset)" />
                <el-button size="small" :icon="Pencil" link @click="startRename(preset)" />
                <el-popconfirm title="确定删除此预设？" @confirm="handleDeletePreset(preset.id)">
                  <template #reference>
                    <el-button size="small" :icon="Trash2" link type="danger" />
                  </template>
                </el-popconfirm>
              </div>
            </div>
          </div>
        </div>

        <!-- 自定义预设为空 -->
        <el-empty v-else description="还没有自定义预设" :image-size="60" />
      </div>
      <template #footer>
        <div class="manager-footer">
          <el-button :icon="Upload" @click="handleImportPreset">导入预设</el-button>
          <el-button type="primary" @click="dialogVisible = false">完成</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick } from "vue";
import { Save, Settings, Download, Upload, Pencil, Trash2 } from "lucide-vue-next";
import { useFFmpegStore } from "../ffmpegStore";
import { BUILTIN_PRESETS } from "../config";
import type { FFmpegPreset, FFmpegParams } from "../types";
import { customMessage } from "@/utils/customMessage";

defineProps<{
  /** 提示文字 */
  placeholder?: string;
}>();

const emit = defineEmits<{
  (e: "apply", preset: FFmpegPreset): void;
  (e: "save-as-preset", name: string, description: string): void;
}>();

const store = useFFmpegStore();

// 预设选择
const selectedPresetId = ref<string | "">("");

/** 合并完整的预设列表 */
const allPresets = computed(() => store.allPresets);
const builtinPresets = computed(() => BUILTIN_PRESETS);
const userPresets = computed(() => store.presets);
const selectedPreset = computed(() => allPresets.value.find((p) => p.id === selectedPresetId.value));

const handlePresetChange = (presetId: string | "") => {
  if (!presetId) return;
  const preset = allPresets.value.find((p) => p.id === presetId);
  if (preset) {
    emit("apply", preset);
  }
};

// 保存为预设
const saveDialogVisible = ref(false);
const saveForm = reactive({ name: "", description: "" });

const handleSaveAsPreset = () => {
  saveForm.name = "";
  saveForm.description = "";
  saveDialogVisible.value = true;
};
const confirmSave = () => {
  if (!saveForm.name.trim()) return;
  emit("save-as-preset", saveForm.name.trim(), saveForm.description.trim());
  saveDialogVisible.value = false;
};

// 管理预设
const dialogVisible = ref(false);
const renamingId = ref<string | null>(null);
const renameForm = reactive({ name: "" });
const startRename = (preset: FFmpegPreset) => {
  renamingId.value = preset.id;
  renameForm.name = preset.name;
  nextTick(() => {
    const el = document.querySelector(".rename-input input") as HTMLInputElement;
    el?.focus();
    el?.select();
  });
};

const confirmRename = (presetId: string) => {
  if (renamingId.value !== presetId) return;
  if (renameForm.name.trim()) {
    store.renamePreset(presetId, renameForm.name.trim());
  }
  renamingId.value = null;
};

const handleDeletePreset = (presetId: string) => {
  store.deletePreset(presetId);
  // 如果删除的是当前选中的预设，清除选中
  if (selectedPresetId.value === presetId) {
    selectedPresetId.value = "";
  }
};

// 导入/导出
const handleExportPreset = (preset?: FFmpegPreset) => {
  const target = preset || selectedPreset.value;
  if (!target) return;

  const exportData = {
    version: 1,
    type: "ffmpeg-preset",
    name: target.name,
    description: target.description,
    params: target.params,
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ffmpeg-preset-${target.name.replace(/[/\\?%*:|"<>]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  customMessage.success(`已导出预设: ${target.name}`);
};

const handleImportPreset = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data.version !== 1 || data.type !== "ffmpeg-preset") {
        customMessage.error("无效的预设文件");
        return;
      }
      store.saveAsPreset(data.name, data.description || "", data.params as Partial<FFmpegParams>);
      customMessage.success(`已导入预设: ${data.name}`);
    } catch {
      customMessage.error("解析预设文件失败");
    }
  };
  input.click();
};

// 外部重置选中状态
const resetSelection = () => {
  selectedPresetId.value = "";
};

defineExpose({ resetSelection });
</script>

<style scoped>
.preset-manager {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preset-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-selector {
  flex: 1;
}

.preset-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.preset-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}

.preset-option-label {
  font-weight: 500;
  font-size: 13px;
}

.preset-option-desc {
  font-size: 11px;
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 300px;
}

.preset-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: var(--input-bg);
  border-radius: 6px;
  font-size: 12px;
}

.preset-info-text {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.preset-info-name {
  font-weight: 600;
  white-space: nowrap;
}

.preset-info-desc {
  color: var(--text-color-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preset-info-actions {
  flex-shrink: 0;
}

.manager-body {
  max-height: 400px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preset-group-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
  color: var(--text-color);
}

.preset-group-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--input-bg);
  transition: background 0.15s;
}

.preset-group-item:hover {
  background: var(--el-fill-color-light);
}

.preset-item-info {
  flex: 1;
  min-width: 0;
}

.preset-item-name {
  font-weight: 500;
  font-size: 13px;
}

.preset-item-desc {
  font-size: 11px;
  color: var(--text-color-light);
  margin-top: 2px;
}

.preset-item-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.rename-input {
  width: 180px;
}

.manager-footer {
  display: flex;
  justify-content: space-between;
}
</style>
