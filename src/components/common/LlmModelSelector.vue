<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import type {
  LlmProfile,
  LlmModelInfo,
  ModelCapabilities,
} from "@/types/llm-profiles";
import DynamicIcon from "@/components/common/DynamicIcon.vue";

interface Props {
  modelValue: string; // combo `profileId:modelId`
  capabilities?: Partial<ModelCapabilities>;
  disabled?: boolean;
  teleported?: boolean;
  popperClass?: string;
  placeholder?: string;
  clearable?: boolean;
}

interface Emits {
  (e: "update:modelValue", value: string): void;
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  capabilities: () => ({}),
  teleported: true,
  placeholder: "选择模型",
  clearable: true,
});
const emit = defineEmits<Emits>();

const router = useRouter();
const { enabledProfiles } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();

type ModelOption = {
  value: string;
  label: string;
  group: string;
  profile: LlmProfile;
  model: LlmModelInfo;
  profileIndex: number;
};

const goToLlmSettings = () => {
  router.push({ path: "/settings", query: { section: "llm-service" } });
};

const matchesCapabilities = (model: LlmModelInfo) => {
  const capabilities = props.capabilities ?? {};
  const requiredCaps = Object.keys(capabilities) as Array<
    keyof ModelCapabilities
  >;

  return requiredCaps.every((key) => {
    const requiredValue = capabilities[key];
    // 如果没有为某个能力指定要求的值，则跳过检查
    if (requiredValue === undefined) {
      return true;
    }

    const modelHasCap = !!model.capabilities?.[key];

    if (requiredValue === true) {
      // 必须具备该能力
      return modelHasCap;
    }
    // 必须不具备该能力 (requiredValue === false)
    return !modelHasCap;
  });
};

const sortModelOptions = (models: ModelOption[]) =>
  models.sort((a, b) => {
    if (a.profileIndex !== b.profileIndex) {
      return a.profileIndex - b.profileIndex;
    }

    return a.model.id.localeCompare(b.model.id);
  });

const allModelOptions = computed(() => {
  const models: ModelOption[] = [];
  enabledProfiles.value.forEach((profile, profileIndex) => {
    profile.models.forEach((model) => {
      const value = `${profile.id}:${model.id}`;
      models.push({
        value,
        label: model.name,
        group: `${profile.name} (${profile.type})`,
        profile,
        model,
        profileIndex,
      });
    });
  });

  return sortModelOptions(models);
});

// 筛选并格式化所有可选模型
const selectableModels = computed(() => {
  return sortModelOptions(
    allModelOptions.value.filter((item) => matchesCapabilities(item.model))
  );
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
  return allModelOptions.value.find((m) => m.value === props.modelValue);
});

const selectedModelIsSelectable = computed(() => {
  return selectableModels.value.some((m) => m.value === props.modelValue);
});

// 分组
const modelGroups = computed(() => {
  // 保持 selectableModels 的顺序提取分组
  const groups: string[] = [];
  selectableModels.value.forEach((m) => {
    if (!groups.includes(m.group)) {
      groups.push(m.group);
    }
  });
  return groups;
});
</script>

<template>
  <div class="llm-model-selector">
    <el-select
      v-model="selectedModelCombo"
      :placeholder="placeholder"
      :clearable="clearable"
      style="width: 100%"
      :disabled="disabled || (selectableModels.length === 0 && !selectedModelInfo)"
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
          v-for="item in selectableModels.filter((m) => m.group === group)"
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
            <el-text
              v-if="item.model.group"
              size="small"
              type="info"
              class="model-group-tag"
            >
              {{ item.model.group }}
            </el-text>
          </div>
        </el-option>
      </el-option-group>
      <el-option
        v-if="selectedModelInfo && !selectedModelIsSelectable"
        :label="selectedModelInfo.label"
        :value="selectedModelInfo.value"
      >
        <div class="option-item selected-fallback">
          <DynamicIcon
            :src="getModelIcon(selectedModelInfo.model) || ''"
            :alt="selectedModelInfo.label"
            class="model-icon"
            lazy
          />
          <span class="model-name">{{ selectedModelInfo.label }}</span>
          <el-text size="small" type="warning" class="model-group-tag">
            当前已选
          </el-text>
        </div>
      </el-option>
    </el-select>
    <el-link
      v-if="selectableModels.length === 0"
      type="warning"
      underline="never"
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
