/**
 * Vue ESM Shim for Plugins
 * 
 * 这个文件将主应用已经加载的 Vue 实例导出为 ESM 模块，
 * 供插件在运行时通过 import { ... } from 'vue' 访问。
 */

if (!window.Vue) {
  console.error('[AIO Hub] window.Vue is not defined. Make sure Vue is loaded before plugins.');
}

const Vue = window.Vue;

// 导出 Vue 的所有核心 API
export const {
  // 核心
  createApp,
  createSSRApp,
  h,
  defineComponent,
  defineAsyncComponent,
  resolveComponent,
  resolveDirective,
  withDirectives,
  withModifiers,

  // 响应式核心
  ref,
  reactive,
  computed,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,

  // 生命周期钩子
  onMounted,
  onUpdated,
  onUnmounted,
  onBeforeMount,
  onBeforeUpdate,
  onBeforeUnmounted,
  onErrorCaptured,
  onRenderTracked,
  onRenderTriggered,
  onActivated,
  onDeactivated,
  onServerPrefetch,

  // 依赖注入
  provide,
  inject,

  // 响应式工具
  toRef,
  toRefs,
  toRaw,
  isRef,
  isReactive,
  isProxy,
  isReadonly,
  unref,
  proxyRefs,

  // 进阶响应式
  shallowRef,
  shallowReactive,
  shallowReadonly,
  triggerRef,
  customRef,
  markRaw,

  // 其他
  nextTick,
  version,
  EffectScope,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  getCurrentInstance
} = Vue;

// 默认导出
export default Vue;