/**
 * Element Plus Icons ESM Shim for Plugins
 */

if (!window.ElementPlusIconsVue) {
  // 注意：主应用可能没有把图标挂载到全局，我们需要在 main.ts 中挂载它
  console.warn('[AIO Hub] window.ElementPlusIconsVue is not defined.');
}

const Icons = window.ElementPlusIconsVue || {};

export const {
  Search, Edit, Check, Message, Star, // ... 常用图标
} = Icons;

export default Icons;