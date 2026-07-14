<script setup lang="ts">
import { ref, watch } from "vue";
import { Trash2 } from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { PresetMessageGroup } from "../types/agent";

const props = defineProps<{ open: boolean; group?: PresetMessageGroup | null }>();
const emit = defineEmits<{
  close: [];
  save: [group: PresetMessageGroup];
  remove: [group: PresetMessageGroup];
}>();
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.agent-manager.PresetEditor.${key}`);
const form = ref<PresetMessageGroup>(createEmptyGroup());

function createEmptyGroup(): PresetMessageGroup {
  return {
    id: crypto.randomUUID(),
    name: "",
    selectionMode: "checkbox",
    enabled: true,
  };
}

watch(
  () => [props.open, props.group] as const,
  ([open, group]) => {
    if (open) form.value = structuredClone(group || createEmptyGroup());
  },
  { immediate: true }
);

function save(): void {
  const name = form.value.name.trim();
  if (name) emit("save", { ...form.value, name });
}
</script>

<template>
  <div v-if="open" class="overlay" @click.self="emit('close')">
    <form class="dialog" @submit.prevent="save">
      <h2>{{ group ? t("编辑消息组") : t("新建消息组") }}</h2>
      <label>
        {{ t("名称") }}
        <input v-model="form.name" autofocus />
      </label>
      <label>
        {{ t("描述") }}
        <textarea v-model="form.description" rows="3" />
      </label>
      <label>
        {{ t("选择方式") }}
        <select v-model="form.selectionMode">
          <option value="checkbox">{{ t("多选模式") }}</option>
          <option value="radio">{{ t("单选模式") }}</option>
        </select>
      </label>
      <label class="check">
        <input v-model="form.enabled" type="checkbox" />
        {{ t("启用此组") }}
      </label>
      <footer>
        <button
          v-if="group"
          class="danger icon-command"
          type="button"
          @click="emit('remove', form)"
        >
          <Trash2 :size="17" />{{ t("删除") }}
        </button>
        <span class="spacer" />
        <button type="button" @click="emit('close')">{{ t("取消") }}</button>
        <button class="primary" type="submit">{{ t("保存") }}</button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.overlay { position: fixed; inset: 0; z-index: 105; padding: 20px; display: grid; place-items: center; background: #0007; }
.dialog { box-sizing: border-box; width: min(100%, 430px); padding: 20px; display: flex; flex-direction: column; gap: 14px; border-radius: 8px; color: var(--text-color); background: var(--card-bg); }
h2 { margin: 0; font-size: 1.1rem; }
label { display: flex; flex-direction: column; gap: 6px; color: var(--color-on-surface-variant); font-size: .82rem; }
input, select, textarea { padding: 10px; border: var(--border-width) solid var(--border-color); border-radius: 7px; color: var(--text-color); background: var(--input-bg); font: inherit; }
.check { flex-direction: row; align-items: center; }
.check input { width: auto; }
footer { display: flex; align-items: center; gap: 8px; }
footer .spacer { flex: 1; }
footer button { padding: 9px 14px; border: 0; border-radius: 7px; color: var(--text-color); background: var(--input-bg); }
footer .primary { color: #fff; background: var(--color-primary); }
footer .danger { color: var(--color-danger, #d14343); }
.icon-command { display: inline-flex; align-items: center; gap: 6px; }
</style>
