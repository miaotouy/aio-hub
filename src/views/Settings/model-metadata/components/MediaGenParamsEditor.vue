<template>
  <div class="media-gen-params-editor">
    <el-form :model="localParams" label-width="120px" label-position="left">
      <!-- 尺寸控制模式 -->
      <el-divider content-position="left">尺寸控制 (Size Control)</el-divider>
      <el-form-item label="模式选择">
        <el-radio-group v-model="sizeMode">
          <el-radio value="none">不配置</el-radio>
          <el-radio value="size">标准尺寸 (size)</el-radio>
          <el-radio value="aspectRatio">宽高比 (xAI)</el-radio>
          <el-radio value="gemini">Gemini 模式</el-radio>
        </el-radio-group>
      </el-form-item>

      <!-- 标准尺寸配置 -->
      <template v-if="sizeMode === 'size' && localParams.size">
        <el-form-item label="尺寸模式">
          <el-radio-group v-model="localParams.size.mode">
            <el-radio value="preset">仅限预设 (Preset)</el-radio>
            <el-radio value="free">自由输入 (Free)</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="预设列表">
          <OptionListEditor v-model="localParams.size.presets!" />
        </el-form-item>

        <el-form-item label="默认尺寸">
          <el-select v-model="localParams.size.default" placeholder="选择默认值" clearable style="width: 100%">
            <el-option v-for="p in localParams.size.presets" :key="p.value" :label="p.label" :value="p.value" />
          </el-select>
        </el-form-item>

        <template v-if="localParams.size.mode === 'free' && localParams.size.constraints">
          <el-divider border-style="dashed">自由模式约束</el-divider>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="最大宽度">
                <el-input-number v-model="localParams.size.constraints.maxWidth" :min="0" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="最大高度">
                <el-input-number v-model="localParams.size.constraints.maxHeight" :min="0" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item label="步长 (Step)">
                <el-input-number v-model="localParams.size.constraints.stepSize" :min="1" style="width: 100%" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
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
        </template>
      </template>

      <!-- 宽高比模式配置 -->
      <template v-else-if="sizeMode === 'aspectRatio' && localParams.aspectRatioMode">
        <el-form-item label="宽高比列表">
          <OptionListEditor v-model="localParams.aspectRatioMode.ratios" />
        </el-form-item>
        <el-form-item label="分辨率列表">
          <OptionListEditor v-model="localParams.aspectRatioMode.resolutions!" />
        </el-form-item>
      </template>

      <!-- Gemini 模式配置 -->
      <template v-else-if="sizeMode === 'gemini' && localParams.geminiImageConfig">
        <el-form-item label="宽高比列表">
          <OptionListEditor v-model="localParams.geminiImageConfig.aspectRatios" />
        </el-form-item>
        <el-form-item label="尺寸等级">
          <OptionListEditor v-model="localParams.geminiImageConfig.imageSizes!" />
          <div class="form-hint">Gemini 的 imageSize 值为 "512" / "1K" / "2K" / "4K"</div>
        </el-form-item>
      </template>

      <!-- 参数支持开关组 -->
      <el-divider content-position="left">参数支持 (Parameter Support)</el-divider>

      <div class="param-support-grid">
        <div v-for="param in supportableParams" :key="param.key" class="param-card">
          <div class="param-header">
            <span class="param-name">{{ param.label }}</span>
            <el-radio-group v-model="paramStates[param.key]" size="small" @change="handleParamStateChange(param.key)">
              <el-radio-button value="unlimited">不限</el-radio-button>
              <el-radio-button value="supported">支持</el-radio-button>
              <el-radio-button value="unsupported">禁用</el-radio-button>
            </el-radio-group>
          </div>

          <div v-if="paramStates[param.key] === 'supported'" class="param-config-area">
            <!-- 选项类参数 -->
            <template v-if="param.type === 'options'">
              <OptionListEditor v-model="(localParams[param.key] as any).options" />
              <el-form-item label="默认值" label-width="60px" style="margin-top: 10px; margin-bottom: 0">
                <el-select
                  v-model="(localParams[param.key] as any).default"
                  placeholder="选择默认值"
                  clearable
                  size="small"
                >
                  <el-option
                    v-for="o in (localParams[param.key] as any).options || []"
                    :key="o.value"
                    :label="o.label"
                    :value="o.value"
                  />
                </el-select>
              </el-form-item>
            </template>

            <!-- 数值类参数 -->
            <template v-else-if="param.type === 'number'">
              <div class="number-range">
                <el-input-number v-model="(localParams[param.key] as any).min" placeholder="最小" size="small" />
                <span>-</span>
                <el-input-number v-model="(localParams[param.key] as any).max" placeholder="最大" size="small" />
              </div>
              <el-form-item label="默认值" label-width="60px" style="margin-top: 10px; margin-bottom: 0">
                <el-input-number v-model="(localParams[param.key] as any).default" size="small" />
              </el-form-item>
            </template>

            <!-- 布尔类参数 -->
            <template v-else-if="param.type === 'boolean'">
              <div class="boolean-hint">启用后，用户可在 UI 中输入此参数</div>
            </template>
          </div>
        </div>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
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

