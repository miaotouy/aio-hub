<template>
  <BaseDialog
    v-model="dialogVisible"
    title="翻译工作台设置"
    width="620px"
    max-height="80vh"
    close-on-backdrop-click
    show-close-button
  >
    <div class="settings-panel">
      <section class="settings-section">
        <div class="section-heading">
          <span>生成参数</span>
          <span class="section-desc">控制单次翻译请求的输出长度和创造性</span>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>默认输出上限</span>
            <span class="setting-desc"
              >兜底的 max_tokens，模型自身上限优先</span
            >
          </div>
          <el-input-number
            v-model="store.settings.defaultMaxTokens"
            :min="1024"
            :max="131072"
            :step="1024"
            controls-position="right"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>按输入长度自动扩容</span>
            <span class="setting-desc">输入更长时自动放大 max_tokens</span>
          </div>
          <el-switch v-model="store.settings.autoExpandMaxTokens" />
        </div>

        <div
          class="setting-row"
          :class="{ disabled: !store.settings.autoExpandMaxTokens }"
        >
          <div class="setting-label">
            <span>输出膨胀系数</span>
            <span class="setting-desc">
              估算 = 字符数 × 系数 + 格式预留。中→英 / 短→长建议 0.8 ~ 1.5 区间
            </span>
          </div>
          <el-input-number
            v-model="store.settings.outputExpansionFactor"
            :min="1"
            :max="8"
            :step="0.5"
            :precision="1"
            :disabled="!store.settings.autoExpandMaxTokens"
            controls-position="right"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>默认采样温度</span>
            <span class="setting-desc">渠道未单独配置时使用</span>
          </div>
          <el-input-number
            v-model="store.settings.defaultTemperature"
            :min="0"
            :max="2"
            :step="0.1"
            :precision="1"
            controls-position="right"
          />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>流式输出</span>
            <span class="setting-desc">逐 token 打字机展示</span>
          </div>
          <el-switch v-model="store.settings.streamingEnabled" />
        </div>
      </section>

      <section class="settings-section">
        <div class="section-heading">
          <span>自定义语言</span>
          <span class="section-desc"> 这些语言会出现在所有翻译下拉中 </span>
        </div>

        <div class="custom-langs">
          <el-tag
            v-for="name in store.settings.customLanguages"
            :key="name"
            class="custom-lang-tag"
            closable
            type="info"
            @close="handleRemoveCustomLang(name)"
          >
            {{ name }}
          </el-tag>
          <span
            v-if="store.settings.customLanguages.length === 0"
            class="empty-langs"
          >
            还没有自定义语言。点击右侧 + 添加。
          </span>
          <el-button
            class="add-lang-btn"
            :icon="Plus"
            size="small"
            @click="handleAddCustomLang"
          >
            添加
          </el-button>
        </div>
      </section>

      <section class="settings-section">
        <div class="section-heading">
          <span>长文本分片翻译</span>
          <span class="section-desc">将超长输入拆成多片逐步翻译</span>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>启用分片翻译</span>
            <span class="setting-desc">超过阈值时在输入区显示启用提示</span>
          </div>
          <el-switch v-model="store.settings.splitTranslationEnabled" />
        </div>

        <div
          class="setting-row"
          :class="{ disabled: !store.settings.splitTranslationEnabled }"
        >
          <div class="setting-label">
            <span>智能过滤分片提示</span>
            <span class="setting-desc">
              当所有渠道都配置了输出上限且预估输出宽裕时，不显示分片提示
            </span>
          </div>
          <el-switch
            v-model="store.settings.splitSuggestSmartFilter"
            :disabled="!store.settings.splitTranslationEnabled"
          />
        </div>

        <div
          class="setting-row"
          :class="{ disabled: !store.settings.splitTranslationEnabled }"
        >
          <div class="setting-label">
            <span>触发字数阈值</span>
            <span class="setting-desc">输入达到该字符数时提示分片翻译</span>
          </div>
          <el-input-number
            v-model="store.settings.splitThreshold"
            :min="1000"
            :max="1000000"
            :step="500"
            :disabled="!store.settings.splitTranslationEnabled"
            controls-position="right"
          />
        </div>

        <div
          class="setting-row"
          :class="{ disabled: !store.settings.splitTranslationEnabled }"
        >
          <div class="setting-label">
            <span>单分片目标大小</span>
            <span class="setting-desc">算法会优先在段落和句子边界切分</span>
          </div>
          <el-input-number
            v-model="store.settings.splitChunkSize"
            :min="500"
            :max="50000"
            :step="500"
            :disabled="!store.settings.splitTranslationEnabled"
            controls-position="right"
          />
        </div>

        <div
          class="setting-row"
          :class="{ disabled: !store.settings.splitTranslationEnabled }"
        >
          <div class="setting-label">
            <span>默认翻译模式</span>
            <span class="setting-desc">串行会把上一片原文和译文作为上下文</span>
          </div>
          <el-radio-group
            v-model="store.settings.splitMode"
            :disabled="!store.settings.splitTranslationEnabled"
          >
            <el-radio-button label="sequential">质量优先</el-radio-button>
            <el-radio-button label="concurrent">速度优先</el-radio-button>
          </el-radio-group>
        </div>

        <div
          class="setting-row"
          :class="{
            disabled:
              !store.settings.splitTranslationEnabled ||
              store.settings.splitMode !== 'concurrent',
          }"
        >
          <div class="setting-label">
            <span>最大并发分片数</span>
            <span class="setting-desc">仅速度优先模式生效，默认 2</span>
          </div>
          <el-input-number
            v-model="store.settings.splitMaxConcurrent"
            :min="1"
            :max="4"
            :step="1"
            :disabled="
              !store.settings.splitTranslationEnabled ||
              store.settings.splitMode !== 'concurrent'
            "
            controls-position="right"
          />
        </div>
      </section>

      <section class="settings-section">
        <div class="section-heading">
          <span>界面与记录</span>
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>输出超限预警</span>
            <span class="setting-desc">
              估算预计超过模型上限时，弹二次确认；关闭后仍显示视觉提示
            </span>
          </div>
          <el-switch v-model="store.settings.warnOnOutputOverflow" />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>结果自动吸底</span>
            <span class="setting-desc">手动向上滚动时会暂停吸底</span>
          </div>
          <el-switch v-model="store.settings.autoScrollResults" />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>保存翻译历史</span>
            <span class="setting-desc">最多保留 30 条，仅本地</span>
          </div>
          <el-switch v-model="store.settings.saveHistory" />
        </div>

        <div class="setting-row">
          <div class="setting-label">
            <span>清空历史记录</span>
            <span class="setting-desc">
              当前共 {{ store.history.length }} 条
            </span>
          </div>
          <el-button
            type="danger"
            plain
            :icon="Trash2"
            :disabled="store.history.length === 0"
            @click="handleClearHistory"
          >
            清空
          </el-button>
        </div>
      </section>
    </div>

    <template #footer>
      <el-button :icon="RotateCcw" @click="handleReset">恢复默认</el-button>
      <el-button type="primary" @click="dialogVisible = false">完成</el-button>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ElMessageBox } from "element-plus";
