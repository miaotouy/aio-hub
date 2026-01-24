<template>
  <BaseDialog
    v-model="visible"
    title="生成参数信息"
    width="600px"
    height="auto"
    max-height="80vh"
  >
    <div class="generation-info-container" v-if="data">
      <div class="info-section">
        <div class="section-title">提示词 (Prompt)</div>
        <div class="content-box prompt-box">{{ data.prompt }}</div>
      </div>

      <div class="info-section" v-if="data.negativePrompt">
        <div class="section-title">负面提示词 (Negative Prompt)</div>
        <div class="content-box prompt-box negative">{{ data.negativePrompt }}</div>
      </div>

      <div class="info-section" v-if="data.revisedPrompt && data.revisedPrompt !== data.prompt">
        <div class="section-title">优化后提示词 (Revised Prompt)</div>
        <div class="content-box prompt-box revised">{{ data.revisedPrompt }}</div>
      </div>

      <div class="info-grid">
        <div class="grid-item">
          <span class="label">模型:</span>
          <span class="value">{{ data.modelId }}</span>
        </div>
        <div class="grid-item" v-if="data.seed !== undefined">
          <span class="label">种子 (Seed):</span>
          <span class="value">{{ data.seed }}</span>
        </div>
      </div>

      <div class="info-section" v-if="hasParams">
        <div class="section-title">其他参数</div>
        <div class="params-list">
          <div v-for="(val, key) in filteredParams" :key="key" class="param-item">
            <span class="p-key">{{ key }}:</span>
            <span class="p-val">{{ val }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="visible = false">关闭</el-button>
        <el-button type="primary" @click="handleRemix" :icon="Sparkles">
          二次创作 (Remix)
        </el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Sparkles } from 'lucide-vue-next';
import BaseDialog from '@/components/common/BaseDialog.vue';
import { useMediaGenStore } from '../stores/mediaGenStore';
import { useRouter } from 'vue-router';
import { customMessage } from '@/utils/customMessage';

const props = defineProps<{
  asset: any;
  data: any;
}>();

const visible = defineModel<boolean>({ default: false });
const router = useRouter();
const mediaStore = useMediaGenStore();

const hasParams = computed(() => {
  return props.data?.params && Object.keys(props.data.params).length > 0;
});

const filteredParams = computed(() => {
  if (!props.data?.params) return {};
  // 过滤掉已经在上方显示的参数
  const { prompt, negativePrompt, seed, modelId, ...rest } = props.data.params;
  return rest;
});

const handleRemix = async () => {
  visible.value = false;
  
  // 跳转到生成中心
  await router.push('/media-generator');

  // 还原参数
  const type = (props.data.genType as any) || (props.asset.type === 'image' ? 'image' : 'video');
  mediaStore.currentConfig.activeType = type;
  
  const config = mediaStore.currentConfig.types[type as 'image' | 'video' | 'audio'];
  if (config) {
    config.params = {
      ...config.params,
      ...props.data.params,
      prompt: props.data.prompt,
      negativePrompt: props.data.negativePrompt,
      seed: props.data.seed
    };
    if (props.data.modelId) {
      config.modelCombo = props.data.modelId;
    }
  }
  
  customMessage.success('已复刻生成参数');
};
</script>

<style scoped>
.generation-info-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px;
}

.info-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  opacity: 0.8;
}

.content-box {
  padding: 12px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

.prompt-box {
  color: var(--el-text-color-primary);
}

.prompt-box.negative {
  color: var(--el-color-danger);
  opacity: 0.8;
}

.prompt-box.revised {
  color: var(--el-color-primary);
  border-style: dashed;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.grid-item {
  display: flex;
  gap: 8px;
  font-size: 14px;
}

.label {
  color: var(--el-text-color-secondary);
}

.value {
  color: var(--el-text-color-primary);
  font-family: var(--el-font-family-mono);
}

.params-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 8px;
  padding: 12px;
  background-color: var(--input-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.param-item {
  display: flex;
  gap: 4px;
  font-size: 12px;
}

.p-key {
  color: var(--el-text-color-secondary);
}

.p-val {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>