<template>
  <InfoCard title="扫描配置" class="config-card">
    <div class="config-content">
      <!-- 预设选择 -->
      <div class="config-section preset-section">
        <label>快速预设</label>
        <el-select
          v-model="selectedPresetId"
          placeholder="选择预设配置"
          clearable
          @change="handlePresetChange"
          class="full-width"
        >
          <el-option
            v-for="preset in presets"
            :key="preset.id"
            :label="preset.name"
            :value="preset.id"
          >
            <div class="preset-option">
              <span class="preset-name">{{ preset.name }}</span>
              <span class="preset-desc">{{ preset.description }}</span>
            </div>
          </el-option>
        </el-select>
      </div>

      <div class="config-section">
        <label>扫描路径</label>
        <DropZone
          variant="input"
          :directory-only="true"
          :multiple="false"
          hide-content
          @drop="handlePathDrop"
        >
          <div class="path-input-group">
            <el-input
              v-model="localScanPath"
              placeholder="输入或拖拽目录路径"
              @keyup.enter="emitAnalyze"
            />
            <el-button @click="selectDirectory" :icon="FolderOpened">选择</el-button>
          </div>
        </DropZone>
      </div>

      <div class="config-section">
        <label>过滤条件</label>

        <div class="filter-item">
          <span class="filter-label">名称匹配</span>
          <el-input v-model="localNamePattern" placeholder="例如: *.tmp 或 temp*" clearable>
            <template #prepend>
              <el-icon>
                <Filter />
              </el-icon>
            </template>
          </el-input>
        </div>

        <div class="filter-item">
          <span class="filter-label">最小年龄（天）</span>
          <el-input-number
            v-model="localMinAgeDays"
            :min="0"
            :max="3650"
            placeholder="修改时间早于 N 天前"
            controls-position="right"
            class="full-width"
          />
        </div>

        <div class="filter-item">
          <span class="filter-label">最小大小（MB）</span>
          <el-input-number
            v-model="localMinSizeMB"
            :min="0"
            :max="102400"
            placeholder="大于 N MB"
            controls-position="right"
            class="full-width"
          />
        </div>

        <div class="filter-item">
          <span class="filter-label">扫描深度</span>
          <div class="slider-wrapper">
            <el-slider
              v-model="localMaxDepth"
              :min="1"
              :max="10"
              :marks="{ 1: '1', 5: '5', 10: '无限' }"
              show-stops
            />
          </div>
          <div class="depth-info">
            {{ localMaxDepth === 10 ? "无限制" : `${localMaxDepth} 层` }}
          </div>
        </div>
      </div>
    </div>

    <div class="button-footer">
      <el-button
        v-if="!isAnalyzing"
        type="primary"
        @click="emitAnalyze"
        :disabled="!localScanPath"
        class="analyze-btn"
      >
        <el-icon style="padding-right: 5px">
          <Search />
        </el-icon>
        开始分析
      </el-button>
      <el-button
        v-else
        type="warning"
        @click="emitStop"
        class="analyze-btn"
      >
        <el-icon style="padding-right: 5px">
          <CloseBold />
        </el-icon>
        停止扫描
      </el-button>
    </div>
  </InfoCard>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { customMessage } from '@/utils/customMessage';
import { FolderOpened, Search, Filter, CloseBold } from "@element-plus/icons-vue";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import InfoCard from "@components/common/InfoCard.vue";
import DropZone from "@components/common/DropZone.vue";
import { builtInPresets, type CleanupPreset } from "../config/presets";
import { createModuleLogger } from "@utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const logger = createModuleLogger("tools/directory-janitor/ConfigPanel");
const errorHandler = createModuleErrorHandler("tools/directory-janitor/ConfigPanel");

interface Props {
  scanPath: string;
  namePattern: string;
  minAgeDays?: number;
  minSizeMB?: number;
  maxDepth: number;
  isAnalyzing: boolean;
  applyPreset: (preset: CleanupPreset) => Promise<any>;
}

