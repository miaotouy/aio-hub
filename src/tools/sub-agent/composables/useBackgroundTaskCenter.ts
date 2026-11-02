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
 * 后台任务中心 UI 状态（进程内单例）
 *
 * 对应设计文档 §6.3：标题栏活动胶囊与聊天区入口需要打开同一个任务中心，
 * 这里只承载“任务中心是否可见”的轻量 UI 状态，避免两处各自维护开关、
 * 导致同时挂载两个 BackgroundTaskCenter 实例。
 *
 * 任务中心组件本身只在 TitleBar 中挂载一次，其它入口通过 openTaskCenter()
 * 触发打开；不涉及任何任务数据或服务层语义。
 */
import { ref } from "vue";


/** 任务中心是否可见（模块级单例状态） */
export type TaskCenterTab = "tasks" | "subagents";

/** 任务中心是否可见（模块级单例状态） */
const isTaskCenterOpen = ref(false);
/** 当前激活的选项卡 */
const activeTab = ref<TaskCenterTab>("tasks");
/** 外部入口指定的任务中心列表焦点；由唯一挂载的任务中心消费。 */
const focusedTaskId = ref<string | null>(null);

export interface UseBackgroundTaskCenterReturn {
  /** 任务中心可见性（供 v-model 绑定唯一挂载点） */
  isTaskCenterOpen: typeof isTaskCenterOpen;
  /** 当前激活的选项卡 */
  activeTab: typeof activeTab;
  /** 当前请求在任务列表中定位的任务 ID */
  focusedTaskId: typeof focusedTaskId;
  /** 切换到指定选项卡 */
  setActiveTab: (tab: TaskCenterTab) => void;
  /** 打开任务中心（默认切到任务列表） */
  openTaskCenter: () => void;
  /** 打开任务中心并定位任务列表项 */
  focusTaskInCenter: (taskId: string) => void;
  /** 清除已消费的列表定位请求 */
  clearFocusedTask: () => void;
  /** 关闭任务中心 */
  closeTaskCenter: () => void;
  /** 切换任务中心可见性 */
  toggleTaskCenter: () => void;
  /** 直接打开子智能体管理面板（同一工作台切换 tab） */
  openSubagentPanel: () => void;
  /** 关闭子智能体面板（等价于关闭任务中心） */
  closeSubagentPanel: () => void;
}

/**
 * 获取任务中心 UI 状态与打开入口。
 *
 * 所有调用方共享同一份 `isTaskCenterOpen`，因此聊天区入口按钮与
 * 标题栏活动胶囊始终指向同一个任务中心实例。
 */
export function useBackgroundTaskCenter(): UseBackgroundTaskCenterReturn {
  function setActiveTab(tab: TaskCenterTab): void {
    activeTab.value = tab;
  }

  function openTaskCenter(): void {
    activeTab.value = "tasks";
    isTaskCenterOpen.value = true;
  }

  function focusTaskInCenter(taskId: string): void {
    activeTab.value = "tasks";
    focusedTaskId.value = taskId;
    isTaskCenterOpen.value = true;
  }

  function clearFocusedTask(): void {
    focusedTaskId.value = null;
  }

  function closeTaskCenter(): void {
    isTaskCenterOpen.value = false;
  }

  function toggleTaskCenter(): void {
    isTaskCenterOpen.value = !isTaskCenterOpen.value;
  }

  function openSubagentPanel(): void {
    activeTab.value = "subagents";
    isTaskCenterOpen.value = true;
  }

  function closeSubagentPanel(): void {
    isTaskCenterOpen.value = false;
  }

  return {
    isTaskCenterOpen,
    activeTab,
    focusedTaskId,
    setActiveTab,
    openTaskCenter,
    focusTaskInCenter,
    clearFocusedTask,
    closeTaskCenter,
    toggleTaskCenter,
    openSubagentPanel,
    closeSubagentPanel,
  };
}
