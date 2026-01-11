<template>
  <aside class="config-sidebar">
    <InfoCard title="渲染配置" class="config-card">
      <!-- 渲染器版本选择 -->
      <div class="control-section">
        <label class="control-label">渲染器版本</label>
        <el-select v-model="rendererVersion" style="width: 100%">
          <el-option
            v-for="versionMeta in enabledVersions"
            :key="versionMeta.version"
            :label="versionMeta.name"
            :value="versionMeta.version"
            :title="versionMeta.description"
          >
            <div class="version-option">
              <span>{{ versionMeta.name }}</span>
              <el-tag
                v-for="tag in versionMeta.tags"
                :key="tag"
                size="small"
                :type="tag === '基础' ? 'success' : tag === '高级' ? 'warning' : 'info'"
                style="margin-left: 4px"
              >
                {{ tag }}
              </el-tag>
            </div>
          </el-option>
        </el-select>
      </div>

      <!-- 测试角色选择 -->
      <div class="control-section">
        <label class="control-label">测试角色 (用于资产解析)</label>
        <div class="profile-selector">
          <el-radio-group v-model="profileType" size="small" class="profile-type-radio">
            <el-radio-button label="agent">智能体</el-radio-button>
            <el-radio-button label="user">用户</el-radio-button>
          </el-radio-group>

          <el-select
            v-if="profileType === 'agent'"
            v-model="selectedProfileId"
            placeholder="选择智能体档案"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="agent in agentPresets"
              :key="agent.id"
              :label="agent.name"
              :value="agent.id"
            >
              <div class="agent-option">
                <Avatar :src="agent.icon" :alt="agent.name" :size="24" />
                <span>{{ agent.name }}</span>
              </div>
            </el-option>
          </el-select>

          <div v-else class="user-profile-mock">
            <el-alert title="用户档案暂未支持资产" type="info" :closable="false" show-icon />
          </div>
        </div>
      </div>

      <!-- 预设内容选择 -->
      <div class="control-section">
        <label class="control-label">预设内容</label>
        <el-select
          v-model="selectedPreset"
          placeholder="选择预设内容"
          clearable
          @change="loadPreset"
          style="width: 100%"
        >
          <el-option
            v-for="preset in presets"
            :key="preset.id"
            :label="preset.name"
            :value="preset.id"
          />
        </el-select>
      </div>

      <!-- HTML 渲染控制 -->
      <div class="control-section">
        <div class="control-header">
          <label class="control-label">HTML 预览</label>
          <el-tooltip content="开启后，HTML 代码块将默认以预览模式显示" placement="left">
            <el-switch v-model="defaultRenderHtml" />
          </el-tooltip>
        </div>
      </div>

      <!-- 代码块默认展开控制 -->
      <div class="control-section">
        <div class="control-header">
          <label class="control-label">代码块默认展开</label>
          <el-tooltip content="开启后，消息中的代码块将默认处于展开状态" placement="left">
            <el-switch v-model="defaultCodeBlockExpanded" />
          </el-tooltip>
        </div>
      </div>

      <!-- 工具调用默认折叠控制 -->
      <div class="control-section">
        <div class="control-header">
          <label class="control-label">工具调用默认折叠</label>
          <el-tooltip content="开启后，消息中的工具调用将默认处于折叠状态" placement="left">
            <el-switch v-model="defaultToolCallCollapsed" />
          </el-tooltip>
        </div>
      </div>

      <!-- CDN 本地化控制 -->
      <div class="control-section">
        <div class="control-header">
          <label class="control-label">CDN 本地化</label>
          <el-tooltip
            content="开启后，HTML 预览将自动拦截 CDN 资源并重定向到本地库"
            placement="left"
          >
            <el-switch v-model="enableCdnLocalizer" />
          </el-tooltip>
        </div>
      </div>

      <!-- 无边框模式控制 -->
      <div class="control-section">
        <div class="control-header">
          <label class="control-label">无边框模式</label>
          <el-tooltip
            content="开启后，HTML 渲染将移除外框和头部，直接嵌入消息流中"
            placement="left"
          >
            <el-switch v-model="seamlessMode" />
          </el-tooltip>
        </div>
      </div>

      <!-- 危险 HTML 控制 -->
      <div class="control-section">
        <div class="control-header">
          <label class="control-label" style="color: var(--el-color-danger)">允许危险 HTML</label>
          <el-tooltip
            content="允许渲染黑名单中的标签（如 script, iframe 等），开启后可能存在安全风险"
            placement="left"
          >
            <el-switch v-model="allowDangerousHtml" />
          </el-tooltip>
        </div>
      </div>

      <!-- 进入动画控制 -->
      <div class="control-section">
        <div class="control-header">
          <label class="control-label">节点进入动画</label>
          <el-tooltip content="开启后，渲染的节点将有淡入效果" placement="left">
            <el-switch v-model="enableEnterAnimation" />
          </el-tooltip>
        </div>
      </div>

      <!-- 流式输出控制 -->
      <div class="control-section">
        <div class="control-header">
          <label class="control-label">流式输出</label>
          <el-tooltip content="开启后将模拟流式输出效果，逐字符渲染内容" placement="left">
            <el-switch v-model="streamEnabled" />
          </el-tooltip>
        </div>

        <template v-if="streamEnabled">
          <div class="control-item">
            <div class="control-header">
              <el-tooltip
                content="开启后，输入框将实时显示流式生成的内容（打字机效果）"
                placement="right"
              >
                <label>同步输入进度</label>
              </el-tooltip>
              <el-switch v-model="syncInputProgress" size="small" />
            </div>
          </div>

          <!-- 分词器选择 -->
          <div class="control-item">
            <el-tooltip content="选择用于分词的模型，影响 token 分隔的准确性" placement="right">
              <label>分词器</label>
            </el-tooltip>
            <el-select v-model="selectedTokenizer" size="small" style="width: 100%">
              <el-option
                v-for="tokenizer in availableTokenizers"
                :key="tokenizer.name"
                :label="tokenizer.description"
                :value="tokenizer.name"
              />
            </el-select>
          </div>

          <div class="control-item">
            <div class="item-header">
              <el-tooltip content="控制流式输出的速度，数值越大输出越快" placement="right">
                <label>输出速度</label>
              </el-tooltip>
              <span class="unit">token/秒</span>
            </div>
            <div class="slider-wrapper">
              <el-slider
                v-model="streamSpeed"
                :min="1"
                :max="500"
                :step="5"
                show-input
                :input-size="'small'"
              />
            </div>
          </div>

          <div class="control-item">
            <div class="item-header">
              <el-tooltip content="开始渲染前的等待时间，用于模拟真实场景" placement="right">
                <label>初始延迟</label>
              </el-tooltip>
              <span class="unit">毫秒</span>
            </div>
            <div class="slider-wrapper">
              <el-slider
                v-model="initialDelay"
                :min="0"
                :max="2000"
                :step="100"
                show-input
                :input-size="'small'"
              />
            </div>
          </div>

          <div class="control-item">
            <div class="item-header">
              <el-tooltip
                content="控制 AST 更新的节流时间，数值越小越实时，但性能开销越大"
                placement="right"
              >
                <label>AST 节流</label>
              </el-tooltip>
              <span class="unit">毫秒</span>
            </div>
            <div class="slider-wrapper">
              <el-slider
                v-model="throttleMs"
                :min="16"
                :max="512"
                :step="8"
                show-input
                :input-size="'small'"
              />
            </div>
          </div>

          <!-- 波动模式控制 -->
          <div class="control-item" style="margin-top: 20px">
            <div class="control-header">
              <el-tooltip
                content="开启后将随机波动延迟和字符数量，模拟真实流式输出"
                placement="right"
              >
                <label>波动模式</label>
              </el-tooltip>
              <el-switch v-model="fluctuationEnabled" />
            </div>
          </div>

          <template v-if="fluctuationEnabled">
            <div class="control-item">
              <div class="item-header">
                <el-tooltip content="每次输出的延迟时间范围" placement="right">
                  <label>延迟波动范围</label>
                </el-tooltip>
                <span class="unit">毫秒</span>
              </div>
              <div class="range-inputs">
                <el-input-number
                  v-model="delayFluctuation.min"
                  :min="10"
                  :max="delayFluctuation.max - 10"
                  :step="10"
                  size="small"
                  controls-position="right"
                />
                <span class="range-separator">~</span>
                <el-input-number
                  v-model="delayFluctuation.max"
                  :min="delayFluctuation.min + 10"
                  :max="1000"
                  :step="10"
                  size="small"
                  controls-position="right"
                />
              </div>
            </div>

            <div class="control-item">
              <div class="item-header">
                <el-tooltip content="每次输出的 token 数量范围" placement="right">
                  <label>Token 数波动范围</label>
                </el-tooltip>
                <span class="unit">token</span>
              </div>
              <div class="range-inputs">
                <el-input-number
                  v-model="charsFluctuation.min"
                  :min="1"
                  :max="charsFluctuation.max - 1"
                  :step="1"
                  size="small"
                  controls-position="right"
                />
                <span class="range-separator">~</span>
                <el-input-number
                  v-model="charsFluctuation.max"
                  :min="charsFluctuation.min + 1"
                  :max="50"
                  :step="1"
                  size="small"
                  controls-position="right"
                />
              </div>
            </div>
          </template>
        </template>
      </div>

      <!-- 元数据模拟 -->
      <div class="control-section">
        <div class="control-header">
          <el-tooltip content="模拟生成元数据（如开始时间等），用于测试计时功能" placement="right">
            <label class="control-label">元数据模拟</label>
          </el-tooltip>
          <el-switch v-model="simulateMeta" />
        </div>

        <template v-if="simulateMeta">
          <div class="control-item">
            <label>模拟项</label>
            <div style="font-size: 12px; color: var(--text-color-secondary)">
              将在流式开始时自动注入 requestStartTime，结束时注入 requestEndTime。
            </div>
          </div>
        </template>
      </div>

      <!-- LLM 思考块规则配置 -->
      <div class="control-section">
        <LlmThinkRulesEditor v-model="llmThinkRules" />
      </div>
    </InfoCard>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useRichTextRendererStore, availableVersions } from "../../store";
