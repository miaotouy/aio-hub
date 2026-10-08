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
  <div class="repo-overview-view">
    <!-- 顶部状态提示 / 加载态 -->
    <div v-if="isLoadingOverview && !overview" class="overview-loading">
      <el-icon class="is-loading" :size="32"><Loading /></el-icon>
      <span>正在加载仓库概览信息...</span>
    </div>

    <template v-else-if="overview">
      <!-- 概览 Header 顶栏卡片 -->
      <div class="overview-header-card">
        <div class="header-main">
          <div class="repo-title">
            <FolderGit2 :size="24" class="repo-icon" />
            <span class="repo-name">{{ repoName }}</span>
            <span class="repo-path text-secondary" :title="overview.path">
              {{ overview.path }}
            </span>
          </div>
          <div class="header-actions">
            <el-button
              type="primary"
              plain
              size="small"
              :loading="isLoadingOverview"
              @click="refreshOverview"
            >
              <template #icon><RefreshCw :size="14" /></template>
              刷新概览
            </el-button>
            <el-button size="small" @click="handleOpenTerminal">
              <template #icon><Terminal :size="14" /></template>
              在终端打开
            </el-button>
          </div>
        </div>

        <div class="header-stats-grid">
          <div class="stat-card">
            <div class="stat-icon-wrapper branch-bg">
              <GitBranch :size="18" />
            </div>
            <div class="stat-info">
              <span class="stat-label text-secondary">当前分支</span>
              <span class="stat-value text-ellipsis" :title="overview.branch || 'HEAD 分离'">
                {{ overview.branch || "HEAD (分离)" }}
              </span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon-wrapper commit-bg">
              <GitCommitHorizontal :size="18" />
            </div>
            <div class="stat-info">
              <span class="stat-label text-secondary">历史提交总数</span>
              <span class="stat-value">{{ overview.totalCommits }}</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon-wrapper tag-bg">
              <Tag :size="18" />
            </div>
            <div class="stat-info">
              <span class="stat-label text-secondary">标签 (Tags)</span>
              <span class="stat-value">{{ overview.tags.length }}</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon-wrapper stash-bg">
              <Archive :size="18" />
            </div>
            <div class="stat-info">
              <span class="stat-label text-secondary">储藏 (Stashes)</span>
              <span class="stat-value">{{ overview.stashes.length }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 下方两列栅格内容区 -->
      <div class="overview-body-grid">
        <!-- 左侧列：分支管理 & 标签 & 储藏 -->
        <div class="grid-column">
          <!-- 分支卡片 -->
          <div class="panel-card">
            <div class="card-header">
              <div class="card-title">
                <GitBranch :size="16" />
                <span>分支列表 ({{ filteredBranches.length }}/{{ overview.branches.length }})</span>
              </div>
              <div class="card-header-actions">
                <el-radio-group v-model="branchFilterType" size="small">
                  <el-radio-button value="all">全部</el-radio-button>
                  <el-radio-button value="local">本地</el-radio-button>
                  <el-radio-button value="remote">远程</el-radio-button>
                </el-radio-group>
                <el-input
                  v-model="branchSearchKeyword"
                  size="small"
                  placeholder="搜索分支..."
                  clearable
                  class="filter-input"
                  :prefix-icon="Search"
                />
                <el-button type="primary" size="small" @click="showCreateBranchDialog = true">
                  + 新增分支
                </el-button>
              </div>
            </div>

            <div v-if="filteredBranches.length === 0" class="empty-card-text">
              无匹配的分支
            </div>
            <div v-else class="branch-list">
              <div
                v-for="b in filteredBranches"
                :key="b.name"
                class="branch-item"
                :class="{ 'is-current': b.isCurrent }"
              >
                <div class="branch-item-left">
                  <span
                    class="branch-badge"
                    :class="b.isRemote ? 'remote' : 'local'"
                  >
                    {{ b.isRemote ? "远程" : "本地" }}
                  </span>
                  <span class="branch-name" :title="b.name">{{ b.name }}</span>
                  <span v-if="b.isCurrent" class="current-tag">HEAD</span>
                  <span v-if="b.upstream" class="upstream-info text-secondary" :title="`追踪: ${b.upstream}`">
                    <ArrowUpRight :size="12" /> {{ b.upstream }}
                  </span>
                </div>

                <div v-if="!b.isRemote" class="branch-item-actions">
                  <el-button
                    v-if="!b.isCurrent"
                    size="small"
                    link
                    type="primary"
                    @click="handleCheckout(b.name)"
                  >
                    切换
                  </el-button>
                  <el-button
                    v-if="!b.isCurrent"
                    size="small"
                    link
                    type="warning"
                    @click="promptMerge(b.name)"
                  >
                    合并入当前
                  </el-button>
                  <el-button
                    v-if="!b.isCurrent"
                    size="small"
                    link
                    type="danger"
                    @click="promptDeleteBranch(b.name)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </div>
          </div>

          <!-- 储藏 Stash 卡片 -->
          <div class="panel-card">
            <div class="card-header">
              <div class="card-title">
                <Archive :size="16" />
                <span>储藏库 ({{ overview.stashes.length }})</span>
              </div>
              <div class="card-header-actions">
                <el-button
                  type="primary"
                  link
                  size="small"
                  @click="showSaveStashDialog = true"
                >
                  + 存入储藏
                </el-button>
              </div>
            </div>

            <div v-if="overview.stashes.length === 0" class="empty-card-text">
              当前没有储藏记录
            </div>
            <div v-else class="stash-list">
              <div
                v-for="s in overview.stashes"
                :key="s.index"
                class="stash-item"
              >
                <div class="stash-info">
                  <span class="stash-index">stash@{ {{ s.index }} }</span>
                  <span class="stash-msg" :title="s.message">{{ s.message }}</span>
                  <span class="stash-branch text-secondary">({{ s.hash.substring(0, 7) }})</span>
                </div>
                <div class="stash-actions">
                  <el-button
                    size="small"
                    link
                    type="primary"
                    @click="handlePopStash(s.index)"
                  >
                    Pop (弹出)
                  </el-button>
                  <el-button
                    size="small"
                    link
                    @click="handleApplyStash(s.index)"
                  >
                    Apply (应用)
                  </el-button>
                  <el-button
                    size="small"
                    link
                    type="danger"
                    @click="handleDropStash(s.index)"
                  >
                    删除
                  </el-button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧列：标签 & 远端配置 & 提交者贡献榜 -->
        <div class="grid-column">
          <!-- 标签 Tags 卡片 -->
          <div class="panel-card">
            <div class="card-header">
              <div class="card-title">
                <Tag :size="16" />
                <span>标签 ({{ filteredTags.length }}/{{ overview.tags.length }})</span>
              </div>
              <div class="card-header-actions">
                <el-input
                  v-model="tagSearchKeyword"
                  size="small"
                  placeholder="搜索标签..."
                  clearable
                  class="filter-input-small"
                  :prefix-icon="Search"
                />
                <el-button
                  type="primary"
                  size="small"
                  @click="showCreateTagDialog = true"
                >
                  + 新增标签
                </el-button>
              </div>
            </div>

            <div v-if="overview.tags.length === 0" class="empty-card-text">
              暂无 Git 标签
            </div>
            <div v-else-if="filteredTags.length === 0" class="empty-card-text">
              无匹配的标签
            </div>
            <div v-else class="tag-list">
              <div v-for="t in filteredTags" :key="t.name" class="tag-item">
                <div class="tag-info">
                  <span class="tag-name">{{ t.name }}</span>
                  <span class="tag-hash text-secondary">{{ t.hash.substring(0, 7) }}</span>
                  <span v-if="t.message" class="tag-msg text-secondary" :title="t.message">
                    - {{ t.message }}
                  </span>
                </div>
                <el-button
                  size="small"
                  link
                  type="danger"
                  @click="promptDeleteTag(t.name)"
                >
                  删除
                </el-button>
              </div>
            </div>
          </div>

          <!-- 远端 Remote 卡片 -->
          <div class="panel-card">
            <div class="card-header">
              <div class="card-title">
                <Globe :size="16" />
                <span>远程仓库配置 ({{ overview.remotes.length }})</span>
              </div>
            </div>

            <div v-if="overview.remotes.length === 0" class="empty-card-text">
              未配置 Remote 远程源
            </div>
            <div v-else class="remote-list">
              <div v-for="r in overview.remotes" :key="r.name" class="remote-item">
                <div class="remote-header-line">
                  <span class="remote-name-badge">{{ r.name }}</span>
                  <div class="remote-url-actions">
                    <el-button
                      v-if="r.fetchUrl"
                      circle
                      size="small"
                      link
                      title="复制 Fetch URL"
                      @click="copyText(r.fetchUrl, 'Fetch URL')"
                    >
                      <Copy :size="12" />
                    </el-button>
                  </div>
                </div>
                <div class="remote-urls">
                  <div class="url-line">
                    <span class="label text-secondary">Fetch:</span>
                    <span class="url text-ellipsis" :title="r.fetchUrl ?? ''">{{ r.fetchUrl || '-' }}</span>
                  </div>
                  <div class="url-line">
                    <span class="label text-secondary">Push:</span>
                    <span class="url text-ellipsis" :title="r.pushUrl ?? ''">{{ r.pushUrl || '-' }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Git 个人配置 & 贡献榜 -->
          <div class="panel-card">
            <div class="card-header">
              <div class="card-title">
                <UserCheck :size="16" />
                <span>Git 提交身份与贡献统计</span>
              </div>
            </div>

            <div class="author-identity-box">
              <div class="identity-row">
                <span class="label text-secondary">本地 User:</span>
                <span class="val">
                  {{ overview.localUserName || "(使用全局)" }} &lt;{{ overview.localUserEmail || "使用全局" }}&gt;
                </span>
              </div>
              <div class="identity-row">
                <span class="label text-secondary">全局 User:</span>
                <span class="val">
                  {{ overview.globalUserName || "未配置" }} &lt;{{ overview.globalUserEmail || "未配置" }}&gt;
                </span>
              </div>
            </div>

            <div class="top-authors-section">
              <div class="sub-title text-secondary">提交贡献 Top 榜单</div>
              <div class="author-list">
                <div
                  v-for="(stat, idx) in overview.topAuthors"
                  :key="stat.email"
                  class="author-item"
                >
                  <div class="author-rank" :class="`rank-${idx + 1}`">
                    {{ idx + 1 }}
                  </div>
                  <div class="author-details">
                    <span class="author-name">{{ stat.name }}</span>
                    <span class="author-email text-secondary">&lt;{{ stat.email }}&gt;</span>
                  </div>
                  <div class="author-count font-mono">
                    {{ stat.commitCount }} 次
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 各类对话框 ===== -->
      <!-- 新增分支对话框 -->
      <el-dialog
        v-model="showCreateBranchDialog"
        title="新建分支"
        width="400px"
        :lock-scroll="false"
      >
        <el-form label-position="top">
          <el-form-item label="分支名称" required>
            <el-input
              v-model="newBranchName"
              placeholder="如 feature/login 或 dev"
              @keyup.enter="handleCreateBranch"
            />
          </el-form-item>
          <el-form-item label="起始起点 (可选，默认 HEAD)">
            <el-input
              v-model="newBranchStartPoint"
              placeholder="提交 Hash 或其他分支名"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showCreateBranchDialog = false">取消</el-button>
          <el-button type="primary" :loading="isSubmitting" @click="handleCreateBranch">
            创建分支
          </el-button>
        </template>
      </el-dialog>

      <!-- 新建标签对话框 -->
      <el-dialog
        v-model="showCreateTagDialog"
        title="新建 Git 标签"
        width="400px"
        :lock-scroll="false"
      >
        <el-form label-position="top">
          <el-form-item label="标签名称 (Tag)" required>
            <el-input
              v-model="newTagName"
              placeholder="如 v1.0.0"
              @keyup.enter="handleCreateTag"
            />
          </el-form-item>
          <el-form-item label="附注消息 (可选)">
            <el-input
              v-model="newTagMessage"
              placeholder="发布版本 1.0.0"
            />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showCreateTagDialog = false">取消</el-button>
          <el-button type="primary" :loading="isSubmitting" @click="handleCreateTag">
            创建标签
          </el-button>
        </template>
      </el-dialog>

      <!-- 存入 Stash 对话框 -->
      <el-dialog
        v-model="showSaveStashDialog"
        title="保存工作区修改到 Stash"
        width="420px"
        :lock-scroll="false"
      >
        <el-form label-position="top">
          <el-form-item label="Stash 说明备注 (可选)">
            <el-input
              v-model="stashMessage"
              placeholder="如：临时保存重构未完成部分"
            />
          </el-form-item>
          <el-form-item>
            <el-checkbox v-model="stashIncludeUntracked">
              包含未追踪的新增文件 (-u / --include-untracked)
            </el-checkbox>
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="showSaveStashDialog = false">取消</el-button>
          <el-button type="primary" :loading="isSubmitting" @click="handleSaveStash">
            存入 Stash
          </el-button>
        </template>
      </el-dialog>

    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, computed } from "vue";
import {
  FolderGit2,
  GitBranch,
  GitCommitHorizontal,
  Tag,
  Archive,
  Terminal,
  RefreshCw,
  ArrowUpRight,
  Globe,
  UserCheck,
  Search,
  Copy,
} from "lucide-vue-next";
import { Loading } from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { currentRepoPath } from "../composables/useGitCommitterState";
import {
  repoOverview,
  isLoadingOverview,
  loadRepoOverview,
  checkoutBranch,
  createBranch,
  deleteBranch,
  mergeBranch,
  createTag,
  deleteTag,
  saveStash,
  popStash,
  applyStash,
  dropStash,
  openTerminal,
} from "../composables/useGitOverview";

const overview = repoOverview;

const repoName = computed(() => {
  const p = overview.value?.path;
  if (!p) return "";
  return p.split(/[/\\]/).filter(Boolean).pop() || p;
});

const branchFilterType = ref<"all" | "local" | "remote">("all");
const branchSearchKeyword = ref("");
const tagSearchKeyword = ref("");

const filteredBranches = computed(() => {
  const branches = overview.value?.branches || [];
  const kw = branchSearchKeyword.value.trim().toLowerCase();
  return branches.filter((b) => {
    if (branchFilterType.value === "local" && b.isRemote) return false;
    if (branchFilterType.value === "remote" && !b.isRemote) return false;
    if (kw && !b.name.toLowerCase().includes(kw)) return false;
    return true;
  });
});

const filteredTags = computed(() => {
  const tags = overview.value?.tags || [];
  const kw = tagSearchKeyword.value.trim().toLowerCase();
  if (!kw) return tags;
  return tags.filter(
    (t) =>
      t.name.toLowerCase().includes(kw) ||
      (t.message && t.message.toLowerCase().includes(kw))
  );
});

const showCreateBranchDialog = ref(false);
const newBranchName = ref("");
const newBranchStartPoint = ref("");

const showCreateTagDialog = ref(false);
const newTagName = ref("");
const newTagMessage = ref("");

const showSaveStashDialog = ref(false);
const stashMessage = ref("");
const stashIncludeUntracked = ref(true);

const isSubmitting = ref(false);

const copyText = async (text: string, label = "内容") => {
  try {
    await navigator.clipboard.writeText(text);
    customMessage.success(`已复制 ${label}`);
  } catch {
    customMessage.error("复制失败");
  }
};

onMounted(() => {
  if (currentRepoPath.value && currentRepoPath.value !== "__panorama__") {
    loadRepoOverview(currentRepoPath.value);
  }
});

watch(
  () => currentRepoPath.value,
  (newPath) => {
    if (newPath && newPath !== "__panorama__") {
      loadRepoOverview(newPath);
    }
  }
);

const refreshOverview = () => {
  if (currentRepoPath.value) {
    loadRepoOverview(currentRepoPath.value);
  }
};

const handleOpenTerminal = () => {
  if (currentRepoPath.value) {
    openTerminal(currentRepoPath.value);
  }
};

const handleCheckout = (branchName: string) => {
  if (currentRepoPath.value) {
    checkoutBranch(currentRepoPath.value, branchName);
  }
};

const promptDeleteBranch = (branchName: string) => {
  ElMessageBox.confirm(
    `确定要删除分支 "${branchName}" 吗？此操作不可逆。`,
    "删除分支确认",
    {
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
      type: "warning",
      lockScroll: false,
    }
  )
    .then(async () => {
      if (currentRepoPath.value) {
        await deleteBranch(currentRepoPath.value, branchName, true);
      }
    })
    .catch(() => {});
};

const promptMerge = (branchName: string) => {
  ElMessageBox.confirm(
    `确定要将分支 "${branchName}" 合并到当前分支 (${overview.value?.branch}) 吗？`,
    "合并分支确认",
    {
      confirmButtonText: "合并",
      cancelButtonText: "取消",
      type: "info",
      lockScroll: false,
    }
  )
    .then(async () => {
      if (currentRepoPath.value) {
        await mergeBranch(currentRepoPath.value, branchName);
      }
    })
    .catch(() => {});
};

const handleCreateBranch = async () => {
  if (!newBranchName.value.trim()) {
    customMessage.warning("请输入有效的分支名称");
    return;
  }
  isSubmitting.value = true;
  try {
    const ok = await createBranch(
      currentRepoPath.value,
      newBranchName.value.trim(),
      newBranchStartPoint.value.trim()
    );
    if (ok) {
      showCreateBranchDialog.value = false;
      newBranchName.value = "";
      newBranchStartPoint.value = "";
    }
  } finally {
    isSubmitting.value = false;
  }
};

const handleCreateTag = async () => {
  if (!newTagName.value.trim()) {
    customMessage.warning("请输入有效的标签名称");
    return;
  }
  isSubmitting.value = true;
  try {
    const ok = await createTag(
      currentRepoPath.value,
      newTagName.value.trim(),
      undefined,
      newTagMessage.value.trim()
    );
    if (ok) {
      showCreateTagDialog.value = false;
      newTagName.value = "";
      newTagMessage.value = "";
    }
  } finally {
    isSubmitting.value = false;
  }
};

const promptDeleteTag = (tagName: string) => {
  ElMessageBox.confirm(`确定要删除标签 "${tagName}" 吗？`, "删除标签", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
    lockScroll: false,
  })
    .then(async () => {
      if (currentRepoPath.value) {
        await deleteTag(currentRepoPath.value, tagName);
      }
    })
    .catch(() => {});
};

