<template>
  <div class="option-list-editor">
    <div class="option-actions">
      <el-dropdown
        v-if="availablePresetGroups.length > 0"
        trigger="click"
        @command="handlePresetCommand"
      >
        <el-button type="primary" plain :icon="MagicStick">
          预设
          <el-icon class="el-icon--right"><ArrowDown /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <template v-for="group in availablePresetGroups" :key="group.key">
              <el-dropdown-item
                :command="{ action: 'replace', groupKey: group.key }"
              >
                覆盖为 {{ group.label }}
              </el-dropdown-item>
              <el-dropdown-item
                :command="{ action: 'append', groupKey: group.key }"
              >
                追加 {{ group.label }}
              </el-dropdown-item>
            </template>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <el-button :icon="DocumentAdd" plain @click="openBatchImport">
        批量导入
      </el-button>
      <el-button :icon="Plus" plain @click="addOption">添加</el-button>
    </div>

    <div v-if="options.length > 0" class="options-container">
      <div v-for="(item, index) in options" :key="index" class="option-row">
        <el-input
          :model-value="item.label"
          placeholder="显示标签"
          class="label-input"
          @update:model-value="updateOption(index, 'label', $event)"
        />
        <el-input
          :model-value="item.value"
          placeholder="参数值"
          class="value-input"
          @update:model-value="updateOption(index, 'value', $event)"
          @blur="handleValueBlur(index)"
        />
        <el-button
          type="danger"
          :icon="Delete"
          circle
          @click="removeOption(index)"
        />
      </div>
    </div>
    <div v-else class="empty-options">暂无选项</div>

    <el-dialog
      v-model="batchImportVisible"
      title="批量导入选项"
      width="520px"
      append-to-body
      :lock-scroll="false"
    >
      <el-input
        v-model="batchImportText"
        type="textarea"
        :rows="8"
        placeholder="每行一个选项，例如：&#10;1024x1024&#10;16:9, 横屏&#10;高清=hd"
      />
      <div class="import-hint">
        支持换行、逗号、等号或制表符分隔；只有一个值时会同时作为标签和值。
      </div>
      <template #footer>
        <el-button @click="batchImportVisible = false">取消</el-button>
        <el-button plain @click="applyBatchImport('append')"
          >追加导入</el-button
        >
        <el-button type="primary" @click="applyBatchImport('replace')">
          覆盖导入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import {
  ArrowDown,
  Delete,
  DocumentAdd,
  MagicStick,
  Plus,
} from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";

interface Option {
  label: string;
  value: string;
}

type PresetType =
  | "size"
  | "ratio"
  | "resolution"
  | "imageSize"
  | "quality"
  | "style"
  | "background"
  | "inputFidelity"
  | "moderation"
  | "outputFormat"
  | "generic";

type PresetGroup = {
  key: string;
  label: string;
  types: PresetType[];
  options: Option[];
};

const props = defineProps<{
  modelValue?: Option[];
  presetType?: PresetType;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: Option[]): void;
}>();

const options = computed(() => props.modelValue || []);
const batchImportVisible = ref(false);
const batchImportText = ref("");

const presetGroups: PresetGroup[] = [
  {
    key: "commonRatios",
    label: "常用宽高比",
    types: ["ratio"],
    options: [
      { label: "1:1", value: "1:1" },
      { label: "16:9 (横屏)", value: "16:9" },
      { label: "9:16 (竖屏)", value: "9:16" },
      { label: "4:3", value: "4:3" },
      { label: "3:4", value: "3:4" },
      { label: "3:2", value: "3:2" },
      { label: "2:3", value: "2:3" },
      { label: "21:9 (超宽)", value: "21:9" },
      { label: "9:21", value: "9:21" },
    ],
  },
  {
    key: "dalleSizes",
    label: "DALL-E 3 尺寸",
    types: ["size"],
    options: [
      { label: "1:1 (1024x1024)", value: "1024x1024" },
      { label: "横屏 (1792x1024)", value: "1792x1024" },
      { label: "竖屏 (1024x1792)", value: "1024x1792" },
    ],
  },
  {
    key: "fluxSdxlSizes",
    label: "FLUX / SDXL 常用尺寸",
    types: ["size"],
    options: [
      { label: "1:1 (1024x1024)", value: "1024x1024" },
      { label: "16:9 (1344x768)", value: "1344x768" },
      { label: "9:16 (768x1344)", value: "768x1344" },
      { label: "3:2 (1536x1024)", value: "1536x1024" },
      { label: "2:3 (1024x1536)", value: "1024x1536" },
    ],
  },
  {
    key: "qwenSizes",
    label: "Qwen / Z-Image 常用尺寸",
    types: ["size"],
    options: [
      { label: "1:1 (1024x1024)", value: "1024x1024" },
      { label: "16:9 (1344x768)", value: "1344x768" },
      { label: "9:16 (768x1344)", value: "768x1344" },
      { label: "4:3 (1152x864)", value: "1152x864" },
      { label: "3:4 (864x1152)", value: "864x1152" },
      { label: "3:2 (1280x854)", value: "1280x854" },
      { label: "2:3 (854x1280)", value: "854x1280" },
    ],
  },
  {
    key: "resolutionLevels",
    label: "1K / 2K 分辨率等级",
    types: ["resolution"],
    options: [
      { label: "1K（标准）", value: "1K" },
      { label: "2K（高分辨率）", value: "2K" },
    ],
  },
  {
    key: "xaiResolutionLevels",
    label: "xAI 分辨率等级",
    types: ["resolution"],
    options: [
      { label: "1K（默认）", value: "1k" },
      { label: "2K（高分辨率）", value: "2k" },
    ],
  },
  {
    key: "geminiImageSizes",
    label: "Gemini 尺寸等级",
    types: ["imageSize", "resolution"],
    options: [
      { label: "512（0.5K）", value: "512" },
      { label: "1K（默认）", value: "1K" },
      { label: "2K", value: "2K" },
      { label: "4K", value: "4K" },
    ],
  },
  {
    key: "quality",
    label: "质量选项",
    types: ["quality"],
    options: [
      { label: "低质量 (Low)", value: "low" },
      { label: "中等 (Medium)", value: "medium" },
      { label: "高质量 (High)", value: "high" },
      { label: "自动 (Auto)", value: "auto" },
    ],
  },
  {
    key: "style",
    label: "风格选项",
    types: ["style"],
    options: [
      { label: "生动 (Vivid)", value: "vivid" },
      { label: "自然 (Natural)", value: "natural" },
      { label: "自动 (Auto)", value: "auto" },
    ],
  },
  {
    key: "background",
    label: "背景选项",
    types: ["background"],
    options: [
      { label: "不透明", value: "opaque" },
      { label: "透明", value: "transparent" },
      { label: "自动", value: "auto" },
    ],
  },
  {
    key: "inputFidelity",
    label: "输入保真度选项",
    types: ["inputFidelity"],
    options: [
      { label: "低 (Low)", value: "low" },
      { label: "高 (High)", value: "high" },
    ],
  },
  {
    key: "moderation",
    label: "内容审核选项",
    types: ["moderation"],
    options: [
      { label: "自动 (Auto)", value: "auto" },
      { label: "宽松 (Low)", value: "low" },
    ],
  },
  {
    key: "outputFormat",
    label: "输出格式选项",
    types: ["outputFormat"],
    options: [
      { label: "PNG", value: "png" },
      { label: "JPEG", value: "jpeg" },
      { label: "WebP", value: "webp" },
      { label: "URL", value: "url" },
      { label: "Base64", value: "b64_json" },
    ],
  },
];

