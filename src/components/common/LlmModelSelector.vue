<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import type { LlmProfile, LlmModelInfo, ModelCapabilities } from "@/types/llm-profiles";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

interface Props {
  modelValue: string; // combo `profileId:modelId`
  capabilities?: Partial<ModelCapabilities>;
  disabled?: boolean;
  teleported?: boolean;
  popperClass?: string;
}

interface Emits {
  (e: "update:modelValue", value: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  capabilities: () => ({}),
  teleported: true,
});
const emit = defineEmits<Emits>();

const router = useRouter();
const { enabledProfiles } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();

const goToLlmSettings = () => {
  router.push({ path: "/settings", query: { section: "llm-service" } });
};

// 筛选并格式化所有可用模型
const availableModels = computed(() => {
  const models: Array<{
    value: string; // 格式: profileId:modelId
    label: string;
    group: string;
    profile: LlmProfile;
    model: LlmModelInfo;
  }> = [];

  enabledProfiles.value.forEach((profile) => {
    profile.models.forEach((model) => {
      // 根据能力要求进行筛选
      const capabilities = props.capabilities ?? {};
      const requiredCaps = Object.keys(capabilities) as Array<keyof ModelCapabilities>;

      const meetsRequirements = requiredCaps.every((key) => {
        const requiredValue = capabilities[key];
        // 如果没有为某个能力指定要求的值，则跳过检查
        if (requiredValue === undefined) {
          return true;
        }
        // 检查模型是否具有该能力并符合要求
        return model.capabilities?.[key] === requiredValue;
      });

      if (meetsRequirements) {
        models.push({
          value: `${profile.id}:${model.id}`,
          label: model.name,
          group: `${profile.name} (${profile.type})`,
          profile,
          model,
        });
      }
    });
  });

  return models;
});

// 当前选中的模型组合值
const selectedModelCombo = computed({
  get: () => props.modelValue,
  set: (value: string) => {
    if (!value) return;
    emit("update:modelValue", value);
  },
});

// 获取当前选中的模型对象以便显示
const selectedModelInfo = computed(() => {
  return availableModels.value.find((m) => m.value === props.modelValue);
});

// 分组
const modelGroups = computed(() => {
  return [...new Set(availableModels.value.map((m) => m.group))];
});
</script>

<template>
  <div class="llm-model-selector">
    <el-select
      v-model="selectedModelCombo"
      placeholder="选择模型"
      style="width: 100%"
      :disabled="disabled || availableModels.length === 0"
      :teleported="teleported"
      :popper-class="popperClass"
      class="custom-select"
    >
      <template #prefix>
        <div v-if="selectedModelInfo" class="selected-model-display-prefix">
          <DynamicIcon
            :src="getModelIcon(selectedModelInfo.model) || ''"
            :alt="selectedModelInfo.label"
            class="model-icon"
          />
        </div>
      </template>

      <el-option-group v-for="group in modelGroups" :key="group" :label="group">
        <el-option
          v-for="item in availableModels.filter((m) => m.group === group)"
          :key="item.value"
          :label="item.label"
          :value="item.value"
        >
          <div class="option-item">
            <DynamicIcon
              :src="getModelIcon(item.model) || ''"
              :alt="item.label"
              class="model-icon"
              lazy
            />
            <span class="model-name">{{ item.label }}</span>
            <el-text v-if="item.model.group" size="small" type="info" class="model-group-tag">
              {{ item.model.group }}
            </el-text>
          </div>
        </el-option>
      </el-option-group>
    </el-select>
    <el-link
      v-if="availableModels.length === 0"
      type="warning"
      :underline="false"
      style="margin-top: 8px; display: block; cursor: pointer"
      @click="goToLlmSettings"
    >
      请先在设置中配置 LLM 服务并添加符合要求的模型
    </el-link>
  </div>
</template>

<style scoped>
.llm-model-selector {
  width: 100%;
}

.custom-select:deep(.el-input__wrapper) {
  padding-left: 8px;
}

.custom-select:deep(.el-input__prefix) {
  margin-right: 8px;
}

.selected-model-display-prefix {
  display: flex;
  align-items: center;
  gap: 8px;
}

.model-icon {
  width: 20px;
  height: 20px;
  border-radius: 4px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.model-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-group-tag {
  margin-left: auto;
  flex-shrink: 0;
}
</style>
