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
import type { StateSyncConfig, StateSyncPayload, JsonPatchOperation, BaseMessage } from '@/types/window-sync';

const logger = createModuleLogger('StateSyncEngine');

export function useStateSyncEngine<T>(
  stateSource: Ref<T> | T,
  config: StateSyncConfig
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
  
  let lastSyncedValue: T = JSON.parse(JSON.stringify(state.value));
  let isInitialized = true; // 标记是否已初始化
  let unlistenStateSync: (() => void) | null = null;
  let stopWatching: (() => void) | null = null;

  /**
   * 推送状态更新
   */
  const pushState = async (isFullSync = false) => {
    if (!isInitialized) {
      logger.warn('无法推送状态，因为未初始化', { stateKey });
      return;
    }

    const newValue = state.value;
    const newVersion = VersionGenerator.next();
    
    let payload: StateSyncPayload;

    // 如果是全量同步、禁用增量、或值为 null/undefined，直接使用全量同步
    const shouldForceFullSync = isFullSync || !enableDelta ||
                                newValue === null || newValue === undefined ||
                                lastSyncedValue === null || lastSyncedValue === undefined;

    if (shouldForceFullSync) {
      payload = {
        stateType: stateKey,
        version: newVersion,
        isFull: true,
        data: newValue,
      };
      logger.info('执行全量同步', { stateKey, version: newVersion });
    } else {
      const patches = calculateDiff(lastSyncedValue, newValue);
      if (patches.length === 0) {
        logger.debug('状态无变化，跳过同步', { stateKey });
        return;
      }
      
      if (shouldUseDelta(patches, newValue, deltaThreshold)) {
        payload = {
          stateType: stateKey,
          version: newVersion,
          isFull: false,
          patches,
        };
        logger.info('执行增量同步', { stateKey, version: newVersion, patchesCount: patches.length });
      } else {
        payload = {
          stateType: stateKey,
          version: newVersion,
          isFull: true,
          data: newValue,
        };
        logger.info('增量过大，执行全量同步', { stateKey, version: newVersion });
      }
    }

    await bus.syncState(stateKey, payload.isFull ? payload.data : payload.patches, newVersion);
    stateVersion.value = newVersion;
    lastSyncedValue = JSON.parse(JSON.stringify(newValue));
  };

  const debouncedPushState = debounce(pushState, debounceDelay);

  /**
   * 接收并应用状态更新
   */
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

    try {
      if (payload.isFull) {
        state.value = payload.data;
        logger.info('已应用全量状态', { stateKey, version: payload.version });
      } else {
        state.value = applyPatches(state.value, payload.patches as JsonPatchOperation[]);
        logger.info('已应用增量状态', { stateKey, version: payload.version });
      }
      stateVersion.value = payload.version;
      lastSyncedValue = JSON.parse(JSON.stringify(state.value));
    } catch (error) {
      logger.error('应用状态更新失败', error as Error, { stateKey });
      // 可以在这里触发一次全量同步请求
    }
  };

  // 根据配置初始化
  if (autoPush && bus.windowType === 'main') {
    stopWatching = watch(
      state,
      () => {
        debouncedPushState();
      },
      { deep: true }
    );
    logger.info('已启动自动推送', { stateKey });
  }

  if (autoReceive && bus.windowType !== 'main') {
    unlistenStateSync = bus.onMessage<StateSyncPayload>('state-sync', receiveState);
    logger.info('已启动自动接收', { stateKey });
  }

  /**
   * 清理资源
   */
  const cleanup = () => {
    stopWatching?.();
    unlistenStateSync?.();
    logger.info('StateSyncEngine 已清理', { stateKey });
  };

  onUnmounted(cleanup);

  return {
    state,
    stateVersion,
    manualPush: pushState,
    cleanup,
  };
}