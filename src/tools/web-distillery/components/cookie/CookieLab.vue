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

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import {
  Plus,
  Upload,
  Globe,
  Cookie,
  Eye,
  EyeOff,
  Edit2,
  Trash2,
  Download,
  RefreshCw,
  FileJson,
  FileText,
  MonitorDown,
  ShieldAlert,
  ShieldCheck,
  PackageOpen,
} from "lucide-vue-next";
import { ElMessageBox } from "element-plus";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { cookieProfileStore } from "../../core/cookie-profile-store";
import type { CookieProfile, CookieEntry } from "../../types";
import CookieProfileCard from "./CookieProfileCard.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { iframeBridge } from "../../core/iframe-bridge";
import { useWebDistilleryStore } from "../../stores/store";

const errorHandler = createModuleErrorHandler("web-distillery/cookie-lab");
const store = useWebDistilleryStore();

// =========== 加密状态 ===========
const cryptoAvailable = ref<boolean | null>(null); // null = 未检测
const cryptoBackend = ref("");

// =========== 主要数据 ===========
const profiles = ref<CookieProfile[]>([]);
const isLoading = ref(false);

const groupedProfiles = computed(() => {
  const groups: Record<string, CookieProfile[]> = {};
  for (const p of profiles.value) {
    if (!groups[p.domain]) groups[p.domain] = [];
    groups[p.domain].push(p);
  }
  return groups;
});

const sortedDomains = computed(() => Object.keys(groupedProfiles.value).sort());

async function refreshProfiles() {
  isLoading.value = true;
  try {
    profiles.value = await cookieProfileStore.getAll();
  } catch (err) {
    errorHandler.error(err, "加载身份卡片失败");
  } finally {
    isLoading.value = false;
  }
}

// =========== 激活切换 ===========
async function handleToggleActive(id: string) {
  const result = await errorHandler.wrapAsync(
    () => cookieProfileStore.toggleActive(id),
    {
      userMessage: "切换激活状态失败",
    }
  );
  if (result !== null) {
    await refreshProfiles();
  }
}

// =========== 详情/编辑对话框 ===========
const showDetailDialog = ref(false);
const isCreating = ref(false);
const editingProfileId = ref<string | null>(null);
const editForm = ref({
  name: "",
  domain: "",
  notes: "",
  domainAliases: "",
});
const editCookies = ref<CookieEntry[]>([]);
const revealedValues = ref<Set<number>>(new Set());
const isSaving = ref(false);

function openCreateDialog(domain?: string) {
  isCreating.value = true;
  editingProfileId.value = null;
  editForm.value = {
    name: "",
    domain: domain ?? "",
    notes: "",
    domainAliases: "",
  };
  editCookies.value = [];
  revealedValues.value = new Set();
  showDetailDialog.value = true;
}

function openEditDialog(id: string) {
  const profile = profiles.value.find((p) => p.id === id);
  if (!profile) return;
  isCreating.value = false;
  editingProfileId.value = id;
  editForm.value = {
    name: profile.name,
    domain: profile.domain,
    notes: profile.notes ?? "",
    domainAliases: profile.domainAliases?.join(", ") ?? "",
  };
  editCookies.value = profile.cookies.map((c) => ({ ...c }));
  revealedValues.value = new Set();
  showDetailDialog.value = true;
}

async function saveProfile() {
  if (!editForm.value.name.trim() || !editForm.value.domain.trim()) {
    customMessage.warning("名称和域名不能为空");
    return;
  }

  isSaving.value = true;
  const domainAliases = editForm.value.domainAliases
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const profileData = {
    name: editForm.value.name.trim(),
    domain: editForm.value.domain.trim(),
    notes: editForm.value.notes.trim() || undefined,
    domainAliases: domainAliases.length > 0 ? domainAliases : undefined,
    cookies: editCookies.value,
  };

  const result = await errorHandler.wrapAsync(
    async () => {
      if (isCreating.value) {
        await cookieProfileStore.create(profileData);
      } else {
        await cookieProfileStore.update(editingProfileId.value!, profileData);
      }
    },
    { userMessage: isCreating.value ? "创建失败" : "保存失败" }
  );

  isSaving.value = false;
  if (result !== null) {
    customMessage.success(
      isCreating.value ? "身份卡片已创建" : "身份卡片已保存"
    );
    showDetailDialog.value = false;
    await refreshProfiles();
  }
}

