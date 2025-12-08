import type { Component, Ref } from 'vue';

/**
 * 分离逻辑钩子 (Logic Hook) 的接口定义
 *
 * @template T - 组件的 props 类型
 * @returns {{
 *   props: Ref<T>; // 响应式的 props 对象，将通过 v-bind 传递给组件
 *   listeners: Record<string, Function>; // 事件监听器对象，将通过 v-on 传递给组件
 * }}
 */
export type DetachedLogicHook<T = any> = () => {
  props: Ref<T>;
  listeners: Record<string, Function>;
};

/**
 * 可分离组件的注册信息接口
 */
export interface DetachableComponentRegistration {
  /**
   * 动态加载组件的函数
   */
  component: () => Promise<Component>;
  /**
   * 在分离窗口中使用的逻辑钩子
   */
  logicHook: DetachedLogicHook;
  /**
   * 可选的环境初始化钩子
   * 在组件被加载到分离容器时执行，用于设置特定的环境（如启动状态消费者）
   */
  initializeEnvironment?: () => void;
}