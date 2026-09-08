<template>
  <div ref="toolbar" class="preset-toolbar">
    <el-popover
      :visible="panel === 'switch'"
      :trigger="[]"
      :trigger-keys="[]"
      placement="bottom-start"
      :width="240"
      @update:visible="!$event && panel === 'switch' && close()"
    >
      <template #reference>
        <div
          ref="selectAnchor"
          class="preset-selection"
          :title="selectionDescription"
        >
          <el-select
            :model-value="selectedId ?? undefined"
            :aria-label="label + '预设'"
            :aria-description="selectionDescription"
            placeholder="未保存配置"
            size="small"
            :disabled="disabled || busy"
            @change="requestSelection"
          >
            <template #prefix>
              <span
                class="preset-status"
                :class="{ 'is-modified': selected && dirty }"
                :title="selected && dirty ? '已修改，尚未覆盖预设' : undefined"
                aria-hidden="true"
              >
                <Pencil :size="12" />
              </span>
            </template>
            <el-option-group label="内置预设"
              ><el-option
                v-for="option in builtin"
                :key="option.id"
                :value="option.id"
                :label="option.name"
                @click="
                  option.id === selectedId &&
                  dirty &&
                  requestSelection(option.id)
                "
            /></el-option-group>
            <el-option-group v-if="custom.length" label="自定义预设"
              ><el-option
                v-for="option in custom"
                :key="option.id"
                :value="option.id"
                :label="option.name"
                @click="
                  option.id === selectedId &&
                  dirty &&
                  requestSelection(option.id)
                "
            /></el-option-group>
          </el-select>
        </div>
      </template>
      <div :data-preset-panel="inputId" @keydown.esc.stop.prevent="close()">
        <p class="popover-copy">
          应用「{{ pending?.name }}」将替换当前未保存的调整。
        </p>
        <div class="popover-actions">
          <el-button size="small" text @click="close()">取消</el-button
          ><el-button size="small" type="primary" @click="applyPending"
            >替换</el-button
          >
        </div>
      </div>
    </el-popover>
    <div class="preset-actions">
      <template v-for="action in actions" :key="action.id">
        <el-popover
          :visible="panel === action.id"
          :trigger="[]"
          `r`n
          :trigger-keys="[]"
          placement="bottom-end"
          :width="240"
          @update:visible="!$event && panel === action.id && close()"
          @after-enter="focusName"
        >
          <template #reference>
            <span class="action-anchor"
              ><el-tooltip
                :content="action.hint"
                :disabled="panel !== null"
                :show-after="300"
              >
                <span class="action-anchor">
                  <button
                    :ref="(el) => registerButton(action.id, el)"
                    type="button"
                    class="preset-icon"
                    :class="{ danger: action.id === 'delete' }"
                    :disabled="actionDisabled(action.id)"
                    :aria-label="action.label"
                    @click="openPanel(action.id)"
                  >
                    <component :is="action.icon" :size="15" />
                  </button>
                </span> </el-tooltip
            ></span>
          </template>
          <div :data-preset-panel="inputId" @keydown.esc.stop.prevent="close()">
            <template v-if="action.id === 'save'">
              <label class="popover-title" :for="inputId"
                >另存为{{ label }}预设</label
              >
              <el-input
                :id="inputId"
                ref="nameInput"
                v-model="name"
                size="small"
                aria-label="预设名称"
                :aria-invalid="!!error"
                :aria-describedby="error ? errorId : undefined"
                @input="error = ''"
                @keydown.enter="saveOnEnter"
              />
            </template>
            <p v-else class="popover-copy">
              {{
                action.id === "reset"
                  ? "恢复为"
                  : action.id === "delete"
                    ? "删除"
                    : "覆盖"
              }}「{{ selected?.name }}」？<span
                v-if="action.id === 'delete'"
                class="popover-note"
                >仅删除预设，保留当前配置。</span
              >
            </p>
            <p v-if="action.id === 'reset'" class="popover-note">
              放弃当前调整，预设本身不会改变。
            </p>
            <p v-if="error" :id="errorId" class="preset-error" role="alert">
              {{ error }}
            </p>
            <div class="popover-actions">
              <el-button size="small" text @click="close()">取消</el-button
              ><el-button
                size="small"
                :loading="busy"
                :type="action.id === 'delete' ? 'danger' : 'primary'"
                @click="confirmAction(action.id)"
                >{{
                  action.id === "save"
                    ? "保存"
                    : action.id === "reset"
                      ? "重置"
                      : action.id === "delete"
                        ? "删除"
                        : "覆盖"
                }}</el-button
              >
            </div>
          </div>
        </el-popover>
      </template>
    </div>
  </div>