const availablePresetGroups = computed(() => {
  const type = props.presetType || "generic";
  if (type === "generic") {
    return presetGroups.filter((group) =>
      ["commonRatios", "fluxSdxlSizes", "quality", "outputFormat"].includes(
        group.key
      )
    );
  }
  return presetGroups.filter((group) => group.types.includes(type));
});

function addOption() {
  const newList = [...options.value, { label: "", value: "" }];
  emit("update:modelValue", newList);
}

function updateOption(index: number, key: keyof Option, value: string) {
  const newList = options.value.map((item, itemIndex) =>
    itemIndex === index ? { ...item, [key]: value } : item
  );
  emit("update:modelValue", newList);
}

function removeOption(index: number) {
  const newList = [...options.value];
  newList.splice(index, 1);
  emit("update:modelValue", newList);
}

function handleValueBlur(index: number) {
  const item = options.value[index];
  // 如果 label 为空，自动使用 value 填充
  if (item.value && !item.label) {
    updateOption(index, "label", item.value);
  }
}

function cloneOptions(list: Option[]) {
  return list.map((item) => ({ ...item }));
}

function mergeOptions(existing: Option[], incoming: Option[]) {
  const map = new Map<string, Option>();
  existing.forEach((item) => {
    map.set(item.value || item.label, { ...item });
  });
  incoming.forEach((item) => {
    map.set(item.value || item.label, { ...item });
  });
  return Array.from(map.values());
}

function applyOptions(incoming: Option[], action: "append" | "replace") {
  const nextOptions =
    action === "replace"
      ? cloneOptions(incoming)
      : mergeOptions(options.value, incoming);
  emit("update:modelValue", nextOptions);
}

function handlePresetCommand(command: {
  action: "append" | "replace";
  groupKey: string;
}) {
  const group = presetGroups.find((item) => item.key === command.groupKey);
  if (!group) return;
  applyOptions(group.options, command.action);
  customMessage.success(
    command.action === "replace"
      ? `已覆盖为${group.label}`
      : `已追加${group.label}`
  );
}

function openBatchImport() {
  batchImportText.value = "";
  batchImportVisible.value = true;
}

function parseBatchImport(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const equalMatch = line.match(/^(.+?)\s*=\s*(.+)$/);
      if (equalMatch) {
        return { label: equalMatch[1].trim(), value: equalMatch[2].trim() };
      }

      const parts = line.split(/\t|,|，/).map((part) => part.trim());
      const [value, label] = parts.filter(Boolean);
      if (value && label) {
        return { label, value };
      }
      return { label: line, value: line };
    });
}

function applyBatchImport(action: "append" | "replace") {
  const parsed = parseBatchImport(batchImportText.value);
  if (parsed.length === 0) {
    customMessage.warning("没有解析到可导入的选项");
    return;
  }
  applyOptions(parsed, action);
  batchImportVisible.value = false;
  customMessage.success(`已导入 ${parsed.length} 个选项`);
}
</script>

<style scoped>
.option-list-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-actions {
  display: flex;
  justify-content: flex-end;
}

.options-container {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow: auto;
  padding-right: 4px;
}

.option-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.label-input {
  flex: 1;
}

.value-input {
  flex: 1;
}

.empty-options {
  font-size: 12px;
  color: var(--text-color-light);
  text-align: center;
  padding: 10px;
  background: var(--input-bg);
  border-radius: 4px;
}

.import-hint {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-color-light);
}

@media (max-width: 720px) {
  .option-actions {
    justify-content: flex-start;
  }

  .option-row {
    display: grid;
    grid-template-columns: 1fr auto;
  }

  .label-input,
  .value-input {
    grid-column: 1 / 2;
  }
}
</style>
