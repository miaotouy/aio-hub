/**
 * Token 计算 Composable 适配器
 * 
 * 负责将核心计算引擎与 Vue 响应式系统（如果需要）或其它 UI 服务连接。
 * 注意：本文件导出的 tokenCalculatorEngine 实例来自核心引擎。
 */

export { tokenCalculatorEngine } from '../core/tokenCalculatorEngine';
export type { TokenCalculationResult } from '../core/tokenCalculatorEngine';