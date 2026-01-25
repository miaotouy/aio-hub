/**
 * 插件设置注册中心
 * 允许插件将设置项注入到聊天设置对话框中
 */

import { ref, readonly } from "vue";
import type { SettingsSection, SettingItem } from "../../components/settings/settings-types";

// 模块级存储，确保全局单例
const pluginSettingsSections = ref<SettingsSection[]>([]);

/**
 * 注册一个插件设置分组
 * @param section 设置分组配置
 */
export function registerSettingsSection(section: SettingsSection) {
  // 检查是否已存在相同标题的分组（避免重复）
  const existingIndex = pluginSettingsSections.value.findIndex(
    (s) => s.title === section.title
  );
  if (existingIndex >= 0) {
    // 合并 items（可选策略：替换或追加）
    // 这里选择替换，因为插件可能更新其配置
    pluginSettingsSections.value[existingIndex] = section;
  } else {
    pluginSettingsSections.value.push(section);
  }
}

/**
 * 向现有分组追加设置项
 * @param sectionTitle 目标分组的标题
 * @param item 要追加的设置项
 */
export function registerSettingItem(sectionTitle: string, item: SettingItem) {
  const section = pluginSettingsSections.value.find(
    (s) => s.title === sectionTitle
  );
  if (section) {
    // 检查是否已存在相同 id 的项
    const existingIndex = section.items.findIndex((i) => i.id === item.id);
    if (existingIndex >= 0) {
      section.items[existingIndex] = item;
    } else {
      section.items.push(item);
    }
  } else {
    // 如果分组不存在，创建一个新的分组（使用默认图标）
    console.warn(
      `插件设置分组 "${sectionTitle}" 不存在，将自动创建。建议插件先注册分组。`
    );
    registerSettingsSection({
      title: sectionTitle,
      icon: () => null, // 占位图标，实际使用时插件应提供
      items: [item],
    });
  }
}

/**
 * 获取所有插件注册的设置分组（只读）
 */
export function getPluginSettingsSections() {
  return readonly(pluginSettingsSections);
}

/**
 * 供 Vue composable 使用，返回响应式 sections 和注册方法
 */
export function usePluginSettings() {
  return {
    pluginSettingsSections: getPluginSettingsSections(),
    registerSettingsSection,
    registerSettingItem,
  };
}