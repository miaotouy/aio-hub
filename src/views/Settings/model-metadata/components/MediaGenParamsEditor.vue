<template>
  <div class="media-gen-params-editor">
    <el-form :model="localParams" label-width="120px" label-position="left">
      <el-collapse v-model="activeSections" class="media-config-collapse">
        <el-collapse-item name="size">
          <template #title>
            <div class="section-title">
              <span>尺寸控制</span>
              <el-tag size="small" effect="plain">{{ sizeModeLabel }}</el-tag>
            </div>
          </template>

          <el-form-item label="模式选择">
            <el-radio-group v-model="sizeMode">
              <el-radio value="none">不配置</el-radio>
              <el-radio value="size">标准尺寸 (size)</el-radio>
              <el-radio value="aspectRatio">宽高比 (xAI)</el-radio>
              <el-radio value="gemini">Gemini 模式</el-radio>
            </el-radio-group>
          </el-form-item>

          <template v-if="sizeMode === 'size' && localParams.size">
            <el-form-item label="尺寸模式">
              <el-radio-group
                v-model="localParams.size.mode"
                @change="handleSizeRuleModeChange"
              >
                <el-radio value="preset">仅限预设 (Preset)</el-radio>
                <el-radio value="free">自由输入 (Free)</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item label="预设列表">
              <OptionListEditor
                v-model="localParams.size.presets"
                preset-type="size"
              />
            </el-form-item>

            <el-form-item label="默认尺寸">
              <el-select
                v-model="localParams.size.default"
                placeholder="选择默认值"
                clearable
                style="width: 100%"
              >
                <el-option
                  v-for="p in localParams.size.presets || []"
                  :key="p.value"
                  :label="p.label"
                  :value="p.value"
                />
              </el-select>
            </el-form-item>

            <template
              v-if="
                localParams.size.mode === 'free' && localParams.size.constraints
              "
            >
              <div class="subsection-title">自由模式约束</div>
              <el-row :gutter="20">
                <el-col :md="12" :sm="24">
                  <el-form-item label="最大宽度">
                    <el-input-number
                      v-model="localParams.size.constraints.maxWidth"
                      :min="0"
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
                <el-col :md="12" :sm="24">
                  <el-form-item label="最大高度">
                    <el-input-number
                      v-model="localParams.size.constraints.maxHeight"
                      :min="0"
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="20">
                <el-col :md="12" :sm="24">
                  <el-form-item label="步长 (Step)">
                    <el-input-number
                      v-model="localParams.size.constraints.stepSize"
                      :min="1"
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
                <el-col :md="12" :sm="24">
                  <el-form-item label="最大比例">
                    <el-input-number
                      v-model="localParams.size.constraints.maxAspectRatio"
                      :min="1"
                      :precision="1"
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="20">
                <el-col :md="12" :sm="24">
                  <el-form-item label="最小像素">
                    <el-input-number
                      v-model="localParams.size.constraints.minPixels"
                      :min="0"
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
                <el-col :md="12" :sm="24">
                  <el-form-item label="最大像素">
                    <el-input-number
                      v-model="localParams.size.constraints.maxPixels"
                      :min="0"
                      style="width: 100%"
                    />
                  </el-form-item>
                </el-col>
              </el-row>
            </template>
          </template>

          <template
            v-else-if="
              sizeMode === 'aspectRatio' && localParams.aspectRatioMode
            "
          >
            <el-form-item label="宽高比列表">
              <OptionListEditor
                v-model="localParams.aspectRatioMode.ratios"
                preset-type="ratio"
              />
            </el-form-item>
            <el-form-item label="分辨率列表">
              <OptionListEditor
                v-model="localParams.aspectRatioMode.resolutions"
                preset-type="resolution"
              />
            </el-form-item>
            <el-row :gutter="20">
              <el-col :md="12" :sm="24">
                <el-form-item label="默认比例">
                  <el-select
                    v-model="localParams.aspectRatioMode.defaultRatio"
                    placeholder="选择默认值"
                    clearable
                    style="width: 100%"
                  >
                    <el-option
                      v-for="ratio in localParams.aspectRatioMode.ratios"
                      :key="ratio.value"
                      :label="ratio.label"
                      :value="ratio.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :md="12" :sm="24">
                <el-form-item label="默认分辨率">
                  <el-select
                    v-model="localParams.aspectRatioMode.defaultResolution"
                    placeholder="选择默认值"
                    clearable
                    style="width: 100%"
                  >
                    <el-option
                      v-for="resolution in localParams.aspectRatioMode
                        .resolutions || []"
                      :key="resolution.value"
                      :label="resolution.label"
                      :value="resolution.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </template>

          <template
            v-else-if="sizeMode === 'gemini' && localParams.geminiImageConfig"
          >
            <el-form-item label="宽高比列表">
              <OptionListEditor
                v-model="localParams.geminiImageConfig.aspectRatios"
                preset-type="ratio"
              />
            </el-form-item>
            <el-form-item label="尺寸等级">
              <OptionListEditor
                v-model="localParams.geminiImageConfig.imageSizes"
                preset-type="imageSize"
              />
              <div class="form-hint">
                Gemini 的 imageSize 值为 "512" / "1K" / "2K" / "4K"
              </div>
            </el-form-item>
            <el-row :gutter="20">
              <el-col :md="12" :sm="24">
                <el-form-item label="默认比例">
                  <el-select
                    v-model="localParams.geminiImageConfig.defaultAspectRatio"
                    placeholder="选择默认值"
                    clearable
                    style="width: 100%"
                  >
                    <el-option
                      v-for="ratio in localParams.geminiImageConfig
                        .aspectRatios"
                      :key="ratio.value"
                      :label="ratio.label"
                      :value="ratio.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
              <el-col :md="12" :sm="24">
                <el-form-item label="默认尺寸">
                  <el-select
                    v-model="localParams.geminiImageConfig.defaultImageSize"
                    placeholder="选择默认值"
                    clearable
                    style="width: 100%"
                  >
                    <el-option
                      v-for="size in localParams.geminiImageConfig.imageSizes ||
                      []"
                      :key="size.value"
                      :label="size.label"
                      :value="size.value"
                    />
                  </el-select>
                </el-form-item>
              </el-col>
            </el-row>
          </template>
        </el-collapse-item>

        <el-collapse-item
          v-for="group in paramGroups"
          :key="group.key"
          :name="group.key"
        >
          <template #title>
            <div class="section-title">
              <span>{{ group.label }}</span>
              <el-tag size="small" effect="plain">
                支持 {{ getSupportedCount(group.params) }} /
                {{ group.params.length }}
              </el-tag>
            </div>
          </template>

          <div class="param-support-grid">
            <div
              v-for="param in group.params"
              :key="param.key"
              class="param-card"
              :class="{ 'is-compact': paramStates[param.key] !== 'supported' }"
            >
              <div class="param-header">
                <span class="param-name">{{ param.label }}</span>
                <el-radio-group
                  v-model="paramStates[param.key]"
                  size="small"
                  @change="handleParamStateChange(param.key)"
                >
                  <el-radio-button value="unlimited">不限</el-radio-button>
                  <el-radio-button value="supported">支持</el-radio-button>
                  <el-radio-button value="unsupported">禁用</el-radio-button>
                </el-radio-group>
              </div>

              <div
                v-if="paramStates[param.key] === 'supported'"
                class="param-config-area"
              >
                <template v-if="param.type === 'options'">
                  <OptionListEditor
                    v-model="(localParams[param.key] as any).options"
                    :preset-type="getParamPresetType(param.key)"
                  />
                  <el-form-item
                    label="默认值"
                    label-width="60px"
                    style="margin-top: 10px; margin-bottom: 0"
                  >
                    <el-select
                      v-model="(localParams[param.key] as any).default"
                      placeholder="选择默认值"
                      clearable
                      size="small"
                    >
                      <el-option
                        v-for="o in (localParams[param.key] as any).options ||
                        []"
                        :key="o.value"
                        :label="o.label"
                        :value="o.value"
                      />
                    </el-select>
                  </el-form-item>
                </template>

                <template v-else-if="param.type === 'number'">
                  <div class="number-range">
                    <el-input-number
                      v-model="(localParams[param.key] as any).min"
                      placeholder="最小"
                      size="small"
                    />
                    <span>-</span>
                    <el-input-number
                      v-model="(localParams[param.key] as any).max"
                      placeholder="最大"
                      size="small"
                    />
                  </div>
                  <el-form-item
                    label="默认值"
                    label-width="60px"
                    style="margin-top: 10px; margin-bottom: 0"
                  >
                    <el-input-number
                      v-model="(localParams[param.key] as any).default"
                      size="small"
                    />
                  </el-form-item>
                  <el-form-item
                    v-if="param.allowStep"
                    label="步长"
                    label-width="60px"
                    style="margin-top: 10px; margin-bottom: 0"
                  >
                    <el-input-number
                      v-model="(localParams[param.key] as any).step"
                      size="small"
                    />
                  </el-form-item>
                </template>

                <template v-else-if="param.type === 'boolean'">
                  <div class="boolean-hint">
                    启用后，用户可在 UI 中输入此参数
                  </div>
                </template>
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import type { MediaGenParamRules } from "@/types/model-metadata";
import OptionListEditor from "./OptionListEditor.vue";

