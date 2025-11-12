<template>
  <InfoCard class="methods-card">
    <template #header>
      <div class="card-header">
        <span>可用方法</span>
        <el-tag size="small" effect="light" round>{{ methods.length }} 个</el-tag>
      </div>
    </template>

    <div class="methods-list">
      <el-collapse v-model="activeMethodName" accordion class="methods-collapse">
        <el-collapse-item
          v-for="method in methods"
          :key="method.name"
          :name="method.name"
        >
          <template #title>
            <div class="method-title">
              <el-tag type="success" size="small" effect="light" round>方法</el-tag>
              <span class="method-name">{{ method.name }}</span>
            </div>
          </template>

          <div class="method-detail">
            <div v-if="method.description" class="method-description">
              <el-text type="info">{{ method.description }}</el-text>
            </div>

            <!-- 参数列表 -->
            <div class="method-section">
              <h4 class="section-title">参数</h4>
              <MethodParametersTable :parameters="method.parameters" />
            </div>

            <!-- 返回值 -->
            <div class="method-section">
              <h4 class="section-title">返回值</h4>
              <el-tag type="primary" effect="light" round>{{ method.returnType }}</el-tag>
            </div>

            <!-- 使用示例 -->
            <div v-if="method.example" class="method-section">
              <h4 class="section-title">使用示例</h4>
              <div class="example-container">
                <RichCodeEditor
                  :model-value="method.example.trim()"
                  language="javascript"
                  :read-only="true"
                  :line-numbers="true"
                />
              </div>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </InfoCard>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { MethodMetadata } from '@/services/types';
import MethodParametersTable from './MethodParametersTable.vue';
import RichCodeEditor from '@/components/common/RichCodeEditor.vue';
import InfoCard from '@/components/common/InfoCard.vue';

defineProps<{
  methods: MethodMetadata[];
}>();

const activeMethodName = ref<string>('');
</script>

<style scoped>
.methods-card {
  margin-top: 16px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

:deep(.el-card__body) {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  box-sizing: border-box;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.methods-list {
  margin: 0; /* 移除外边距，让 collapse 撑满 */
  padding-right: 8px;
}

.methods-collapse {
  /* 移除 collapse 组件的边框 */
  --el-collapse-border-color: transparent;
}

:deep(.el-collapse-item__header) {
  border-bottom-color: var(--el-border-color-lighter);
  padding: 0 12px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

:deep(.el-collapse-item__header:hover) {
  background-color: var(--el-fill-color-light);
}

:deep(.el-collapse-item__header.is-active) {
  /* 将主题色与背景色混合，生成一个柔和的激活色，适应不同主题 */
  background-color: color-mix(
    in srgb,
    var(--el-color-primary) 15%,
    var(--el-bg-color)
  );
  box-sizing: border-box;
}

:deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

:deep(.el-collapse-item__content) {
  padding: 0;
}

.method-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  box-sizing: border-box;
}

.method-name {
  font-family: 'Consolas', 'Monaco', monospace;
  font-weight: 600;
  font-size: 14px;
}

.method-detail {
  padding: 16px 16px 8px 16px;
}

.method-description {
  padding: 8px 12px;
  background-color: var(--el-bg-color-page);
  border-radius: 4px;
  margin-bottom: 20px;
}

.method-section {
  margin-bottom: 20px;
}

.section-title {
  margin: 0 0 10px 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-regular);
}

.example-container {
  min-height: 150px;
  max-height: 400px;
  border-radius: 4px;
  overflow: hidden;
}
</style>