<script setup lang="ts">
import { computed, ref } from "vue";
import type { MessagePresentationGroup } from "../../utils/messagePresentation";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import MessageStatistics from "./MessageStatistics.vue";
const props = defineProps<{
  group: MessagePresentationGroup;
  characterCounts: Map<string, number>;
  screenshotMode?: boolean;
}>();
const { settings } = useChatSettings();
const expanded = ref(false);
const textMembers = computed(() =>
  props.group.members.filter((m) => m.role !== "tool")
);
const chars = computed(() =>
  textMembers.value.reduce(
    (sum, m) => sum + (props.characterCounts.get(m.id) ?? 0),
    0
  )
);
const detailMembers = computed(() =>
  props.group.members
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => {
      const m = member.metadata;
      return (
        (settings.value.uiPreferences.showCharCount &&
          (props.characterCounts.get(member.id) ?? 0) > 0) ||
        (settings.value.uiPreferences.showTokenCount &&
          (!!m?.usage || m?.contentTokens !== undefined)) ||
        ((props.screenshotMode ||
          settings.value.uiPreferences.showPerformanceMetrics) &&
          member.role === "assistant" &&
          member.status === "complete" &&
          (m?.tokensPerSecond !== undefined ||
            (m?.requestStartTime !== undefined &&
              (m?.firstTokenTime !== undefined ||
                m?.requestEndTime !== undefined))))
      );
    })
);
const hasMetrics = computed(() => detailMembers.value.length > 0);
</script>
<template>
  <div v-if="hasMetrics" class="message-group-footer">
    <button
      v-if="!screenshotMode"
      class="summary"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span>{{ group.members.length }} 段</span>
      <span
        data-meta-type="char"
        v-if="settings.uiPreferences.showCharCount && chars"
        >{{ chars.toLocaleString() }} 字</span
      >
      <span class="disclosure">{{ expanded ? "收起统计" : "统计明细" }}</span>
    </button>
    <div v-if="expanded || screenshotMode" class="details">
      <div
        v-for="{ member, index } in detailMembers"
        :key="member.id"
        class="detail-row"
      >
        <span class="member-label"
          >{{ index + 1 }} ·
          {{
            member.role === "tool"
              ? "工具"
              : member.role === "user"
                ? "提问"
                : "回复"
          }}</span
        >
        <MessageStatistics
          :message="member"
          :char-count="characterCounts.get(member.id)"
          :screenshot-mode="screenshotMode"
        />
      </div>
    </div>
  </div>
</template>
<style scoped>
.message-group-footer {
  padding: 4px 16px 10px;
  color: var(--text-color-light);
  font-size: 12px;
}
.summary {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 12px;
  background: transparent;
  border: 0;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 4px 0;
}
.summary:hover,
.summary:focus-visible {
  color: var(--primary-color);
}
.disclosure {
  opacity: 0.7;
}
.details {
  display: grid;
  gap: 8px;
  padding-block: 8px;
}
.detail-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}
.member-label {
  flex: 0 0 auto;
  opacity: 0.7;
}
</style>
