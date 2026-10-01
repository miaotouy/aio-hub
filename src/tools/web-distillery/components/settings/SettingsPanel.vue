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
import { ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  RotateCcw,
  Sparkles,
  Sliders,
  Network,
  ExternalLink,
  Activity,
  CheckCircle2,
  AlertCircle,
} from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";
import { customMessage } from "@/utils/customMessage";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import type { RawFetchPayload } from "../../types";

const store = useWebDistilleryStore();
const logger = createModuleLogger("web-distillery/settings");
const errorHandler = createModuleErrorHandler("web-distillery/settings");

const isTestingConnection = ref(false);
const testResult = ref<{
  success: boolean;
  message: string;
} | null>(null);

// 监听配置变更，触发防抖保存
watch(
  () => store.config,
  () => {
    store.saveConfigDebounced();
  },
  { deep: true }
);

const handleReset = async () => {
  try {
    await ElMessageBox.confirm(
      "确定要将网页蒸馏室的所有偏好设置恢复为默认基线值吗？此操作无法撤销。",
      "重置确认",
      {
        confirmButtonText: "确定重置",
        cancelButtonText: "取消",
        type: "warning",
        lockScroll: false,
      }
    );
    await store.resetConfig();
    testResult.value = null;
    customMessage.success("蒸馏室设置已重置为默认值");
  } catch {
    // 用户取消操作
  }
};

const handleOpenJinaDocs = async () => {
  try {
    await openUrl("https://jina.ai/reader");
  } catch (err) {
    errorHandler.handle(err, {
      userMessage: "打开外部链接失败",
      showToUser: true,
    });
  }
};

