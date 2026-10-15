import { createPinia, disposePinia, setActivePinia } from "pinia";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VcpConfig } from "../types/protocol";
type StoredConnectionConfig = Partial<VcpConfig> & { autoConnect?: boolean };

const { loadConfig, startDistributedNode, distributedStore, onSyncMessage } =
  vi.hoisted(() => ({
    loadConfig: vi.fn<() => Promise<StoredConnectionConfig>>(),
    startDistributedNode: vi.fn(),
    onSyncMessage: vi.fn<
      (type: string, handler: (payload: unknown) => void) => () => void
    >(() => vi.fn()),
    distributedStore: { initPromise: Promise.resolve() },
  }));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));
vi.mock("@/utils/configManager", () => ({
  createConfigManager: (options: {
    fileName: string;
    createDefault: () => object;
    mergeConfig?: (defaults: object, loaded: object) => object;
  }) => ({
    load: async () => {
      const defaults = options.createDefault();
      const loaded =
        options.fileName === "config.json" ? await loadConfig() : {};
      return options.mergeConfig
        ? options.mergeConfig(defaults, loaded)
        : { ...defaults, ...loaded };
    },
    save: vi.fn(),
    saveDebounced: vi.fn(),
  }),
}));
vi.mock("@/composables/useDetachedManager", async () => {
  const { ref } = await import("vue");
  return {
    useDetachedManager: () => ({ detachedComponents: ref([]) }),
  };
});
vi.mock("@/composables/useWindowSyncBus", () => ({
  useWindowSyncBus: () => ({
    windowType: "main",
    onMessage: onSyncMessage,
    onInitialStateRequest: vi.fn(() => vi.fn()),
    syncState: vi.fn(),
  }),
}));
vi.mock("@/composables/useNotification", () => ({
  useNotification: vi.fn(),
}));
vi.mock("@/utils/customMessage", () => ({ customMessage: {} }));
vi.mock("@/tools/llm-chat/stores/toolCallingStore", () => ({
  useToolCallingStore: vi.fn(),
}));
vi.mock("../services/vcpNodeProtocol", () => ({ VcpNodeProtocol: vi.fn() }));
vi.mock("../services/VcpBridgeFactory", () => ({ vcpBridgeFactory: {} }));
vi.mock("../services/vcpEmoticonService", () => ({
  loadFromDisk: vi.fn(),
  refresh: vi.fn(),
  clearLibrary: vi.fn(),
}));
vi.mock("../stores/vcpDistributedStore", () => ({
  useVcpDistributedStore: () => distributedStore,
}));
vi.mock("../composables/useVcpDistributedNode", () => ({
  useVcpDistributedNode: () => ({ startDistributedNode }),
}));

import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { appSettingsManager } from "@/utils/appSettings";
import { useVcpStore } from "../stores/vcpConnectorStore";
import { VcpConnectorRegistry } from "../vcp-connector.registry";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const connectionConfig = {
  wsUrl: "ws://vcp.example",
  vcpKey: "test-key",
  mode: "observer" as const,
};

// 验证是否发起连接，避免测试向真实 VCP 服务发送请求。
const WebSocketMock = vi.fn(
  class {
    static OPEN = 1;
    close = vi.fn();
  }
);

