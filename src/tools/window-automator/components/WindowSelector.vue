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

<script setup lang="ts">
/**
 * 窗口选择器
 *
 * 支持两种模式：
 *  - inline（默认）：下拉 + 刷新按钮，嵌入到其它面板中。
 *  - dialog：作为 BaseDialog 弹出展示。
 *
 * 选择某个窗口后，会调用 store.setBoundWindow 同步当前绑定。
 */
import { computed, ref, onMounted, watch } from "vue";
import { RefreshCw, Check, X } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import { useWindowBinding } from "../composables/useWindowBinding";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";
import type { WindowInfo } from "../types";

const props = withDefaults(
  defineProps<{
    mode?: "inline" | "dialog";
    modelValue?: boolean;
  }>(),
  { mode: "inline", modelValue: false }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "bound", window: WindowInfo | null): void;
}>();

const logger = createModuleLogger("window-automator/WindowSelector");
const store = useWindowAutomatorStore();
const { windows, isLoading, refresh, isValid } = useWindowBinding();

const showDialog = computed({
  get: () => (props.mode === "dialog" ? props.modelValue : false),
  set: (v) => emit("update:modelValue", v),
});

const selectedHwnd = ref<number | null>(null);
const filterText = ref("");

const filteredWindows = computed(() => {
  const q = filterText.value.trim().toLowerCase();
  if (!q) return windows.value;
  return windows.value.filter(
    (w) =>
      w.title.toLowerCase().includes(q) ||
      w.processName.toLowerCase().includes(q) ||
      w.className.toLowerCase().includes(q)
  );
});

async function reload() {
  await refresh(true);
  if (store.boundWindow) {
    const still = windows.value.find((w) => w.hwnd === store.boundWindow!.hwnd);
    if (!still) {
      store.appendLog(
        "warn",
        null,
        `已绑定窗口 [${store.boundWindow.title}] 已不在窗口列表中`
      );
    }
  }
}

async function bindTarget(win: WindowInfo) {
  const valid = await isValid(win.hwnd);
  if (!valid) {
    customMessage.warning(`窗口 [${win.title}] 句柄已失效，请刷新后重试`);
    return;
  }
  store.setBoundWindow(win);
  logger.info("绑定窗口", { hwnd: win.hwnd, title: win.title });
  customMessage.success(`已绑定: ${win.title}`);
  selectedHwnd.value = win.hwnd;
  emit("bound", win);
  if (props.mode === "dialog") showDialog.value = false;
}

function unbind() {
  store.setBoundWindow(null);
  selectedHwnd.value = null;
  customMessage.info("已解绑窗口");
  emit("bound", null);
}

function onSelectChange(v: number | null) {
  if (v === null) {
    unbind();
  } else {
    const w = windows.value.find((x) => x.hwnd === v);
    if (w) void bindTarget(w);
  }
}

onMounted(async () => {
  await reload();
  if (store.boundWindow) selectedHwnd.value = store.boundWindow.hwnd;
});

watch(
  () => store.boundWindow,
  (val) => {
    selectedHwnd.value = val ? val.hwnd : null;
  }
);
</script>

<template>
  <!-- inline 模式：内嵌到工具栏 -->
  <div v-if="mode === 'inline'" class="window-selector inline">
    <el-select
      :model-value="selectedHwnd"
      :loading="isLoading"
      :placeholder="
        store.boundWindow ? store.boundWindow.title : '点击选择目标窗口'
      "
      filterable
      clearable
      style="min-width: 240px"
      @change="onSelectChange"
    >
      <template #prefix>
        <Check
          v-if="store.boundWindow"
          :size="14"
          style="color: var(--el-color-success)"
        />
      </template>
      <el-option
        v-for="w in filteredWindows"
        :key="w.hwnd"
        :label="w.title || '(无标题)'"
        :value="w.hwnd"
      >
        <div class="option-row">
          <div class="option-title">{{ w.title || "(无标题)" }}</div>
          <div class="option-meta">
            <span class="process">{{ w.processName }}</span>
            <span class="class">{{ w.className }}</span>
          </div>
        </div>
      </el-option>
    </el-select>
    <el-tooltip content="刷新窗口列表" placement="top">
      <el-button :icon="RefreshCw" :loading="isLoading" @click="reload" />
    </el-tooltip>
    <el-tooltip v-if="store.boundWindow" content="解绑当前窗口" placement="top">
      <el-button :icon="X" @click="unbind" />
    </el-tooltip>
  </div>

  <!-- dialog 模式：弹窗 -->
  <BaseDialog
    v-else
    v-model="showDialog"
    title="选择目标窗口"
    width="640px"
    :show-close-button="true"
    :close-on-backdrop-click="true"
  >
    <div class="window-selector dialog">
      <div class="dialog-toolbar">
        <el-input
          v-model="filterText"
          placeholder="搜索窗口标题 / 进程 / 类名"
          clearable
          size="default"
        />
        <el-button :icon="RefreshCw" :loading="isLoading" @click="reload"
          >刷新</el-button
        >
      </div>
      <div class="window-list">
        <div
          v-for="w in filteredWindows"
          :key="w.hwnd"
          class="window-item"
          :class="{ active: selectedHwnd === w.hwnd }"
          @click="bindTarget(w)"
        >
          <div class="title">{{ w.title || "(无标题)" }}</div>
          <div class="meta">
            <span class="process">{{ w.processName }}</span>
            <span class="class">{{ w.className }}</span>
            <span class="hwnd">HWND {{ w.hwnd }}</span>
          </div>
        </div>
        <div v-if="filteredWindows.length === 0" class="empty">
          暂无可绑定窗口
        </div>
      </div>
      <div v-if="store.boundWindow" class="current-bound">
        当前绑定: <strong>{{ store.boundWindow.title }}</strong> ({{
          store.boundWindow.processName
        }})
      </div>
    </div>
  </BaseDialog>
</template>

<style scoped>
.window-selector.inline {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}
.option-row {
  display: flex;
  flex-direction: column;
}
.option-title {
  font-weight: 500;
  color: var(--el-text-color-primary);
}
.option-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.window-selector.dialog {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 400px;
}
.dialog-toolbar {
  display: flex;
  gap: 8px;
}
.window-list {
  flex: 1;
  overflow-y: auto;
  border: var(--border-width) solid var(--border-color);
  border-radius: 4px;
  max-height: 50vh;
}
.window-item {
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color-light);
  cursor: pointer;
  transition: background-color 0.15s;
}
.window-item:hover {
  background-color: rgba(
    var(--el-text-color-primary-rgb, 128, 128, 128),
    calc(var(--card-opacity, 1) * 0.08)
  );
}
.window-item.active {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
}
.window-item .title {
  font-weight: 500;
}
.window-item .meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
.empty {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-placeholder);
}
.current-bound {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.current-bound strong {
  color: var(--el-color-primary);
}
</style>
