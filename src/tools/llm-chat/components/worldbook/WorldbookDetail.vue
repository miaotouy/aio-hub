<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useWorldbookStore } from "../../stores/worldbookStore";
import type { STWorldbook, STWorldbookEntry } from "../../types/worldbook";
import { STWorldbookLogic, STWorldbookPosition } from "../../types/worldbook";
import {
  Plus,
  Trash2,
  Copy,
  Filter,
  Settings2,
  ArrowLeft,
  RotateCw,
  Expand,
  Shrink,
  StickyNote,
  ArrowDownAZ,
  ArrowDown01,
  User,
  ChevronRight,
  ArrowLeftRight,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { useDebounceFn, useElementSize } from "@vueuse/core";

const props = defineProps<{
  id: string;
}>();

const store = useWorldbookStore();
const loading = ref(false);
const currentBook = ref<STWorldbook | null>(null);
const selectedEntryUid = ref<number | null>(null);
const searchQuery = ref("");

// 移动/复制对话框
const moveCopyDialogVisible = ref(false);
const moveCopyTargetId = ref("");
const isMoveMode = ref(false);

const detailContainerRef = ref<HTMLElement | null>(null);
const { width } = useElementSize(detailContainerRef);
// 当组件自身可用宽度小于 680px 时，折叠内部侧边栏，避免三栏拥挤
const isInnerWide = computed(() => width.value > 680);

// 侧边栏过滤状态
const filterConstant = ref(false);
const filterDisabled = ref(false);

// 排序状态
const sortField = ref<string>("order");
const sortOrder = ref<"asc" | "desc">("desc");

// 紧凑模式 (对应酒馆的展开/折叠视觉效果)
const isCompact = ref(false);

// 加载数据
const loadBook = async () => {
  if (!props.id) return;
  loading.value = true;
  try {
    const book = await store.getWorldbookContent(props.id);
    if (book) {
      // 深拷贝以断开引用，避免直接修改 store
      currentBook.value = JSON.parse(JSON.stringify(book));

      // 如果没有选中条目，且有条目，默认选中第一个
      if (!selectedEntryUid.value) {
        const entries = Object.values(book.entries);
        if (entries.length > 0) {
          // 按 Order 排序选第一个
          const sorted = entries.sort((a, b) => (b.order || 0) - (a.order || 0));
          selectedEntryUid.value = sorted[0].uid;
        }
      }
    }
  } catch (error) {
    customMessage.error("加载世界书失败");
  } finally {
    loading.value = false;
  }
};

watch(() => props.id, loadBook, { immediate: true });

// 条目列表处理
const entryList = computed(() => {
  if (!currentBook.value) return [];

  let entries = Object.values(currentBook.value.entries);

  // 过滤
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase();
    entries = entries.filter(
      (e) =>
        (e.comment || "").toLowerCase().includes(q) ||
        e.key.some((k) => k.toLowerCase().includes(q)) ||
        e.content.toLowerCase().includes(q)
    );
  }

  if (filterConstant.value) {
    entries = entries.filter((e) => e.constant);
  }

  if (filterDisabled.value) {
    entries = entries.filter((e) => e.disable);
  }

  // 动态排序
  return entries.sort((a, b) => {
    let valA: any = (a as any)[sortField.value];
    let valB: any = (b as any)[sortField.value];

    // 特殊处理
    if (sortField.value === "content") {
      valA = a.content.length;
      valB = b.content.length;
    }

    if (valA === undefined || valA === null) valA = 0;
    if (valB === undefined || valB === null) valB = 0;

    if (valA === valB) return 0;
    const modifier = sortOrder.value === "asc" ? 1 : -1;
    return valA > valB ? modifier : -modifier;
  });
});

const currentEntry = computed(() => {
  if (!currentBook.value || selectedEntryUid.value === null) return null;
  return currentBook.value.entries[selectedEntryUid.value];
});

// 操作
const handleRefresh = () => {
  loadBook();
  customMessage.success("已刷新");
};

const handleBackfillMemos = () => {
  if (!currentBook.value) return;
  let count = 0;
  Object.values(currentBook.value.entries).forEach((entry) => {
    if (!entry.comment && entry.key.length > 0) {
      entry.comment = entry.key[0];
      count++;
    }
  });
  if (count > 0) {
    customMessage.success(`已为 ${count} 个条目填充备注`);
    saveChanges();
  }
};

const handleApplySorting = () => {
  if (!currentBook.value) return;
  const sorted = [...entryList.value];
  sorted.forEach((entry, index) => {
    const target = currentBook.value?.entries[entry.uid];
    if (target) {
      // 按照当前排序分配权重，步长为10
      target.order = (sorted.length - index) * 10;
    }
  });
  customMessage.success("排序已应用为权重顺序");
  saveChanges();
};

