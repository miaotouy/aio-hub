<script setup lang="ts">
/**
 * OCR 识别步骤配置：识别区域 + 引擎 + 关键字匹配 + 跳转
 *
 * 引擎配置通过 OcrEngineType 区分；engineConfig 为对应引擎的完整配置。
 * 执行时通过 toolRegistryManager.getRegistry('smart-ocr').runOcr 复用。
 */
import { ref, watch } from "vue";
import type { OcrStepParams, FlowStep, OcrEngineType } from "../../types";

const props = defineProps<{
  params: OcrStepParams;
  steps: FlowStep[];
}>();
const emit = defineEmits<{
  (e: "update:params", value: OcrStepParams): void;
}>();

function update(patch: Partial<OcrStepParams>) {
  emit("update:params", { ...props.params, ...patch });
}

function updateRect(patch: Partial<OcrStepParams["rect"]>) {
  update({ rect: { ...props.params.rect, ...patch } });
}

const engineTypes: Array<{ value: OcrEngineType; label: string }> = [
  { value: "tesseract", label: "Tesseract" },
  { value: "native", label: "Native (Windows OCR)" },
  { value: "vlm", label: "VLM" },
  { value: "cloud", label: "Cloud" },
  { value: "plugin", label: "Plugin" },
];

const engineConfigText = ref(serializeEngineConfig(props.params.engineConfig));

function serializeEngineConfig(c: OcrStepParams["engineConfig"]): string {
  try {
    return JSON.stringify(c, null, 2);
  } catch {
    return "{}";
  }
}

watch(
  () => props.params.engineType,
  () => {
    const current = props.params.engineConfig;
    if (
      !current ||
      (current as { type?: string }).type !== props.params.engineType
    ) {
      const next = defaultEngineConfig(props.params.engineType);
      update({ engineConfig: next });
      engineConfigText.value = serializeEngineConfig(next);
    } else {
      engineConfigText.value = serializeEngineConfig(current);
    }
  }
);

watch(
  () => props.params.engineConfig,
  (val) => {
    engineConfigText.value = serializeEngineConfig(val);
  },
  { deep: true }
);

function commitEngineConfig(text: string) {
  engineConfigText.value = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      update({
        engineConfig: {
          ...parsed,
          type: props.params.engineType,
        } as OcrStepParams["engineConfig"],
      });
    }
  } catch {
    // 解析失败时保留旧配置，不更新 store，避免误清空
  }
}

function defaultEngineConfig(
  type: OcrEngineType
): OcrStepParams["engineConfig"] {
  switch (type) {
    case "tesseract":
      return { type: "tesseract", name: "default", language: "chi_sim+eng" };
    case "native":
      return { type: "native", name: "default" };
    case "vlm":
      return {
        type: "vlm",
        name: "default",
        profileId: "",
        modelId: "",
        prompt: "请识别图中文字并完整输出。",
        temperature: 0.2,
        maxTokens: 1024,
        concurrency: 1,
        delay: 0,
      };
    case "cloud":
      return { type: "cloud", name: "default", activeProfileId: "" };
    case "plugin":
      return {
        type: "plugin",
        name: "default",
        pluginId: "",
        method: "",
        modelProfile: "",
        language: "",
      };
  }
}
</script>

<template>
  <div class="ocr-config">
    <div class="row">
      <div class="field grow">
        <label>X</label>
        <el-input-number
          :model-value="params.rect.x"
          :min="0"
          :step="1"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) => updateRect({ x: Number(v) || 0 })
          "
        />
      </div>
      <div class="field grow">
        <label>Y</label>
        <el-input-number
          :model-value="params.rect.y"
          :min="0"
          :step="1"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) => updateRect({ y: Number(v) || 0 })
          "
        />
      </div>
      <div class="field grow">
        <label>宽</label>
        <el-input-number
          :model-value="params.rect.width"
          :min="0"
          :step="1"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) => updateRect({ width: Number(v) || 0 })
          "
        />
      </div>
      <div class="field grow">
        <label>高</label>
        <el-input-number
          :model-value="params.rect.height"
          :min="0"
          :step="1"
          :precision="0"
          controls-position="right"
          @update:model-value="
            (v: number | undefined) => updateRect({ height: Number(v) || 0 })
          "
        />
      </div>
      <div class="field">
        <label>模式</label>
        <el-select
          :model-value="params.rect.mode"
          @update:model-value="
            (v: 'pixel' | 'percent') => updateRect({ mode: v })
          "
        >
          <el-option label="像素" value="pixel" />
          <el-option label="百分比" value="percent" />
        </el-select>
      </div>
    </div>

    <div class="row">
      <div class="field">
        <label>引擎</label>
        <el-select
          :model-value="params.engineType"
          @update:model-value="(v: OcrEngineType) => update({ engineType: v })"
        >
          <el-option
            v-for="t in engineTypes"
            :key="t.value"
            :label="t.label"
            :value="t.value"
          />
        </el-select>
      </div>
      <div class="field grow">
        <label>期望关键字</label>
        <el-input
          :model-value="params.keyword"
          placeholder='支持正则（勾选下方"使用正则"）'
          @update:model-value="
            (v: string | number) => update({ keyword: String(v ?? '') })
          "
        />
      </div>
      <div class="field check">
        <el-checkbox
          :model-value="params.useRegex"
          @update:model-value="
            (v: string | number | boolean) => update({ useRegex: Boolean(v) })
          "
        >
          使用正则
        </el-checkbox>
      </div>
      <div class="field grow">
        <label>保存到变量（可选）</label>
        <el-input
          :model-value="params.saveToVariable ?? ''"
          placeholder="如 hp / gold"
          @update:model-value="
            (v: string | number) =>
              update({ saveToVariable: String(v ?? '') || undefined })
          "
        />
      </div>
    </div>

    <div class="row engine-config-row">
      <div class="field grow">
        <label>引擎配置 (JSON)</label>
        <el-input
          v-model="engineConfigText"
          type="textarea"
          :autosize="{ minRows: 4, maxRows: 10 }"
          :placeholder="`配置 ${params.engineType} 引擎的完整参数`"
          @change="(v: string | number) => commitEngineConfig(String(v ?? ''))"
        />
      </div>
    </div>

    <div class="row">
      <div class="field grow">
        <label>匹配时跳转</label>
        <el-select
          :model-value="params.matchGoto"
          placeholder="顺延下一步"
          clearable
          @update:model-value="
            (v: string | number | null | undefined) =>
              update({ matchGoto: String(v ?? '') })
          "
        >
          <el-option
            v-for="(s, i) in steps"
            :key="s.id"
            :label="`#${i + 1} ${s.label}`"
            :value="s.id"
          />
        </el-select>
      </div>
      <div class="field grow">
        <label>不匹配时跳转</label>
        <el-select
          :model-value="params.mismatchGoto"
          placeholder="顺延下一步"
          clearable
          @update:model-value="
            (v: string | number | null | undefined) =>
              update({ mismatchGoto: String(v ?? '') })
          "
        >
          <el-option
            v-for="(s, i) in steps"
            :key="s.id"
            :label="`#${i + 1} ${s.label}`"
            :value="s.id"
          />
        </el-select>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ocr-config {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  flex-wrap: wrap;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 130px;
}
.field.grow {
  flex: 1;
  min-width: 140px;
}
.field.check {
  align-self: center;
}
.field label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.engine-config-row .field {
  min-width: 100%;
}
</style>