interface Emits {
  (e: "update:scanPath", value: string): void;
  (e: "update:namePattern", value: string): void;
  (e: "update:minAgeDays", value: number | undefined): void;
  (e: "update:minSizeMB", value: number | undefined): void;
  (e: "update:maxDepth", value: number): void;
  (e: "analyze"): void;
  (e: "stop"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 预设配置
const presets = ref<CleanupPreset[]>(builtInPresets);
const selectedPresetId = ref<string | undefined>(undefined);

// 本地状态（用于 v-model）
const localScanPath = ref(props.scanPath);
const localNamePattern = ref(props.namePattern);
const localMinAgeDays = ref(props.minAgeDays);
const localMinSizeMB = ref(props.minSizeMB);
const localMaxDepth = ref(props.maxDepth);

// 同步本地状态到父组件
watch(localScanPath, (value) => emit("update:scanPath", value));
watch(localNamePattern, (value) => emit("update:namePattern", value));
watch(localMinAgeDays, (value) => emit("update:minAgeDays", value));
watch(localMinSizeMB, (value) => emit("update:minSizeMB", value));
watch(localMaxDepth, (value) => emit("update:maxDepth", value));

// 同步父组件状态到本地
watch(
  () => props.scanPath,
  (value) => (localScanPath.value = value)
);
watch(
  () => props.namePattern,
  (value) => (localNamePattern.value = value)
);
watch(
  () => props.minAgeDays,
  (value) => (localMinAgeDays.value = value)
);
watch(
  () => props.minSizeMB,
  (value) => (localMinSizeMB.value = value)
);
watch(
  () => props.maxDepth,
  (value) => (localMaxDepth.value = value)
);
// 应用预设
const handlePresetChange = async (presetId?: string) => {
  if (!presetId) {
    return;
  }
  const preset = presets.value.find((p: any) => p.id === presetId);
  if (!preset) {
    logger.warn("未找到预设", { presetId });
    return;
  }

  const result = await props.applyPreset(preset);
  if (result) {
    // 应用预设配置到本地状态
    localScanPath.value = result.resolvedPath;
    localNamePattern.value = preset.namePattern ?? "";
    localMinAgeDays.value = preset.minAgeDays;
    localMinSizeMB.value = preset.minSizeMB;
    localMaxDepth.value = preset.maxDepth ?? 10;

    if (result.needSelectPath) {
      customMessage.info(`已应用预设: ${result.presetName}，请选择扫描路径`);
    } else {
      customMessage.success(`已应用预设: ${result.presetName}`);
    }
    // 重置选择，以便可以再次选择相同的预设
    selectedPresetId.value = undefined;
  }
};

// 处理路径拖放
const handlePathDrop = (paths: string[]) => {
  if (paths.length > 0) {
    localScanPath.value = paths[0];
    customMessage.success(`已设置扫描路径: ${paths[0]}`);
  }
};

// 选择目录
const selectDirectory = async () => {
  try {
    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: "选择要扫描的目录",
    });
    if (typeof selected === "string") {
      localScanPath.value = selected;
    }
  } catch (error) {
    errorHandler.error(error, "选择目录失败");
  }
};

// 触发分析
const emitAnalyze = () => {
  emit("analyze");
};

// 触发停止
const emitStop = () => {
  emit("stop");
};
</script>

<style scoped>
.config-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.config-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

.button-footer {
  flex-shrink: 0;
  padding-top: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.config-section {
  margin-bottom: 20px;
}

.config-section label {
  display: block;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.preset-section {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.preset-option {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
}

.preset-desc {
  font-size: 12px;
  color: var(--text-color-light);
}

.path-input-group {
  display: flex;
  gap: 8px;
}

.filter-item {
  margin-bottom: 16px;
}

.filter-label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--text-color-light);
}

.full-width {
  width: 100%;
}

.slider-wrapper {
  padding: 0 16px;
}

.depth-info {
  text-align: center;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-light);
}

.analyze-btn {
  width: 100%;
}
</style>
