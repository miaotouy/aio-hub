<template>
  <BaseDialog
    v-model="dialogVisible"
    title="翻译工作台设置"
    width="620px"
    max-height="80vh"
    close-on-backdrop-click
    show-close-button
  >
    <div class="settings-panel">
      <section class="settings-section">
        <div class="section-heading">
          <span>生成参数</span>
          <span class="section-desc">控制单次翻译请求的输出长度和创造性</span>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>默认输出上限</span>
            <span class="setting-desc"
              >兜底的 max_tokens，模型自身上限优先</span
            >
          </div>
          <el-input-number
            v-model="store.settings.defaultMaxTokens"
            :min="1024"
            :max="131072"
            :step="1024"
            controls-position="right"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>按输入长度自动扩容</span>
            <span class="setting-desc">输入更长时自动放大 max_tokens</span>
          </div>
          <el-switch v-model="store.settings.autoExpandMaxTokens" />
        </div>

        <div
          class="setting-row"
          :class="{ disabled: !store.settings.autoExpandMaxTokens }"
        >
          <div class="setting-label">
            <span>输出膨胀系数</span>
            <span class="setting-desc">
              估算 = 字符数 × 系数 + 格式预留。中→英 / 短→长建议 2~4
            </span>
          </div>
          <el-input-number
            v-model="store.settings.outputExpansionFactor"
            :min="1"
            :max="8"
            :step="0.5"
            :precision="1"
            :disabled="!store.settings.autoExpandMaxTokens"
            controls-position="right"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>默认采样温度</span>
            <span class="setting-desc">渠道未单独配置时使用</span>
          </div>
          <el-input-number
            v-model="store.settings.defaultTemperature"
            :min="0"
            :max="2"
            :step="0.1"
            :precision="1"
            controls-position="right"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>流式输出</span>
            <span class="setting-desc">逐 token 打字机展示</span>
          </div>
          <el-switch v-model="store.settings.streamingEnabled" />
        </div>
      </section>

      <section class="settings-section">
        <div class="section-heading">
          <span>界面与记录</span>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>结果自动吸底</span>
            <span class="setting-desc">手动向上滚动时会暂停吸底</span>
          </div>
          <el-switch v-model="store.settings.autoScrollResults" />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>保存翻译历史</span>
            <span class="setting-desc">最多保留 30 条，仅本地</span>
          </div>
          <el-switch v-model="store.settings.saveHistory" />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>清空历史记录</span>
            <span class="setting-desc">
              当前共 {{ store.history.length }} 条
            </span>
          </div>
          <el-button
            type="danger"
            plain
            :icon="Trash2"
            :disabled="store.history.length === 0"
            @click="handleClearHistory"
          >
            清空
          </el-button>
        </div>
      </section>
    </div>

    <template #footer>
      <el-button :icon="RotateCcw" @click="handleReset">恢复默认</el-button>
      <el-button type="primary" @click="dialogVisible = false">完成</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElMessageBox } from "element-plus";
import { RotateCcw, Trash2 } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { useTranslatorStore } from "../composables/useTranslatorStore";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const store = useTranslatorStore();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

function handleReset() {
  store.resetSettings();
  customMessage.success("翻译设置已恢复默认");
}

async function handleClearHistory() {
  try {
    await ElMessageBox.confirm(
      "确定要清空全部翻译历史吗？此操作无法撤销。",
      "清空历史",
      {
        confirmButtonText: "清空",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    store.clearHistory();
    customMessage.success("翻译历史已清空");
  } catch {
    /* user cancelled */
  }
}
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 4px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 700;
}

.section-desc {
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 500;
}

.setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 52px;
  padding: 10px 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  transition: opacity 0.18s ease;
}

.setting-row.disabled {
  opacity: 0.55;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.setting-label > span:first-child {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
}

.setting-desc {
  color: var(--text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
}

:deep(.el-input-number) {
  width: 156px;
}
</style>