async function handleDeleteProfile(id: string) {
  const profile = profiles.value.find((p) => p.id === id);
  if (!profile) return;

  try {
    await ElMessageBox.confirm(
      `确定要删除身份卡片 "${profile.name}" 吗？此操作不可撤销。`,
      "删除确认",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
  } catch {
    return;
  }

  const result = await errorHandler.wrapAsync(
    () => cookieProfileStore.delete(id),
    {
      userMessage: "删除失败",
    }
  );
  if (result !== null) {
    customMessage.success("身份卡片已删除");
    if (showDetailDialog.value && editingProfileId.value === id) {
      showDetailDialog.value = false;
    }
    await refreshProfiles();
  }
}

async function handleExportProfile(id: string) {
  const result = await errorHandler.wrapAsync(
    () => cookieProfileStore.exportAsJson(id),
    {
      userMessage: "导出失败",
    }
  );
  if (result === null) return;

  const profile = profiles.value.find((p) => p.id === id);
  const filename = `cookie-profile-${profile?.name ?? id}.json`;
  await downloadTextFile(result, filename, "application/json");
  customMessage.success("已导出为 JSON 文件");
}

async function handleExportAll() {
  if (profiles.value.length === 0) {
    customMessage.warning("没有可导出的身份卡片");
    return;
  }

  const result = await errorHandler.wrapAsync(
    () => cookieProfileStore.exportAllAsJson(),
    {
      userMessage: "导出失败",
    }
  );
  if (result === null) return;

  const filename = `cookie-profiles-all-${new Date().toISOString().slice(0, 10)}.json`;
  await downloadTextFile(result, filename, "application/json");
  customMessage.success(`已导出全部 ${profiles.value.length} 个身份卡片`);
}

async function handleExportAsNetscape(id: string) {
  const result = await errorHandler.wrapAsync(
    () => cookieProfileStore.exportAsNetscape(id),
    {
      userMessage: "导出失败",
    }
  );
  if (result === null) return;

  const profile = profiles.value.find((p) => p.id === id);
  const filename = `cookies-${profile?.name ?? id}.txt`;
  await downloadTextFile(result, filename, "text/plain");
  customMessage.success("已导出为 Netscape 格式");
}

async function downloadTextFile(
  content: string,
  filename: string,
  _mimeType: string
) {
  const ext = filename.split(".").pop() ?? "txt";
  const filePath = await save({
    defaultPath: filename,
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (!filePath) return; // 用户取消
  await writeTextFile(filePath, content);
}

// =========== Cookie 表格操作 ===========
function toggleValueReveal(index: number) {
  const newSet = new Set(revealedValues.value);
  if (newSet.has(index)) {
    newSet.delete(index);
  } else {
    newSet.add(index);
  }
  revealedValues.value = newSet;
}

function removeCookie(index: number) {
  editCookies.value.splice(index, 1);
  const newSet = new Set<number>();
  for (const i of revealedValues.value) {
    if (i < index) newSet.add(i);
    else if (i > index) newSet.add(i - 1);
  }
  revealedValues.value = newSet;
}

// =========== Cookie 编辑子对话框 ===========
const showCookieEditDialog = ref(false);
const editingCookieIndex = ref<number>(-1);
const cookieForm = ref<CookieEntry>({
  name: "",
  value: "",
  domain: "",
  path: "/",
  expires: undefined,
  httpOnly: false,
  secure: false,
});

function openAddCookieDialog() {
  editingCookieIndex.value = -1;
  cookieForm.value = {
    name: "",
    value: "",
    domain: editForm.value.domain,
    path: "/",
    expires: undefined,
    httpOnly: false,
    secure: false,
  };
  showCookieEditDialog.value = true;
}

function openEditCookieDialog(index: number) {
  editingCookieIndex.value = index;
  cookieForm.value = { ...editCookies.value[index] };
  showCookieEditDialog.value = true;
}

function saveCookieEdit() {
  if (!cookieForm.value.name.trim()) {
    customMessage.warning("Cookie 名称不能为空");
    return;
  }
  if (editingCookieIndex.value >= 0) {
    editCookies.value[editingCookieIndex.value] = { ...cookieForm.value };
  } else {
    editCookies.value.push({ ...cookieForm.value });
  }
  showCookieEditDialog.value = false;
}

// =========== 从浏览器抓取（在详情对话框内） ===========
const isCaptureLoading = ref(false);

async function captureFromCurrentPage() {
  if (!store.isWebviewCreated) {
    customMessage.warning("请先在蒸馏工作台打开一个页面");
    return;
  }

  isCaptureLoading.value = true;
  try {
    await iframeBridge.getCookies();
    const result = await iframeBridge.waitForCookiesExtracted(5000);
    const cookieStr = result.cookies;
    const url = result.url;

    if (!cookieStr) {
      customMessage.info(
        "当前页面没有可读取的 Cookie（HttpOnly Cookie 无法通过此方式获取）"
      );
      return;
    }

    let hostname = editForm.value.domain;
    try {
      hostname = new URL(url).hostname;
    } catch {
      // keep existing domain
    }

    const parsed: CookieEntry[] = cookieStr
      .split(";")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const eqIndex = pair.indexOf("=");
        if (eqIndex < 0) return null;
        const name = pair.slice(0, eqIndex).trim();
        const value = pair.slice(eqIndex + 1).trim();
        if (!name) return null;
        return {
          name,
          value,
          domain: hostname,
          path: "/",
        } satisfies CookieEntry;
      })
      .filter((c): c is CookieEntry => c !== null);

    // 合并到当前编辑列表（按 name 去重，新的覆盖旧的）
    const existingNames = new Map(editCookies.value.map((c, i) => [c.name, i]));
    for (const c of parsed) {
      const existingIdx = existingNames.get(c.name);
      if (existingIdx !== undefined) {
        editCookies.value[existingIdx] = c;
      } else {
        editCookies.value.push(c);
        existingNames.set(c.name, editCookies.value.length - 1);
      }
    }

    if (!editForm.value.domain && url) {
      try {
        editForm.value.domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        // ignore
      }
    }

    customMessage.success(`已抓取 ${parsed.length} 条 Cookie`);
  } catch (err) {
    errorHandler.error(err, "抓取 Cookie 失败");
  } finally {
    isCaptureLoading.value = false;
  }
}

// =========== 导入对话框 ===========
const showImportDialog = ref(false);
const importMode = ref<"browser" | "json" | "netscape">("browser");
const importJsonText = ref("");
const importNetscapeText = ref("");
const importNetscapeName = ref("");
const importNetscapeDomain = ref("");
const isImporting = ref(false);
const isBrowserCapturing = ref(false);

function openImportDialog(mode: "browser" | "json" | "netscape" = "browser") {
  importMode.value = mode;
  importJsonText.value = "";
  importNetscapeText.value = "";
  importNetscapeName.value = "";
  importNetscapeDomain.value = "";
  showImportDialog.value = true;
}

async function handleImportFromBrowser() {
  if (!store.isWebviewCreated) {
    customMessage.warning("请先在蒸馏工作台打开一个页面");
    return;
  }

  isBrowserCapturing.value = true;
  try {
    await iframeBridge.getCookies();
    const result = await iframeBridge.waitForCookiesExtracted(5000);

    if (!result.cookies) {
      customMessage.info("当前页面没有可读取的 Cookie");
      return;
    }

    const profile = await cookieProfileStore.captureFromBrowser(
      result.cookies,
      result.url
    );
    customMessage.success(
      `已从浏览器抓取 ${profile.cookies.length} 条 Cookie，创建了新身份卡片`
    );
    showImportDialog.value = false;
    await refreshProfiles();
  } catch (err) {
    errorHandler.error(err, "从浏览器抓取失败");
  } finally {
    isBrowserCapturing.value = false;
  }
}

async function handleImportFromJson() {
  if (!importJsonText.value.trim()) {
    customMessage.warning("请输入 JSON 内容");
    return;
  }

  isImporting.value = true;
  try {
    let data: unknown;
    try {
      data = JSON.parse(importJsonText.value.trim());
    } catch {
      customMessage.error("JSON 格式错误，请检查输入内容");
      isImporting.value = false;
      return;
    }

    const { imported, skipped } = await cookieProfileStore.importFromJson(data);
    customMessage.success(
      `导入成功：${imported} 个身份卡片${skipped > 0 ? `，跳过 ${skipped} 个` : ""}`
    );
    showImportDialog.value = false;
    await refreshProfiles();
  } catch (err) {
    errorHandler.error(err, "JSON 导入失败");
  } finally {
    isImporting.value = false;
  }
}

async function handleImportFromNetscape() {
  if (!importNetscapeText.value.trim()) {
    customMessage.warning("请输入 Netscape Cookie 文件内容");
    return;
  }
  if (!importNetscapeName.value.trim()) {
    customMessage.warning("请输入身份卡片名称");
    return;
  }
  if (!importNetscapeDomain.value.trim()) {
    customMessage.warning("请输入域名");
    return;
  }

  isImporting.value = true;
  try {
    const profile = await cookieProfileStore.importFromNetscape(
      importNetscapeText.value,
      importNetscapeName.value.trim(),
      importNetscapeDomain.value.trim()
    );
    customMessage.success(`已导入 ${profile.cookies.length} 条 Cookie`);
    showImportDialog.value = false;
    await refreshProfiles();
  } catch (err) {
    errorHandler.error(err, "Netscape 格式导入失败");
  } finally {
    isImporting.value = false;
  }
}

function handleJsonFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    importJsonText.value = (e.target?.result as string) ?? "";
  };
  reader.readAsText(file);
  input.value = "";
}