const handleAddEntry = () => {
  if (!currentBook.value) return;

  const newUid = Date.now();
  const newEntry: STWorldbookEntry = {
    uid: newUid,
    key: [],
    keysecondary: [],
    comment: "新条目",
    content: "",
    constant: false,
    selective: true,
    order: 100,
    position: STWorldbookPosition.BeforeChar,
    disable: false,
    probability: 100,
    depth: 4,
    useProbability: true,
    groupWeight: 100,
    useGroupScoring: false,
    delayUntilRecursion: false,
    delayUntilRecursionLevel: 1,
    excludeRecursion: false,
    preventRecursion: false,
    ignoreBudget: false,
    triggers: [],
    characterFilter: {
      isExclude: false,
      names: [],
      tags: [],
    },
    matchCharacterDescription: true,
    matchCharacterPersonality: true,
    matchScenario: true,
    matchPersonaDescription: false,
    matchCharacterDepthPrompt: false,
    matchCreatorNotes: false,
  };
  currentBook.value.entries[newUid] = newEntry;
  selectedEntryUid.value = newUid;
  saveChanges();
};

const handleDeleteEntry = (uid: number) => {
  if (!currentBook.value) return;
  delete currentBook.value.entries[uid];
  if (selectedEntryUid.value === uid) {
    selectedEntryUid.value = null;
  }
  saveChanges();
};

const handleDuplicateEntry = (entry: STWorldbookEntry) => {
  if (!currentBook.value) return;
  const newUid = Date.now();
  const newEntry = {
    ...JSON.parse(JSON.stringify(entry)),
    uid: newUid,
    comment: `${entry.comment} (副本)`,
  };
  currentBook.value.entries[newUid] = newEntry;
  selectedEntryUid.value = newUid;
  saveChanges();
};

const handleMoveCopyEntry = () => {
  moveCopyTargetId.value = "";
  moveCopyDialogVisible.value = true;
};

const executeMoveCopy = async () => {
  if (!currentEntry.value || !moveCopyTargetId.value || !currentBook.value) return;

  const targetId = moveCopyTargetId.value;
  const entryToProcess = JSON.parse(JSON.stringify(currentEntry.value));

  try {
    // 1. 获取目标世界书内容
    const targetBook = await store.getWorldbookContent(targetId);
    if (!targetBook) {
      customMessage.error("获取目标世界书失败");
      return;
    }

    // 2. 注入条目（生成新 UID 避免冲突，除非是完全不同的书，但生成新 UID 更安全）
    const newUid = Date.now();
    entryToProcess.uid = newUid;
    targetBook.entries[newUid] = entryToProcess;

    // 3. 保存目标世界书
    await store.updateWorldbook(targetId, targetBook);

    // 4. 如果是移动模式，从当前书中删除
    if (isMoveMode.value) {
      const oldUid = currentEntry.value.uid;
      delete currentBook.value.entries[oldUid];
      selectedEntryUid.value = null;
      await saveChanges();
      customMessage.success("条目已移动到目标世界书");
    } else {
      customMessage.success("条目已复制到目标世界书");
    }

    moveCopyDialogVisible.value = false;
  } catch (error) {
    customMessage.error("操作失败");
  }
};

// 自动保存
const saveChanges = useDebounceFn(async () => {
  if (!currentBook.value || !props.id) return;
  await store.updateWorldbook(props.id, currentBook.value);
}, 100);

// 监听整个世界书内容变化触发保存 (包括列表中的行内编辑)
watch(
  currentBook,
  () => {
    saveChanges();
  },
  { deep: true }
);

// 辅助选项
const sortOptions = [
  { label: "优先级 (Order)", value: "order" },
  { label: "标题 (Title)", value: "comment" },
  { label: "深度 (Depth)", value: "depth" },
  { label: "概率 (Prob)", value: "probability" },
  { label: "长度 (Length)", value: "content" },
  { label: "UID", value: "uid" },
];

const logicOptions = [
  { label: "包含任意 (AND ANY)", value: STWorldbookLogic.AND_ANY },
  { label: "不包含所有 (NOT ALL)", value: STWorldbookLogic.NOT_ALL },
  { label: "不包含任意 (NOT ANY)", value: STWorldbookLogic.NOT_ANY },
  { label: "包含所有 (AND ALL)", value: STWorldbookLogic.AND_ALL },
];

const roleOptions = [
  { label: "系统 (System)", value: 0 },
  { label: "用户 (User)", value: 1 },
  { label: "助手 (Assistant)", value: 2 },
];

