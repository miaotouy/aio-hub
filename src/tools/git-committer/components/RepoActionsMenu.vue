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
        <el-dropdown-item command="alias">
          <Pencil :size="13" />
          修改别名
        </el-dropdown-item>
        <el-dropdown-item command="open">
          <FolderOpen :size="13" />
          打开目录
        </el-dropdown-item>
        <el-dropdown-item command="remove" divided>
          <Trash2 :size="13" />
          移出列表
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<script setup lang="ts">
import { FolderOpen, MoreVertical, Pencil, Trash2 } from "lucide-vue-next";
import type { RepositoryConfig } from "../types";
import { useGitRepositoryManagement } from "../composables/useGitRepositoryManagement";

const props = defineProps<{ repo: RepositoryConfig }>();
const { editAlias, openDirectory, remove } = useGitRepositoryManagement();

const handleCommand = async (command: string) => {
  if (command === "alias") await editAlias(props.repo);
  if (command === "open") await openDirectory(props.repo);
  if (command === "remove") await remove(props.repo);
};
</script>

<style scoped>
.repo-menu-trigger {
  margin: 0;
}
</style>
