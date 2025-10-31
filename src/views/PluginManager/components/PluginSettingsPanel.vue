<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { ElMessage } from 'element-plus';
import { pluginConfigService } from '@/services/plugin-config.service';
import type { PluginProxy, SettingsSchema, SettingsProperty } from '@/services/plugin-types';
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('PluginManager/PluginSettingsPanel');

// Props
interface Props {
  plugin: PluginProxy | null;
}

const props = defineProps<Props>();

// 内部配置数据
const formData = ref<Record<string, any>>({});
const loading = ref(false);
const saving = ref(false);

// 计算属性：配置模式
const settingsSchema = computed<SettingsSchema | undefined>(() => {
  return props.plugin?.manifest.settingsSchema;
});

// 计算属性：配置项列表（转换为数组以便渲染）
const settingsItems = computed(() => {
  if (!settingsSchema.value) return [];
  
  return Object.entries(settingsSchema.value.properties).map(([key, property]) => ({
    key,
    ...property,
  }));
});

/**
 * 加载插件配置
 */
async function loadConfig() {
  if (!props.plugin) return;
  
  loading.value = true;
  try {
    const config = await pluginConfigService.getAll(props.plugin.id);
    if (config) {
      formData.value = { ...config };
    } else {
      // 如果没有配置，使用默认值
      const defaultConfig: Record<string, any> = {};
      if (settingsSchema.value) {
        for (const [key, property] of Object.entries(settingsSchema.value.properties)) {
          defaultConfig[key] = property.default;
        }
      }
      formData.value = defaultConfig;
    }
    logger.debug('配置加载完成', { pluginId: props.plugin.id, config: formData.value });
  } catch (error) {
    logger.error('加载配置失败', error, { pluginId: props.plugin.id });
    ElMessage.error('加载配置失败');
  } finally {
    loading.value = false;
  }
}

/**
 * 保存配置
 */
async function saveConfig() {
  if (!props.plugin) return;
  
  saving.value = true;
  try {
    // 逐个保存配置项
    for (const [key, value] of Object.entries(formData.value)) {
      await pluginConfigService.setValue(props.plugin.id, key, value);
    }
    
    ElMessage.success('配置已保存');
    logger.info('配置保存成功', { pluginId: props.plugin.id });
  } catch (error) {
    logger.error('保存配置失败', error, { pluginId: props.plugin.id });
    ElMessage.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
  } finally {
    saving.value = false;
  }
}

/**
 * 获取表单项的输入组件类型
 */
function getInputType(property: SettingsProperty): 'input' | 'number' | 'switch' | 'select' {
  if (property.enum && property.enum.length > 0) {
    return 'select';
  }
  
  switch (property.type) {
    case 'boolean':
      return 'switch';
    case 'number':
      return 'number';
    default:
      return 'input';
  }
}

// 监听 plugin 变化，加载配置
watch(() => props.plugin, (newPlugin) => {
  if (newPlugin) {
    loadConfig();
  }
}, { immediate: true });
</script>

<template>
  <div class="plugin-settings-panel">
    <div v-if="!plugin" class="empty-state">
      <el-empty description="请选择一个插件以查看其配置" :image-size="100" />
    </div>

    <div v-else-if="loading" class="loading-container">
      <el-icon class="is-loading" :size="32">
        <i-ep-loading />
      </el-icon>
      <p>加载配置中...</p>
    </div>

    <div v-else-if="!settingsSchema || settingsItems.length === 0" class="empty-state">
      <el-empty description="该插件没有可配置项" :image-size="100" />
    </div>

    <div v-else class="settings-content">
      <div class="settings-header">
        <h3 class="settings-title">{{ plugin.name }} - 设置</h3>
      </div>

      <el-form :model="formData" label-position="top" class="settings-form">
        <el-form-item
          v-for="item in settingsItems"
          :key="item.key"
          :label="item.label"
        >
          <template #label>
            <div class="form-label">
              <span>{{ item.label }}</span>
              <el-tooltip v-if="item.description" :content="item.description" placement="top">
                <el-icon class="info-icon"><i-ep-question-filled /></el-icon>
              </el-tooltip>
            </div>
          </template>

          <!-- 字符串输入 -->
          <el-input
            v-if="getInputType(item) === 'input'"
            v-model="formData[item.key]"
            :type="item.secret ? 'password' : 'text'"
            :placeholder="`请输入${item.label}`"
            :show-password="item.secret"
          />

          <!-- 数字输入 -->
          <el-input-number
            v-else-if="getInputType(item) === 'number'"
            v-model="formData[item.key]"
            :placeholder="`请输入${item.label}`"
            style="width: 100%;"
          />

          <!-- 布尔开关 -->
          <el-switch
            v-else-if="getInputType(item) === 'switch'"
            v-model="formData[item.key]"
          />

          <!-- 下拉选择 -->
          <el-select
            v-else-if="getInputType(item) === 'select'"
            v-model="formData[item.key]"
            :placeholder="`请选择${item.label}`"
            style="width: 100%;"
          >
            <el-option
              v-for="option in item.enum"
              :key="option"
              :label="option"
              :value="option"
            />
          </el-select>

          <!-- 描述信息 -->
          <div v-if="item.description" class="field-description">
            {{ item.description }}
          </div>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="saving" @click="saveConfig">
            保存配置
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.plugin-settings-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.empty-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.loading-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-color-secondary);
}

.settings-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-header {
  flex-shrink: 0;
  padding: 20px;
  border-bottom: 1px solid var(--border-color);
}

.settings-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0;
}

.settings-form {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
  font-size: 16px;
}

.field-description {
  margin-top: 6px;
  font-size: 13px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

/* 滚动条样式 */
.settings-form::-webkit-scrollbar {
  width: 6px;
}

.settings-form::-webkit-scrollbar-track {
  background: transparent;
}

.settings-form::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.settings-form::-webkit-scrollbar-thumb:hover {
  background: var(--text-color-secondary);
}
</style>