const triggerOptions = [
  { label: "正常 (Normal)", value: "normal" },
  { label: "继续 (Continue)", value: "continue" },
  { label: "AI 帮答 (Impersonate)", value: "impersonate" },
  { label: "滑动 (Swipe)", value: "swipe" },
  { label: "重新生成 (Regenerate)", value: "regenerate" },
  { label: "静默 (Quiet)", value: "quiet" },
];

// 模拟酒馆的条目类型逻辑 (不再包含 disable，由独立开关控制)
const getEntryState = (entry: STWorldbookEntry) => {
  if (entry.constant) return "constant";
  if (entry.vectorized) return "vectorized";
  return "normal";
};

const setEntryState = (entry: STWorldbookEntry, state: string) => {
  entry.constant = state === "constant";
  entry.vectorized = state === "vectorized";
};

const stateOptions = [
  { label: "🔵 永久", value: "constant" },
  { label: "🟢 关键词", value: "normal" },
  { label: "🔗 向量化 [暂不支持]", value: "vectorized" },
];

const enhancedPositionOptions = [
  { label: "@D ⚙ [系统]在深度", value: STWorldbookPosition.Depth, role: 0 },
  { label: "@D 👤 [用户]在深度", value: STWorldbookPosition.Depth, role: 1 },
  { label: "@D 🤖 [AI]在深度", value: STWorldbookPosition.Depth, role: 2 },
  { label: "角色之前 (Before Char)", value: STWorldbookPosition.BeforeChar, role: null },
  { label: "角色之后 (After Char)", value: STWorldbookPosition.AfterChar, role: null },
  { label: "示例之前 (Before EM) [降级]", value: STWorldbookPosition.BeforeEM, role: null },
  { label: "示例之后 (After EM) [降级]", value: STWorldbookPosition.AfterEM, role: null },
  { label: "作者注之前 (Before AN) [降级]", value: STWorldbookPosition.BeforeAN, role: null },
  { label: "作者注之后 (After AN) [降级]", value: STWorldbookPosition.AfterAN, role: null },
  { label: "➡️ Outlet [不支持]", value: STWorldbookPosition.Outlet, role: null },
];

const handlePositionChange = (entry: STWorldbookEntry, compositeVal: string) => {
  const [pos, roleStr] = compositeVal.split("_");
  const posVal = parseInt(pos);
  const roleVal = roleStr === "null" ? null : parseInt(roleStr);

  entry.position = posVal;
  if (roleVal !== null) {
    entry.role = roleVal;
  }
};

const getCompositePosition = (entry: STWorldbookEntry) => {
  const role = entry.position === STWorldbookPosition.Depth ? (entry.role ?? 0) : "null";
  return `${entry.position}_${role}`;
};
</script>

