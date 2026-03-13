<template>
  <div class="kb-placeholder-editor">
    <el-form :model="form" label-width="100px" label-position="left" size="default">
      <!-- 知识库选择 -->
      <el-form-item label="知识库">
        <el-select
          v-model="form.kbName"
          placeholder="选择知识库 (可选)"
          clearable
          filterable
          class="full-width"
        >
          <el-option label="所有知识库" value="" />
          <el-option
            v-for="base in kbStore.bases"
            :key="base.id"
            :label="base.name"
            :value="base.name"
          />
        </el-select>
        <div class="item-tip">留空则检索所有已启用的知识库</div>
      </el-form-item>

      <!-- 召回数量 (非 static 模式显示) -->
      <el-form-item v-if="form.mode !== 'static'" label="召回数量">
        <el-input-number
          v-model="form.limit"
          :min="1"
          :max="50"
          placeholder="默认"
          controls-position="right"
        />
        <span class="unit">条</span>
      </el-form-item>

      <!-- 最低分数 (非 static 模式显示) -->
      <el-form-item v-if="form.mode !== 'static'" label="最低分数">
        <div class="slider-container">
          <el-slider
            v-model="form.minScore"
            :min="0"
            :max="1"
            :step="0.05"
            :format-tooltip="(v: number) => v.toFixed(2)"
          />
          <span class="slider-value">{{ form.minScore?.toFixed(2) }}</span>
        </div>
        <div class="item-tip">仅返回相关度高于此分数的条目</div>
      </el-form-item>

      <!-- 激活模式 -->
      <el-form-item label="激活模式">
        <el-select v-model="form.mode" class="full-width">
          <el-option label="总是检索 (always)" value="always" />
          <el-option label="标签门控 (gate)" value="gate" />
          <el-option label="轮次常驻 (turn)" value="turn" />
          <el-option label="静态注入 (static)" value="static" />
        </el-select>
      </el-form-item>

      <!-- 模式参数: gate -->
      <el-form-item v-if="form.mode === 'gate'" label="标签过滤">
        <el-select
          v-model="form.modeParams"
          multiple
          filterable
          allow-create
          default-first-option
          placeholder="输入标签并回车"
          class="full-width"
        >
          <el-option v-for="tag in allTags" :key="tag" :label="tag" :value="tag" />
        </el-select>
        <div class="item-tip">仅当用户消息包含这些标签时才触发检索</div>
      </el-form-item>

      <!-- 模式参数: turn -->
      <el-form-item v-if="form.mode === 'turn'" label="轮次间隔">
        <el-input-number v-model="turnInterval" :min="1" :max="100" controls-position="right" />
        <span class="unit">轮</span>
        <div class="item-tip">每隔多少轮对话触发一次检索</div>
      </el-form-item>

      <!-- 模式参数: static -->
      <template v-if="form.mode === 'static'">
        <el-form-item label="注入范围">
          <el-radio-group v-model="staticType">
            <el-radio value="all">全部条目</el-radio>
            <el-radio value="select">指定条目</el-radio>
          </el-radio-group>
          <div class="item-tip">
            {{
              staticType === "all"
                ? "注入所选知识库的全部已启用条目（不执行相似度检索）"
                : "从知识库中选择要注入的条目"
            }}
          </div>
        </el-form-item>

        <!-- 条目选择器 (select 模式) -->
        <el-form-item v-if="staticType === 'select'" label="选择条目">
          <!-- 知识库选择 (用于加载条目列表) -->
          <el-select
            v-model="staticKbId"
            placeholder="先选择一个知识库"
            filterable
            class="full-width"
            @change="loadKbEntries"
          >
            <el-option
              v-for="base in kbStore.bases"
              :key="base.id"
              :label="`${base.name} (${base.entryCount} 条)`"
              :value="base.id"
            />
          </el-select>

          <!-- 条目多选列表 -->
          <el-select
            v-if="staticKbEntries.length > 0"
            v-model="selectedEntryIds"
            multiple
            filterable
            placeholder="搜索并选择条目"
            class="full-width entry-select"
            :filter-method="filterEntries"
          >
            <el-option
              v-for="entry in filteredEntries"
              :key="entry.id"
              :label="entry.key"
              :value="entry.id"
            >
              <div class="entry-option">
                <span class="entry-key">{{ entry.key }}</span>
                <span v-if="entry.summary" class="entry-summary">{{ entry.summary }}</span>
              </div>
            </el-option>
          </el-select>

          <div v-if="staticKbId && loadingEntries" class="item-tip">加载条目中...</div>
          <div
            v-if="staticKbId && !loadingEntries && staticKbEntries.length === 0"
            class="item-tip"
          >
            该知识库暂无条目
          </div>

          <!-- 高级: 手动输入 ID -->
          <el-collapse class="manual-collapse">
            <el-collapse-item title="手动输入 ID（高级）">
              <el-input
                v-model="manualIds"
                type="textarea"
                :rows="2"
                placeholder="输入条目 ID，多个 ID 用逗号或换行分隔"
              />
            </el-collapse-item>
          </el-collapse>
        </el-form-item>
      </template>

      <!-- 预览 -->
      <div class="preview-section">
        <div class="preview-label">预览语法：</div>
        <code class="preview-code">{{ generatedPlaceholder }}</code>
      </div>

      <!-- 操作 -->
      <div class="actions">
        <el-button @click="$emit('cancel')">取消</el-button>
        <el-button type="primary" @click="handleInsert">
          {{ isEdit ? "确认修改" : "插入占位符" }}
        </el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useKnowledgeBaseStore } from "@/tools/knowledge-base/stores/knowledgeBaseStore";