</template>
<script setup lang="ts" generic="T">
import {
  computed,
  nextTick,
  onMounted,
  onBeforeUnmount,
  ref,
  useId,
  watch,
  type ComponentPublicInstance,
} from "vue";
import { CopyPlus, Save, Trash2, Pencil, RotateCcw } from "lucide-vue-next";
import {
  clonePresetValue,
  presetNameError,
  suggestPresetName,
  type PresetOption,
} from "../classificationPresets";
const props = defineProps<{
  label: string;
  value: T;
  builtin: PresetOption<T>[];
  custom: PresetOption<T>[];
  selectedId: string | null;
  disabled?: boolean;
  prepare?: () => T | null;
  savePreset?: (option: PresetOption<T>) => Promise<void>;
  removePreset?: (id: string) => Promise<void>;
}>();
const emit = defineEmits<{
  select: [option: PresetOption<T>];
  save: [option: PresetOption<T>];
  remove: [id: string];
}>();
type Action = "save" | "overwrite" | "delete" | "reset";
const panel = ref<Action | "switch" | null>(null);
const busy = ref(false);
const toolbar = ref<HTMLElement>();
const pending = ref<PresetOption<T> | null>(null);
const name = ref(""),
  error = ref("");
const inputId = useId(),
  errorId = useId();
const nameInput = ref<{ focus: () => void; select: () => void }[]>();
const selectAnchor = ref<HTMLElement>();
const buttons = new Map<string, HTMLButtonElement>();
let returnFocus: HTMLElement | undefined;
const selected = computed(() =>
  [...props.builtin, ...props.custom].find((p) => p.id === props.selectedId)
);
const dirty = computed(
  () =>
    !selected.value ||
    JSON.stringify(props.value) !== JSON.stringify(selected.value.value)
);
const selectionDescription = computed(
  () =>
    (selected.value?.name || "未保存配置") +
    (selected.value && dirty.value ? " · 已修改，尚未覆盖预设" : "")
);
const isCustom = computed(() =>
  props.custom.some((p) => p.id === props.selectedId)
);
const actions = computed(() => [
  {
    id: "reset" as const,
    label: "重置为当前" + props.label + "预设",
    hint: !selected.value
      ? "请先选择预设"
      : !dirty.value
        ? "当前配置与预设一致"
        : "放弃调整，恢复当前预设",
    icon: RotateCcw,
  },
  {
    id: "save" as const,
    label: "另存为" + props.label + "预设",
    hint: "另存为自定义预设",
    icon: CopyPlus,
  },
  ...(isCustom.value
    ? [
        {
          id: "overwrite" as const,
          label: "覆盖" + props.label + "预设",
          hint: dirty.value ? "用当前配置覆盖预设" : "当前配置尚未修改",
          icon: Save,
        },
        {
          id: "delete" as const,
          label: "删除" + props.label + "预设",
          hint: "删除当前自定义预设",
          icon: Trash2,
        },
      ]
    : []),
]);
function registerButton(
  id: string,
  el: Element | ComponentPublicInstance | null
) {
  if (el instanceof HTMLButtonElement) buttons.set(id, el);
  else buttons.delete(id);
}
async function close() {
  if (busy.value || panel.value === null) return;
  panel.value = null;
  pending.value = null;
  error.value = "";
  await nextTick();
  if (returnFocus?.isConnected) returnFocus.focus();
  else buttons.get("save")?.focus();
}
function actionDisabled(action: Action) {
  return (
    !!props.disabled ||
    busy.value ||
    (action === "overwrite" && !dirty.value) ||
    (action === "reset" && (!selected.value || !dirty.value))
  );
}
function openPanel(action: Action) {
  if (actionDisabled(action)) return;
  if (panel.value === action) return;
  returnFocus = buttons.get(action);
  panel.value = action;
  error.value = "";
  if (action === "save")
    name.value = suggestPresetName(
      selected.value ? selected.value.name + " 副本" : props.label + "预设",
      props.custom.map((p) => p.name)
    );
}

