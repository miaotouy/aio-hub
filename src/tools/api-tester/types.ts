/**
 * API 测试工具的类型定义
 */

// 变量类型
export type VariableType = 'string' | 'enum' | 'boolean';

// 变量定义
export interface Variable {
  key: string;
  value: string | boolean;
  type: VariableType;
  label?: string; // 显示标签
  placeholder?: string; // 占位符
  options?: string[]; // enum 类型的选项
  required?: boolean; // 是否必填
  description?: string; // 变量说明
}

// HTTP 方法
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

// API 预设
export interface ApiPreset {
  id: string;
  name: string;
  description?: string;
  // URL 模板字符串 (如: "{{protocol}}://{{baseUrl}}/{{endpoint}}")
  urlTemplate: string;
  method: HttpMethod;
  // 默认请求头
  headers: Record<string, string>;
  // 请求体模板（支持 {{variable}} 占位符）
  bodyTemplate?: string;
  // 此预设包含的变量定义
  variables: Variable[];
}

// 请求配置文件（可保存和加载）
export interface RequestProfile {
  id: string;
  name: string;
  selectedPresetId: string;
  // 当前变量值
  variables: Record<string, string | boolean>;
  // 自定义请求头
  headers: Record<string, string>;
  // 请求体内容
  body: string;
  // 创建时间
  createdAt?: string;
  // 更新时间
  updatedAt?: string;
}

// API 响应
export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  duration: number; // 请求耗时（毫秒）
  timestamp: string;
  error?: string;
}