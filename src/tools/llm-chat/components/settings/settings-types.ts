import type { Component } from 'vue';
import type { ChatSettings } from '../../composables/useChatSettings';

/**
 * 定义单个设置项的 UI 组件类型
 */
export type SettingComponent =
  | 'ElSwitch'
  | 'ElSlider'
  | 'ElRadioGroup'
  | 'ElSelect'
  | 'ElInputNumber'
  | 'ElInput'
  | 'LlmModelSelector'
  | 'SliderWithInput';

/**
 * 定义单个设置项的配置结构
 */
export interface SettingItem {
  /**
   * 设置项的唯一标识符，用于 data-setting-id 和搜索定位
   */
  id: string;
  /**
   * 设置项的显示标签
   */
  label: string;
  /**
   * 布局类型
   * 'inline': 控件和提示在同一行 (例如 ElSwitch)
   * 'block': 控件和提示在不同行 (例如 ElSlider)
   * @default 'block'
   */
  layout?: 'inline' | 'block';
  /**
   * 用于渲染表单组件的类型
   */
  component: SettingComponent | Component;
  /**
   * 传递给组件的 props
   */
  props?: Record<string, any>;
  /**
   * 对于 ElRadioGroup, ElSelect 等组件，定义其选项
   */
  options?: {
    label: string;
    value: string | number | boolean;
    tags?: string[];
    description?: string;
  }[];
  /**
   * 设置项的描述性提示文字
   */
  hint: string;
  /**
   * 在 localSettings 对象中，该设置项值的路径
   * 例如: 'uiPreferences.showTimestamp'
   */
  modelPath: string;
  /**
   * 用于搜索的关键词，以空格分隔
   */
  keywords: string;
  /**
   * 控制该设置项是否显示的条件函数
   * @param settings - 当前的设置对象
   * @returns boolean - 是否显示
   */
  visible?: (settings: ChatSettings) => boolean;
  /**
   * 组件下方的额外内容插槽，例如重置按钮
   */
  slots?: {
    default?: () => Component;
    append?: () => Component;
  };
}

/**
 * 定义设置分组的配置结构
 */
export interface SettingsSection {
  /**
   * 分组标题
   */
  title: string;
  /**
   * 分组图标
   */
  icon: Component;
  /**
   * 该分组下的所有设置项
   */
  items: SettingItem[];
}