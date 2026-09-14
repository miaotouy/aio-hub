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

import { computed, type Ref } from "vue";
import {
  pullRepo,
  pushRepo,
  generateCommitMessage,
  abortCommitMessageGeneration,
  executeCommit,
} from "./useGitCommitterRunner";
import {
  repoWorkflowStates,
  getRepoWorkflowState,
  repoSessions,
  updateRepoCommitDraft,
} from "./useGitCommitterState";

export function useGitRepoWorkflow(repoPath: Ref<string>) {
  // 运行态按仓库读取，切换仓库后各仓库互不影响
  const isPulling = computed(
    () => !!repoWorkflowStates.value[repoPath.value]?.isPulling
  );
  const isPushing = computed(
    () => !!repoWorkflowStates.value[repoPath.value]?.isPushing
  );
  const isGenerating = computed(
    () => !!repoWorkflowStates.value[repoPath.value]?.isGenerating
  );
  const isCommitting = computed(
    () => !!repoWorkflowStates.value[repoPath.value]?.isCommitting
  );

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
    const path = repoPath.value;
    if (!path) return;
    const state = getRepoWorkflowState(path);
    if (state.isPulling) return;
    state.isPulling = true;
    try {
      await pullRepo(path);
    } finally {
      state.isPulling = false;
    }
  };

  // 推送
  const push = async () => {
    const path = repoPath.value;
    if (!path) return;
    const state = getRepoWorkflowState(path);
    if (state.isPushing) return;
    state.isPushing = true;
    try {
      await pushRepo(path);
    } finally {
      state.isPushing = false;
    }
  };

  // AI 生成提交信息
  const generateMsg = async () => {
    const path = repoPath.value;
    if (!path) return;
    const state = getRepoWorkflowState(path);
    if (state.isGenerating) return;
    state.isGenerating = true;
    // 整个生成过程始终写回发起生成的仓库，避免切换仓库后内容串台
    updateRepoCommitDraft(path, "");
    try {
      const generatedMessage = await generateCommitMessage(path, (chunk) => {
        const current = repoSessions.value[path]?.commitDraft || "";
        updateRepoCommitDraft(path, current + chunk);
      });
      if (generatedMessage !== null) {
        updateRepoCommitDraft(path, generatedMessage);
      }
    } finally {
      state.isGenerating = false;
    }
  };

  // 中止当前仓库的 AI 生成
  const abortGenerateMsg = () => {
    const path = repoPath.value;
    if (!path) return;
    abortCommitMessageGeneration(path);
  };

  // 提交
  const commit = async (pushAfter = false) => {
    const path = repoPath.value;
    if (!path) return false;
    const state = getRepoWorkflowState(path);
    if (state.isCommitting) return false;
    state.isCommitting = true;
    const message = draft.value;
    try {
      const ok = await executeCommit(path, message, pushAfter);
      if (ok) {
        updateRepoCommitDraft(path, "");
        return true;
      }
      return false;
    } finally {
      state.isCommitting = false;
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
    abortGenerateMsg,
    commit,
  };
}