// =========== 生命周期 ===========
onMounted(async () => {
  await cookieProfileStore.load();
  await refreshProfiles();

  // 检查加密状态
  const status = await cookieProfileStore.checkCrypto();
  cryptoAvailable.value = status.available;
  cryptoBackend.value = status.backend;
});
</script>

<template>
  <div class="cookie-lab">
    <!-- 顶部工具栏 -->
    <div class="lab-toolbar">
      <div class="toolbar-title">
        <Cookie :size="14" class="title-icon" />
        <span>身份卡片</span>
      </div>
      <div class="toolbar-actions">
        <el-button
          text
          size="small"
          :loading="isLoading"
          title="刷新"
          @click="refreshProfiles"
        >
          <RefreshCw :size="13" />
        </el-button>
        <el-button type="primary" size="small" @click="openCreateDialog()">
          <Plus :size="13" style="margin-right: 4px" />
          新建
        </el-button>
        <el-dropdown trigger="click" placement="bottom-end">
          <div>
            <el-button size="small">
              <Upload :size="13" style="margin-right: 4px" />
              导入
            </el-button>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="openImportDialog('browser')">
                <MonitorDown :size="13" class="dropdown-icon" />
                从浏览器抓取
              </el-dropdown-item>
              <el-dropdown-item @click="openImportDialog('json')">
                <FileJson :size="13" class="dropdown-icon" />
                JSON 文件
              </el-dropdown-item>
              <el-dropdown-item @click="openImportDialog('netscape')">
                <FileText :size="13" class="dropdown-icon" />
                Netscape 格式
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-dropdown
          trigger="click"
          placement="bottom-end"
          :disabled="profiles.length === 0"
        >
          <div>
            <el-tooltip
              content="没有可导出的身份卡片"
              :disabled="profiles.length > 0"
              placement="top"
            >
              <el-button size="small" :disabled="profiles.length === 0">
                <Download :size="13" style="margin-right: 4px" />
                导出
              </el-button>
            </el-tooltip>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="handleExportAll">
                <PackageOpen :size="13" class="dropdown-icon" />
                导出全部 (JSON)
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 加密状态提示 -->
    <div v-if="cryptoAvailable === false" class="crypto-warning-banner">
      <ShieldAlert :size="13" class="crypto-icon" />
      <span>当前平台不支持加密存储，Cookie 以明文保存在本地磁盘</span>
    </div>
    <div v-else-if="cryptoAvailable === true" class="crypto-ok-banner">
      <ShieldCheck :size="13" class="crypto-icon" />
      <span>Cookie 值已通过 {{ cryptoBackend.toUpperCase() }} 加密保护</span>
    </div>

    <!-- 主体：按域名分组 -->
    <div class="lab-body">
      <!-- 空状态 -->
      <div v-if="sortedDomains.length === 0 && !isLoading" class="empty-state">
        <Cookie :size="32" class="empty-icon" />
        <p class="empty-title">还没有身份卡片</p>
        <p class="empty-desc">创建身份卡片来保存网站登录态，实现带身份抓取</p>
        <el-button type="primary" size="small" @click="openCreateDialog()">
          <Plus :size="13" style="margin-right: 4px" />
          新建身份卡片
        </el-button>
      </div>

      <!-- 域名分组列表 -->
      <div v-for="domain in sortedDomains" :key="domain" class="domain-group">
        <div class="domain-header">
          <Globe :size="12" class="domain-icon" />
          <span class="domain-name">{{ domain }}</span>
          <el-button
            text
            size="small"
            class="domain-add-btn"
            title="在此域名下新建"
            @click="openCreateDialog(domain)"
          >
            <Plus :size="12" />
          </el-button>
        </div>
        <div class="cards-grid">
          <CookieProfileCard
            v-for="profile in groupedProfiles[domain]"
            :key="profile.id"
            :profile="profile"
            :is-active="profile.isActive"
            @toggle-active="handleToggleActive"
            @edit="openEditDialog"
            @delete="handleDeleteProfile"
            @export-json="handleExportProfile"
            @export-netscape="handleExportAsNetscape"
          />
        </div>
      </div>
    </div>

    <!-- ===== 详情/编辑对话框 ===== -->
    <BaseDialog
      v-model="showDetailDialog"
      :title="isCreating ? '新建身份卡片' : '编辑身份卡片'"
      width="90%"
      max-width="860px"
      height="80vh"
      :show-close-button="true"
      :close-on-backdrop-click="false"
      :destroy-on-close="true"
      :show-footer="true"
    >
      <template #content>
        <div class="detail-content">
          <!-- 基本信息 -->
          <div class="section-title">基本信息</div>
          <el-form label-position="top" size="small" class="profile-form">
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item label="名称" required>
                  <el-input
                    v-model="editForm.name"
                    placeholder="如：知乎-主号"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="域名" required>
                  <el-input
                    v-model="editForm.domain"
                    placeholder="如：zhihu.com"
                  />
                </el-form-item>
              </el-col>
            </el-row>
            <el-form-item label="域名别名（逗号分隔）">
              <el-input
                v-model="editForm.domainAliases"
                placeholder="如：www.zhihu.com, zhuanlan.zhihu.com"
              />
            </el-form-item>
            <el-form-item label="备注">
              <el-input
                v-model="editForm.notes"
                type="textarea"
                :rows="2"
                placeholder="可选备注信息"
              />
            </el-form-item>
          </el-form>

          <!-- Cookie 列表 -->
          <div class="section-header">
            <div class="section-title">Cookie 列表</div>
            <div class="section-actions">
              <el-button
                size="small"
                :loading="isCaptureLoading"
                :disabled="!store.isWebviewCreated"
                :title="
                  store.isWebviewCreated
                    ? '从当前浏览器页面抓取'
                    : '请先在蒸馏工作台打开页面'
                "
                @click="captureFromCurrentPage"
              >
                <MonitorDown :size="12" style="margin-right: 4px" />
                从当前页面抓取
              </el-button>
              <el-button size="small" @click="openAddCookieDialog">
                <Plus :size="12" style="margin-right: 4px" />
                手动添加
              </el-button>
            </div>
          </div>

          <div class="cookie-table-wrap">
            <el-table
              :data="editCookies"
              size="small"
              empty-text="暂无 Cookie"
              class="cookie-table"
              :max-height="280"
            >
              <el-table-column
                label="名称"
                prop="name"
                min-width="120"
                show-overflow-tooltip
              />
              <el-table-column label="值" min-width="140">
                <template #default="{ row, $index }">
                  <div class="value-cell">
                    <span class="value-text">
                      {{ revealedValues.has($index) ? row.value : "••••••" }}
                    </span>
                    <el-button
                      text
                      size="small"
                      class="reveal-btn"
                      :aria-label="
                        revealedValues.has($index) ? '隐藏值' : '显示值'
                      "
                      @click="toggleValueReveal($index)"
                    >
                      <Eye v-if="!revealedValues.has($index)" :size="12" />
                      <EyeOff v-else :size="12" />
                    </el-button>
                  </div>
                </template>
              </el-table-column>
              <el-table-column
                label="域名"
                prop="domain"
                min-width="100"
                show-overflow-tooltip
              />
              <el-table-column
                label="路径"
                prop="path"
                width="70"
                show-overflow-tooltip
              />
              <el-table-column label="过期时间" min-width="100">
                <template #default="{ row }">
                  <span v-if="!row.expires" class="text-placeholder">永久</span>
                  <span
                    v-else
                    :class="{
                      'text-danger': new Date(row.expires) < new Date(),
                    }"
                    :title="row.expires"
                  >
                    {{ new Date(row.expires).toLocaleDateString() }}
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="标志" width="80">
                <template #default="{ row }">
                  <span v-if="row.httpOnly" class="flag-badge">H</span>
                  <span v-if="row.secure" class="flag-badge flag-secure"
                    >S</span
                  >
                </template>
              </el-table-column>
              <el-table-column label="操作" width="80" fixed="right">
                <template #default="{ $index }">
                  <el-button
                    text
                    size="small"
                    @click="openEditCookieDialog($index)"
                  >
                    <Edit2 :size="12" />
                  </el-button>
                  <el-button
                    text
                    size="small"
                    class="danger-btn"
                    @click="removeCookie($index)"
                  >
                    <Trash2 :size="12" />
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div class="cookie-count-hint">
            共 {{ editCookies.length }} 条 Cookie
          </div>
        </div>
      </template>

      <template #footer>
        <div class="detail-footer">
          <div class="footer-left">
            <el-button
              v-if="!isCreating && editingProfileId"
              type="danger"
              plain
              size="small"
              @click="handleDeleteProfile(editingProfileId!)"
            >
              <Trash2 :size="12" style="margin-right: 4px" />
              删除此卡片
            </el-button>
            <el-dropdown
              v-if="!isCreating && editingProfileId"
              trigger="click"
              placement="top-start"
            >
              <div>
                <el-button size="small">
                  <Download :size="12" style="margin-right: 4px" />
                  导出
                </el-button>
              </div>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    @click="handleExportProfile(editingProfileId!)"
                  >
                    <FileJson :size="12" class="dropdown-icon" />
                    导出 JSON
                  </el-dropdown-item>
                  <el-dropdown-item
                    @click="handleExportAsNetscape(editingProfileId!)"
                  >
                    <FileText :size="12" class="dropdown-icon" />
                    导出 Netscape
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
          <div class="footer-right">
            <el-button size="small" @click="showDetailDialog = false"
              >取消</el-button
            >
            <el-button
              type="primary"
              size="small"
              :loading="isSaving"
              @click="saveProfile"
            >
              {{ isCreating ? "创建" : "保存" }}
            </el-button>
          </div>
        </div>
      </template>
    </BaseDialog>

    <!-- ===== Cookie 编辑子对话框 ===== -->
    <BaseDialog
      v-model="showCookieEditDialog"
      :title="editingCookieIndex >= 0 ? '编辑 Cookie' : '添加 Cookie'"
      width="480px"
      :show-close-button="true"
      :close-on-backdrop-click="true"
      :destroy-on-close="true"
      :show-footer="true"
    >
      <template #content>
        <el-form label-position="top" size="small">
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="名称" required>
                <el-input v-model="cookieForm.name" placeholder="cookie_name" />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="值">
                <el-input
                  v-model="cookieForm.value"
                  placeholder="cookie_value"
                />
              </el-form-item>
            </el-col>
          </el-row>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item label="域名">
                <el-input
                  v-model="cookieForm.domain"
                  placeholder="example.com"
                />
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="路径">
                <el-input v-model="cookieForm.path" placeholder="/" />
              </el-form-item>
            </el-col>
          </el-row>
          <el-form-item label="过期时间（ISO 格式，留空表示永久）">
            <el-input
              v-model="cookieForm.expires"
              placeholder="2026-12-31T00:00:00.000Z"
              clearable
            />
          </el-form-item>
          <el-row :gutter="12">
            <el-col :span="12">
              <el-form-item>
                <el-checkbox v-model="cookieForm.httpOnly"
                  >HttpOnly</el-checkbox
                >
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item>
                <el-checkbox v-model="cookieForm.secure">Secure</el-checkbox>
              </el-form-item>
            </el-col>
          </el-row>
        </el-form>
      </template>
      <template #footer>
        <el-button size="small" @click="showCookieEditDialog = false"
          >取消</el-button
        >
        <el-button type="primary" size="small" @click="saveCookieEdit">
          {{ editingCookieIndex >= 0 ? "保存" : "添加" }}
        </el-button>
      </template>
    </BaseDialog>

    <!-- ===== 导入对话框 ===== -->
    <BaseDialog
      v-model="showImportDialog"
      title="导入身份卡片"
      width="560px"
      :show-close-button="true"
      :close-on-backdrop-click="true"
      :destroy-on-close="true"
      :show-footer="false"
    >
      <template #content>
        <!-- 导入模式切换 -->
        <div class="import-tabs">
          <button
            class="import-tab"
            :class="{ active: importMode === 'browser' }"
            @click="importMode = 'browser'"
          >
            <MonitorDown :size="13" style="margin-right: 4px" />
            从浏览器抓取
          </button>
          <button
            class="import-tab"
            :class="{ active: importMode === 'json' }"
            @click="importMode = 'json'"
          >
            <FileJson :size="13" style="margin-right: 4px" />
            JSON 文件
          </button>
          <button
            class="import-tab"
            :class="{ active: importMode === 'netscape' }"
            @click="importMode = 'netscape'"
          >
            <FileText :size="13" style="margin-right: 4px" />
            Netscape 格式
          </button>
        </div>

        <!-- 从浏览器抓取 -->
        <div v-if="importMode === 'browser'" class="import-panel">
          <div class="import-desc">
            <p>
              从当前蒸馏工作台中打开的页面抓取所有可读
              Cookie，自动创建新的身份卡片。
            </p>
            <p class="import-note">
              注意：HttpOnly Cookie 无法通过此方式读取。
            </p>
          </div>
          <div v-if="!store.isWebviewCreated" class="import-warning">
            <span>⚠️ 请先在蒸馏工作台打开一个页面，再使用此功能。</span>
          </div>
          <div class="import-actions">
            <el-button
              type="primary"
              :loading="isBrowserCapturing"
              :disabled="!store.isWebviewCreated"
              @click="handleImportFromBrowser"
            >
              <MonitorDown :size="13" style="margin-right: 4px" />
              立即抓取
            </el-button>
          </div>
        </div>

        <!-- JSON 导入 -->
        <div v-else-if="importMode === 'json'" class="import-panel">
          <div class="import-desc">
            <p>
              粘贴 JSON 格式的身份卡片数据，或选择本地 JSON 文件。兼容
              EditThisCookie 导出格式。
            </p>
          </div>
          <el-input
            v-model="importJsonText"
            type="textarea"
            :rows="8"
            placeholder='粘贴 JSON 内容，如：[{"name":"...","domain":"...","cookies":[...]}]'
            class="import-textarea"
          />
          <div class="import-actions">
            <label class="file-select-btn">
              <input
                type="file"
                accept=".json"
                style="display: none"
                @change="handleJsonFileSelect"
              />
              <el-button size="small">选择文件</el-button>
            </label>
            <el-button
              type="primary"
              :loading="isImporting"
              @click="handleImportFromJson"
            >
              导入
            </el-button>
          </div>
        </div>

        <!-- Netscape 格式导入 -->
        <div v-else-if="importMode === 'netscape'" class="import-panel">
          <div class="import-desc">
            <p>
              粘贴 Netscape HTTP Cookie File 格式内容（以
              <code># Netscape HTTP Cookie File</code> 开头）。
            </p>
          </div>
          <el-form label-position="top" size="small" style="margin-bottom: 8px">
            <el-row :gutter="12">
              <el-col :span="12">
                <el-form-item label="身份卡片名称" required>
                  <el-input
                    v-model="importNetscapeName"
                    placeholder="如：GitHub 个人"
                  />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="域名" required>
                  <el-input
                    v-model="importNetscapeDomain"
                    placeholder="如：github.com"
                  />
                </el-form-item>
              </el-col>
            </el-row>
          </el-form>
          <el-input
            v-model="importNetscapeText"
            type="textarea"
            :rows="7"
            placeholder="# Netscape HTTP Cookie File&#10;.github.com	TRUE	/	FALSE	0	_gh_sess	abc..."
            class="import-textarea"
          />
          <div class="import-actions">
            <el-button
              type="primary"
              :loading="isImporting"
              @click="handleImportFromNetscape"
            >
              导入
            </el-button>
          </div>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.cookie-lab {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ===== 工具栏 ===== */
.lab-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
  gap: 8px;
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
}

