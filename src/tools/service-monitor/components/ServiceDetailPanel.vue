<template>
  <div v-if="service" class="service-detail">
    <!-- 基本信息 -->
    <el-card class="detail-card">
      <template #header>
        <div class="card-header">
          <span>服务信息</span>
        </div>
      </template>
      
      <el-descriptions :column="1" border>
        <el-descriptions-item label="服务 ID">
          <el-tag type="primary" effect="light" round>{{ service.id }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item v-if="service.name" label="服务名称">
          {{ service.name }}
        </el-descriptions-item>
        <el-descriptions-item v-if="service.description" label="服务描述">
          {{ service.description }}
        </el-descriptions-item>
        <el-descriptions-item label="元数据支持">
          <el-tag
            :type="hasMetadata ? 'success' : 'info'"
            size="small"
            effect="light"
            round
          >
            {{ hasMetadata ? '已实现' : '未实现' }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <!-- 方法列表 -->
    <ServiceMethods v-if="hasMetadata && metadata" :methods="metadata.methods" />

    <!-- 未实现元数据提示 -->
    <el-card v-else-if="!hasMetadata" class="detail-card">
      <el-empty description="该服务尚未实现 getMetadata() 方法" :image-size="100">
        <template #image>
          <el-icon :size="100" color="#909399">
            <InfoFilled />
          </el-icon>
        </template>
      </el-empty>
    </el-card>
  </div>

  <!-- 未选择服务时的提示 -->
  <el-empty
    v-else
    description="请从左侧列表选择一个服务查看详情"
    :image-size="120"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { ToolService, ServiceMetadata } from '@/services/types';
import { InfoFilled } from '@element-plus/icons-vue';
import ServiceMethods from './ServiceMethods.vue';

const props = defineProps<{
  service: ToolService | null;
}>();

// 是否有元数据
const hasMetadata = computed(() => {
  return props.service?.getMetadata !== undefined;
});

// 服务元数据
const metadata = computed<ServiceMetadata | null>(() => {
  if (!props.service?.getMetadata) {
    return null;
  }
  return props.service.getMetadata();
});
</script>

<style scoped>
.service-detail {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.detail-card {
  margin-bottom: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 600;
}

/* 空状态调整 */
:deep(.el-empty) {
  padding: 20px;
}
</style>