import { presets } from "../../presets";
import { useAgentPresets } from "@/composables/useAgentPresets";
import Avatar from "@/components/common/Avatar.vue";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";
import InfoCard from "@/components/common/InfoCard.vue";
import LlmThinkRulesEditor from "../../components/LlmThinkRulesEditor.vue";

// Props for local state
const selectedTokenizer = defineModel<string>("selectedTokenizer", { required: true });
const simulateMeta = defineModel<boolean>("simulateMeta", { required: true });

// Store
const store = useRichTextRendererStore();
const {
  selectedPreset,
  inputContent,
  streamEnabled,
  syncInputProgress,
  streamSpeed,
  initialDelay,
  throttleMs,
  fluctuationEnabled,
  delayFluctuation,
  charsFluctuation,
  rendererVersion,
  defaultRenderHtml,
  defaultCodeBlockExpanded,
  defaultToolCallCollapsed,
  allowDangerousHtml,
  enableCdnLocalizer,
  enableEnterAnimation,
  llmThinkRules,
  seamlessMode,
  profileType,
  selectedProfileId,
} = storeToRefs(store);

// Agent Presets
const { presets: agentPresets } = useAgentPresets();

// Computed
const enabledVersions = computed(() => availableVersions.filter((v) => v.enabled));
const availableTokenizers = tokenCalculatorEngine.getAvailableTokenizers();