<template>
  <div
    class="wb-detail-container"
    ref="detailContainerRef"
    :class="{ 'is-inner-narrow': !isInnerWide, 'is-compact': isCompact }"
  >
    <!-- 内部窄屏模式：顶部导航 -->
    <div v-if="!isInnerWide" class="inner-mobile-header">
      <div class="mobile-nav-left">
        <el-button v-if="selectedEntryUid" :icon="ArrowLeft" link @click="selectedEntryUid = null"
          >返回列表</el-button
        >
        <span v-else class="mobile-title">条目列表 ({{ entryList.length }})</span>
      </div>
      <div class="mobile-nav-actions">
        <el-button
          v-if="!selectedEntryUid"
          :icon="Plus"
          type="primary"
          @click="handleAddEntry"
          circle
          size="small"
        />
      </div>
    </div>

    <!-- 列表栏 (宽屏显示，或窄屏且未选中条目时显示) -->
    <aside
      v-if="isInnerWide || (!isInnerWide && !selectedEntryUid)"
      class="wb-sidebar"
      :class="{ 'is-mobile-list': !isInnerWide }"
    >
      <!-- 快捷工具栏 (仿酒馆) -->
      <div class="sidebar-header">
        <div class="header-top-row">
          <el-input
            v-model="searchQuery"
            placeholder="搜索条目..."
            prefix-icon="Search"
            clearable
            class="search-input"
          />
          <el-button type="primary" :icon="Plus" circle size="small" @click="handleAddEntry" />
        </div>
        <div class="header-tools-row">
          <div class="tool-group">
            <el-tooltip content="刷新数据">
              <el-button :icon="RotateCw" link @click="handleRefresh" />
            </el-tooltip>
            <el-tooltip :content="isCompact ? '展开视图' : '紧凑视图'">
              <el-button :icon="isCompact ? Expand : Shrink" link @click="isCompact = !isCompact" />
            </el-tooltip>
            <el-tooltip content="填充空备注 (使用首个关键词)">
              <el-button :icon="StickyNote" link @click="handleBackfillMemos" />
            </el-tooltip>
            <el-tooltip content="应用当前排序为权重">
              <el-button :icon="ArrowDown01" link @click="handleApplySorting" />
            </el-tooltip>
          </div>
          <div class="sort-group">
            <el-select v-model="sortField" size="small" class="sort-select">
              <el-option
                v-for="opt in sortOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-button
              link
              size="small"
              @click="sortOrder = sortOrder === 'asc' ? 'desc' : 'asc'"
              :icon="sortOrder === 'asc' ? ArrowDownAZ : ArrowDown01"
            />
          </div>
        </div>
      </div>

      <div class="sidebar-filters">
        <div class="filter-group">
          <el-check-tag
            :checked="filterConstant"
            @change="filterConstant = !filterConstant"
            size="small"
            >常量</el-check-tag
          >
          <el-check-tag
            :checked="filterDisabled"
            @change="filterDisabled = !filterDisabled"
            size="small"
            >已禁用</el-check-tag
          >
        </div>
        <span class="entry-count">{{ entryList.length }}</span>
      </div>

      <!-- 条目列表头部 (仿酒馆) -->
      <div class="entry-list-header">
        <span class="col-status"></span>
        <span class="col-name">标题（备忘）</span>
        <span class="col-pos">位置</span>
        <span class="col-depth" v-if="!isCompact">深度</span>
        <span class="col-order" v-if="!isCompact">顺序</span>
        <span class="col-prob" v-if="!isCompact">概率%</span>
        <span class="col-handle"></span>
      </div>

      <div class="entry-list custom-scrollbar">
        <div
          v-for="entry in entryList"
          :key="entry.uid"
          class="entry-item-row"
          :class="{ active: selectedEntryUid === entry.uid, disabled: entry.disable }"
          @click="selectedEntryUid = entry.uid"
        >
          <!-- 状态与开关 (仿酒馆三态) -->
          <div class="cell col-status" @click.stop>
            <div class="status-controls">
              <el-switch
                :model-value="!entry.disable"
                @update:model-value="(val: boolean) => (entry.disable = !val)"
                size="small"
                class="entry-disable-switch"
                title="启用/禁用条目"
              />
              <el-select
                :model-value="getEntryState(entry)"
                @update:model-value="(val: string) => setEntryState(entry, val)"
                size="small"
                class="state-select-mini"
              >
                <el-option
                  v-for="opt in stateOptions"
                  :key="opt.value"
                  :label="opt.label"
                  :value="opt.value"
                />
              </el-select>
            </div>
          </div>

          <!-- 标题备注 -->
          <div class="cell col-name" @click.stop>
            <div class="name-wrapper">
              <el-input
                v-model="entry.comment"
                size="small"
                placeholder="备注..."
                class="compact-input"
              />
            </div>
          </div>

          <!-- 插入位置 -->
          <div class="cell col-pos" @click.stop>
            <el-select
              :model-value="getCompositePosition(entry)"
              size="small"
              class="compact-select"
              @change="(val: string) => handlePositionChange(entry, val)"
            >
              <el-option
                v-for="opt in enhancedPositionOptions"
                :key="opt.label"
                :label="
                  opt.label.includes('[')
                    ? opt.label.split(']')[0] + ']'
                    : opt.label.split('(')[0].trim()
                "
                :value="`${opt.value}_${opt.role ?? 'null'}`"
              />
            </el-select>
          </div>

          <!-- 深度 -->
          <div class="cell col-depth" @click.stop v-if="!isCompact">
            <el-input-number
              v-model="entry.depth"
              size="small"
              :controls="false"
              class="compact-number"
              v-if="entry.position === STWorldbookPosition.Depth"
            />
            <span v-else class="placeholder">-</span>
          </div>

          <!-- 权重 -->
          <div class="cell col-order" @click.stop v-if="!isCompact">
            <el-input-number
              v-model="entry.order"
              size="small"
              :controls="false"
              class="compact-number"
            />
          </div>

          <!-- 概率 -->
          <div class="cell col-prob" @click.stop v-if="!isCompact">
            <el-input-number
              v-model="entry.probability"
              size="small"
              :controls="false"
              :min="0"
              :max="100"
              class="compact-number"
            />
          </div>

          <!-- 选中手柄 (位于右侧，靠近编辑区) -->
          <div class="cell col-handle">
            <el-icon class="handle-icon"><ChevronRight /></el-icon>
          </div>
        </div>

        <el-empty v-if="entryList.length === 0" description="没有找到条目" :image-size="60" />
      </div>
    </aside>

    <!-- 右侧编辑区 (宽屏显示选中项，或窄屏且已选中条目时显示) -->
    <main
      class="wb-editor-area"
      v-if="currentEntry && (isInnerWide || (!isInnerWide && selectedEntryUid))"
    >
      <!-- 编辑器头部 -->
      <div class="editor-header">
        <div class="header-left">
          <el-input
            v-model="currentEntry.comment"
            placeholder="条目备注/名称"
            class="entry-name-input"
          />
        </div>
        <div class="header-actions">
          <el-tooltip content="移动/复制到其他世界书">
            <el-button :icon="ArrowLeftRight" circle @click="handleMoveCopyEntry" />
          </el-tooltip>
          <el-tooltip content="复制条目">
            <el-button :icon="Copy" circle @click="handleDuplicateEntry(currentEntry)" />
          </el-tooltip>
          <el-popconfirm title="确定删除此条目吗？" @confirm="handleDeleteEntry(currentEntry.uid)">
            <template #reference>
              <el-tooltip content="删除条目">
                <el-button :icon="Trash2" circle plain />
              </el-tooltip>
            </template>
          </el-popconfirm>
        </div>
      </div>

      <!-- 编辑器内容滚动区 -->
      <div class="editor-scroll-content custom-scrollbar">
        <!-- 核心设置区 -->
        <div class="section-core">
          <div class="form-group">
            <label class="form-label">
              触发关键词 (Keys)
              <span class="sub-label">输入后按回车分割</span>
            </label>
            <el-select
              v-model="currentEntry.key"
              multiple
              filterable
              allow-create
              default-first-option
              :reserve-keyword="false"
              placeholder="输入关键词并回车..."
              class="keys-input"
            />
          </div>

          <div class="form-group content-group">
            <label class="form-label">内容 (Content)</label>
            <div class="editor-wrapper">
              <RichCodeEditor
                v-model="currentEntry.content"
                language="markdown"
                :height="'300px'"
              />
            </div>
          </div>
        </div>

        <!-- 高级配置区 (不再折叠) -->
        <div class="section-advanced-flat" v-if="currentEntry">
          <div class="flat-section">
            <div class="section-header">
              <el-icon><Settings2 /></el-icon>
              <span>插入策略 (Position & Order)</span>
            </div>
            <div class="advanced-grid">
              <div class="control-item">
                <span class="label">条目状态</span>
                <div class="flex-center gap-8">
                  <el-switch
                    :model-value="!currentEntry.disable"
                    @update:model-value="(val: boolean) => (currentEntry!.disable = !val)"
                    size="small"
                    active-text="已启用"
                    inactive-text="已禁用"
                    inline-prompt
                  />
                  <el-select
                    :model-value="getEntryState(currentEntry)"
                    @update:model-value="(val: any) => setEntryState(currentEntry!, val)"
                    size="small"
                    style="flex: 1"
                  >
                    <el-option
                      v-for="opt in stateOptions"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                </div>
              </div>

              <div class="control-item">
                <span class="label">插入位置</span>
                <el-select
                  :model-value="getCompositePosition(currentEntry)"
                  size="small"
                  @change="(val: string) => handlePositionChange(currentEntry!, val)"
                >
                  <el-option
                    v-for="opt in enhancedPositionOptions"
                    :key="opt.label"
                    :label="opt.label"
                    :value="`${opt.value}_${opt.role ?? 'null'}`"
                  />
                </el-select>
              </div>

              <div class="control-item">
                <span class="label">深度 (Depth)</span>
                <el-input-number
                  v-model="currentEntry.depth"
                  size="small"
                  controls-position="right"
                  :min="0"
                />
              </div>

              <div class="control-item">
                <span class="label">权重 (Order)</span>
                <el-input-number
                  v-model="currentEntry.order"
                  size="small"
                  controls-position="right"
                />
              </div>

              <div class="control-item">
                <span class="label">触发概率 ({{ currentEntry.probability }}%)</span>
                <el-slider v-model="currentEntry.probability" size="small" :min="0" :max="100" />
              </div>

              <div class="control-item">
                <span class="label">插入角色 (Role)</span>
                <el-select v-model="currentEntry.role" size="small" placeholder="不限" clearable>
                  <el-option
                    v-for="opt in roleOptions"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>

              <div class="control-item" v-if="currentEntry.position === STWorldbookPosition.Outlet">
                <span class="label">Outlet 名称</span>
                <el-input
                  v-model="currentEntry.outletName"
                  size="small"
                  placeholder="Outlet Name"
                />
              </div>

              <div class="control-item">
                <span class="label">自动化 ID (不支持)</span>
                <el-input v-model="currentEntry.automationId" size="small" placeholder="不支持" />
              </div>
            </div>
          </div>

          <div class="flat-section">
            <div class="section-header">
              <el-icon><ArrowDown01 /></el-icon>
              <span>分组与权重 (Group & Weight)</span>
            </div>
            <div class="advanced-grid">
              <div class="control-item">
                <span class="label">包含组 (Inclusion Group)</span>
                <el-input v-model="currentEntry.group" size="small" placeholder="组名..." />
              </div>

              <div class="control-item">
                <span class="label">组权重 (Group Weight)</span>
                <el-input-number
                  v-model="currentEntry.groupWeight"
                  size="small"
                  :min="1"
                  controls-position="right"
                />
              </div>

              <div class="control-item">
                <span class="label">组评分</span>
                <el-switch v-model="currentEntry.useGroupScoring" size="small" />
              </div>

              <div class="control-item">
                <span class="label">确定优先级</span>
                <el-checkbox v-model="currentEntry.groupOverride" size="small" />
              </div>
            </div>
          </div>

          <div class="flat-section">
            <div class="section-header">
              <el-icon><Filter /></el-icon>
              <span>高级逻辑 (Logic & Filter)</span>
            </div>
            <div class="advanced-grid">
              <div class="control-item full-width">
                <el-checkbox v-model="currentEntry.selective"
                  >启用选择性逻辑 (Selective Keywords)</el-checkbox
                >
              </div>

              <template v-if="currentEntry.selective">
                <div class="control-item full-width">
                  <span class="label">次要关键词 (Secondary Keys)</span>
                  <el-select
                    v-model="currentEntry.keysecondary"
                    multiple
                    filterable
                    allow-create
                    default-first-option
                    placeholder="输入次要关键词..."
                    size="small"
                    style="width: 100%"
                  />
                </div>

                <div class="control-item">
                  <span class="label">逻辑类型</span>
                  <el-select v-model="currentEntry.selectiveLogic" size="small">
                    <el-option
                      v-for="opt in logicOptions"
                      :key="opt.value"
                      :label="opt.label"
                      :value="opt.value"
                    />
                  </el-select>
                </div>
              </template>

              <div class="control-item">
                <span class="label">扫描深度 (Scan Depth)</span>
                <el-input-number
                  v-model="currentEntry.scanDepth"
                  size="small"
                  :min="0"
                  placeholder="使用全局"
                  controls-position="right"
                />
              </div>

              <div class="control-item">
                <span class="label">区分大小写</span>
                <el-select v-model="currentEntry.caseSensitive" size="small" placeholder="使用全局">
                  <el-option label="是" :value="true" />
                  <el-option label="否" :value="false" />
                  <el-option label="使用全局" :value="null" />
                </el-select>
              </div>

              <div class="control-item">
                <span class="label">匹配全词</span>
                <el-select
                  v-model="currentEntry.matchWholeWords"
                  size="small"
                  placeholder="使用全局"
                >
                  <el-option label="是" :value="true" />
                  <el-option label="否" :value="false" />
                  <el-option label="使用全局" :value="null" />
                </el-select>
              </div>

              <div class="control-item">
                <span class="label">无视回复限额</span>
                <el-switch v-model="currentEntry.ignoreBudget" size="small" />
              </div>
            </div>
          </div>
          <div class="flat-section">
            <div class="section-header">
              <el-icon><RotateCw /></el-icon>
              <span>递归控制 (Recursion Control)</span>
            </div>
            <div class="advanced-grid">
              <div class="control-item">
                <span class="label">排除递归 (不支持)</span>
                <el-switch v-model="currentEntry.excludeRecursion" size="small" />
              </div>

              <div class="control-item">
                <span class="label">防止进一步递归</span>
                <el-switch v-model="currentEntry.preventRecursion" size="small" />
              </div>

              <div class="control-item">
                <span class="label">延迟到递归</span>
                <el-switch v-model="currentEntry.delayUntilRecursion" size="small" />
              </div>

              <div class="control-item">
                <span class="label">递归等级</span>
                <el-input-number
                  v-model="currentEntry.delayUntilRecursionLevel"
                  size="small"
                  :min="1"
                  controls-position="right"
                />
              </div>
            </div>
          </div>

          <div class="flat-section">
            <div class="section-header">
              <el-icon><Filter /></el-icon>
              <span>触发器过滤 (不支持)</span>
            </div>
            <div class="advanced-grid">
              <div class="control-item full-width">
                <el-select
                  v-model="currentEntry.triggers"
                  multiple
                  placeholder="不支持过滤"
                  size="small"
                  style="width: 100%"
                >
                  <el-option
                    v-for="opt in triggerOptions"
                    :key="opt.value"
                    :label="opt.label"
                    :value="opt.value"
                  />
                </el-select>
              </div>
            </div>
          </div>

          <div class="flat-section">
            <div class="section-header">
              <el-icon><Plus /></el-icon>
              <span>额外匹配来源 (Additional Sources)</span>
            </div>
            <div class="advanced-grid">
              <div class="control-item">
                <el-checkbox v-model="currentEntry.matchCharacterDescription" size="small"
                  >角色描述</el-checkbox
                >
              </div>
              <div class="control-item">
                <el-checkbox v-model="currentEntry.matchCharacterPersonality" size="small"
                  >角色性格</el-checkbox
                >
              </div>
              <div class="control-item">
                <el-checkbox v-model="currentEntry.matchScenario" size="small">情景</el-checkbox>
              </div>
              <div class="control-item">
                <el-checkbox v-model="currentEntry.matchPersonaDescription" size="small"
                  >用户设定描述</el-checkbox
                >
              </div>
              <div class="control-item">
                <el-checkbox v-model="currentEntry.matchCharacterDepthPrompt" size="small"
                  >角色备注</el-checkbox
                >
              </div>
              <div class="control-item">
                <el-checkbox v-model="currentEntry.matchCreatorNotes" size="small"
                  >创作者注释</el-checkbox
                >
              </div>
            </div>
          </div>

          <!-- 角色/标签绑定 (Character Filter) -->
          <div class="flat-section" v-if="currentEntry.characterFilter">
            <div class="section-header">
              <el-icon><User /></el-icon>
              <span>角色/标签绑定</span>
            </div>
            <div class="advanced-grid">
              <div class="control-item full-width">
                <div class="flex-between mb-8">
                  <span class="label">绑定到角色或标签</span>
                  <el-checkbox v-model="currentEntry.characterFilter.isExclude"
                    >排除模式 (Exclude)</el-checkbox
                  >
                </div>
                <el-select
                  v-model="currentEntry.characterFilter.names"
                  multiple
                  filterable
                  allow-create
                  placeholder="输入角色名或标签..."
                  size="small"
                  style="width: 100%"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>

    <div v-else class="empty-selection">
      <el-empty description="选择一个条目开始编辑" />
    </div>

    <!-- 移动/复制对话框 -->
    <BaseDialog v-model="moveCopyDialogVisible" title="移动/复制条目" width="400px" height="auto">
      <div class="move-copy-dialog-content">
        <div class="dialog-form-item">
          <label>目标世界书</label>
          <el-select v-model="moveCopyTargetId" placeholder="请选择目标世界书" style="width: 100%">
            <el-option
              v-for="book in store.worldbooks.filter((b) => b.id !== props.id)"
              :key="book.id"
              :label="book.name"
              :value="book.id"
            />
          </el-select>
        </div>
        <div class="dialog-form-item" style="margin-top: 16px">
          <label>操作模式</label>
          <div style="margin-top: 8px">
            <el-radio-group v-model="isMoveMode">
              <el-radio :label="false">复制 (保留当前条目)</el-radio>
              <el-radio :label="true">移动 (删除当前条目)</el-radio>
            </el-radio-group>
          </div>
        </div>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="moveCopyDialogVisible = false">取消</el-button>
          <el-button type="primary" :disabled="!moveCopyTargetId" @click="executeMoveCopy">
            确定
          </el-button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.wb-detail-container {
  display: flex;
  flex-direction: row;
  height: 100%;
  width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}

