<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <el-dropdown trigger="click" @command="handleCommand">
    <el-button circle size="small" class="repo-menu-trigger" @click.stop>
      <MoreVertical :size="14" />
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="repo:alias">
          <Pencil :size="13" />
          修改别名
        </el-dropdown-item>
        <el-dropdown-item command="repo:color">
          <Palette :size="13" />
          修改颜色
        </el-dropdown-item>
        <el-dropdown-item command="repo:prompt">
          <MessageSquareText :size="13" />
          设置 AI 提示词
        </el-dropdown-item>
        <el-dropdown-item command="repo:open-dir">
          <FolderOpen :size="13" />
          打开目录
        </el-dropdown-item>
        <el-dropdown-item command="repo:remove" divided>
          <Trash2 :size="13" />
          移出列表
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import {
  FolderOpen,
  MessageSquareText,
  MoreVertical,
  Palette,
  Pencil,
  Trash2,
} from "lucide-vue-next";

/**
 * 仓库操作下拉菜单（管理模式 MoreVertical 按钮）。
 * 只负责发出命令，动作与对话框由 RepoBar 统一处理，
 * 与仓库右键菜单共用同一套命令 id 与处理函数。
 */
const emit = defineEmits<{
  (e: "action", command: string): void;
}>();

const handleCommand = (command: string) => {
  emit("action", command);
};
</script>

<style scoped>
.repo-menu-trigger {
  margin: 0;
}
</style>