const props = defineProps<{
  modelValue: MediaGenParamRules | undefined;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: MediaGenParamRules | undefined): void;
  (e: "update:json"): void;
}>();

const localParams = ref<MediaGenParamRules>({});
const isApplyingExternalValue = ref(false);
const activeSections = ref(["size", "core"]);

const sizeMode = ref<"none" | "size" | "aspectRatio" | "gemini">("none");
const paramStates = ref<
  Record<string, "unlimited" | "supported" | "unsupported">
>({});

type SupportableParamKey =
  | "quality"
  | "style"
  | "negativePrompt"
  | "seed"
  | "steps"
  | "guidanceScale"
  | "background"
  | "inputFidelity"
  | "moderation"
  | "outputFormat"
  | "outputCompression"
  | "batchSize"
  | "partialImages";

type OptionPresetType =
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

type SupportableParam = {
  key: SupportableParamKey;
  label: string;
  type: "options" | "number" | "boolean";
  allowStep?: boolean;
};

const supportableParams: SupportableParam[] = [
  { key: "quality", label: "质量 (quality)", type: "options" },
  { key: "style", label: "风格 (style)", type: "options" },
  { key: "negativePrompt", label: "负向提示词", type: "boolean" },
  { key: "seed", label: "随机种子 (seed)", type: "number" },
  { key: "steps", label: "迭代步数 (steps)", type: "number" },
  {
    key: "guidanceScale",
    label: "引导系数 (cfg)",
    type: "number",
    allowStep: true,
  },
  { key: "background", label: "背景/透明度", type: "options" },
  { key: "inputFidelity", label: "输入保真度", type: "options" },
  { key: "moderation", label: "内容审核", type: "options" },
  { key: "outputFormat", label: "输出格式", type: "options" },
  { key: "outputCompression", label: "输出压缩", type: "number" },
  { key: "batchSize", label: "批量生成 (n)", type: "number" },
  { key: "partialImages", label: "流式预览图", type: "number" },
] as const;

