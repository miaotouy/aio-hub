import type { Component } from "vue";
import type { RouteRecordRaw } from "vue-router";

/**
 * 工具注册信息
 */
export interface ToolRegistry {
  /** 工具唯一标识 */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具图标 (Lucide 图标组件) */
  icon: any;
  /** 工具描述 */
  description: string;
  /** 工具主视图组件 (可选) */
  component?: Component;
  /** 是否在主页列表隐藏 */
  hidden?: boolean;
  /** 自定义路由配置 (可选) */
  route?: RouteRecordRaw;
}