.wb-detail-container.is-inner-narrow {
  flex-direction: column;
}

.inner-mobile-header {
  padding: 10px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--border-color);
  background-color: var(--sidebar-bg);
  flex-shrink: 0;
  height: 48px;
  box-sizing: border-box;
}

.mobile-title {
  font-weight: 600;
  font-size: 14px;
}

/* Sidebar Styles (仿酒馆表格布局) */
.wb-sidebar {
  width: 600px; /* 增加宽度以容纳表格行 */
  max-width: 55%; /* 防止在较窄屏幕挤压编辑器 */
  flex-shrink: 0;
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  background-color: var(--sidebar-bg);
}

.sidebar-header {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border: 1px solid var(--border-color);
}

.header-top-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.header-tools-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tool-group {
  display: flex;
  gap: 4px;
}

.tool-group :deep(.el-button) {
  padding: 4px;
  height: auto;
}

.sort-group {
  display: flex;
  align-items: center;
  gap: 4px;
}

.sort-select {
  width: 130px;
}

.entry-list-header {
  display: flex;
  padding: 4px 8px;
  background-color: color-mix(in srgb, var(--el-fill-color-lighter), transparent 40%);
  border: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--el-text-color-secondary);
  font-weight: bold;
}

.col-status {
  width: 85px;
  flex-shrink: 0;
  text-align: center;
}