.title-icon {
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

/* ===== 加密状态提示 ===== */
.crypto-warning-banner,
.crypto-ok-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 11px;
  flex-shrink: 0;
}

.crypto-warning-banner {
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  color: var(--el-color-warning);
  border-bottom: var(--border-width) solid
    rgba(var(--el-color-warning-rgb), 0.2);
}

.crypto-ok-banner {
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.06)
  );
  color: var(--el-color-success);
  border-bottom: var(--border-width) solid
    rgba(var(--el-color-success-rgb), 0.15);
}

.crypto-icon {
  flex-shrink: 0;
}

/* ===== 主体 ===== */
.lab-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 空状态 ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
  gap: 10px;
  flex: 1;
}

.empty-icon {
  color: var(--el-text-color-placeholder);
  opacity: 0.5;
}

.empty-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin: 0;
}

.empty-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin: 0;
  line-height: 1.6;
  max-width: 240px;
}

/* ===== 域名分组 ===== */
.domain-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.domain-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.domain-icon {
  color: var(--el-text-color-placeholder);
  flex-shrink: 0;
}

.domain-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex: 1;
}

.domain-add-btn {
  opacity: 0;
  transition: opacity 0.15s;
}

.domain-group:hover .domain-add-btn {
  opacity: 1;
}

