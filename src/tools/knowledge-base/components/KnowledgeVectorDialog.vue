<template>
  <BaseDialog
    :model-value="modelValue"
    title="构建语义索引"
    width="560px"
    height="auto"
    :show-close-button="!vectorizing"
    :close-on-backdrop-click="false"
    @update:model-value="handleVisibilityChange"
  >
    <template #content>
      <div class="vector-dialog-content">
        <section class="coverage-summary">
          <div>
            <span>向量覆盖</span>
            <strong>{{ coverageLabel }}</strong>
          </div>
          <el-progress
            :percentage="coveragePercentage"
            :stroke-width="8"
            :show-text="false"
          />
          <p>
            {{ status?.vectorizedChunks ?? 0 }} / {{ status?.totalChunks ?? 0 }}
            个分块可用于语义检索
          </p>
        </section>

        <div class="model-field">
          <label for="knowledge-embedding-model">Embedding 模型</label>
          <el-select
            id="knowledge-embedding-model"
            v-model="modelCombo"
            filterable
            placeholder="选择用于当前资料库的模型"
            :disabled="vectorizing"
          >
            <el-option-group
              v-for="group in modelGroups"
              :key="group"
              :label="group"
            >
              <el-option
                v-for="option in availableEmbeddingModels.filter(
                  (item) => item.group === group
                )"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              >
                <div class="model-option">
                  <span>{{ option.label }}</span>
                  <small>{{ option.modelId }}</small>
                </div>
              </el-option>
            </el-option-group>
          </el-select>
          <p v-if="availableEmbeddingModels.length === 0" class="field-warning">
            当前没有已启用的 Embedding 模型，请先在 LLM 服务设置中配置。
          </p>
          <p v-else class="field-hint">
            切换模型会以新模型建立覆盖状态，关键词索引不受影响。
          </p>
        </div>

        <section v-if="vectorizing" class="build-progress" aria-live="polite">
          <div>
            <span>正在写入向量</span>
            <strong>{{ processed }} / {{ total }}</strong>
          </div>
          <el-progress :percentage="buildPercentage" :stroke-width="8" />
        </section>
      </div>
    </template>

    <template #footer>
      <div class="dialog-actions">
        <el-button :disabled="vectorizing" @click="closeDialog">取消</el-button>
        <el-button
          type="primary"
          :loading="vectorizing"
          :disabled="!selectedTarget || totalChunks === 0"
          @click="buildVectors"
        >
          {{ actionLabel }}
        </el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useEmbeddingModelOptions } from "@/composables/useEmbeddingModelOptions";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { vectorizeKnowledgeLibrary } from "../service";
import type { KnowledgeIndexStatus, KnowledgeLibrary } from "../types";

const props = defineProps<{
  modelValue: boolean;
  library: KnowledgeLibrary;
  status: KnowledgeIndexStatus | null;
}>();

const emit = defineEmits<{
  (event: "update:modelValue", value: boolean): void;
  (event: "completed"): void;
  (event: "statusChanged"): void;
}>();

const errorHandler = createModuleErrorHandler("knowledge-base/vector-dialog");
const { availableEmbeddingModels, modelGroups, resolveModelCombo } =
  useEmbeddingModelOptions();
const modelCombo = ref("");
const vectorizing = ref(false);
const processed = ref(0);
const total = ref(0);

const selectedTarget = computed(() => resolveModelCombo(modelCombo.value));
const totalChunks = computed(() => props.status?.totalChunks ?? 0);
const coveragePercentage = computed(() => {
  if (!props.status?.totalChunks) return 0;
  return Math.round(
    (props.status.vectorizedChunks / props.status.totalChunks) * 100
  );
});
const coverageLabel = computed(() => `${coveragePercentage.value}%`);
const buildPercentage = computed(() =>
  total.value ? Math.round((processed.value / total.value) * 100) : 0
);
const actionLabel = computed(() => {
  if (vectorizing.value) return "正在构建";
  return props.status?.vectorizedChunks ? "重新构建" : "开始构建";
});

watch(
  [() => props.modelValue, () => availableEmbeddingModels.value.length],
  ([visible]) => {
    if (!visible) return;
    const current = availableEmbeddingModels.value.find(
      (item) =>
        item.value === props.status?.embeddingModelId ||
        item.modelId === props.status?.embeddingModelId
    );
    modelCombo.value =
      current?.value || availableEmbeddingModels.value[0]?.value || "";
    processed.value = 0;
    total.value = props.status?.totalChunks ?? 0;
  },
  { immediate: true }
);

function handleVisibilityChange(visible: boolean) {
  if (!vectorizing.value) emit("update:modelValue", visible);
}

function closeDialog() {
  if (!vectorizing.value) emit("update:modelValue", false);
}

async function buildVectors() {
  const target = selectedTarget.value;
  if (!target || !totalChunks.value) return;
  const switchingModel =
    props.status?.embeddingModelId &&
    props.status.embeddingModelId !== target.combo &&
    props.status.embeddingModelId !== target.modelId;
  if (switchingModel) {
    try {
      await ElMessageBox.confirm(
        "当前资料库已使用其他模型。继续后会以新模型作为语义检索基准。",
        "切换 Embedding 模型",
        {
          type: "warning",
          confirmButtonText: "继续构建",
          cancelButtonText: "取消",
          lockScroll: false,
        }
      );
    } catch (error) {
      if (error === "cancel" || error === "close") return;
      errorHandler.error(error, "确认模型切换失败");
      return;
    }
  }

  vectorizing.value = true;
  try {
    const count = await vectorizeKnowledgeLibrary(
      props.library.id,
      target.modelId,
      target.profile,
      {
        onProgress(current, nextTotal) {
          processed.value = current;
          total.value = nextTotal;
        },
      }
    );
    customMessage.success(`已为 ${count} 个分块建立语义索引`);
    emit("completed");
    emit("update:modelValue", false);
  } catch (error) {
    errorHandler.error(error, "构建语义索引失败");
    if (processed.value > 0) emit("statusChanged");
  } finally {
    vectorizing.value = false;
  }
}
</script>

<style scoped>
.vector-dialog-content {
  display: grid;
  gap: 20px;
}

.coverage-summary,
.build-progress {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 6px;
  background: var(--input-bg);
}

.coverage-summary > div,
.build-progress > div,
.dialog-actions,
.model-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.coverage-summary span,
.build-progress span,
.model-field label {
  color: var(--el-text-color-regular);
  font-size: 13px;
  font-weight: 600;
}

.coverage-summary strong,
.build-progress strong {
  font-variant-numeric: tabular-nums;
}

.coverage-summary p,
.field-hint,
.field-warning {
  margin: 0;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.model-field {
  display: grid;
  gap: 8px;
}

.model-option small {
  overflow: hidden;
  color: var(--el-text-color-secondary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-warning {
  color: var(--el-color-warning);
}

.dialog-actions {
  justify-content: flex-end;
  width: 100%;
}
</style>
