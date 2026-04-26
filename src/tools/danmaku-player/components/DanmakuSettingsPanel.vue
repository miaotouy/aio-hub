<template>
  <div class="danmaku-settings">
    <el-form :model="config" label-position="top" size="small">
      <!-- 弹幕面板标题 -->
      <div class="settings-header">
        <span class="title">显示设置</span>
      </div>

      <!-- 类型过滤 -->
      <div class="settings-group" :class="{ disabled: !config.enabled }">
        <div class="group-title">类型过滤</div>
        <div class="checkbox-row">
          <el-checkbox v-model="config.showScroll">滚动</el-checkbox>
          <el-checkbox v-model="config.showFixed">固定</el-checkbox>
          <el-checkbox v-model="config.showColored">彩色</el-checkbox>
        </div>
      </div>

      <!-- 显示调整 -->
      <div class="settings-group" :class="{ disabled: !config.enabled }">
        <div class="group-title">显示调整</div>
        <el-form-item>
          <template #label>
            <div class="slider-label">
              <span>显示区域</span>
              <span class="value-hint">{{ config.displayArea }}%</span>
            </div>
          </template>
          <el-slider v-model="config.displayArea" :min="0" :max="100" :format-tooltip="(val: number) => val + '%'" />
        </el-form-item>
        <el-form-item>
          <template #label>
            <div class="slider-label">
              <span>弹幕密度</span>
              <span class="value-hint">{{ config.density }}%</span>
            </div>
          </template>
          <el-slider v-model="config.density" :min="0" :max="100" :format-tooltip="(val: number) => val + '%'" />
        </el-form-item>
        <el-form-item>
          <template #label>
            <div class="slider-label">
              <span>不透明度</span>
              <span class="value-hint">{{ config.opacity }}%</span>
            </div>
          </template>
          <el-slider v-model="config.opacity" :min="0" :max="100" :format-tooltip="(val: number) => val + '%'" />
        </el-form-item>
        <el-form-item>
          <template #label>
            <div class="slider-label">
              <span>字号缩放</span>
              <span class="value-hint">{{ config.fontScale }}%</span>
            </div>
          </template>
          <el-slider v-model="config.fontScale" :min="50" :max="200" :format-tooltip="(val: number) => val + '%'" />
        </el-form-item>
        <el-form-item>
          <template #label>
            <div class="slider-label">
              <span>飞行速度</span>
              <span class="value-hint">{{ config.speed.toFixed(1) }}x</span>
            </div>
          </template>
          <el-slider
            v-model="config.speed"
            :min="0.5"
            :max="2.0"
            :step="0.1"
            :format-tooltip="(val: number) => val + 'x'"
          />
        </el-form-item>
      </div>

      <!-- 高级设置 -->
      <div class="settings-group" :class="{ disabled: !config.enabled }">
        <div class="group-title">高级设置</div>
        <el-form-item label="描边类型">
          <el-radio-group v-model="config.borderType">
            <el-radio-button value="shadow">投影</el-radio-button>
            <el-radio-button value="outline">描边</el-radio-button>
            <el-radio-button value="glow">重墨</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-checkbox v-model="config.isBold">强制粗体</el-checkbox>
        <el-checkbox v-model="config.preventSubtitleOverlap">防挡字幕 (底部留空)</el-checkbox>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import type { DanmakuConfig } from "../types";

defineProps<{
  config: DanmakuConfig;
}>();
</script>

<style scoped>
.danmaku-settings {
  padding: 4px;
}

.settings-header {
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.settings-header .title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.settings-group {
  margin-bottom: 20px;
}

.settings-group.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.group-title {
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.checkbox-row {
  display: flex;
  gap: 16px;
  margin-bottom: 8px;
}

:deep(.el-form-item) {
  margin-bottom: 12px;
}

:deep(.el-form-item__label) {
  font-size: 12px;
  margin-bottom: 4px !important;
  color: var(--el-text-color-regular);
  width: 100%;
}

.slider-label {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.value-hint {
  font-family: var(--el-font-family-mono);
  color: var(--el-color-primary);
  font-weight: bold;
}
</style>
