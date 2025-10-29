<template>
  <el-card class="methods-card">
    <template #header>
      <div class="card-header">
        <span>可用方法</span>
        <el-tag size="small">{{ methods.length }} 个</el-tag>
      </div>
    </template>

    <div class="methods-list">
      <el-collapse v-model="activeMethodName" accordion>
        <el-collapse-item
          v-for="method in methods"
          :key="method.name"
          :name="method.name"
        >
          <template #title>
            <div class="method-title">
              <el-tag type="success" size="small">方法</el-tag>
              <span class="method-name">{{ method.name }}</span>
            </div>
          </template>

          <div class="method-detail">
            <div v-if="method.description" class="method-description">
              <el-text type="info">{{ method.description }}</el-text>
            </div>

            <!-- 参数列表 -->
            <div class="method-section">
              <h4>参数</h4>
              <MethodParametersTable :parameters="method.parameters" />
            </div>

            <!-- 返回值 -->
            <div class="method-section">
              <h4>返回值</h4>
              <el-tag type="primary">{{ method.returnType }}</el-tag>
            </div>
          </div>
        </el-collapse-item>
      </el-collapse>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { MethodMetadata } from '@/services/types';
import MethodParametersTable from './MethodParametersTable.vue';

defineProps<{
  methods: MethodMetadata[];
}>();

const activeMethodName = ref<string>('');
</script>

<style scoped>
.methods-card {
  margin-top: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

.methods-list {
  margin-top: 12px;
}

.method-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.method-name {
  font-family: 'Consolas', 'Monaco', monospace;
  font-weight: 600;
  font-size: 14px;
}

.method-detail {
  padding: 12px 0;
}

.method-description {
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  margin-bottom: 16px;
}

.method-section {
  margin-bottom: 16px;
}

.method-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}
</style>