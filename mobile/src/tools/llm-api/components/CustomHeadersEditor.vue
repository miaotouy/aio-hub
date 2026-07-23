<script setup lang="ts">
import { ref, watch } from "vue";
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

interface HeaderDraft {
  id: number;
  key: string;
  value: string;
}

const headerDrafts = ref<HeaderDraft[]>([]);
let nextHeaderDraftId = 0;

const resetDrafts = (headers: Record<string, string>) => {
  headerDrafts.value = Object.entries(headers).map(([key, value]) => ({
    id: nextHeaderDraftId++,
    key,
    value,
  }));
};

watch(
  () => props.show,
  (show) => {
    if (show) resetDrafts(props.headers);
  },
  { immediate: true }
);

const addHeader = () => {
  const existingKeys = new Set(headerDrafts.value.map((draft) => draft.key));
  let index = headerDrafts.value.length;
  while (existingKeys.has(`X-Custom-Header-${index}`)) index += 1;
  headerDrafts.value.push({
    id: nextHeaderDraftId++,
    key: `X-Custom-Header-${index}`,
    value: "",
  });
};

const removeHeader = (id: number) => {
  headerDrafts.value = headerDrafts.value.filter((draft) => draft.id !== id);
};

const confirmHeaders = () => {
  const headers: Record<string, string> = {};
  for (const draft of headerDrafts.value) {
    const key = draft.key.trim();
    if (key) headers[key] = draft.value;
  }
  emit("update:headers", headers);
  emit("update:show", false);
};

// 处理输入框聚焦时滚动到可见区域
const scrollIntoViewOnFocus = (event: Event) => {
  const target = event.target as HTMLElement;
  const group = (target.closest(".header-row") || target) as HTMLElement;

  // 找到滚动容器
  const scrollContainer = target.closest(".popup-content") as HTMLElement;
  if (!scrollContainer) return;

  const tryScroll = (retryCount = 0) => {
    const kbHeight =
      parseInt(
        getComputedStyle(document.documentElement).getPropertyValue(
          "--keyboard-height"
        )
      ) || 0;

    if (kbHeight === 0 && retryCount < 3) {
      setTimeout(() => tryScroll(retryCount + 1), 100);
      return;
    }

    const availableHeight = window.visualViewport?.height || window.innerHeight;

    const groupRect = group.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();

    const groupCenterInContainer =
      groupRect.top -
      containerRect.top +
      scrollContainer.scrollTop +
      groupRect.height / 2;

    const targetScrollTop = groupCenterInContainer - availableHeight * 0.4;

    logger.debug("Auto-scrolling calculation", {
      keyboardHeight: kbHeight,
      availableHeight,
      targetScrollTop,
    });

    if (groupRect.bottom > availableHeight - 40 || groupRect.top < 100) {
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
    <div class="popup-container" data-testid="llm-custom-headers-editor">
      <var-app-bar
        :title="tRaw('tools.llm-api.CustomHeadersEditor.自定义请求头')"
        fixed
        safe-area
      >
        <template #left>
          <var-button round text @click="$emit('update:show', false)">
            <ChevronLeft :size="24" />
          </var-button>
        </template>
        <template #right>
          <var-button
            text
            data-testid="llm-custom-headers-confirm"
            @click="confirmHeaders"
          >
            {{ t("common.确认") }}
          </var-button>
        </template>
      </var-app-bar>

      <div class="popup-content">
        <div v-for="draft in headerDrafts" :key="draft.id" class="header-row">
          <div class="input-col">
            <var-input
              :model-value="draft.key"
              @update:model-value="(newKey) => (draft.key = newKey)"
              data-testid="llm-custom-header-key"
              placeholder="Key"
              variant="outlined"
              size="small"
              class="key-input"
              @focus="scrollIntoViewOnFocus"
            />
            <var-input
              :model-value="draft.value"
              @update:model-value="(newVal) => (draft.value = newVal)"
              data-testid="llm-custom-header-value"
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
            @click="removeHeader(draft.id)"
          >
            <Trash2 :size="18" />
          </var-button>
        </div>

        <div v-if="headerDrafts.length === 0" class="empty-hint">
          {{ tRaw("tools.llm-api.CustomHeadersEditor.暂无自定义请求头") }}
        </div>
      </div>

      <div class="popup-footer">
        <var-button
          block
          type="primary"
          data-testid="llm-custom-header-add"
          @click="addHeader"
        >
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
  font-size: 1rem;
}

.popup-footer {
  padding: 20px;
  background: var(--color-surface);
  border-top: 1px solid var(--color-outline-variant);
}
</style>