const coreParamKeys = new Set<SupportableParamKey>([
  "quality",
  "style",
  "negativePrompt",
  "seed",
  "steps",
  "guidanceScale",
]);

const coreParams = computed(() =>
  supportableParams.filter((param) => coreParamKeys.has(param.key))
);

const advancedParams = computed(() =>
  supportableParams.filter((param) => !coreParamKeys.has(param.key))
);

const paramGroups = computed(() => [
  { key: "core", label: "核心生成参数", params: coreParams.value },
  { key: "advanced", label: "高级与输出参数", params: advancedParams.value },
]);

const sizeModeLabel = computed(() => {
  const labels = {
    none: "未配置",
    size: "标准尺寸",
    aspectRatio: "宽高比",
    gemini: "Gemini",
  };
  return labels[sizeMode.value];
});

function ensureEditorShape(params: MediaGenParamRules) {
  if (params.size) {
    params.size.presets ||= [];
    if (params.size.mode === "free") {
      params.size.constraints ||= {};
    }
  }
  if (params.aspectRatioMode) {
    params.aspectRatioMode.ratios ||= [];
    params.aspectRatioMode.resolutions ||= [];
  }
  if (params.geminiImageConfig) {
    params.geminiImageConfig.aspectRatios ||= [];
    params.geminiImageConfig.imageSizes ||= [];
  }
  supportableParams.forEach((p) => {
    const param = (params as any)[p.key];
    if (p.type === "options" && param?.supported === true) {
      param.options ||= [];
    }
  });
}

function cleanMediaGenParams(params: MediaGenParamRules): MediaGenParamRules {
  const cleaned = JSON.parse(JSON.stringify(params)) as MediaGenParamRules;

  if (cleaned.size) {
    if (!cleaned.size.presets?.length) delete cleaned.size.presets;
    if (cleaned.size.constraints) {
      Object.keys(cleaned.size.constraints).forEach((key) => {
        const value = (cleaned.size!.constraints as Record<string, unknown>)[
          key
        ];
        if (value === undefined || value === null) {
          delete (cleaned.size!.constraints as Record<string, unknown>)[key];
        }
      });
      if (Object.keys(cleaned.size.constraints).length === 0) {
        delete cleaned.size.constraints;
      }
    }
  }

  if (cleaned.aspectRatioMode?.resolutions?.length === 0) {
    delete cleaned.aspectRatioMode.resolutions;
  }
  if (cleaned.geminiImageConfig?.imageSizes?.length === 0) {
    delete cleaned.geminiImageConfig.imageSizes;
  }

  supportableParams.forEach((p) => {
    const param = (cleaned as any)[p.key];
    if (!param || typeof param !== "object") return;
    Object.keys(param).forEach((key) => {
      if (param[key] === undefined || param[key] === null) {
        delete param[key];
      }
    });
    if (Array.isArray(param.options) && param.options.length === 0) {
      delete param.options;
    }
  });

  return cleaned;
}

