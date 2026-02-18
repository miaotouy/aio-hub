<script setup lang="ts">
import { ref, onMounted, nextTick } from "vue";
import { Search, FileText, Zap } from "lucide-vue-next";
import { createToolDiscoveryService } from "./core/discovery";
import { VcpToolCallingProtocol } from "./core/protocols/vcp-protocol";

// 导入拆分后的组件
import DiscoveryPane from "./components/DiscoveryPane.vue";
import ExecutorPane from "./components/ExecutorPane.vue";
import ParserPane from "./components/ParserPane.vue";

// --- 服务初始化 ---
const discoveryService = createToolDiscoveryService();
const vcpProtocol = new VcpToolCallingProtocol();

const activeTab = ref("discovery");
const discoveredGroups = ref<any[]>([]);
const executorRef = ref<InstanceType<typeof ExecutorPane> | null>(null);

const refreshDiscovery = async () => {
  discoveredGroups.value = discoveryService.getDiscoveredMethods();
};

/**
 * 处理从 Discovery 加载到 Executor
 */
const handleLoadToExecutor = (group: any, method: any) => {
  activeTab.value = "executor";
  // 等待 DOM 更新后调用子组件方法
  nextTick(() => {
    executorRef.value?.loadMethod(group, method);
  });
};

onMounted(() => {
  refreshDiscovery();
});
</script>

<template>
  <div class="tool-calling-tester-container">
    <el-tabs v-model="activeTab" class="main-tabs">
      <!-- 1. 工具库浏览 -->
      <el-tab-pane name="discovery">
        <template #label>
          <div class="tab-label">
            <el-icon><Search /></el-icon>
            <span>工具库浏览</span>
          </div>
        </template>
        <DiscoveryPane 
          :groups="discoveredGroups" 
          @refresh="refreshDiscovery" 
          @load="handleLoadToExecutor" 
        />
      </el-tab-pane>

      <!-- 2. 执行沙盒 -->
      <el-tab-pane name="executor">
        <template #label>
          <div class="tab-label">
            <el-icon><Zap /></el-icon>
            <span>执行沙盒</span>
          </div>
        </template>
        <ExecutorPane ref="executorRef" />
      </el-tab-pane>

      <!-- 3. 解析验证 -->
      <el-tab-pane name="parser">
        <template #label>
          <div class="tab-label">
            <el-icon><FileText /></el-icon>
            <span>解析器验证</span>
          </div>
        </template>
        <ParserPane :protocol="vcpProtocol" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.tool-calling-tester-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--container-bg);
  border-radius: 8px;
  overflow: hidden;
  backdrop-filter: blur(var(--ui-blur));
}

.main-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.el-tabs__header) {
  margin: 0;
  padding: 0 16px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
}

:deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

:deep(.el-tab-pane) {
  height: 100%;
}

.tab-label {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

:deep(.el-tabs__nav-wrap::after) {
  display: none;
}

:deep(.el-tabs__active-bar) {
  height: 3px;
  border-radius: 3px;
}
</style>