import { Plus, RotateCcw, Trash2 } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";
import { useTranslatorStore } from "../composables/useTranslatorStore";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const store = useTranslatorStore();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value) => emit("update:modelValue", value),
});

function handleReset() {
  store.resetSettings();
  customMessage.success("翻译设置已恢复默认");
}

async function handleAddCustomLang() {
  try {
    const { value } = await ElMessageBox.prompt(
      "填入 LLM 能理解的英文名或原名，例如：Klingon、Toki Pona、Old English。",
      "添加自定义语言",
      {
        confirmButtonText: "添加",
        cancelButtonText: "取消",
        inputPlaceholder: "例如：Klingon",
        inputValidator: (input) => {
          const v = (input || "").trim();
          if (!v) return "请输入语言名称";
          if (v.length > 64) return "名称过长（≤64 字符）";
          if (store.settings.customLanguages.includes(v))
            return "该自定义语言已存在";
          return true;
        },
        lockScroll: false,
      }
    );
    const name = (value as string).trim();
    if (!name) return;
    if (store.addCustomLanguage(name)) {
      customMessage.success(`已添加：${name}`);
    }
  } catch {
    /* user cancelled */
  }
}

async function handleRemoveCustomLang(name: string) {
  try {
    await ElMessageBox.confirm(
      `确定要删除自定义语言 "${name}" 吗？正在使用它的输入框会回退到默认语言；预设里以它为默认的字段不会自动改动。`,
      "删除自定义语言",
      {
        confirmButtonText: "删除",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    store.removeCustomLanguage(name);
    customMessage.success(`已删除：${name}`);
  } catch {
    /* user cancelled */
  }
}

async function handleClearHistory() {
  try {
    await ElMessageBox.confirm(
      "确定要清空全部翻译历史吗？此操作无法撤销。",
      "清空历史",
      {
        confirmButtonText: "清空",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    store.clearHistory();
    customMessage.success("翻译历史已清空");
  } catch {
    /* user cancelled */
  }
}
</script>

<style scoped>
.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-heading {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding-bottom: 4px;
  color: var(--text-color);
  font-size: 13px;
  font-weight: 700;
}

.section-desc {
  color: var(--text-color-secondary);
  font-size: 12px;
  font-weight: 500;
}

.setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  min-height: 52px;
  padding: 10px 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  transition: opacity 0.18s ease;
}

.setting-row.disabled {
  opacity: 0.55;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.setting-label > span:first-child {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
}

.setting-desc {
  color: var(--text-color-secondary);
  font-size: 11px;
  line-height: 1.5;
}

:deep(.el-input-number) {
  width: 156px;
}

.custom-langs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--input-bg);
  min-height: 52px;
}

.custom-lang-tag {
  font-size: 12px;
}

.empty-langs {
  flex: 1;
  color: var(--text-color-light);
  font-size: 12px;
  font-style: italic;
}

.add-lang-btn {
  margin-left: auto;
}
</style>