/* ===== 卡片网格 ===== */
.cards-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

@media (max-width: 320px) {
  .cards-grid {
    grid-template-columns: 1fr;
  }
}

/* ===== 详情对话框内容 ===== */
.detail-content {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
  margin-top: 4px;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 8px;
}

.section-actions {
  display: flex;
  gap: 6px;
}

.profile-form {
  margin-bottom: 4px;
}

/* ===== Cookie 表格 ===== */
.cookie-table-wrap {
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.cookie-table {
  width: 100%;
}

.value-cell {
  display: flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
}

.value-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: monospace;
  font-size: 11px;
}

.reveal-btn {
  flex-shrink: 0;
  padding: 0 2px !important;
  height: auto !important;
}

.flag-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-info);
  margin-right: 3px;
}

.flag-secure {
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.15)
  );
  color: var(--el-color-success);
}

.cookie-count-hint {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
  text-align: right;
  margin-top: 6px;
}

.text-placeholder {
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}

.text-danger {
  color: var(--el-color-danger);
  font-size: 11px;
}

.danger-btn {
  color: var(--el-color-danger) !important;
}

/* ===== 详情对话框底部 ===== */
.detail-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.footer-left {
  display: flex;
  gap: 8px;
}

.footer-right {
  display: flex;
  gap: 8px;
}

