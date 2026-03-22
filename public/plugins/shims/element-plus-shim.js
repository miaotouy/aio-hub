/**
 * Element Plus ESM Shim for Plugins
 * 
 * 这个文件将主应用已经加载的 Element Plus 实例导出为 ESM 模块。
 */

if (!window.ElementPlus) {
  console.error('[AIO Hub] window.ElementPlus is not defined. Make sure Element Plus is loaded before plugins.');
}

const ElementPlus = window.ElementPlus;

// 导出常用组件和函数
export const {
  ElMessage,
  ElMessageBox,
  ElNotification,
  ElLoading,
  // ... 其他常用的导出可以按需添加
} = ElementPlus;

// 默认导出
export default ElementPlus;