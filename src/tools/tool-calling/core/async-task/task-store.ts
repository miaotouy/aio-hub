// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 异步任务存储
 *
 * 使用 ConfigManager 持久化任务状态
 * 采用内存优先 + 异步持久化的策略，避免高频 I/O
 */

import type { AsyncTaskMetadata } from "./types";
import { createConfigManager } from "@/utils/configManager";

interface TaskStoreData {
  version: string;
  tasks: Record<string, AsyncTaskMetadata>;
}

function createDefaultData(): TaskStoreData {
  return {
    version: "1.0.0",
    tasks: {},
  };
}

const configManager = createConfigManager<TaskStoreData>({
  moduleName: "tool-calling",
  fileName: "async-tasks.json",
  version: "1.0.0",
  createDefault: createDefaultData,
  debounceDelay: 300, // 进度更新频繁，使用较短的防抖延迟
});

export class TaskStore {
  /**
   * 加载所有任务数据
   */
  async load(): Promise<Record<string, AsyncTaskMetadata>> {
    const data = await configManager.load();
    return data.tasks;
  }

  /**
   * 防抖保存任务数据
   */
  saveDebounced(tasks: Record<string, AsyncTaskMetadata>): void {
    configManager.saveDebounced({
      version: "1.0.0",
      tasks,
    });
  }

  /**
   * 立即保存任务数据
   */
  async saveImmediately(
    tasks: Record<string, AsyncTaskMetadata>
  ): Promise<void> {
    await configManager.save({
      version: "1.0.0",
      tasks,
    });
  }
}
