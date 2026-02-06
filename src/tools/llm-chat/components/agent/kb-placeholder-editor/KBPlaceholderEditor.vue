<template>
  <div class="kb-placeholder-editor">
    <el-form :model="form" label-width="100px" label-position="left" size="default">
      <!-- 知识库选择 -->
      <el-form-item label="知识库">
        <el-select
          v-model="form.kbName"
          placeholder="选择知识库 (可选)"
          clearable
          filterable
          class="full-width"
        >
          <el-option label="所有知识库" value="" />
          <el-option
            v-for="base in kbStore.bases"
            :key="base.id"
            :label="base.name"
            :value="base.name"
          />
        </el-select>
        <div class="item-tip">留空则检索所有已启用的知识库</div>
      </el-form-item>

      <!-- 召回数量 -->
      <el-form-item label="召回数量">
        <el-input-number
          v-model="form.limit"
          :min="1"
          :max="50"
          placeholder="默认"
          controls-position="right"
        />
        <span class="unit">条</span>
      </el-form-item>

      <!-- 最低分数 -->
      <el-form-item label="最低分数">
        <div class="slider-container">
          <el-slider
            v-model="form.minScore"
            :min="0"
            :max="1"
            :step="0.05"
            :format-tooltip="(v: number) => v.toFixed(2)"
          />
          <span class="slider-value">{{ form.minScore?.toFixed(2) }}</span>
        </div>
        <div class="item-tip">仅返回相关度高于此分数的条目</div>
      </el-form-item>

      <!-- 激活模式 -->
      <el-form-item label="激活模式">
        <el-select v-model="form.mode" class="full-width">
          <el-option label="总是检索 (always)" value="always" />
          <el-option label="标签门控 (gate)" value="gate" />
          <el-option label="轮次常驻 (turn)" value="turn" />
          <el-option label="静态注入 (static)" value="static" />
        </el-select>
      </el-form-item>

      <!-- 模式参数 -->
      <el-form-item v-if="form.mode === 'gate'" label="标签过滤">
        <el-select
          v-model="form.modeParams"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入标签并回车"
          class="full-width"
        >
          <el-option
            v-for="tag in allTags"
            :key="tag"
            :label="tag"
            :value="tag"
          />
        </el-select>
        <div class="item-tip">仅当用户消息包含这些标签时才触发检索</div>
      </el-form-item>

      <el-form-item v-if="form.mode === 'turn'" label="轮次间隔">
        <el-input-number
          v-model="turnInterval"
          :min="1"
          :max="100"
          controls-position="right"
        />
        <span class="unit">轮</span>
        <div class="item-tip">每隔多少轮对话触发一次检索</div>
      </el-form-item>

      <el-form-item v-if="form.mode === 'static'" label="条目 ID">
        <el-input
          v-model="staticIds"
          type="textarea"
          :rows="3"
          placeholder="输入条目 ID，多个 ID 用逗号或换行分隔"
        />
        <div class="item-tip">直接注入指定条目，不执行相似度检索</div>
      </el-form-item>

      <!-- 预览 -->
      <div class="preview-section">
        <div class="preview-label">预览语法：</div>
        <code class="preview-code">{{ generatedPlaceholder }}</code>
      </div>

      <!-- 操作 -->
      <div class="actions">
        <el-button @click="$emit('cancel')">取消</el-button>
        <el-button type="primary" @click="handleInsert">
          {{ isEdit ? '确认修改' : '插入占位符' }}
        </el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useKnowledgeBaseStore } from '@/tools/knowledge-base/stores/knowledgeBaseStore';
import { parseKBParams, type KBPlaceholder } from '../../../core/context-processors/knowledge-processor';

const props = defineProps<{
  /** 当前选中的占位符文本，用于编辑模式 */
  value?: string;
}>();

const emit = defineEmits<{
  (e: 'insert', value: string): void;
  (e: 'cancel'): void;
}>();

const kbStore = useKnowledgeBaseStore();

// 表单数据
const form = ref<Partial<KBPlaceholder>>({
  kbName: '',
  limit: undefined,
  minScore: 0.3,
  mode: 'always',
  modeParams: [],
});

// 辅助字段
const turnInterval = ref(1);
const staticIds = ref('');

const isEdit = computed(() => !!props.value);

// 获取所有已知标签用于建议
const allTags = computed(() => kbStore.globalStats.allDiscoveredTags || []);

/**
 * 解析传入的占位符
 */
const parseValue = (val: string) => {
  if (!val) return;
  
  const KB_PLACEHOLDER_REGEX = /【(?:kb|knowledge)(?:::([^【】]*?))?】/;
  const match = val.match(KB_PLACEHOLDER_REGEX);
  
  if (match) {
    const params = parseKBParams(match[0], match[1] || '', 0);
    form.value = {
      kbName: params.kbName || '',
      limit: params.limit,
      minScore: params.minScore ?? 0.3,
      mode: params.mode || 'always',
      modeParams: params.modeParams || [],
    };
    
    // 同步辅助字段
    if (params.mode === 'turn' && params.modeParams?.[0]) {
      turnInterval.value = parseInt(params.modeParams[0]) || 1;
    } else if (params.mode === 'static' && params.modeParams) {
      staticIds.value = params.modeParams.join(', ');
    }
  }
};

onMounted(() => {
  if (kbStore.bases.length === 0) {
    kbStore.init();
  }
  if (props.value) {
    parseValue(props.value);
  }
});

watch(() => props.value, (newVal) => {
  if (newVal) parseValue(newVal);
});

/**
 * 生成占位符字符串
 */
const generatedPlaceholder = computed(() => {
  const parts: string[] = [];
  
  // 1. kbName
  parts.push(form.value.kbName || '');
  
  // 2. limit
  parts.push(form.value.limit?.toString() || '');
  
  // 3. minScore
  parts.push(form.value.minScore !== undefined ? form.value.minScore.toFixed(2) : '');
  
  // 4. mode
  parts.push(form.value.mode || 'always');
  
  // 5. modeParams
  let finalParams = form.value.modeParams || [];
  if (form.value.mode === 'turn') {
    finalParams = [turnInterval.value.toString()];
  } else if (form.value.mode === 'static') {
    finalParams = staticIds.value.split(/[\n,，]/).map(s => s.trim()).filter(Boolean);
  }
  parts.push(finalParams.join(','));
  
  // 清理末尾多余的 ::
  while (parts.length > 0 && !parts[parts.length - 1]) {
    parts.pop();
  }
  
  const paramStr = parts.join('::');
  return paramStr ? `【kb::${paramStr}】` : '【kb】';
});

const handleInsert = () => {
  emit('insert', generatedPlaceholder.value);
};
</script>

<style scoped>
.kb-placeholder-editor {
  padding: 4px;
}

.full-width {
  width: 100%;
}

.item-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  margin-top: 4px;
}

.unit {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.slider-container :deep(.el-slider) {
  flex: 1;
}

.slider-value {
  font-family: var(--el-font-family-mono);
  font-size: 13px;
  color: var(--el-color-primary);
  min-width: 32px;
}

.preview-section {
  margin-top: 24px;
  padding: 12px;
  background-color: var(--input-bg);
  border-radius: 6px;
  border: 1px dashed var(--border-color);
}

.preview-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.preview-code {
  display: block;
  font-family: var(--el-font-family-mono);
  font-size: 13px;
  color: var(--el-color-primary);
  word-break: break-all;
  user-select: all;
}

.actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>