.col-handle {
  width: 24px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-controls {
  display: flex;
  align-items: center;
  gap: 4px;
}

.col-name {
  flex: 1;
  min-width: 100px;
  padding: 0 4px;
}
.col-pos {
  width: 100px;
  flex-shrink: 0;
  padding: 0 4px;
}
.col-depth {
  width: 50px;
  flex-shrink: 0;
  text-align: center;
}
.col-order {
  width: 50px;
  flex-shrink: 0;
  text-align: center;
}
.col-prob {
  width: 50px;
  flex-shrink: 0;
  text-align: center;
}

/* 紧凑模式调整 */
.is-compact .col-pos {
  width: 80px;
}
.is-compact .wb-sidebar {
  width: 320px;
}

.entry-item-row {
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color 0.2s;
}

.entry-item-row:hover {
  background-color: color-mix(in srgb, var(--el-fill-color-light), transparent 50%);
}

.entry-item-row.active {
  background-color: color-mix(in srgb, var(--el-color-primary), transparent 90%);
}

.entry-item-row.active .col-handle {
  color: var(--el-color-primary);
}

.entry-item-row.active .handle-icon {
  transform: scale(1.1);
  color: var(--el-color-primary);
}

.entry-item-row:not(.active):hover .col-handle {
  color: var(--el-text-color-regular);
}

.entry-item-row.disabled {
  opacity: 0.6;
  background-color: color-mix(in srgb, var(--el-fill-color-lighter), transparent 20%);
}

.cell {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.handle-icon {
  font-size: 14px;
  color: var(--el-text-color-placeholder);
  transition: all 0.2s;
}

.entry-item-row:hover .handle-icon {
  color: var(--el-text-color-secondary);
}

.compact-input :deep(.el-input__wrapper),
.compact-select :deep(.el-select__wrapper),
.compact-number :deep(.el-input__wrapper) {
  padding: 0 4px;
  box-shadow: none !important;
  background: transparent;
  border: 1px solid transparent;
  transition: all 0.2s;
}

/* Hover 状态 */
.entry-item-row:hover .compact-input :deep(.el-input__wrapper),
.entry-item-row:hover .compact-select :deep(.el-select__wrapper),
.entry-item-row:hover .compact-number :deep(.el-input__wrapper) {
  border-color: var(--border-color);
  background: var(--input-bg);
}

/* Focus 状态 - 确保在输入时边框高亮 */
.compact-input :deep(.el-input__wrapper.is-focus),
.compact-select :deep(.el-select__wrapper.is-focus),
.compact-number :deep(.el-input__wrapper.is-focus) {
  border-color: var(--el-color-primary) !important;
  background: var(--input-bg) !important;
}

.compact-number {
  width: 100%;
}

.placeholder {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}

.wb-sidebar.is-mobile-list {
  width: 100%;
  border-right: none;
}

.sidebar-filters {
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border: 1px solid var(--border-color);
}

.filter-group {
  display: flex;
  gap: 8px;
}

.entry-list {
  flex: 1;
  overflow-y: auto;
}

/* Editor Area Styles */
.wb-editor-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0; /* Prevent flex overflow */
}

.editor-header {
  padding: 16px 24px;
  border: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  flex: 1;
  margin-right: 16px;
}

.entry-name-input :deep(.el-input__wrapper) {
  box-shadow: none;
  border: 1px solid var(--border-color);
  padding-left: 0;
  transition: border-color 0.2s;
  background: transparent;
}

.entry-name-input :deep(.el-input__wrapper.is-focus) {
  border-color: var(--el-color-primary);
}

.entry-name-input :deep(.el-input__inner) {
  font-size: 18px;
  font-weight: 600;
}

.editor-scroll-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
  box-sizing: border-box;
}

