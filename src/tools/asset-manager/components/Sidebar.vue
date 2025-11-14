<template>
  <div class="asset-sidebar">
    <!-- 统计信息 -->
    <div class="stats-section">
      <h3 class="section-title">资产统计</h3>
      <div class="stat-item">
        <span class="stat-label">总数量</span>
        <span class="stat-value">{{ totalAssets }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">总大小</span>
        <span class="stat-value">{{ formatSize(totalSize) }}</span>
      </div>
    </div>

    <el-divider />

    <!-- 按类型筛选 -->
    <div class="filter-section">
      <h3 class="section-title">文件类型</h3>
      <el-radio-group v-model="internalSelectedType" @change="handleTypeChange">
        <el-radio value="all" class="filter-radio">
          <div class="radio-content">
            <span>全部</span>
            <span class="count">{{ totalAssets }}</span>
          </div>
        </el-radio>
        <el-radio value="image" class="filter-radio">
          <div class="radio-content">
            <span class="radio-label"><Image :size="16" /> 图片</span>
            <span class="count">{{ typeCounts.image }}</span>
          </div>
        </el-radio>
        <el-radio value="video" class="filter-radio">
          <div class="radio-content">
            <span class="radio-label"><Video :size="16" /> 视频</span>
            <span class="count">{{ typeCounts.video }}</span>
          </div>
        </el-radio>
        <el-radio value="audio" class="filter-radio">
          <div class="radio-content">
            <span class="radio-label"><Music :size="16" /> 音频</span>
            <span class="count">{{ typeCounts.audio }}</span>
          </div>
        </el-radio>
        <el-radio value="document" class="filter-radio">
          <div class="radio-content">
            <span class="radio-label"><FileText :size="16" /> 文档</span>
            <span class="count">{{ typeCounts.document }}</span>
          </div>
        </el-radio>
        <el-radio value="other" class="filter-radio">
          <div class="radio-content">
            <span class="radio-label"><Paperclip :size="16" /> 其他</span>
            <span class="count">{{ typeCounts.other }}</span>
          </div>
        </el-radio>
      </el-radio-group>
    </div>

    <el-divider />

    <!-- 按来源模块筛选 -->
    <div class="filter-section">
      <h3 class="section-title">来源模块</h3>
      <el-radio-group v-model="internalSelectedSourceModule" @change="handleSourceModuleChange">
        <el-radio value="all" class="filter-radio">
          <div class="radio-content">
            <span>全部</span>
            <span class="count">{{ totalAssets }}</span>
          </div>
        </el-radio>
        <el-radio
          v-for="(count, module) in sourceModuleCounts"
          :key="module"
          :value="module"
          class="filter-radio"
        >
          <div class="radio-content">
            <span class="radio-label">
              <component :is="getModuleIcon(module)" :size="16" />
              {{ getModuleLabel(module) }}
            </span>
            <span class="count">{{ count }}</span>
          </div>
        </el-radio>
      </el-radio-group>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { AssetType, AssetStats } from '@/types/asset-management';
import { assetManagerEngine } from '@/composables/useAssetManager';
import { useToolsStore } from '@/stores/tools';
import {
  Image,
  Video,
  Music,
  FileText,
  Paperclip,
  HelpCircle
} from 'lucide-vue-next';

interface Props {
  selectedType: AssetType | 'all';
  selectedSourceModule?: string | 'all';
  totalAssets: number;
  totalSize: number;
  typeCounts: AssetStats['typeCounts'];
  sourceModuleCounts?: Record<string, number>;
}

const props = withDefaults(defineProps<Props>(), {
  selectedSourceModule: 'all',
  sourceModuleCounts: () => ({}),
});

const emit = defineEmits<{
  'update:selectedType': [value: AssetType | 'all'];
  'update:selectedSourceModule': [value: string | 'all'];
  'update:showDuplicatesOnly': [value: boolean];
}>();

// 内部状态
const internalSelectedType = ref(props.selectedType);
const internalSelectedSourceModule = ref(props.selectedSourceModule);

// 监听 props 变化
watch(() => props.selectedType, (newVal) => {
  internalSelectedType.value = newVal;
});

watch(() => props.selectedSourceModule, (newVal) => {
  internalSelectedSourceModule.value = newVal;
});

// 事件处理
const handleTypeChange = (value: string | number | boolean) => {
  emit('update:selectedType', value as AssetType | 'all');
};

const handleSourceModuleChange = (value: string | number | boolean) => {
  emit('update:selectedSourceModule', value as string | 'all');
};

// 从工具注册表动态获取工具配置
const toolsStore = useToolsStore();

// 创建模块ID到工具配置的映射
const moduleToolMap = computed(() => {
  const map = new Map<string, { name: string; icon: any }>();
  
  toolsStore.tools.forEach(tool => {
    // 将路径转换为模块ID（去掉开头的 '/'）
    const moduleId = tool.path.substring(1);
    map.set(moduleId, {
      name: tool.name,
      icon: tool.icon
    });
  });
  
  return map;
});

// 获取模块图标（从工具注册表动态获取）
const getModuleIcon = (module: string) => {
  const toolConfig = moduleToolMap.value.get(module);
  return toolConfig?.icon || HelpCircle;
};

// 获取模块标签（从工具注册表动态获取）
const getModuleLabel = (module: string): string => {
  const toolConfig = moduleToolMap.value.get(module);
  if (toolConfig) {
    return toolConfig.name;
  }
  
  // 对于特殊模块提供友好的回退名称
  if (module === 'unknown') return '未知来源';
  
  // 将 kebab-case 转换为友好的标题
  return module
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

// 格式化文件大小
const formatSize = (bytes: number) => {
  return assetManagerEngine.formatFileSize(bytes);
};
</script>

<style scoped>
.asset-sidebar {
  padding: 16px;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0 0 12px 0;
}

.stats-section {
  margin-bottom: 8px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  font-size: 13px;
}

.stat-label {
  color: var(--el-text-color-secondary);
}

.stat-value {
  color: var(--el-text-color-primary);
  font-weight: 500;
}

.filter-section {
  margin-bottom: 8px;
}

.filter-radio {
  width: 100%;
  margin: 0;
  padding: 8px 0;
  height: auto;
}

.filter-radio :deep(.el-radio__label) {
  width: 100%;
  padding-left: 8px;
  display: block;
}

.radio-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  font-size: 13px;
  gap: 8px;
}

.radio-content > span:first-child {
  flex: 1;
  min-width: 0;
}

.radio-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  flex-shrink: 0;
  text-align: right;
  min-width: 40px;
}

.el-divider {
  margin: 16px 0;
}
</style>