describe("VCP 启动连接", () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    pinia = createPinia();
    setActivePinia(pinia);
    useAppSettingsStore().settings.startupTasks = {};
    vi.stubGlobal("WebSocket", WebSocketMock);
    distributedStore.initPromise = Promise.resolve();
    loadConfig.mockResolvedValue({ ...connectionConfig, autoConnect: true });
  });

  afterEach(async () => {
    useVcpStore().disconnect();
    await useAppSettingsStore().saveNow();
    disposePinia(pinia);
    vi.unstubAllGlobals();
    vi.useRealTimers();
    window.history.replaceState({}, "", "/");
  });

  it("全局未开启时，旧连接配置开启也保持断开", async () => {
    const store = useVcpStore();
    await store.initPromise;

    expect(store.autoConnect).toBe(false);
    expect(store.connection.status).toBe("disconnected");
    expect(WebSocketMock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "启动项等待配置加载后读取全局开关 %s，忽略相反的旧配置",
    async (autoConnect) => {
      const configReady = deferred<StoredConnectionConfig>();
      const distributedReady = deferred<void>();
      loadConfig.mockReturnValue(configReady.promise);
      distributedStore.initPromise = distributedReady.promise;

      const store = useVcpStore();
      store.autoConnect = true;
      const connect = vi.spyOn(store, "connect");
      const startup = new VcpConnectorRegistry().onStartup();
      expect(WebSocketMock).not.toHaveBeenCalled();

      configReady.resolve({ ...connectionConfig, autoConnect: !autoConnect });
      await store.initPromise;
      expect(WebSocketMock).not.toHaveBeenCalled();
      expect(startDistributedNode).not.toHaveBeenCalled();

      // 配置加载期间全局设置可能发生变化，连接前应读取最新值。
      useAppSettingsStore().update({
        startupTasks: {
          "vcp-connector": { enabled: autoConnect, consecutiveFailures: 0 },
        },
      });
      distributedReady.resolve();
      await startup;

      expect(connect).toHaveBeenCalledTimes(autoConnect ? 1 : 0);
      expect(WebSocketMock).toHaveBeenCalledTimes(autoConnect ? 2 : 0);
      expect(startDistributedNode).toHaveBeenCalledTimes(autoConnect ? 1 : 0);
      if (autoConnect) {
        expect(WebSocketMock).toHaveBeenCalledWith(
          "ws://vcp.example/vcpinfo/VCP_Key=test-key"
        );
      }
    }
  );

  it("全局自动连接关闭时仍可手动建立连接", async () => {
    loadConfig.mockResolvedValue({ ...connectionConfig, autoConnect: false });
    const store = useVcpStore();
    await store.initPromise;

    store.connect();

    expect(WebSocketMock).toHaveBeenCalledTimes(2);
    expect(store.connection.status).toBe("connecting");
  });

  it("页面开关联动全局配置并持久化，保留其他启动项", async () => {
    const settingsStore = useAppSettingsStore();
    const otherTask = { enabled: true, consecutiveFailures: 2 };
    settingsStore.update({ startupTasks: { other: otherTask } });
    const store = useVcpStore();
    await store.initPromise;

    store.autoConnect = true;
    expect(settingsStore.settings.startupTasks?.["vcp-connector"].enabled).toBe(
      true
    );
    store.autoConnect = false;
    expect(settingsStore.settings.startupTasks?.["vcp-connector"].enabled).toBe(
      false
    );
    expect(settingsStore.settings.startupTasks?.other).toEqual(otherTask);
    await settingsStore.saveNow();
    expect(appSettingsManager.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        startupTasks: expect.objectContaining({
          "vcp-connector": expect.objectContaining({ enabled: false }),
          other: otherTask,
        }),
      })
    );
    expect(WebSocketMock).not.toHaveBeenCalled();
  });

  it("全局设置变化实时反映到页面开关，页面重新启用可恢复自动禁用的启动项", async () => {
    const settingsStore = useAppSettingsStore();
    const store = useVcpStore();
    await store.initPromise;

    for (const enabled of [true, false]) {
      settingsStore.update({
        startupTasks: {
          "vcp-connector": { enabled, consecutiveFailures: 0 },
        },
      });
      expect(store.autoConnect).toBe(enabled);
    }
    settingsStore.update({
      startupTasks: {
        "vcp-connector": {
          enabled: false,
          consecutiveFailures: 3,
          autoDisabled: true,
        },
      },
    });
    store.autoConnect = true;
    expect(
      settingsStore.settings.startupTasks?.["vcp-connector"]
    ).toMatchObject({
      enabled: true,
      consecutiveFailures: 0,
      autoDisabled: false,
    });
  });

  it("关闭全局开关后，已排队的异常断线重连跳过执行", async () => {
    const store = useVcpStore();
    await store.initPromise;
    store.autoConnect = true;
    store.connect();
    const observer = WebSocketMock.mock.results[0].value as {
      onclose: (event: { wasClean: boolean }) => void;
    };
    observer.onclose({ wasClean: false });
    expect(store.connection.reconnectAttempts).toBe(1);

    useAppSettingsStore().update({
      startupTasks: {
        "vcp-connector": { enabled: false, consecutiveFailures: 0 },
      },
    });
    await vi.advanceTimersByTimeAsync(2500);

    expect(WebSocketMock).toHaveBeenCalledTimes(2);
    expect(store.connection.status).toBe("disconnected");
  });

  it("分离监控窗口同步主窗口的自动连接开关", async () => {
    window.history.replaceState(
      {},
      "",
      "/detached-component/vcp-connector:monitor"
    );
    const store = useVcpStore();
    await store.initPromise;
    const onSync = onSyncMessage.mock.calls[0][1];
    for (const enabled of [true, false]) {
      onSync({
        stateType: "vcp-connector",
        data: { status: "disconnected", autoConnect: enabled },
      });
      expect(store.autoConnect).toBe(enabled);
    }
    expect(appSettingsManager.save).not.toHaveBeenCalled();
    expect(WebSocketMock).not.toHaveBeenCalled();
  });
});
