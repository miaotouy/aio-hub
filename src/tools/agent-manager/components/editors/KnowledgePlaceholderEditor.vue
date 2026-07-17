<template>
  <div class="knowledge-placeholder-editor">
    <el-form label-width="92px" label-position="left">
      <el-form-item label="资料库">
        <el-select
          v-model="form.library"
          clearable
          filterable
          placeholder="所有已启用资料库"
          class="full-width"
        >
          <el-option
            v-for="library in store.libraries"
            :key="library.id"
            :label="library.name"
            :value="library.id"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="检索策略">
        <el-select v-model="form.strategy" class="full-width">
          <el-option label="自动" value="auto" />
          <el-option label="关键词" value="keyword" />
          <el-option label="语义" value="semantic" />
          <el-option label="混合" value="hybrid" />
        </el-select>
      </el-form-item>
      <el-form-item label="召回上限">
        <el-input-number
          v-model="form.limit"
          :min="1"
          :max="50"
          controls-position="right"
        />
      </el-form-item>
      <el-form-item label="最低分数">
        <div class="slider-row">
          <el-slider v-model="form.minScore" :min="0" :max="1" :step="0.05" />
          <span>{{ form.minScore?.toFixed(2) }}</span>
        </div>
      </el-form-item>
      <el-form-item label="来源引用">
        <el-switch v-model="form.citation" />
      </el-form-item>
    </el-form>

    <div class="preview">
      <span>预览语法</span>
      <code>{{ generatedPlaceholder }}</code>
    </div>
    <div class="actions">
      <el-button @click="$emit('cancel')">取消</el-button>
      <el-button type="primary" @click="$emit('insert', generatedPlaceholder)">
        {{ value ? "确认修改" : "插入占位符" }}
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useKnowledgeStore } from "@/tools/knowledge-base/store";
import {
  parseKnowledgePlaceholder,
  serializeKnowledgePlaceholder,
  type KnowledgePlaceholder,
} from "@/tools/llm-chat/core/context-processors/knowledge-placeholder";

const props = defineProps<{ value?: string }>();
defineEmits<{
  (event: "insert", value: string): void;
  (event: "cancel"): void;
}>();

const store = useKnowledgeStore();
const form = ref<Partial<KnowledgePlaceholder>>({
  library: "",
  strategy: "auto",
  limit: 8,
  minScore: 0,
  when: "always",
  citation: true,
});

function parseValue(value?: string) {
  const match = value?.match(/【knowledge(?:::[^【】]*)?】/);
  if (!match) return;
  const parsed = parseKnowledgePlaceholder(match[0], 0);
  form.value = {
    library: parsed.library || "",
    strategy: parsed.strategy || "auto",
    limit: parsed.limit ?? 8,
    minScore: parsed.minScore ?? 0,
    when: "always",
    citation: parsed.citation ?? true,
  };
}

const generatedPlaceholder = computed(() =>
  serializeKnowledgePlaceholder({
    library: form.value.library || undefined,
    strategy: form.value.strategy,
    limit: form.value.limit,
    minScore: form.value.minScore,
    when: "always",
    citation: form.value.citation,
  })
);

onMounted(() => {
  if (!store.libraries.length) void store.initialize();
  parseValue(props.value);
});
watch(() => props.value, parseValue);
</script>

<style scoped>
.knowledge-placeholder-editor {
  padding: 4px;
}

.full-width {
  width: 100%;
}

.slider-row {
  display: grid;
  width: 100%;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  gap: 12px;
}

.slider-row span {
  color: var(--el-color-primary);
  font-family: var(--el-font-family-mono);
  font-size: 12px;
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 18px;
  padding: 12px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  background: var(--input-bg);
}

.preview span {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.preview code {
  overflow-wrap: anywhere;
  color: var(--el-color-primary);
  font-size: 12px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}
</style>
