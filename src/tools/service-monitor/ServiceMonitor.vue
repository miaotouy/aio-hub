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
        <div v-if="selectedService" class="service-detail">
          <!-- 基本信息 -->
          <el-card class="detail-card">
            <template #header>
              <div class="card-header">
                <span>服务信息</span>
              </div>
            </template>
            
            <el-descriptions :column="1" border>
              <el-descriptions-item label="服务 ID">
                <el-tag type="primary">{{ selectedService.id }}</el-tag>
              </el-descriptions-item>
              <el-descriptions-item v-if="selectedService.name" label="服务名称">
                {{ selectedService.name }}
              </el-descriptions-item>
              <el-descriptions-item v-if="selectedService.description" label="服务描述">
                {{ selectedService.description }}
              </el-descriptions-item>
              <el-descriptions-item label="元数据支持">
                <el-tag :type="hasMetadata ? 'success' : 'info'" size="small">
                  {{ hasMetadata ? '已实现' : '未实现' }}
                </el-tag>
              </el-descriptions-item>
            </el-descriptions>
          </el-card>

          <!-- 方法列表 -->
          <el-card v-if="hasMetadata && metadata" class="detail-card methods-card">
            <template #header>
              <div class="card-header">
                <span>可用方法</span>
                <el-tag size="small">{{ metadata.methods.length }} 个</el-tag>
              </div>
            </template>

            <div class="methods-list">
              <el-collapse v-model="activeMethodNames" accordion>
                <el-collapse-item
                  v-for="method in metadata.methods"
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
                      <el-table
                        v-if="method.parameters.length > 0"
                        :data="method.parameters"
                        size="small"
                        border
                      >
                        <el-table-column prop="name" label="参数名" width="150" />
                        <el-table-column prop="type" label="类型" width="200">
                          <template #default="{ row }">
                            <el-tag size="small" type="warning">{{ row.type }}</el-tag>
                          </template>
                        </el-table-column>
                        <el-table-column prop="description" label="描述" />
                        <el-table-column prop="defaultValue" label="默认值" width="120">
                          <template #default="{ row }">
                            <el-tag v-if="row.defaultValue !== undefined" size="small">
                              {{ row.defaultValue }}
                            </el-tag>
                            <span v-else class="no-default">-</span>
                          </template>
                        </el-table-column>
                      </el-table>
                      <el-empty v-else description="无参数" :image-size="60" />
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
      </el-main>
    </el-container>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { serviceRegistry } from '@/services/registry';
import type { ToolService, ServiceMetadata } from '@/services/types';
import { InfoFilled } from '@element-plus/icons-vue';

// 服务列表
const services = ref<ToolService[]>([]);

// 当前选中的服务
const selectedService = ref<ToolService | null>(null);

// 展开的方法名称
const activeMethodNames = ref<string>('');

// 是否有元数据
const hasMetadata = computed(() => {
  return selectedService.value?.getMetadata !== undefined;
});

// 服务元数据
const metadata = computed<ServiceMetadata | null>(() => {
  if (!selectedService.value?.getMetadata) {
    return null;
  }
  return selectedService.value.getMetadata();
});

// 选择服务
const selectService = (service: ToolService) => {
  selectedService.value = service;
  activeMethodNames.value = '';
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
  overflow-y: auto;
  background: var(--el-bg-color-page);
}

.service-detail {
  max-width: 1200px;
  margin: 0 auto;
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

/* 方法列表 */
.methods-card {
  margin-top: 16px;
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

.no-default {
  color: var(--el-text-color-placeholder);
}

/* 空状态调整 */
:deep(.el-empty) {
  padding: 20px;
}
</style>