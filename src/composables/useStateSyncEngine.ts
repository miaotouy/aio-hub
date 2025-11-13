/**
 * 状态同步引擎 Composable
 * 
 * 封装了与 WindowSyncBus 交互的状态同步逻辑，
 * 实现了自动的状态推送和接收，并支持增量更新。
 */
import { ref, onUnmounted, type Ref, isRef, watch } from 'vue';
import { useWindowSyncBus } from './useWindowSyncBus';
import { calculateDiff, applyPatches, shouldUseDelta, debounce, VersionGenerator } from '@/utils/sync-helpers';
import { createModuleLogger } from '@/utils/logger';
import type { StateSyncConfig, StateSyncPayload, JsonPatchOperation, BaseMessage, StateKey } from '@/types/window-sync';

const logger = createModuleLogger('StateSyncEngine');

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
    requestOnMount = false,
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
      if (!isInitialized) {
        logger.warn('无法推送状态，因为未初始化', { stateKey });
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
      logger.warn('收到旧版本状态，已忽略', { 
        stateKey, 
        currentVersion: stateVersion.value, 
        receivedVersion: payload.version 
      });
      return;
    }

    isApplyingExternalState = true;
    try {
      if (payload.isFull) {
        state.value = payload.data;
        logger.debug('已应用全量状态', { stateKey, version: payload.version });
      } else {
        state.value = applyPatches(state.value, payload.patches as JsonPatchOperation[]);
        logger.debug('已应用增量状态', { stateKey, version: payload.version });
      }
      stateVersion.value = payload.version;
      lastSyncedValue = safeDeepClone(state.value);
    } catch (error) {
      logger.error('应用状态更新失败', error as Error, { stateKey });
    } finally {
      isApplyingExternalState = false;
    }
  };

  // 自动推送：main 窗口和 detached-tool 窗口都需要
  // - main: 作为状态源头，监听 Store 变化并广播给所有下游
  // - detached-tool: 作为中继站，监听自己 Store 的变化（来自上游的更新）并广播给自己的子组件
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
    logger.info('已启动自动推送', { stateKey, windowType: bus.windowType });
  }

  if (autoReceive) {
    unlistenStateSync = bus.onMessage<StateSyncPayload>('state-sync', receiveState);
    logger.info('已启动自动接收', { stateKey, windowType: bus.windowType });
    
    if (requestOnMount && bus.windowType !== 'main') {
      bus.requestSpecificState(stateKey);
    }
  }

  const manualPush = (isFullSync = true, targetWindowLabel?: string, silent = false) => {
    debouncedPushState.cancel();
    return pushState(isFullSync, targetWindowLabel, silent);
  };

  const cleanup = () => {
    stopWatching?.();
    unlistenStateSync?.();
    logger.info('StateSyncEngine 已清理', { stateKey });
  };

  onUnmounted(cleanup);

  return {
    state,
    stateVersion,
    manualPush,
    cleanup,
  };
}