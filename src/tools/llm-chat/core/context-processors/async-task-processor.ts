// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { useAsyncTaskStore } from "@/tools/tool-calling/stores/asyncTaskStore";
import { createModuleLogger } from "@/utils/logger";
import { getActivePinia } from "pinia";
import { createAsyncTaskProcessor } from "../pipeline/processors/async-task-processor";

const logger = createModuleLogger("llm-chat/async-task-processor");
export const asyncTaskProcessor = createAsyncTaskProcessor({
  logger,
  getTasks: () => {
    if (!getActivePinia()) {
      logger.debug("未检测到活跃的 Pinia 实例，跳过异步任务状态注入");
      return undefined;
    }
    const store = useAsyncTaskStore();
    if (!store.isInitialized) {
      logger.debug("异步任务 Store 未初始化，跳过处理");
      return undefined;
    }
    return store;
  },
});
