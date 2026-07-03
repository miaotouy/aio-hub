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

<template>
  <div class="editor-row model-match-row">
    <span class="field-label">过滤</span>
    <div class="model-match-config">
      <div class="match-switches">
        <el-switch v-model="enabled" size="small" active-text="启用过滤" />
        <template v-if="enabled">
          <el-divider direction="vertical" />
          <el-radio-group v-model="mode" size="small">
            <el-radio-button value="any">满足其一 (OR)</el-radio-button>
            <el-radio-button value="all">同时满足 (AND)</el-radio-button>
          </el-radio-group>
          <el-divider direction="vertical" />
          <el-switch
            v-model="exclude"
            size="small"
            active-text="排除模式"
            style="--el-switch-on-color: var(--el-color-warning)"
          />
          <el-tooltip placement="top">
            <template #content>
              <div style="max-width: 300px">
                <p>输入匹配规则，支持正则表达式。</p>
                <p>
                  <strong>满足其一 (OR)：</strong>
                  只要模型或渠道满足任意一条规则即生效。
                </p>
                <p>
                  <strong>同时满足 (AND)：</strong>
                  必须模型满足规则且渠道满足规则才生效。
                </p>
                <p>
                  <strong>排除模式：</strong>
                  开启后逻辑反转——匹配到的模型/渠道将<em>不</em>注入此消息。
                </p>
                <p><i>注：如果某项规则为空，则视为该项已通过匹配。</i></p>
              </div> </template
            ><el-icon class="info-icon" style="margin-left: 4px"
              ><InfoFilled
            /></el-icon>
          </el-tooltip>
        </template>
      </div>

      <div v-if="enabled" class="model-match-patterns-area">
        <div class="match-pattern-group">
          <span class="pattern-label">模型规则:</span>
          <el-input
            v-model="patternsText"
            type="textarea"
            :rows="2"
            placeholder="每行一个模型 ID 或名称的匹配规则（支持正则）"
            style="width: 100%; max-width: 600px"
          />
        </div>
        <div class="match-pattern-group">
          <span class="pattern-label">渠道规则:</span>
          <el-input
            v-model="profilePatternsText"
            type="textarea"
            :rows="2"
            placeholder="每行一个渠道名称的匹配规则（支持正则）"
            style="width: 100%; max-width: 600px"
          />
        </div>
        <div
          v-if="matchProfileName && !profilePatternsText"
          class="legacy-hint"
        >
          <el-checkbox v-model="matchProfileName" size="small">
            兼容旧版：在模型规则中同时匹配渠道名
          </el-checkbox>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { InfoFilled } from "@element-plus/icons-vue";

type ModelMatchValue =
  | {
      enabled: boolean;
      mode?: "any" | "all";
      exclude?: boolean;
      patterns: string[];
      profilePatterns?: string[];
      matchProfileName?: boolean;
    }
  | undefined;

const props = defineProps<{ modelValue: ModelMatchValue }>();
const emit = defineEmits<{ "update:modelValue": [value: ModelMatchValue] }>();

const enabled = ref(false);
const mode = ref<"any" | "all">("any");
const exclude = ref(false);
const matchProfileName = ref(false);
const patternsText = ref("");
const profilePatternsText = ref("");

function restore(val: ModelMatchValue) {
  if (!val) {
    enabled.value = false;
    mode.value = "any";
    exclude.value = false;
    matchProfileName.value = false;
    patternsText.value = "";
    profilePatternsText.value = "";
    return;
  }
  enabled.value = val.enabled;
  mode.value = val.mode || "any";
  exclude.value = val.exclude || false;
  matchProfileName.value = val.matchProfileName || false;
  patternsText.value = (val.patterns || []).join("\n");
  profilePatternsText.value = (val.profilePatterns || []).join("\n");
}

watch(() => props.modelValue, restore, { immediate: true, deep: true });

watch(
  [enabled, mode, exclude, matchProfileName, patternsText, profilePatternsText],
  () => {
    if (!enabled.value) {
      emit("update:modelValue", undefined);
      return;
    }
    const patterns = patternsText.value
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    const profilePatterns = profilePatternsText.value
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);
    if (patterns.length === 0 && profilePatterns.length === 0) {
      emit("update:modelValue", undefined);
      return;
    }
    emit("update:modelValue", {
      enabled: true,
      mode: mode.value,
      exclude: exclude.value || undefined,
      patterns,
      profilePatterns,
      matchProfileName: matchProfileName.value,
    });
  }
);
</script>

<style scoped>
.editor-row {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.field-label {
  width: 60px;
  font-weight: 500;
  color: var(--el-text-color-regular);
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.model-match-row {
  align-items: flex-start;
}

.model-match-row .field-label {
  margin-top: 4px;
}

.model-match-config {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.match-switches {
  display: flex;
  align-items: center;
  height: 32px;
}

.model-match-patterns-area {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.match-pattern-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pattern-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
}

.legacy-hint {
  opacity: 0.6;
}

.info-icon {
  color: var(--el-text-color-secondary);
  cursor: help;
}
</style>
