<script setup lang="ts">
import BaseDialog from "@/components/common/BaseDialog.vue";
import { Cpu, Power, Zap, Info } from "lucide-vue-next";

const props = defineProps<{
  modelValue: boolean;
}>();

const toolsMacro = "{{tools}}";
const toolsMacroWithArgs = "{{tools::toolId1::toolId2}}";
const toolUsageMacro = "{{tool_usage}}";
const toolContextMacro = "{{tool_context}}";
const toolContextMacroWithArgs = "{{tool_context::toolId1}}";

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const handleClose = () => {
  emit("update:modelValue", false);
};
</script>

<template>
  <BaseDialog
    :model-value="props.modelValue"
    title="工具调用 (Agent) 控制功能说明"
    width="720px"
    @close="handleClose"
  >
    <template #content>
      <div class="help-content">
        <div class="help-section">
          <div class="section-title">
            <Cpu :size="16" class="title-icon" />
            <span>核心控制维度</span>
          </div>
          <p class="section-desc">
            工具调用包含两个完全独立的控制维度：<strong>启用状态 (电源)</strong>
            与 <strong>自动批准 (闪电)</strong>。
          </p>

          <div class="dimension-cards">
            <div class="dimension-card">
              <div class="card-header">
                <Power :size="14" class="power-icon" />
                <span>启用状态 (Power)</span>
              </div>
              <div class="card-body">
                <p>
                  控制工具或方法是否对智能体开放和提供工具说明。关闭时智能体无法绕开调用。
                </p>
                <ul>
                  <li>
                    <strong>工具级：</strong>
                    关闭后，该工具的所有方法被彻底拉闸，即使智能体尝试调用也会返回错误。
                  </li>
                  <li>
                    <strong>方法级：</strong>
                    可单独拉闸工具内的某个特定方法，该方法的调用会被拦截。
                  </li>
                </ul>
              </div>
            </div>

            <div class="dimension-card">
              <div class="card-header">
                <Zap :size="14" class="zap-icon" />
                <span>自动批准 (Zap)</span>
              </div>
              <div class="card-body">
                <p>控制智能体调用工具时是否需要你手动点击同意。</p>
                <ul>
                  <li>
                    <strong>全局：</strong>
                    总闸。设为手动模式时，所有自动批准均失效。
                  </li>
                  <li>
                    <strong>工具级：</strong>
                    开启后，该工具的所有方法默认自动批准。
                  </li>
                  <li>
                    <strong>方法级：</strong>
                    可单独为高频/安全的方法开启自动批准。
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div class="help-section">
          <div class="section-title">
            <Zap :size="16" class="title-icon zap-icon" />
            <span>自动批准 优先级与覆盖关系</span>
          </div>
          <div class="relation-flow">
            <div class="flow-step">
              <div class="step-badge">1</div>
              <div class="step-text">
                <strong>全局总闸 (底部"自动批准"开关)</strong>
                <span>
                  必须处于开启状态。如果全局为手动模式，所有工具和方法的自动批准开关均不生效。
                </span>
              </div>
            </div>
            <div class="flow-arrow">→</div>
            <div class="flow-step">
              <div class="step-badge">2</div>
              <div class="step-text">
                <strong>方法级自动批准 (方法旁)</strong>
                <span>
                  拥有最高优先级。即使工具级自动批准是关闭的，只要单独开启了该方法的
                  自动批准，它依然会自动执行。
                </span>
              </div>
            </div>
            <div class="flow-arrow">→</div>
            <div class="flow-step">
              <div class="step-badge">3</div>
              <div class="step-text">
                <strong>工具级自动批准 (工具旁)</strong>
                <span>
                  作为工具内所有方法的默认值。开启后，工具内未单独设置的方法都会自动批准。
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="help-section">
          <div class="section-title">
            <Info :size="16" class="title-icon info-icon" />
            <span>提示词宏与注入说明</span>
          </div>
          <div class="macro-info">
            <div class="macro-item">
              <code>{{ toolsMacro }}</code>
              <span>
                注入当前启用的工具和方法定义，让模型知道自己有哪些工具可用。
                支持通过参数指定工具 ID 列表（如
                <code>{{ toolsMacroWithArgs }}</code>
                ）。
              </span>
            </div>
            <div class="macro-item">
              <code>{{ toolUsageMacro }}</code>
              <span>
                注入工具调用的当前协议模板格式（如vcp）的说明，指导模型如何正确输出工具调用格式。
              </span>
            </div>
            <div class="macro-item">
              <code>{{ toolContextMacro }}</code>
              <span>
                注入当前已启用工具的实时运行时上下文数据，支持通过参数指定工具
                ID 列表 （如<code>{{ toolContextMacroWithArgs }}</code
                >）。
              </span>
            </div>
            <div class="macro-item">
              <strong>保底注入</strong>
              <span>
                如果你的角色设定提示词中忘记添加
                <code>{{ toolsMacro }}</code>
                宏，开启保底注入后，系统会自动在对话历史前追加工具定义。
              </span>
            </div>
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <el-button type="primary" size="small" @click="handleClose">
        我知道了
      </el-button>
    </template>
  </BaseDialog>
</template>

<style scoped>
.help-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 4px;
}

.help-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.title-icon {
  color: var(--el-color-primary);
}

.zap-icon {
  color: var(--el-color-warning) !important;
}

.power-icon {
  color: var(--el-color-success) !important;
}

.info-icon {
  color: var(--el-color-info) !important;
}

.section-desc {
  font-size: 12px;
  color: var(--el-text-color-regular);
  margin: 0;
  line-height: 1.5;
}

.dimension-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-top: 4px;
}

.dimension-card {
  background: var(--el-fill-color-blank);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.card-body {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.5;
}

.card-body p {
  margin: 0 0 6px 0;
}

.card-body ul {
  margin: 0;
  padding-left: 16px;
}

.card-body li {
  margin-bottom: 4px;
}

.relation-flow {
  background: var(--el-fill-color-lighter);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.flow-step {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.step-badge {
  background: var(--el-color-primary-light-8);
  color: var(--el-color-primary);
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: bold;
  flex-shrink: 0;
  margin-top: 2px;
}

.step-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}

.step-text strong {
  color: var(--el-text-color-primary);
}

.step-text span {
  font-size: 11px;
  color: var(--el-text-color-secondary);
  line-height: 1.4;
}

.flow-arrow {
  font-size: 12px;
  color: var(--el-text-color-placeholder);
  padding-left: 5px;
  margin: -2px 0;
}

.macro-info {
  background: var(--el-fill-color-blank);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.macro-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.macro-item code {
  align-self: flex-start;
  background: var(--el-fill-color-light);
  color: var(--el-color-primary);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--el-font-family-mono);
  font-weight: bold;
}
</style>
