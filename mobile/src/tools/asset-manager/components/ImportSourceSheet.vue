<script setup lang="ts">
import { Camera, FilePlus2, Images, X } from "lucide-vue-next";

const emit = defineEmits<{
  close: [];
  pick: [source: "file" | "photo" | "camera"];
}>();
</script>

<template>
  <div class="sheet-layer" role="presentation" @click.self="emit('close')">
    <section class="source-sheet" role="dialog" aria-modal="true" aria-labelledby="import-source-title" data-testid="asset-import-source-sheet">
      <header class="sheet-header">
        <div>
          <h2 id="import-source-title">导入资产</h2>
          <p>选择要导入的来源</p>
        </div>
        <button class="icon-button" type="button" data-testid="asset-import-close" aria-label="关闭导入选择" @click="emit('close')"><X :size="22" /></button>
      </header>
      <div class="source-actions">
        <button type="button" data-testid="asset-import-file" @click="emit('pick', 'file')">
          <FilePlus2 :size="23" />
          <span><strong>从文件导入</strong><small>选择文档、音频、视频或其他文件</small></span>
        </button>
        <button type="button" data-testid="asset-import-photo" @click="emit('pick', 'photo')">
          <Images :size="23" />
          <span><strong>从照片和视频导入</strong><small>使用系统媒体选择器，不申请全库权限</small></span>
        </button>
        <button type="button" data-testid="asset-import-camera" @click="emit('pick', 'camera')">
          <Camera :size="23" />
          <span><strong>拍摄照片</strong><small>调用系统相机，照片会复制到资产库</small></span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sheet-layer {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  background: rgba(0, 0, 0, 0.42);
}

.source-sheet {
  width: 100%;
  color: var(--text-color);
  background: var(--overlay-bg);
  border-top: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-xl) var(--app-radius-xl) 0 0;
}

.sheet-header {
  min-height: 64px;
  padding: 14px 12px 10px 18px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.sheet-header h2 { margin: 0; font-size: 17px; }
.sheet-header p { margin: 4px 0 0; color: var(--text-color-light); font-size: 12px; }

.icon-button {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  color: var(--text-color);
  background: transparent;
  border: 0;
}

.source-actions {
  padding: 6px 18px calc(18px + env(safe-area-inset-bottom));
}

.source-actions button {
  width: 100%;
  min-height: 64px;
  padding: 12px 0;
  display: flex;
  align-items: center;
  gap: 13px;
  color: var(--text-color);
  text-align: left;
  background: transparent;
  border: 0;
  border-bottom: var(--border-width) solid var(--border-color);
}

.source-actions button:last-child { border-bottom: 0; }
.source-actions button > svg { color: var(--primary-color); }
.source-actions span { display: flex; flex-direction: column; gap: 3px; }
.source-actions strong { font-size: 14px; }
.source-actions small { color: var(--text-color-light); font-size: 12px; }
</style>
