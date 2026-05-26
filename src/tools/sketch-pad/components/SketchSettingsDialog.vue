<template>
  <BaseDialog v-model="visible" title="画板设置" width="640px" height="80vh">
    <div class="sketch-settings">
      <el-scrollbar>
        <el-form label-position="top" class="settings-form">
          <!-- 新建项目 -->
          <div class="settings-section">
            <div class="section-title">
              <FilePlus :size="16" />
              <span>新建项目</span>
            </div>

            <el-form-item label="默认画布尺寸">
              <div class="size-row">
                <el-input-number
                  v-model="local.defaultCanvasWidth"
                  :min="100"
                  :max="8192"
                  :step="10"
                  controls-position="right"
                  placeholder="宽"
                />
                <span class="size-separator">×</span>
                <el-input-number
                  v-model="local.defaultCanvasHeight"
                  :min="100"
                  :max="8192"
                  :step="10"
                  controls-position="right"
                  placeholder="高"
                />
              </div>
            </el-form-item>

            <el-form-item label="默认比例预设">
              <el-select v-model="local.defaultCanvasPreset" @change="handlePresetChange">
                <el-option
                  v-for="preset in CANVAS_PRESETS"
                  :key="preset.id"
                  :label="`${preset.name} (${preset.ratioLabel})`"
                  :value="preset.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item>
              <div class="switch-row">
                <el-switch v-model="local.createBackgroundLayer" />
                <span class="switch-label">新建时创建填充图层</span>
              </div>
            </el-form-item>

            <Transition name="fade">
              <div v-if="local.createBackgroundLayer" class="sub-settings">
                <el-form-item label="默认填充色">
                  <div class="color-row">
                    <el-color-picker v-model="bgColorProxy" show-alpha :predefine="BG_COLOR_PRESETS" />
                    <el-button
                      v-if="local.backgroundLayerColor"
                      text
                      size="small"
                      @click="local.backgroundLayerColor = null"
                    >
                      设为透明
                    </el-button>
                    <span class="color-hint">{{ local.backgroundLayerColor || "透明" }}</span>
                  </div>
                </el-form-item>
              </div>
            </Transition>

            <el-form-item>
              <div class="switch-row">
                <el-switch v-model="local.createObjectLayer" />
                <span class="switch-label">新建时创建矢量对象图层</span>
              </div>
            </el-form-item>

            <Transition name="fade">
              <el-form-item v-if="local.createObjectLayer" label="对象图层名称">
                <el-input v-model="local.objectLayerName" placeholder="矢量标注" />
              </el-form-item>
            </Transition>
          </div>

          <!-- 画笔默认值 -->
          <div class="settings-section">
            <div class="section-title">
              <Pencil :size="16" />
              <span>画笔默认值</span>
            </div>

            <el-form-item label="默认大小">
              <el-slider v-model="local.defaultBrushSize" :min="1" :max="100" :step="1" show-input />
            </el-form-item>

            <el-form-item label="默认颜色">
              <el-color-picker v-model="local.defaultBrushColor" :predefine="PRESET_COLORS" />
            </el-form-item>

            <el-form-item label="默认透明度">
              <el-slider v-model="local.defaultBrushOpacity" :min="0" :max="1" :step="0.05" show-input />
            </el-form-item>
          </div>

          <!-- 形状默认值 -->
          <div class="settings-section">
            <div class="section-title">
              <Square :size="16" />
              <span>形状默认值</span>
            </div>

            <el-form-item label="描边宽度">
              <el-slider v-model="local.defaultStrokeWidth" :min="1" :max="20" :step="1" show-input />
            </el-form-item>

            <el-form-item label="描边颜色">
              <el-color-picker v-model="local.defaultStrokeColor" :predefine="PRESET_COLORS" />
            </el-form-item>

            <el-form-item label="填充颜色">
              <div class="color-row">
                <el-color-picker v-model="fillColorProxy" show-alpha :predefine="PRESET_COLORS" />
                <el-button v-if="local.defaultFillColor" text size="small" @click="local.defaultFillColor = null">
                  无填充
                </el-button>
                <span class="color-hint">{{ local.defaultFillColor || "无填充" }}</span>
              </div>
            </el-form-item>

            <el-form-item label="圆角半径">
              <el-slider v-model="local.defaultCornerRadius" :min="0" :max="50" :step="1" show-input />
            </el-form-item>
          </div>

          <!-- 文字默认值 -->
          <div class="settings-section">
            <div class="section-title">
              <Type :size="16" />
              <span>文字默认值</span>
            </div>

            <el-form-item label="默认字号">
              <el-input-number
                v-model="local.defaultFontSize"
                :min="8"
                :max="200"
                :step="2"
                controls-position="right"
              />
            </el-form-item>

            <el-form-item label="默认颜色">
              <el-color-picker v-model="local.defaultTextColor" :predefine="PRESET_COLORS" />
            </el-form-item>
          </div>

          <!-- 画布外观 -->
          <div class="settings-section">
            <div class="section-title">
              <Grid3x3 :size="16" />
              <span>画布外观</span>
            </div>

            <el-form-item label="棋盘格透明度">
              <el-slider v-model="local.checkerOpacity" :min="0" :max="1" :step="0.05" show-input />
              <span class="setting-hint">设为 0 可完全隐藏棋盘格背景</span>
            </el-form-item>
          </div>

          <!-- 行为设置 -->
          <div class="settings-section">
            <div class="section-title">
              <Settings :size="16" />
              <span>行为</span>
            </div>

            <el-form-item>
              <div class="switch-row">
                <el-switch v-model="local.autoSaveEnabled" />
                <span class="switch-label">启用自动保存</span>
              </div>
            </el-form-item>

            <Transition name="fade">
              <el-form-item v-if="local.autoSaveEnabled" label="自动保存间隔（秒）">
                <el-input-number
                  v-model="local.autoSaveInterval"
                  :min="10"
                  :max="300"
                  :step="5"
                  controls-position="right"
                />
              </el-form-item>
            </Transition>

            <el-form-item>
              <div class="switch-row">
                <el-switch v-model="local.showToolSwitchHint" />
                <span class="switch-label">切换工具时显示图层提示</span>
              </div>
            </el-form-item>
          </div>
        </el-form>
      </el-scrollbar>
    </div>

    <template #footer>
      <el-button @click="handleReset">恢复默认</el-button>
      <el-button type="primary" @click="handleSave">保存</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { reactive, watch, computed } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { FilePlus, Pencil, Square, Type, Settings, Grid3x3 } from "lucide-vue-next";
