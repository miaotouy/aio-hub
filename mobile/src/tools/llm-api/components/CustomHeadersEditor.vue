<script setup lang="ts">
import { Trash2, Plus, ChevronLeft } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("CustomHeadersEditor");
const { t, tRaw } = useI18n();

const props = defineProps<{
  show: boolean;
  headers: Record<string, string>;
}>();

const emit = defineEmits<{
  (e: "update:show", val: boolean): void;
  (e: "update:headers", val: Record<string, string>): void;
}>();

const addHeader = () => {
  const newHeaders = { ...props.headers };
  newHeaders["X-Custom-Header-" + Object.keys(newHeaders).length] = "";
  emit("update:headers", newHeaders);
};

const removeHeader = (key: string) => {
  const newHeaders = { ...props.headers };
  delete newHeaders[key];
  emit("update:headers", newHeaders);
};

const updateKey = (oldKey: string, newKey: string) => {
  if (oldKey === newKey) return;
  const newHeaders = { ...props.headers };
  const val = newHeaders[oldKey];
  delete newHeaders[oldKey];
  newHeaders[newKey] = val;
  emit("update:headers", newHeaders);
};

const updateValue = (key: string, val: string) => {
  const newHeaders = { ...props.headers };
  newHeaders[key] = val;
  emit("update:headers", newHeaders);
};

// 处理输入框聚焦时滚动到可见区域
const scrollIntoViewOnFocus = (event: Event) => {
  const target = event.target as HTMLElement;
  const group = (target.closest(".header-row") || target) as HTMLElement;

  // 找到滚动容器
  const scrollContainer = target.closest(".popup-content") as HTMLElement;
  if (!scrollContainer) return;

  const tryScroll = (retryCount = 0) => {
    const keyboardHeight =
      parseInt(getComputedStyle(document.documentElement).getPropertyValue("--keyboard-height")) ||
      0;

    if (keyboardHeight === 0 && retryCount < 3) {
      setTimeout(() => tryScroll(retryCount + 1), 100);
      return;
    }

    const viewportHeight = window.innerHeight;
    const availableHeight = viewportHeight - keyboardHeight;

    const groupRect = group.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();

    const groupCenterInContainer =
      groupRect.top - containerRect.top + scrollContainer.scrollTop + groupRect.height / 2;

    const targetScrollTop = groupCenterInContainer - availableHeight * 0.4;

    logger.debug("Auto-scrolling calculation", {
      keyboardHeight,
      viewportHeight,
      availableHeight,
      targetScrollTop,
    });

    const isSimulated = document.documentElement.classList.contains("keyboard-simulated");
    const threshold = isSimulated ? availableHeight - 20 : availableHeight - 40;

    if (groupRect.bottom > threshold || groupRect.top < 100) {
      scrollContainer.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: "smooth",
      });
    }
  };

  setTimeout(() => tryScroll(), 300);
};
</script>

<template>
  <var-popup
    :show="show"
    @update:show="$emit('update:show', $event)"
    position="right"
    style="width: 100%; height: 100%"
  >
    <div class="popup-container">
      <var-app-bar :title="tRaw('tools.llm-api.CustomHeadersEditor.自定义请求头')" fixed safe-area>
        <template #left>
          <var-button round text @click="$emit('update:show', false)">
            <ChevronLeft :size="24" />
          </var-button>
        </template>
        <template #right>
          <var-button text @click="$emit('update:show', false)">
            {{ t("common.确认") }}
          </var-button>
        </template>
      </var-app-bar>

      <div class="popup-content">
        <div v-for="(val, key) in headers" :key="key" class="header-row">
          <div class="input-col">
            <var-input
              :model-value="String(key)"
              @update:model-value="(newKey) => updateKey(String(key), newKey)"
              placeholder="Key"
              variant="outlined"
              size="small"
              class="key-input"
              @focus="scrollIntoViewOnFocus"
            />
            <var-input
              :model-value="val"
              @update:model-value="(newVal) => updateValue(String(key), newVal)"
              placeholder="Value"
              variant="outlined"
              size="small"
              class="val-input"
              @focus="scrollIntoViewOnFocus"
            />
          </div>
          <var-button
            round
            text
            type="danger"
            class="delete-btn"
            @click="removeHeader(String(key))"
          >
            <Trash2 :size="18" />
          </var-button>
        </div>

        <div v-if="Object.keys(headers).length === 0" class="empty-hint">
          {{ tRaw("tools.llm-api.CustomHeadersEditor.暂无自定义请求头") }}
        </div>
      </div>

      <div class="popup-footer">
        <var-button block type="primary" @click="addHeader">
          <Plus :size="20" class="mr-1" />
          {{ t("common.添加") }}
        </var-button>
      </div>
    </div>
  </var-popup>
</template>

<style scoped>
.popup-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-surface);
}

.popup-content {
  flex: 1;
  overflow-y: auto;
  /* 避让 fixed AppBar: 54px (AppBar) + 20px (原padding) */
  /* 同时考虑顶部安全区域 */
  padding: calc(54px + var(--safe-area-inset-top, 0px) + 20px) 20px 20px;
  scroll-behavior: smooth;
}

.header-row {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--color-surface-container);
  border-radius: 16px;
  align-items: center;
  border: 1px solid var(--color-outline-variant);
}

.input-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.key-input,
.val-input {
  width: 100%;
}

.delete-btn {
  flex-shrink: 0;
}

.empty-hint {
  text-align: center;
  padding: 60px 0;
  opacity: 0.4;
  font-size: 14px;
}

.popup-footer {
  padding: 20px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-outline-variant);
}
</style>