const handleSaveStash = async () => {
  isSubmitting.value = true;
  try {
    const ok = await saveStash(
      currentRepoPath.value,
      stashMessage.value.trim(),
      stashIncludeUntracked.value
    );
    if (ok) {
      showSaveStashDialog.value = false;
      stashMessage.value = "";
    }
  } finally {
    isSubmitting.value = false;
  }
};

const handlePopStash = (index: number) => {
  if (currentRepoPath.value) {
    popStash(currentRepoPath.value, index);
  }
};

const handleApplyStash = (index: number) => {
  if (currentRepoPath.value) {
    applyStash(currentRepoPath.value, index);
  }
};

const handleDropStash = (index: number) => {
  ElMessageBox.confirm(`确定要删除 stash@{${index}} 储藏吗？`, "删除储藏", {
    confirmButtonText: "删除",
    cancelButtonText: "取消",
    type: "warning",
    lockScroll: false,
  })
    .then(async () => {
      if (currentRepoPath.value) {
        await dropStash(currentRepoPath.value, index);
      }
    })
    .catch(() => {});
};
</script>

<style scoped>
.repo-overview-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  gap: 16px;
  overflow-y: auto;
  box-sizing: border-box;
  background-color: var(--container-bg);
  color: var(--el-text-color-primary);
}

