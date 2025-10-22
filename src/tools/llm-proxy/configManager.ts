import { createConfigManager } from '@utils/configManager';
import { createModuleLogger } from '@utils/logger';
import type { LlmProxySettings, ProxyConfig } from './types';

const logger = createModuleLogger('LlmProxy/ConfigManager');

// 默认配置创建函数
function createDefaultSettings(): LlmProxySettings {
  return {
    config: {
      port: 8999,
      target_url: 'https://api.openai.com'
    },
    searchQuery: '',
    filterStatus: '',
    maskApiKeys: true,
    version: '1.0.0'
  };
}

// 创建配置管理器
const configManager = createConfigManager<LlmProxySettings>({
  moduleName: 'llm-proxy',
  fileName: 'settings.json',
  version: '1.0.0',
  createDefault: createDefaultSettings
});

// 创建防抖保存函数
const debouncedSave = configManager.createDebouncedSave(500);

/**
 * 加载配置
 */
export async function loadSettings(): Promise<LlmProxySettings> {
  try {
    const settings = await configManager.load();
    logger.info('配置加载成功', {
      port: settings.config.port,
      targetUrl: settings.config.target_url
    });
    return settings;
  } catch (error) {
    logger.error('加载配置失败', error);
    // 返回默认配置
    return createDefaultSettings();
  }
}

/**
 * 保存配置
 */
export async function saveSettings(settings: LlmProxySettings): Promise<void> {
  try {
    debouncedSave(settings);
    logger.debug('配置保存请求已提交');
  } catch (error) {
    logger.error('保存配置失败', error);
    throw error;
  }
}

/**
 * 立即保存配置（不使用防抖）
 */
export async function saveSettingsImmediate(settings: LlmProxySettings): Promise<void> {
  try {
    await configManager.save(settings);
    logger.info('配置已立即保存');
  } catch (error) {
    logger.error('立即保存配置失败', error);
    throw error;
  }
}

/**
 * 重置配置为默认值
 */
export async function resetSettings(): Promise<LlmProxySettings> {
  try {
    const defaultSettings = createDefaultSettings();
    await saveSettingsImmediate(defaultSettings);
    logger.info('配置已重置为默认值');
    return defaultSettings;
  } catch (error) {
    logger.error('重置配置失败', error);
    throw error;
  }
}

/**
 * 获取默认代理配置
 */
export function getDefaultProxyConfig(): ProxyConfig {
  return {
    port: 8999,
    target_url: 'https://api.openai.com'
  };
}

/**
 * 验证代理配置
 */
export function validateProxyConfig(config: ProxyConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 验证端口
  if (!config.port || config.port < 1024 || config.port > 65535) {
    errors.push('端口必须在 1024-65535 范围内');
  }

  // 验证目标 URL
  try {
    const url = new URL(config.target_url);
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push('目标 URL 必须使用 HTTP 或 HTTPS 协议');
    }
  } catch {
    errors.push('目标 URL 格式无效');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 合并配置（用于更新部分配置）
 */
export function mergeSettings(base: LlmProxySettings, updates: Partial<LlmProxySettings>): LlmProxySettings {
  return {
    ...base,
    ...updates,
    config: {
      ...base.config,
      ...(updates.config || {})
    }
  };
}