function focusName() {
  if (panel.value === "save") {
    nameInput.value?.[0]?.focus();
    nameInput.value?.[0]?.select();
  }
}
function saveOnEnter(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  confirmAction("save");
}
async function confirmAction(action: Action) {
  if (actionDisabled(action)) return;
  if (action === "reset") {
    if (!selected.value) return;
    emit("select", clonePresetValue(selected.value));
    void close();
    return;
  }
  if (action === "delete") {
    if (!isCustom.value || !props.selectedId) return;
    await perform(async () => {
      if (props.removePreset) await props.removePreset(props.selectedId!);
      else emit("remove", props.selectedId!);
    });
    return;
  }
  if (
    action === "overwrite" &&
    (!isCustom.value || !selected.value || !dirty.value)
  )
    return;
  if (action === "save") {
    error.value = presetNameError(
      name.value,
      props.custom.map((p) => p.name)
    );
    if (error.value) return;
  }
  const value = props.prepare ? props.prepare() : props.value;
  if (value === null) {
    error.value = "请先修正下方配置中的错误";
    return;
  }
  const option = {
    id:
      action === "save" ? "custom:" + crypto.randomUUID() : selected.value!.id,
    name: action === "save" ? name.value.trim() : selected.value!.name,
    value: clonePresetValue(value),
  };
  await perform(async () => {
    if (props.savePreset) await props.savePreset(option);
    else emit("save", option);
  });
}
async function perform(operation: () => Promise<void>) {
  busy.value = true;
  try {
    await operation();
    busy.value = false;
    await close();
  } catch {
    error.value = "保存失败，当前输入已保留，请重试";
  } finally {
    busy.value = false;
  }
}
function outside(event: PointerEvent) {
  const target = event.target;
  if (
    !(target instanceof Element) ||
    toolbar.value?.contains(target) ||
    target.closest('[data-preset-panel="' + inputId + '"]') ||
    target.closest(".el-select__popper")
  )
    return;
  if (panel.value) void close();
}
onMounted(() => document.addEventListener("pointerdown", outside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", outside));
function requestSelection(id: string) {
  if (props.disabled || busy.value) return;
  const option = [...props.builtin, ...props.custom].find((p) => p.id === id);
  if (!option || (id === props.selectedId && !dirty.value)) return;
  pending.value = option;
  returnFocus =
    selectAnchor.value?.querySelector<HTMLElement>('[role="combobox"]') ??
    undefined;
  if (dirty.value) {
    panel.value = "switch";
    error.value = "";
  } else applyPending();
}
function applyPending() {
  if (!pending.value || props.disabled) return;
  const option = clonePresetValue(pending.value) as PresetOption<T>;
  emit("select", option);
  void close();
}
watch(
  () => props.disabled,
  (value) => {
    if (value) void close();
  }
);
</script>
<style scoped>
.preset-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.preset-selection {
  flex: 1;
  min-width: 0;
  position: relative;
}
.preset-selection :deep(.el-select) {
  width: 100%;
}
/* Reserve status and action space so dirty/source changes never resize the row. */
.preset-status {
  display: grid;
  place-items: center;
  width: 14px;
  height: 14px;
  visibility: hidden;
  color: var(--el-color-primary);
}
.preset-status.is-modified {
  visibility: visible;
}
.preset-actions {
  display: grid;
  grid-template-columns: repeat(4, 28px);
  gap: 4px;
  flex: 0 0 124px;
  height: 28px;
}
.action-anchor {
  display: inline-flex;
  flex-shrink: 0;
}
.preset-icon {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 4px;
  color: var(--text-color);
  background: transparent;
  cursor: pointer;
}
.preset-icon:hover:not(:disabled) {
  background: var(--el-fill-color);
}
.preset-icon:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}
.preset-icon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.preset-icon.danger:hover:not(:disabled) {
  color: var(--el-color-danger);
}
.popover-title {
  display: block;
  margin-bottom: 8px;
  font-size: 13px;
}
.popover-copy {
  margin: 0;
  overflow-wrap: anywhere;
  line-height: 1.6;
}
.popover-note {
  display: block;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-top: 12px;
}
.preset-error {
  color: var(--el-color-danger);
  font-size: 12px;
  margin: 8px 0 0;
}
</style>