.overview-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--el-text-color-secondary);
}

/* Header Card */
.overview-header-card {
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header-main {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.repo-title {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.repo-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.repo-name {
  font-size: 18px;
  font-weight: 600;
  flex-shrink: 0;
}

.repo-path {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.header-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  min-width: 0;
}

.stat-icon-wrapper {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.branch-bg { background: rgba(64, 158, 255, 0.15); color: #409eff; }
.commit-bg { background: rgba(103, 194, 58, 0.15); color: #67c23a; }
.tag-bg { background: rgba(230, 162, 60, 0.15); color: #e6a23c; }
.stash-bg { background: rgba(144, 147, 153, 0.15); color: #909399; }

.stat-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.stat-label {
  font-size: 11px;
}

.stat-value {
  font-size: 14px;
  font-weight: 600;
}

/* Grid Layout */
.overview-body-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 16px;
  align-items: start;
}

.grid-column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}

/* Panel Cards */
.panel-card {
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 8px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-wrap: wrap;
  gap: 8px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
}

.card-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.empty-card-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 24px 0;
  text-align: center;
}

/* Branches */
.filter-input {
  width: 150px;
}

.filter-input-small {
  width: 130px;
}

.branch-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 420px;
  overflow-y: auto;
  padding-right: 4px;
}

.branch-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  min-height: 38px;
  box-sizing: border-box;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  min-width: 0;
  gap: 12px;
  transition: all 0.2s ease;
}

.branch-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
}

.branch-item.is-current {
  background: rgba(64, 158, 255, 0.1);
  border: 1px solid rgba(64, 158, 255, 0.35);
}

.branch-item-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  min-width: 0;
  flex: 1;
  line-height: 1.4;
}

.branch-item-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.branch-badge {
  font-size: 11px;
  font-weight: 500;
  padding: 2px 6px;
  line-height: 1;
  border-radius: 4px;
  flex-shrink: 0;
}
.branch-badge.local { background: rgba(64, 158, 255, 0.18); color: #409eff; }
.branch-badge.remote { background: rgba(230, 162, 60, 0.18); color: #e6a23c; }

.branch-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  letter-spacing: 0.2px;
}

.current-tag {
  font-size: 10px;
  font-weight: 600;
  background: var(--el-color-success, #67c23a);
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  line-height: 1.2;
  flex-shrink: 0;
}

.upstream-info {
  font-size: 11px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

/* Stashes & Tags & Remotes */
.stash-list, .tag-list, .remote-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 320px;
  overflow-y: auto;
  padding-right: 4px;
}

.stash-item, .tag-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  min-height: 38px;
  box-sizing: border-box;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid transparent;
  font-size: 12px;
  min-width: 0;
  gap: 10px;
  transition: all 0.2s ease;
}

.stash-item:hover, .tag-item:hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.08);
}