// Methods
const loadPreset = () => {
  const preset = presets.find((p) => p.id === selectedPreset.value);
  if (preset) {
    inputContent.value = preset.content;
  }
};
</script>

<style scoped>
.config-sidebar {
  width: 360px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: 100%;
  overflow: hidden;
}

.config-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-card :deep(.el-card__body) {
  flex: 1;
  min-height: 0;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

.control-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.control-item label {
  font-size: 13px;
  color: var(--text-color-secondary);
  font-weight: 500;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.slider-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.slider-wrapper :deep(.el-slider) {
  flex: 1;
}

/* 缩窄滑块自带的输入框 */
.slider-wrapper :deep(.el-input-number--small) {
  width: 100px;
}

.unit {
  font-size: 12px;
  color: var(--text-color-light);
  white-space: nowrap;
}

.range-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-inputs :deep(.el-input-number) {
  width: 100px;
}

.range-separator {
  font-size: 14px;
  color: var(--text-color-secondary);
  font-weight: 500;
}

.version-option {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.version-option span:first-child {
  flex: 1;
}

.profile-selector {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  background-color: var(--input-bg);
  border-radius: 8px;
  border: 1px solid var(--border-color);
}

.profile-type-radio {
  display: flex;
  width: 100%;
}

.profile-type-radio :deep(.el-radio-button) {
  flex: 1;
}

.profile-type-radio :deep(.el-radio-button__inner) {
  width: 100%;
}

.agent-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}

.user-profile-mock {
  margin-top: 4px;
}

.user-profile-mock :deep(.el-alert) {
  padding: 8px 12px;
}
</style>
