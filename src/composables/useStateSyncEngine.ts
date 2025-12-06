/**
 * 状态同步引擎 Composable
 * 
 * 封装了与 WindowSyncBus 交互的状态同步逻辑，
 * 实现了自动的状态推送和接收，并支持增量更新。
 */
import { ref, onUnmounted, type Ref, isRef, watch, nextTick, getCurrentInstance } from 'vue';
import { useWindowSyncBus } from './useWindowSyncBus';
import { calculateDiff, applyPatches, shouldUseDelta, debounce, VersionGenerator, deepEqual } from '@/utils/sync-helpers';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';
import type { StateSyncConfig, StateSyncPayload, JsonPatchOperation, BaseMessage, StateKey } from '@/types/window-sync';

const logger = createModuleLogger('StateSyncEngine');
const errorHandler = createModuleErrorHandler('StateSyncEngine');

// ==========================================
// 全局同步源注册中心
// ==========================================

type SyncSource = {
  pushState: (isFullSync?: boolean, targetWindowLabel?: string, silent?: boolean) => Promise<void>;
  stateKey: string;
};

const syncRegistry = new Set<SyncSource>();
let isRegistryInitialized = false;

/**
 * 初始化全局注册中心监听器
 * 确保只在主窗口或工具窗口（数据源头）初始化一次
 */
function initRegistryListeners() {
  if (isRegistryInitialized) return;
  
  const bus = useWindowSyncBus();
  
  // 仅主窗口和工具窗口需要响应同步请求
  if (bus.windowType !== 'main' && bus.windowType !== 'detached-tool') {
    return;
  }

  // 1. 监听初始状态请求，批量推送所有注册源的全量状态
  bus.onInitialStateRequest((requesterLabel) => {
    logger.info(`[${bus.windowType}] 收到来自 ${requesterLabel} 的初始状态请求，开始批量推送...`);
    
    for (const source of syncRegistry) {
      // 强制推送全量状态给请求者（静默模式）
      source.pushState(true, requesterLabel, true).catch(err => {
        errorHandler.error(err, '批量推送状态失败', { context: { stateKey: source.stateKey }, showToUser: false });
      });
    }
    
    logger.info(`[${bus.windowType}] 已向 ${requesterLabel} 批量推送所有状态`);
  });

  // 2. 监听重连事件，广播所有注册源的全量状态
  bus.onReconnect(() => {
    logger.info(`[${bus.windowType}] 窗口重新获得焦点，开始广播所有状态...`);
    
    for (const source of syncRegistry) {
      // 广播全量状态（静默模式）
      source.pushState(true, undefined, true).catch(err => {
        errorHandler.error(err, '广播状态失败', { context: { stateKey: source.stateKey }, showToUser: false });
      });
    }
    
    logger.info(`[${bus.windowType}] 所有状态广播完成`);
  });

  isRegistryInitialized = true;
  logger.info('StateSyncEngine 全局注册中心已初始化');
}

/**
 * 注册外部同步源（用于非 useStateSyncEngine 创建的自定义同步逻辑）
 * 例如：ChatInputManager
 */
export function registerSyncSource(source: SyncSource) {
  // 确保监听器已初始化
  initRegistryListeners();
  
  syncRegistry.add(source);
  
  return () => {
    syncRegistry.delete(source);
  };
}