import {
  parseKBParams,
  type KBPlaceholder,
} from "../../../core/context-processors/knowledge-processor";
import type { CaiuIndexItem } from "@/tools/knowledge-base/types";

const props = defineProps<{
  /** 当前选中的占位符文本，用于编辑模式 */
  value?: string;
}>();

const emit = defineEmits<{
  (e: "insert", value: string): void;
  (e: "cancel"): void;
}>();

const kbStore = useKnowledgeBaseStore();

// ─── 默认值常量 ───
const DEFAULT_MIN_SCORE = 0.3;
const DEFAULT_MODE = "always";

// ─── 表单数据 ───
const form = ref<Partial<KBPlaceholder>>({
  kbName: "",
  limit: undefined,
  minScore: DEFAULT_MIN_SCORE,
  mode: DEFAULT_MODE,
  modeParams: [],
});

// ─── 辅助字段 ───
const turnInterval = ref(1);

// static 模式相关
const staticType = ref<"all" | "select">("select");
const staticKbId = ref("");
const staticKbEntries = ref<CaiuIndexItem[]>([]);
const selectedEntryIds = ref<string[]>([]);
const manualIds = ref("");
const loadingEntries = ref(false);
const entryFilterText = ref("");

const isEdit = computed(() => !!props.value);

// 获取所有已知标签用于建议
const allTags = computed(() => kbStore.globalStats.allDiscoveredTags || []);

// 过滤后的条目列表
const filteredEntries = computed(() => {
  if (!entryFilterText.value) return staticKbEntries.value;
  const keyword = entryFilterText.value.toLowerCase();
  return staticKbEntries.value.filter(
    (e) =>
      e.key.toLowerCase().includes(keyword) ||
      (e.summary && e.summary.toLowerCase().includes(keyword)) ||
      e.tags.some((t) => t.toLowerCase().includes(keyword))
  );
});

/**
 * el-select 自定义过滤方法
 */
const filterEntries = (val: string) => {
  entryFilterText.value = val;
};

/**
 * 加载指定知识库的条目列表
 */
const loadKbEntries = async (kbId: string) => {
  if (!kbId) {
    staticKbEntries.value = [];
    return;
  }

  loadingEntries.value = true;
  try {
    const meta = await invoke<any | null>("kb_load_base_meta", { kbId });
    staticKbEntries.value = meta?.entries || [];
    entryFilterText.value = "";
  } catch {
    staticKbEntries.value = [];
  } finally {
    loadingEntries.value = false;
  }
};

/**
 * 解析传入的占位符
 */
const parseValue = (val: string) => {
  if (!val) return;

  const KB_PLACEHOLDER_REGEX = /【(?:kb|knowledge)(?:::([^【】]*?))?】/;
  const match = val.match(KB_PLACEHOLDER_REGEX);

  if (match) {
    const params = parseKBParams(match[0], match[1] || "", 0);
    form.value = {
      kbName: params.kbName || "",
      limit: params.limit,
      minScore: params.minScore ?? DEFAULT_MIN_SCORE,
      mode: params.mode || DEFAULT_MODE,
      modeParams: params.modeParams || [],
    };

    // 同步辅助字段
    if (params.mode === "turn" && params.modeParams?.[0]) {
      turnInterval.value = parseInt(params.modeParams[0]) || 1;
    } else if (params.mode === "static" && params.modeParams) {
      if (params.modeParams.length === 1 && params.modeParams[0].toLowerCase() === "all") {
        staticType.value = "all";
      } else {
        staticType.value = "select";
        // 尝试匹配已有条目（如果有知识库选中的话）
        selectedEntryIds.value = [...params.modeParams];
        manualIds.value = "";
      }
    }
  }
};

