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

import { ref, computed, type Ref } from "vue";
import {
  pullRepo,
  pushRepo,
  generateCommitMessage,
  executeCommit,
} from "./useGitCommitterRunner";
import { repoSessions, updateRepoCommitDraft } from "./useGitCommitterState";

export function useGitRepoWorkflow(repoPath: Ref<string>) {
  const isPulling = ref(false);
  const isPushing = ref(false);
  const isGenerating = ref(false);
  const isCommitting = ref(false);

  // 绑定指定仓库的提交草稿
  const draft = computed({
    get: () => {
      const path = repoPath.value;
      if (!path) return "";
      return repoSessions.value[path]?.commitDraft || "";
    },
    set: (val) => {
      updateRepoCommitDraft(repoPath.value, val);
    },
  });

  // 拉取
  const pull = async () => {
    if (!repoPath.value || isPulling.value) return;
    isPulling.value = true;
    try {
      await pullRepo(repoPath.value);
    } finally {
      isPulling.value = false;
    }
  };

  // 推送
  const push = async () => {
    if (!repoPath.value || isPushing.value) return;
    isPushing.value = true;
    try {
      await pushRepo(repoPath.value);
    } finally {
      isPushing.value = false;
    }
  };

  // AI 生成提交信息
  const generateMsg = async () => {
    if (!repoPath.value || isGenerating.value) return;
    isGenerating.value = true;
    draft.value = ""; // 清空旧草稿
    try {
      await generateCommitMessage(repoPath.value, (chunk) => {
        draft.value += chunk;
      });
    } finally {
      isGenerating.value = false;
    }
  };

  // 提交
  const commit = async (pushAfter = false) => {
    if (!repoPath.value || isCommitting.value) return false;
    isCommitting.value = true;
    try {
      const ok = await executeCommit(repoPath.value, draft.value, pushAfter);
      if (ok) {
        draft.value = "";
        return true;
      }
      return false;
    } finally {
      isCommitting.value = false;
    }
  };

  return {
    isPulling,
    isPushing,
    isGenerating,
    isCommitting,
    draft,
    pull,
    push,
    generateMsg,
    commit,
  };
}
