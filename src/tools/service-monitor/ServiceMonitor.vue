<template>
  <div class="service-monitor">
    <el-container class="monitor-container">
      <!-- 左侧：服务列表 -->
      <el-aside width="300px" class="service-list-panel">
        <div class="panel-header">
          <h3>已注册服务</h3>
          <el-tag :type="services.length > 0 ? 'success' : 'info'" size="small">
            {{ services.length }} 个服务
          </el-tag>
        </div>
        
        <el-scrollbar class="service-list-scrollbar">
          <div class="service-list">
            <div
              v-for="service in services"
              :key="service.id"
              class="service-item"
              :class="{ active: selectedService?.id === service.id }"
              @click="selectService(service)"
            >
              <div class="service-item-header">
                <span class="service-id">{{ service.id }}</span>
              </div>
              <div v-if="service.name" class="service-name">
                {{ service.name }}
              </div>
              <div v-if="service.description" class="service-description">
                {{ service.description }}
              </div>
            </div>
            
            <el-empty
              v-if="services.length === 0"
              description="暂无已注册的服务"
              :image-size="80"
            />
          </div>
        </el-scrollbar>
      </el-aside>

      <!-- 右侧：服务详情 -->
      <el-main class="service-detail-panel">
        <ServiceDetailPanel :service="selectedService" />
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { serviceRegistry } from '@/services/registry';
import type { ToolService } from '@/services/types';
import ServiceDetailPanel from './components/ServiceDetailPanel.vue';

// 服务列表
const services = ref<ToolService[]>([]);

// 当前选中的服务
const selectedService = ref<ToolService | null>(null);

// 选择服务
const selectService = (service: ToolService) => {
  selectedService.value = service;
};

// 加载服务列表
const loadServices = () => {
  services.value = serviceRegistry.getAllServices();
  
  // 如果有服务，默认选中第一个
  if (services.value.length > 0 && !selectedService.value) {
    selectedService.value = services.value[0];
  }
};

onMounted(() => {
  loadServices();
});
</script>

<style scoped lang="css">
.service-monitor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--el-bg-color-page);
}

.monitor-container {
  flex: 1;
  height: 100%;
  overflow: hidden;
}

/* 左侧面板 */
.service-list-panel {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
  overflow: hidden;
}

.panel-header {
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.service-list-scrollbar {
  flex: 1;
  overflow: hidden;
}

.service-list {
  padding: 8px;
}

.service-item {
  padding: 12px;
  margin-bottom: 8px;
  border-radius: 6px;
  cursor: pointer;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-bg-color);
  backdrop-filter: blur(var(--ui-blur));
  transition: all 0.2s;
}

.service-item:hover {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 8%, transparent);
}

.service-item.active {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 15%, transparent);
  box-shadow: 0 2px 8px color-mix(in srgb, var(--el-color-primary) 30%, transparent);
}

.service-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.service-id {
  font-family: 'Consolas', 'Monaco', monospace;
  font-weight: 600;
  color: var(--el-color-primary);
  font-size: 14px;
}

.service-name {
  font-size: 13px;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
}

.service-description {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
  display: -webkit-box;
  line-clamp: 2;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* 右侧面板 */
.service-detail-panel {
  padding: 16px;
  background: var(--el-bg-color-page);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>