// 尺寸模式映射
const sizeMode = ref<"none" | "size" | "aspectRatio" | "gemini">("none");

// 参数状态映射 (unlimited | supported | unsupported)
const paramStates = ref<Record<string, "unlimited" | "supported" | "unsupported">>({});

const supportableParams = [
  { key: "quality", label: "质量 (quality)", type: "options" },
  { key: "style", label: "风格 (style)", type: "options" },
  { key: "negativePrompt", label: "负向提示词", type: "boolean" },
  { key: "seed", label: "随机种子 (seed)", type: "number" },
  { key: "steps", label: "迭代步数 (steps)", type: "number" },
  { key: "guidanceScale", label: "引导系数 (cfg)", type: "number" },
  { key: "background", label: "背景/透明度", type: "options" },
  { key: "outputFormat", label: "输出格式", type: "options" },
  { key: "batchSize", label: "批量生成 (n)", type: "number" },
  { key: "moderation", label: "内容审核", type: "options" },
] as const;

// 初始化本地状态
watch(
  () => props.modelValue,
  (newVal) => {
    if (!newVal) {
      localParams.value = {};
      sizeMode.value = "none";
      paramStates.value = {};
      return;
    }

    localParams.value = JSON.parse(JSON.stringify(newVal));

    // 推断尺寸模式
    if (localParams.value.size) sizeMode.value = "size";
    else if (localParams.value.aspectRatioMode) sizeMode.value = "aspectRatio";
    else if (localParams.value.geminiImageConfig) sizeMode.value = "gemini";
    else sizeMode.value = "none";

    // 推断参数状态
    const newStates: Record<string, any> = {};
    supportableParams.forEach((p) => {
      const val = (localParams.value as any)[p.key];
      if (val === undefined) newStates[p.key] = "unlimited";
      else if (val.supported === false) newStates[p.key] = "unsupported";
      else newStates[p.key] = "supported";
    });
    paramStates.value = newStates;
  },
  { immediate: true, deep: true },
);

// 监听本地状态变化并同步回父组件
watch(
  localParams,
  (newVal) => {
    emit("update:modelValue", Object.keys(newVal).length > 0 ? newVal : undefined);
  },
  { deep: true },
);

// 处理尺寸模式切换
watch(sizeMode, (newMode) => {
  // 清理其他模式的数据
  delete localParams.value.size;
  delete localParams.value.aspectRatioMode;
  delete localParams.value.geminiImageConfig;

  if (newMode === "size") {
    localParams.value.size = { mode: "preset", presets: [], constraints: { stepSize: 8 } };
  } else if (newMode === "aspectRatio") {
    localParams.value.aspectRatioMode = { ratios: [] };
  } else if (newMode === "gemini") {
    localParams.value.geminiImageConfig = { aspectRatios: [] };
  }
});

function handleParamStateChange(key: string) {
  const state = paramStates.value[key];
  const paramDef = supportableParams.find((p) => p.key === key);

  if (state === "unlimited") {
    delete (localParams.value as any)[key];
  } else if (state === "unsupported") {
    (localParams.value as any)[key] = { supported: false };
  } else {
    // 初始化支持状态
    if (paramDef?.type === "options") {
      (localParams.value as any)[key] = { supported: true, options: [] };
    } else if (paramDef?.type === "number") {
      (localParams.value as any)[key] = { supported: true };
    } else {
      (localParams.value as any)[key] = { supported: true };
    }
  }
}
</script>

<style scoped>
.media-gen-params-editor {
  text-align: left;
}

.param-support-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
  gap: 16px;
  margin-top: 10px;
}

.param-card {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  background: var(--card-bg);
}

.param-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.param-name {
  font-weight: bold;
  font-size: 14px;
}

.param-config-area {
  padding: 10px;
  background: var(--input-bg);
  border-radius: 6px;
  margin-top: 8px;
}

.number-range {
  display: flex;
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

:deep(.el-divider__text) {
  background-color: transparent;
  color: var(--primary-color);
  font-weight: bold;
}
</style>