const handleTestJinaConnection = async () => {
  const apiKey = store.config.jina.apiKey?.trim();
  isTestingConnection.value = true;
  testResult.value = null;

  try {
    const headers: Record<string, string> = {
      Accept: "text/plain, */*",
      "X-Timeout": "10",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const testUrl = "https://r.jina.ai/https://example.com";
    logger.info("Testing Jina connection", {
      hasApiKey: Boolean(apiKey),
      maskedKey: apiKey
        ? `${apiKey.slice(0, 4)}...${apiKey.slice(-3)}`
        : "none",
    });

    const payload = await invoke<RawFetchPayload>("distillery_quick_fetch", {
      url: testUrl,
      options: {
        url: testUrl,
        timeout: 10000,
        headers,
      },
    });

    if (payload.statusCode >= 200 && payload.statusCode < 300) {
      const msg = apiKey
        ? "API Key 验证通过，已成功连通 Jina Reader 云端服务！"
        : "连通成功！当前使用 Jina Reader 官方匿名免费额度 (20 RPM)。";
      testResult.value = { success: true, message: msg };
      customMessage.success(msg);
    } else {
      const errMsg = `连通失败: HTTP ${payload.statusCode}`;
      testResult.value = { success: false, message: errMsg };
      customMessage.error(errMsg);
    }
  } catch (err: any) {
    const errorMsg =
      err?.message || (typeof err === "string" ? err : "网络超时或连接失败");
    testResult.value = {
      success: false,
      message: `连通异常: ${errorMsg}`,
    };
    customMessage.error(`Jina 连接测试失败: ${errorMsg}`);
  } finally {
    isTestingConnection.value = false;
  }
};
</script>

<template>
  <div class="settings-panel-container">
    <div class="settings-header">
      <div class="header-info">
        <h3 class="header-title">蒸馏偏好设置</h3>
        <p class="header-desc">
          配置全局网页提取默认行为、Jina Reader 云端引擎凭据与底层网络沙箱参数
        </p>
      </div>
      <el-button :icon="RotateCcw" @click="handleReset" plain type="danger">
        一键重置
      </el-button>
    </div>

    <div class="settings-sections">
      <!-- 1. Jina Reader 云端引擎卡片 -->
      <section class="settings-card">
        <div class="card-header">
          <div class="card-title">
            <el-icon class="icon-accent"><Sparkles /></el-icon>
            <span>Jina Reader 云端引擎</span>
          </div>
          <el-link
            type="primary"
            class="header-link"
            :underline="false"
            @click="handleOpenJinaDocs"
          >
            获取 Jina API Key
            <el-icon class="el-icon--right"><ExternalLink /></el-icon>
          </el-link>
        </div>
        <p class="card-desc">
          通过 r.jina.ai 云端提炼管道输出高纯度 Markdown。留空时自动享受官方 20
          RPM 免费限额；配置专属 API Key 可获得更高请求配额与更低排队延迟。
        </p>

        <div class="card-body">
          <div class="form-row">
            <div class="field-label-group">
              <span class="field-title">Jina API Key</span>
              <span class="field-hint">可选。以 jina_ 开头的访问令牌</span>
            </div>
            <div class="field-control-group key-input-wrapper">
              <el-input
                v-model="store.config.jina.apiKey"
                type="password"
                show-password
                placeholder="留空即走免费限额，或填入 jina_..."
                clearable
              />
              <el-button
                :icon="Activity"
                type="primary"
                plain
                :loading="isTestingConnection"
                @click="handleTestJinaConnection"
              >
                测试连接
              </el-button>
            </div>
          </div>

          <div
            v-if="testResult"
            class="test-feedback"
            :class="{
              'is-success': testResult.success,
              'is-error': !testResult.success,
            }"
          >
            <el-icon v-if="testResult.success"><CheckCircle2 /></el-icon>
            <el-icon v-else><AlertCircle /></el-icon>
            <span>{{ testResult.message }}</span>
          </div>

          <div class="form-row">
            <div class="field-label-group">
              <span class="field-title">提炼引擎选择</span>
              <span class="field-hint">选择云端提炼算法模型</span>
            </div>
            <div class="field-control-group">
              <el-select
                v-model="store.config.jina.engine"
                style="width: 220px"
              >
                <el-option label="默认通用引擎 (Default)" value="default" />
                <el-option
                  label="ReaderLM-v2 (1.5B 提炼专用小模型)"
                  value="readerlm-v2"
                />
              </el-select>
            </div>
          </div>

          <div class="form-row">
            <div class="field-label-group">
              <span class="field-title">图像智能描述生成</span>
              <span class="field-hint"
                >启用 X-With-Generated-Alt，云端多模态引擎会自动为无描述图片生成
                alt 说明</span
              >
            </div>
            <div class="field-control-group">
              <el-switch v-model="store.config.jina.withGeneratedAlt" />
            </div>
          </div>
        </div>
      </section>

      <!-- 2. 蒸馏默认行为卡片 -->
      <section class="settings-card">
        <div class="card-header">
          <div class="card-title">
            <el-icon class="icon-accent"><Sliders /></el-icon>
            <span>默认蒸馏行为</span>
          </div>
        </div>
        <p class="card-desc">
          预设在工作台未做特殊指定时所采用的默认提取方式及文本净化格式。
        </p>

        <div class="card-body">
          <div class="form-row">
            <div class="field-label-group">
              <span class="field-title">默认提取模式</span>
              <span class="field-hint">启动蒸馏时的默认作业通道</span>
            </div>
            <div class="field-control-group">
              <el-radio-group v-model="store.config.defaultMode">
                <el-radio-button value="fast"
                  >⚡ 快速 (本地 HTTP)</el-radio-button
                >
                <el-radio-button value="smart"
                  >🧠 智能 (沙箱渲染)</el-radio-button
                >
                <el-radio-button value="jina"
                  >🌐 Jina (云端提炼)</el-radio-button
                >
              </el-radio-group>
            </div>
          </div>

          <div class="form-row">
            <div class="field-label-group">
              <span class="field-title">默认输出格式</span>
              <span class="field-hint">蒸馏完成后优先呈递的目标文本类型</span>
            </div>
            <div class="field-control-group">
              <el-select
                v-model="store.config.defaultFormat"
                style="width: 200px"
              >
                <el-option label="Markdown 正文" value="markdown" />
                <el-option label="纯文本 (Text)" value="text" />
                <el-option label="清洗后 HTML" value="html" />
                <el-option label="JSON 结构化对象" value="json" />
              </el-select>
            </div>
          </div>

          <div class="form-row">
            <div class="field-label-group">
              <span class="field-title">默认开启纯净模式</span>
              <span class="field-hint"
                >过滤提炼结果中的全部超级链接语法，避免长篇外链造成阅读干扰</span
              >
            </div>
            <div class="field-control-group">
              <el-switch v-model="store.config.defaultCleanMode" />
            </div>
          </div>
        </div>
      </section>

      <!-- 3. 网络与沙箱渲染卡片 -->
      <section class="settings-card">
        <div class="card-header">
          <div class="card-title">
            <el-icon class="icon-accent"><Network /></el-icon>
            <span>网络与沙箱渲染控制</span>
          </div>
        </div>
        <p class="card-desc">
          调节底层 HTTP 请求超时时间与智能模式沙箱 WebView
          内的动态滚动等待策略。
        </p>

        <div class="card-body">
          <div class="form-row">
            <div class="field-label-group">
              <span class="field-title">网络抓取超时时间 (毫秒)</span>
              <span class="field-hint"
                >超过该阈值时自动终止底层连接并提示失败 (5,000ms -
                60,000ms)</span
              >
            </div>
            <div class="field-control-group slider-control-group">
              <el-slider
                v-model="store.config.network.timeout"
                :min="5000"
                :max="60000"
                :step="1000"
                style="width: 200px"
              />
              <el-input-number
                v-model="store.config.network.timeout"
                :min="5000"
                :max="60000"
                :step="1000"
                style="width: 130px"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="field-label-group">
              <span class="field-title">智能模式自动滚动次数</span>
              <span class="field-hint"
                >在沙箱中加载动态页面时，最大模拟滚动探底次数以激活图片懒加载</span
              >
            </div>
            <div class="field-control-group">
              <el-input-number
                v-model="store.config.network.maxAutoScrolls"
                :min="0"
                :max="10"
                :step="1"
                style="width: 140px"
              />
            </div>
          </div>

          <div class="form-row">
            <div class="field-label-group">
              <span class="field-title">滚动间隔停顿 (毫秒)</span>
              <span class="field-hint"
                >每次模拟滚动触发后的停留等待时间，等待前端渲染流水线响应</span
              >
            </div>
            <div class="field-control-group">
              <el-input-number
                v-model="store.config.network.scrollDelay"
                :min="200"
                :max="3000"
                :step="100"
                style="width: 140px"
              />
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.settings-panel-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 8px 12px 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.header-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-desc {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.settings-sections {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.icon-accent {
  color: var(--el-color-primary);
}

.card-desc {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.card-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 4px;
}

.form-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  padding-top: 12px;
  border-top: var(--border-width) solid
    rgba(var(--el-border-color-rgb, 128, 128, 128), 0.12);
}

.form-row:first-child {
  border-top: none;
  padding-top: 0;
}

.field-label-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.field-title {
  font-size: 13.5px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.field-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.field-control-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.key-input-wrapper {
  flex: 1;
  max-width: 440px;
}

.slider-control-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

.test-feedback {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12.5px;
}

.test-feedback.is-success {
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-success);
  border: var(--border-width) solid rgba(var(--el-color-success-rgb), 0.25);
}

.test-feedback.is-error {
  background-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.12)
  );
  color: var(--el-color-danger);
  border: var(--border-width) solid rgba(var(--el-color-danger-rgb), 0.25);
}

@media (max-width: 640px) {
  .form-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .field-control-group {
    width: 100%;
    justify-content: flex-start;
  }

  .key-input-wrapper {
    max-width: 100%;
  }
}
</style>