export function useStateSyncEngine<T, K extends StateKey = StateKey>(
  stateSource: Ref<T> | T,
  config: StateSyncConfig<K>
) {
  const {
    stateKey,
    autoPush = false,
    autoReceive = false,
    enableDelta = true,
    deltaThreshold = 0.5,
    debounce: debounceDelay = 100,
  } = config;

  const bus = useWindowSyncBus();
  const state = isRef(stateSource) ? stateSource : ref(stateSource);
  const stateVersion = ref(0);
  
  // 安全地深拷贝值，处理 undefined 情况
  const safeDeepClone = <V>(value: V): V => {
    if (value === undefined || value === null) {
      return value;
    }
    return JSON.parse(JSON.stringify(value));
  };
  
  let lastSyncedValue: T = safeDeepClone(state.value);
  let isInitialized = true;
  let isApplyingExternalState = false;
  let unlistenStateSync: (() => void) | null = null;
  let stopWatching: (() => void) | null = null;

    const pushState = async (isFullSync = false, targetWindowLabel?: string, silent = false) => {
      // 如果没有目标窗口，且没有下游消费者，则跳过同步
      if (!targetWindowLabel && !bus.hasDownstreamWindows.value) {
        // logger.debug('没有下游窗口，跳过同步', { stateKey });
        return;
      }
      
      if (!isInitialized) {
        logger.warn('无法推送状态，因为未初始化', { stateKey });
        return;
      }

      // 【关键修复】如果正在应用外部状态，则跳过推送，防止无限循环
      if (isApplyingExternalState) {
        logger.debug('正在应用外部状态，跳过推送', { stateKey });
        return;
      }
  
      const newValue = state.value;
      const newVersion = VersionGenerator.next();
  
      let payload: StateSyncPayload;
  
      const shouldForceFullSync = isFullSync || !enableDelta ||
        newValue === null || newValue === undefined ||
        lastSyncedValue === null || lastSyncedValue === undefined;
  
      if (shouldForceFullSync) {
        payload = { stateType: stateKey, version: newVersion, isFull: true, data: newValue };
        if (!silent) logger.debug('执行全量同步', { stateKey, version: newVersion, targetWindow: targetWindowLabel });
      } else {
        const patches = calculateDiff(lastSyncedValue, newValue);
        if (patches.length === 0) {
          if (!silent) logger.debug('状态无变化，跳过同步', { stateKey });
          return;
        }
  
        if (shouldUseDelta(patches, newValue, deltaThreshold)) {
          payload = { stateType: stateKey, version: newVersion, isFull: false, patches };
          if (!silent) logger.debug('执行增量同步', { stateKey, version: newVersion, patchesCount: patches.length, targetWindow: targetWindowLabel });
        } else {
          payload = { stateType: stateKey, version: newVersion, isFull: true, data: newValue };
          if (!silent) logger.debug('增量过大，执行全量同步', { stateKey, version: newVersion, targetWindow: targetWindowLabel });
        }
      }
    await bus.syncState(
      stateKey,
      payload.isFull ? payload.data : payload.patches,
      newVersion,
      payload.isFull,
      targetWindowLabel
    );
    stateVersion.value = newVersion;
    lastSyncedValue = safeDeepClone(newValue);
  };

  const debouncedPushState = debounce(pushState, debounceDelay);

  const receiveState = (payload: StateSyncPayload, _message: BaseMessage) => {
    if (payload.stateType !== stateKey) return;
    if (payload.version <= stateVersion.value) {
      logger.debug('收到旧版本状态，已忽略', {
        stateKey,
        currentVersion: stateVersion.value,
        receivedVersion: payload.version
      });
      return;
    }

    // 【性能优化】对于全量同步，先检查数据是否真的发生了变化
    // 避免因窗口焦点切换等原因导致的无意义状态更新
    if (payload.isFull) {
      const newData = payload.data;
      if (deepEqual(state.value, newData)) {
        // 数据没有变化，只更新版本号，不触发响应式更新
        stateVersion.value = payload.version;
        logger.debug('全量状态数据无变化，跳过更新', { stateKey, version: payload.version });
        return;
      }
    }

    isApplyingExternalState = true;
    try {
      if (payload.isFull) {
        state.value = payload.data;
        logger.debug('已应用全量状态', { stateKey, version: payload.version });
      } else {
        // 对于增量更新，也检查应用后的结果是否真的变化
        const patchedValue = applyPatches(state.value, payload.patches as JsonPatchOperation[]);
        if (deepEqual(state.value, patchedValue)) {
          stateVersion.value = payload.version;
          lastSyncedValue = safeDeepClone(state.value);
          logger.debug('增量状态应用后无变化，跳过更新', { stateKey, version: payload.version });
          // 注意：这里不需要重置 isApplyingExternalState，因为没有触发响应式更新
          isApplyingExternalState = false;
          return;
        }
        state.value = patchedValue;
        logger.debug('已应用增量状态', { stateKey, version: payload.version });
      }
      stateVersion.value = payload.version;
      lastSyncedValue = safeDeepClone(state.value);
    } catch (error) {
      errorHandler.error(error as Error, '应用状态更新失败', { context: { stateKey }, showToUser: false });
    } finally {
      // 【关键修复】使用 nextTick 延迟重置标志位
      // 确保在 Vue 的响应式系统完成更新、watch 回调执行之后再允许推送
      nextTick(() => {
        isApplyingExternalState = false;
      });
    }
  };

  // 自动推送：main 窗口和 detached-tool 窗口都需要
  // - main 和 detached-tool: 作为状态源头，监听 Store 变化并广播给所有下游（如 detached-component）
  // - detached-component: 不需要推送，只接收
  if (autoPush && (bus.windowType === 'main' || bus.windowType === 'detached-tool')) {
    stopWatching = watch(
      state,
      () => {
        if (isApplyingExternalState) return;
        debouncedPushState();
      },
      { deep: true }
    );
    logger.debug('已启动自动推送', { stateKey, windowType: bus.windowType });
  }

  if (autoReceive) {
    unlistenStateSync = bus.onMessage<StateSyncPayload>('state-sync', receiveState);
    logger.debug('已启动自动接收', { stateKey, windowType: bus.windowType });
  }

  const manualPush = (isFullSync = true, targetWindowLabel?: string, silent = false) => {
    debouncedPushState.cancel();
    return pushState(isFullSync, targetWindowLabel, silent);
  };

  // 注册到全局注册中心
  // 只有配置了 autoPush 的引擎才需要响应全局请求
  let unregister: (() => void) | null = null;
  if (autoPush && (bus.windowType === 'main' || bus.windowType === 'detached-tool')) {
    unregister = registerSyncSource({
      pushState: manualPush,
      stateKey
    });
  }

  let isCleaned = false;
  const cleanup = () => {
    if (isCleaned) return;
    isCleaned = true;
    
    stopWatching?.();
    unlistenStateSync?.();
    unregister?.();
    logger.info('StateSyncEngine 已清理', { stateKey });
  };

  // 仅在有活跃组件实例时自动注册清理
  if (getCurrentInstance()) {
    onUnmounted(cleanup);
  }

  return {
    state,
    stateVersion,
    manualPush,
    cleanup,
  };
}