.stash-info, .tag-info {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  min-width: 0;
  flex: 1;
}

.stash-index {
  font-family: monospace;
  color: #e6a23c;
  flex-shrink: 0;
}

.stash-msg, .tag-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stash-branch, .tag-hash {
  flex-shrink: 0;
  font-family: monospace;
}

.tag-msg {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stash-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.remote-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
}

.remote-header-line {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.remote-name-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.remote-url-actions {
  display: flex;
  align-items: center;
}

.remote-urls {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
}

.url-line {
  display: flex;
  gap: 6px;
}

.url-line .label { width: 40px; }
.url-line .url { flex: 1; font-family: monospace; }

/* Authors & Identity */
.author-identity-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 4px;
}

.identity-row {
  display: flex;
  gap: 8px;
}
.identity-row .label { width: 70px; }

.top-authors-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.sub-title {
  font-size: 12px;
  font-weight: 600;
}

.author-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.author-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  font-size: 12px;
}

.author-rank {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: bold;
}
.rank-1 { background: #e6a23c; color: #fff; }
.rank-2 { background: #909399; color: #fff; }
.rank-3 { background: #b8860b; color: #fff; }

.author-details {
  flex: 1;
  display: flex;
  gap: 6px;
  overflow: hidden;
}

.author-name {
  font-weight: 500;
}

.author-count {
  color: var(--el-color-primary);
  font-weight: 600;
}

.text-secondary { color: var(--el-text-color-secondary); }
.text-ellipsis { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.font-mono { font-family: monospace; }
</style>