watch(
  () => props.modelValue,
  (newVal) => {
    if (!newVal) {
      localParams.value = {};
      sizeMode.value = "none";
      paramStates.value = {};
      return;
    }

    isApplyingExternalValue.value = true;
    localParams.value = JSON.parse(JSON.stringify(newVal));
    ensureEditorShape(localParams.value);

    if (localParams.value.size) sizeMode.value = "size";
    else if (localParams.value.aspectRatioMode) sizeMode.value = "aspectRatio";
    else if (localParams.value.geminiImageConfig) sizeMode.value = "gemini";
    else sizeMode.value = "none";

    const newStates: Record<string, any> = {};
    supportableParams.forEach((p) => {
      const val = (localParams.value as any)[p.key];
      if (val === undefined) newStates[p.key] = "unlimited";
      else if (val.supported === false) newStates[p.key] = "unsupported";
      else newStates[p.key] = "supported";
    });
    paramStates.value = newStates;
    nextTick(() => {
      isApplyingExternalValue.value = false;
    });
  },
  { immediate: true, deep: true }
);

watch(
  localParams,
  (newVal) => {
    if (isApplyingExternalValue.value) return;
    const cleaned = cleanMediaGenParams(newVal);
    emit(
      "update:modelValue",
      Object.keys(cleaned).length > 0 ? cleaned : undefined
    );
    emit("update:json");
  },
  { deep: true }
);

watch(sizeMode, (newMode) => {
  if (isApplyingExternalValue.value) return;

  delete localParams.value.size;
  delete localParams.value.aspectRatioMode;
  delete localParams.value.geminiImageConfig;

  if (newMode === "size") {
    localParams.value.size = {
      mode: "preset",
      presets: [],
      constraints: { stepSize: 8 },
    };
  } else if (newMode === "aspectRatio") {
    localParams.value.aspectRatioMode = { ratios: [], resolutions: [] };
  } else if (newMode === "gemini") {
    localParams.value.geminiImageConfig = {
      aspectRatios: [],
      imageSizes: [],
    };
  }
});

function handleSizeRuleModeChange() {
  if (localParams.value.size?.mode === "free") {
    localParams.value.size.constraints ||= { stepSize: 8 };
  }
}

function handleParamStateChange(key: string) {
  const state = paramStates.value[key];
  const paramDef = supportableParams.find((p) => p.key === key);

  if (state === "unlimited") {
    delete (localParams.value as any)[key];
  } else if (state === "unsupported") {
    (localParams.value as any)[key] = { supported: false };
  } else if (paramDef?.type === "options") {
    (localParams.value as any)[key] = { supported: true, options: [] };
  } else {
    (localParams.value as any)[key] = { supported: true };
  }
}

function getSupportedCount(params: SupportableParam[]) {
  return params.filter((param) => paramStates.value[param.key] === "supported")
    .length;
}

function getParamPresetType(key: SupportableParamKey): OptionPresetType {
  const presetMap: Partial<Record<SupportableParamKey, OptionPresetType>> = {
    quality: "quality",
    style: "style",
    background: "background",
    inputFidelity: "inputFidelity",
    moderation: "moderation",
    outputFormat: "outputFormat",
  };
  return presetMap[key] || "generic";
}
</script>

<style scoped>
.media-gen-params-editor {
  text-align: left;
}

.media-config-collapse {
  border-top: none;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding-right: 12px;
  font-weight: 600;
}

.subsection-title {
  margin: 8px 0 16px;
  padding-top: 12px;
  border-top: var(--border-width) dashed var(--border-color);
  color: var(--text-color-secondary);
  font-size: 13px;
  font-weight: 600;
}

.param-support-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}

.param-card {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  background: var(--card-bg);
}

.param-card.is-compact {
  padding-bottom: 10px;
}

.param-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.param-name {
  font-weight: 600;
  font-size: 14px;
}

.param-config-area {
  padding: 10px;
  background: var(--input-bg);
  border-radius: 6px;
  margin-top: 10px;
}

.number-range {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.boolean-hint {
  font-size: 12px;
  color: var(--text-color-light);
  font-style: italic;
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-light);
  margin-top: 4px;
}

:deep(.el-collapse-item__header) {
  background: transparent;
}

:deep(.el-collapse-item__content) {
  padding-bottom: 18px;
}

@media (max-width: 720px) {
  .param-support-grid {
    grid-template-columns: 1fr;
  }

  .param-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .number-range {
    grid-template-columns: 1fr;
  }
}
</style>