import { useSketchSettings, DEFAULT_SKETCH_SETTINGS } from "../composables/useSketchSettings";
import { PRESET_COLORS } from "../constants";
import { customMessage } from "@/utils/customMessage";
import { ElMessageBox } from "element-plus";
import type { SketchPadSettings } from "../types";

const visible = defineModel<boolean>({ default: false });

const { settings, saveSettings, resetSettings } = useSketchSettings();

// 本地编辑副本
const local = reactive<SketchPadSettings>({ ...DEFAULT_SKETCH_SETTINGS });

// 画布预设（与 SketchGallery 保持一致）
const CANVAS_PRESETS = [
  { id: "ultrawide", name: "超宽", ratioLabel: "2.39:1", width: 2390, height: 1000 },
  { id: "wide", name: "宽屏", ratioLabel: "1.85:1", width: 1850, height: 1000 },
  { id: "hd", name: "HD", ratioLabel: "16:9", width: 1920, height: 1080 },
  { id: "old", name: "传统", ratioLabel: "4:3", width: 1600, height: 1200 },
  { id: "square", name: "方形", ratioLabel: "1:1", width: 1024, height: 1024 },
  { id: "vertical", name: "竖屏", ratioLabel: "9:16", width: 1080, height: 1920 },
  { id: "custom", name: "自定义", ratioLabel: "自由", width: 1920, height: 1080 },
] as const;

const BG_COLOR_PRESETS = ["#ffffff", "#f5f5f5", "#e8e8e8", "#1a1a1a", "#2d2d2d", "#000000", "#fffbe6", "#f0f5ff"];

// 背景色代理（处理 null <-> 颜色选择器的交互）
const bgColorProxy = computed({
  get: () => local.backgroundLayerColor || undefined,
  set: (val) => {
    local.backgroundLayerColor = val || null;
  },
});

// 填充色代理
const fillColorProxy = computed({
  get: () => local.defaultFillColor || undefined,
  set: (val) => {
    local.defaultFillColor = val || null;
  },
});

// 打开时同步设置到本地副本
watch(visible, (val) => {
  if (val) {
    Object.assign(local, settings.value);
  }
});

function handlePresetChange(presetId: string) {
  const preset = CANVAS_PRESETS.find((p) => p.id === presetId);
  if (preset && presetId !== "custom") {
    local.defaultCanvasWidth = preset.width;
    local.defaultCanvasHeight = preset.height;
  }
}

async function handleSave() {
  await saveSettings({ ...local });
  customMessage.success("画板设置已保存");
  visible.value = false;
}

async function handleReset() {
  try {
    await ElMessageBox.confirm("确定要恢复所有设置为默认值吗？", "提示", {
      confirmButtonText: "确定",
      cancelButtonText: "取消",
      type: "warning",
      lockScroll: false,
    });
    await resetSettings();
    Object.assign(local, DEFAULT_SKETCH_SETTINGS);
    customMessage.success("已恢复默认设置");
  } catch {
    // 取消
  }
}
</script>

<style scoped>
.sketch-settings {
  height: 100%;
  padding: 0 4px;
}

.settings-form {
  max-width: 560px;
  margin: 0 auto;
  padding-bottom: 16px;
}

.settings-section {
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
}

.settings-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 16px;
}

.size-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.size-separator {
  font-size: 16px;
  color: var(--el-text-color-placeholder);
  font-weight: 300;
}

.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.switch-label {
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.sub-settings {
  padding-left: 16px;
  border-left: 2px solid rgba(var(--primary-color-rgb), 0.2);
  margin-top: 8px;
}

.color-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.color-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-family: monospace;
}

.setting-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  margin-top: 4px;
}

/* 过渡动画 */
.fade-enter-active,
.fade-leave-active {
  transition: all 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