/* ===== 导入对话框 ===== */
.import-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  padding-bottom: 0;
}

.import-tab {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -1px;
  border-radius: 4px 4px 0 0;
}

.import-tab:hover {
  color: var(--el-text-color-primary);
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.05)
  );
}

.import-tab.active {
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary);
  font-weight: 600;
}

.import-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.import-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.6;
}

.import-desc p {
  margin: 0 0 4px;
}

.import-note {
  color: var(--el-color-warning) !important;
  font-size: 11px !important;
}

.import-warning {
  padding: 8px 12px;
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  border: var(--border-width) solid var(--el-color-warning-light-5);
  border-radius: 6px;
  font-size: 12px;
  color: var(--el-color-warning);
}

.import-textarea {
  font-family: monospace;
}

.import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  align-items: center;
}

.file-select-btn {
  cursor: pointer;
}

/* ===== 下拉图标 ===== */
.dropdown-icon {
  margin-right: 6px;
  flex-shrink: 0;
}

/* ===== 滚动条 ===== */
.lab-body::-webkit-scrollbar {
  width: 4px;
}

.lab-body::-webkit-scrollbar-track {
  background: transparent;
}

.lab-body::-webkit-scrollbar-thumb {
  background: var(--el-border-color-light);
  border-radius: 2px;
}
</style>