onMounted(() => {
  if (kbStore.bases.length === 0) {
    kbStore.init();
  }
  if (props.value) {
    parseValue(props.value);
  }
});

watch(
  () => props.value,
  (newVal) => {
    if (newVal) parseValue(newVal);
  }
);

/**
 * 收集 static 模式下的最终 ID 列表
 */
const resolvedStaticParams = computed<string[]>(() => {
  if (staticType.value === "all") return ["all"];

  // 合并选择器选中的 + 手动输入的
  const fromSelector = [...selectedEntryIds.value];
  const fromManual = manualIds.value
    .split(/[\n,，]/)
    .map((s) => s.trim())
    .filter(Boolean);

  // 去重
  const merged = [...new Set([...fromSelector, ...fromManual])];
  return merged;
});

/**
 * 生成占位符字符串
 * 从末尾开始省略等于默认值的参数，避免产生多余的 ::
 */
const generatedPlaceholder = computed(() => {
  // 5. modeParams
  let finalParams: string[] = [];
  if (form.value.mode === "turn") {
    finalParams = [turnInterval.value.toString()];
  } else if (form.value.mode === "static") {
    finalParams = resolvedStaticParams.value;
  } else if (form.value.mode === "gate") {
    finalParams = form.value.modeParams || [];
  }
  const modeParamsStr = finalParams.join(",");

  // 构建参数数组 (位置: 0=kbName, 1=limit, 2=minScore, 3=mode, 4=modeParams)
  const slots: Array<{ value: string; isDefault: boolean }> = [
    {
      value: form.value.kbName || "",
      isDefault: !form.value.kbName,
    },
    {
      value: form.value.limit?.toString() || "",
      isDefault: form.value.limit === undefined || form.value.limit === null,
    },
    {
      value: form.value.minScore !== undefined ? form.value.minScore.toFixed(2) : "",
      isDefault:
        form.value.minScore === undefined ||
        Math.abs((form.value.minScore ?? DEFAULT_MIN_SCORE) - DEFAULT_MIN_SCORE) < 0.001,
    },
    {
      value: form.value.mode || DEFAULT_MODE,
      isDefault: !form.value.mode || form.value.mode === DEFAULT_MODE,
    },
    {
      value: modeParamsStr,
      isDefault: !modeParamsStr,
    },
  ];

  // 从末尾开始裁剪：如果是默认值就省略
  let lastMeaningful = -1;
  for (let i = slots.length - 1; i >= 0; i--) {
    if (!slots[i].isDefault) {
      lastMeaningful = i;
      break;
    }
  }

  if (lastMeaningful < 0) return "【kb】";

  const parts = slots.slice(0, lastMeaningful + 1).map((s) => s.value);
  return `【kb::${parts.join("::")}】`;
});

const handleInsert = () => {
  emit("insert", generatedPlaceholder.value);
};
</script>

<style scoped>
.kb-placeholder-editor {
  padding: 4px;
}

.full-width {
  width: 100%;
}

.item-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
  margin-top: 4px;
}

.unit {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
}

.slider-container {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
}

.slider-container :deep(.el-slider) {
  flex: 1;
}

.slider-value {
  font-family: var(--el-font-family-mono);
  font-size: 13px;
  color: var(--el-color-primary);
  min-width: 32px;
}

.entry-select {
  margin-top: 8px;
}

.entry-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px 0;
}

.entry-key {
  font-size: 13px;
  font-weight: 500;
}

.entry-summary {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.manual-collapse {
  margin-top: 8px;
  border: none;
}

.manual-collapse :deep(.el-collapse-item__header) {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  height: 28px;
  line-height: 28px;
  background: transparent;
  border: none;
}

.manual-collapse :deep(.el-collapse-item__wrap) {
  border: none;
  background: transparent;
}

.manual-collapse :deep(.el-collapse-item__content) {
  padding-bottom: 0;
}

.preview-section {
  margin-top: 24px;
  padding: 12px;
  background-color: var(--input-bg);
  border-radius: 6px;
  border: 1px dashed var(--border-color);
}

.preview-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.preview-code {
  display: block;
  font-family: var(--el-font-family-mono);
  font-size: 13px;
  color: var(--el-color-primary);
  word-break: break-all;
  user-select: all;
}

.actions {
  margin-top: 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
