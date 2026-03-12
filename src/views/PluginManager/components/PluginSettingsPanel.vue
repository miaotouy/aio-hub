<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { pluginConfigService } from '@/services/plugin-config.service';
import type { PluginProxy, SettingsSchema, SettingsProperty } from '@/services/plugin-types';
import type { SettingItem } from '@/types/settings-renderer';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import { customMessage } from '@/utils/customMessage';
import SettingListRenderer from '@/components/common/SettingListRenderer.vue';

const logger = createModuleLogger('PluginManager/PluginSettingsPanel');
const errorHandler = createModuleErrorHandler('PluginManager/PluginSettingsPanel');

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

// 计算属性：配置项列表（转换为 SettingItem 数组）
const settingsItems = computed<SettingItem[]>(() => {
  if (!settingsSchema.value) return [];
  
  return Object.entries(settingsSchema.value.properties).map(([key, property]) => {
    // 如果已经是完整的 SettingItem，直接使用
    if ('component' in property && 'modelPath' in property) {
      return property as SettingItem;
    }
    
    // 否则从旧格式的 SettingsProperty 转换
    const oldProp = property as SettingsProperty;
    
    // 自动推断组件类型
    let component: string;
    let layout: 'inline' | 'block' = 'block';
    
    if (oldProp.enum && oldProp.enum.length > 0) {
      component = 'ElSelect';
    } else if (oldProp.type === 'boolean') {
      component = 'ElSwitch';
      layout = 'inline';
    } else if (oldProp.type === 'number') {
      component = 'ElInputNumber';
    } else {
      component = 'ElInput';
    }
    
    // 构建 props
    const props: Record<string, any> = {};
    if (oldProp.secret) {
      props.type = 'password';
      props.showPassword = true;
    }
    if (component === 'ElInput') {
      props.placeholder = `请输入${oldProp.label}`;
    } else if (component === 'ElSelect') {
      props.placeholder = `请选择${oldProp.label}`;
    } else if (component === 'ElInputNumber') {
      props.placeholder = `请输入${oldProp.label}`;
      props.style = { width: '100%' };
    }
    
    // 构建 options
    const options = oldProp.enum?.map(value => ({
      label: String(value),
      value: value
    }));
    
    return {
      id: key,
      label: oldProp.label,
      component: component as any,
      modelPath: key,
      hint: oldProp.description || '',
      defaultValue: oldProp.default,
      layout,
      props,
      options,
      keywords: `${key} ${oldProp.label} ${oldProp.description || ''}`
    } as SettingItem;
  });
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
          // 兼容新旧格式
          if ('defaultValue' in property) {
            // SettingItem 格式
            defaultConfig[key] = property.defaultValue;
          } else if ('default' in property) {
            // SettingsProperty 格式
            defaultConfig[key] = (property as SettingsProperty).default;
          }
        }
      }
      formData.value = defaultConfig;
    }
    logger.debug('配置加载完成', { pluginId: props.plugin.id, config: formData.value });
  } catch (error) {
    errorHandler.error(error as Error, '加载配置失败', {
      context: { pluginId: props.plugin.id },
    });
  } finally {
    loading.value = false;
  }
}

/**
 * 处理设置更新
 */
function handleSettingsUpdate(newSettings: any) {
  formData.value = newSettings;
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
    
    customMessage.success('配置已保存');
    logger.info('配置保存成功', { pluginId: props.plugin.id });
  } catch (error) {
    errorHandler.error(error as Error, '保存配置失败', {
      context: { pluginId: props.plugin.id },
    });
  } finally {
    saving.value = false;
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

      <div class="settings-form-wrapper">
        <el-form :model="formData" label-position="top" class="settings-form">
          <SettingListRenderer
            :items="settingsItems"
            :settings="formData"
            @update:settings="handleSettingsUpdate"
          />

          <el-form-item class="form-actions">
            <el-button type="primary" :loading="saving" @click="saveConfig">
              保存配置
            </el-button>
          </el-form-item>
        </el-form>
      </div>
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

.settings-form-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.settings-form {
  max-width: 800px;
}

.form-actions {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid var(--border-color);
}

.form-actions :deep(.el-form-item__content) {
  margin-left: 0 !important;
}

/* 滚动条样式 */
.settings-form-wrapper::-webkit-scrollbar {
  width: 6px;
}

.settings-form-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.settings-form-wrapper::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}

.settings-form-wrapper::-webkit-scrollbar-thumb:hover {
  background: var(--text-color-secondary);
}
</style>