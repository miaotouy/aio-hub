import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    loadTasks: vi.fn(),
    saveTasks: vi.fn(),
    saveTasksDebounced: vi.fn(),
  },
}));

vi.mock("../composables/useMediaStorage", () => ({
  useMediaStorage: () => mockStorage,
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import {
  MEDIA_TASK_AUTO_CLEAN_DELAY_MS,
  getMediaTaskRuntimeSettings,
  useMediaTaskManager,
} from "../composables/useMediaTaskManager";
import type { MediaTask } from "../types";

const makeTask = (id: string, status: MediaTask["status"]): MediaTask => ({
  id,
  type: "image",
  status,
  input: {
    prompt: "test",
    modelId: "model",
    profileId: "profile",
    params: {},
  },
  progress: 0,
  createdAt: Date.now(),
});

describe("media task runtime controls", () => {
  const manager = useMediaTaskManager();

  beforeEach(() => {
    vi.useFakeTimers();
    mockStorage.loadTasks.mockResolvedValue([
      makeTask("interrupted-processing", "processing"),
      makeTask("interrupted-pending", "pending"),
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
    manager.configureRuntimeSettings({ autoCleanCompleted: false });
  });

  it("启动时把无法跨进程恢复的 pending/processing 任务落为 error", async () => {
    await manager.init();

    expect(manager.getTask("interrupted-processing")).toMatchObject({
      status: "error",
      error: "应用重启，生成中断",
    });
    expect(manager.getTask("interrupted-pending")).toMatchObject({
      status: "error",
      error: "应用重启，排队任务未恢复",
    });
    expect(mockStorage.saveTasks).toHaveBeenCalled();
  });

  it("自动清理按设置启用，并在固定生命周期后移除 completed 任务", async () => {
    await manager.init();
    manager.configureRuntimeSettings({
      maxConcurrentTasks: 1,
      autoCleanCompleted: true,
    });

    const task = makeTask("completed-for-cleanup", "pending");
    manager.addTask(task);
    manager.updateTaskStatus(task.id, "completed");

    expect(manager.getTask(task.id)).toBeDefined();
    vi.advanceTimersByTime(MEDIA_TASK_AUTO_CLEAN_DELAY_MS - 1);
    expect(manager.getTask(task.id)).toBeDefined();

    vi.advanceTimersByTime(1);
    expect(manager.getTask(task.id)).toBeUndefined();
    expect(getMediaTaskRuntimeSettings()).toMatchObject({
      maxConcurrentTasks: 1,
      autoCleanCompleted: true,
    });
  });
});