.section-core {
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 16px;
}

.form-label {
  display: block;
  margin-bottom: 8px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.sub-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-left: 8px;
  font-weight: normal;
}

.editor-wrapper {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

/* Advanced Section Flat */
.section-advanced-flat {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.flat-section {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 16px;
  background-color: var(--input-bg);
  backdrop-filter: blur(var(--ui-blur));
  transition: all 0.3s;
}

.flat-section:focus-within {
  border-color: color-mix(in srgb, var(--el-color-primary), transparent 60%);
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--el-text-color-primary);
  font-size: 14px;
}

.advanced-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.flex-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.mb-8 {
  margin-bottom: 8px;
}

.flex-center {
  display: flex;
  align-items: center;
}

.gap-8 {
  gap: 8px;
}

.state-select-mini {
  width: 42px;
}
.state-select-mini :deep(.el-select__wrapper) {
  padding: 0 4px;
  box-shadow: none !important;
  background-color: transparent;
  transition: all 0.2s;
}

.name-wrapper {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-item.full-width {
  grid-column: 1 / -1;
}

.control-item .label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.unsupported {
  opacity: 0.6;
  cursor: not-allowed !important;
}

.unsupported :deep(*) {
  cursor: not-allowed !important;
}

.empty-selection {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Move/Copy Dialog */
.move-copy-dialog-content {
  padding: 10px 0;
}

.dialog-form-item label {
  display: block;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Custom Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: var(--border-color);
  border-radius: 3px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
</style>
