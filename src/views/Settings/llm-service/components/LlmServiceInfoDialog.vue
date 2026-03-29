<script setup lang="ts">
import { ref } from "vue";
import { Copy, Check } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { customMessage } from "@/utils/customMessage";

const visible = defineModel<boolean>({ required: true });

const NEW_API_CONFIG = '{ "AIO Hub": "aiohub://add-profile?key={key}&address={address}&name=New API 渠道" }';
const BASIC_LINK = "aiohub://add-profile?key=sk-xxx&address=https://api.example.com&name=我的服务";
const DEEPSEEK_LINK = "aiohub://add-profile?key=sk-xxx&address=https://api.deepseek.com&type=deepseek";
const FORMAT_LINK = "aiohub://add-profile?key=YOUR_API_KEY&address=API_BASE_URL&name=渠道名称&type=提供商类型";

const copiedText = ref("");

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    copiedText.value = text;
    customMessage.success("已复制到剪贴板");
    setTimeout(() => {
      if (copiedText.value === text) {
        copiedText.value = "";
      }
    }, 2000);
  } catch (err) {
    customMessage.error("复制失败");
  }
};
</script>

<template>
  <BaseDialog v-model="visible" title="LLM 服务帮助" width="700px" height="70vh">
    <template #content>
      <div class="deep-link-info">
        <p class="info-section">AIO Hub 支持通过网页链接快速添加 LLM 服务渠道</p>

        <el-divider />

        <h4 class="info-title">链接格式</h4>
        <div class="code-block-wrapper">
          <div class="code-block">
            <code>aiohub://add-profile?key=YOUR_API_KEY&address=API_BASE_URL&name=渠道名称&type=提供商类型</code>
          </div>
          <el-tooltip :content="copiedText === FORMAT_LINK ? '已复制' : '复制链接'" placement="top">
            <el-button class="copy-button" circle size="small" @click="copyToClipboard(FORMAT_LINK)">
              <Check v-if="copiedText === FORMAT_LINK" :size="14" />
              <Copy v-else :size="14" />
            </el-button>
          </el-tooltip>
        </div>

        <h4 class="info-title">参数说明</h4>
        <ul class="param-list">
          <li><strong>key</strong> (必需): API 密钥</li>
          <li><strong>address</strong> (必需): API 基础地址</li>
          <li><strong>name</strong> (可选): 渠道名称，不提供时自动生成</li>
          <li><strong>type</strong> (可选): 提供商类型，不提供时根据地址自动推断</li>
        </ul>

        <el-divider />

        <h4 class="info-title">在 New API 中配置</h4>
        <div class="newapi-config-section">
          <p class="config-description">
            如果你使用 New API 管理 API 密钥，可以在"聊天设置"中添加以下配置，让用户一键添加到 AIO Hub：
          </p>

          <div class="config-example">
            <p class="example-label">配置示例（JSON 格式）：</p>
            <div class="code-block-wrapper highlight">
              <div class="code-block">
                <code>{ "AIO Hub": "aiohub://add-profile?key={key}&address={address}&name=New API 渠道" }</code>
              </div>
              <el-tooltip :content="copiedText === NEW_API_CONFIG ? '已复制' : '复制配置'" placement="top">
                <el-button class="copy-button" circle size="small" @click="copyToClipboard(NEW_API_CONFIG)">
                  <Check v-if="copiedText === NEW_API_CONFIG" :size="14" />
                  <Copy v-else :size="14" />
                </el-button>
              </el-tooltip>
            </div>
          </div>

          <div class="config-note">
            <p><strong>变量说明：</strong></p>
            <ul>
              <li><code>{key}</code> - 自动替换为用户的 API 密钥（如 sk-xxxx）</li>
              <li><code>{address}</code> - 自动替换为 New API 服务器地址（末尾不带 / 和 /v1）</li>
            </ul>
          </div>

          <div class="config-steps">
            <p><strong>配置步骤：</strong></p>
            <ol>
              <li>登录 New API 管理后台</li>
              <li>进入"设置" → "聊天设置"</li>
              <li>找到"聊天配置"区域，切换到"JSON 编辑"模式</li>
              <li>在 JSON 数组中添加上述配置</li>
              <li>保存后，用户在 New API 首页即可看到"AIO Hub"快捷链接</li>
            </ol>
          </div>
        </div>

        <el-divider />

        <h4 class="info-title">示例链接</h4>
        <div class="example-section">
          <p class="example-label">基础示例：</p>
          <div class="code-block-wrapper">
            <div class="code-block">
              <code>{{ BASIC_LINK }}</code>
            </div>
            <el-tooltip :content="copiedText === BASIC_LINK ? '已复制' : '复制链接'" placement="top">
              <el-button class="copy-button" circle size="small" @click="copyToClipboard(BASIC_LINK)">
                <Check v-if="copiedText === BASIC_LINK" :size="14" />
                <Copy v-else :size="14" />
              </el-button>
            </el-tooltip>
          </div>
        </div>

        <div class="example-section">
          <p class="example-label">指定提供商类型：</p>
          <div class="code-block-wrapper">
            <div class="code-block">
              <code>{{ DEEPSEEK_LINK }}</code>
            </div>
            <el-tooltip :content="copiedText === DEEPSEEK_LINK ? '已复制' : '复制链接'" placement="top">
              <el-button class="copy-button" circle size="small" @click="copyToClipboard(DEEPSEEK_LINK)">
                <Check v-if="copiedText === DEEPSEEK_LINK" :size="14" />
                <Copy v-else :size="14" />
              </el-button>
            </el-tooltip>
          </div>
        </div>

        <el-divider />

        <div class="info-note">
          <p><strong>使用方式：</strong></p>
          <ol>
            <li>在浏览器中点击符合格式的链接</li>
            <li>系统会自动唤起 AIO Hub 并弹出确认对话框</li>
            <li>确认后即可完成渠道添加</li>
          </ol>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.deep-link-info {
  padding-bottom: 8px;
  line-height: 1.6;
}

.info-section {
  margin-bottom: 8px;
  color: var(--text-color);
}

.info-title {
  margin: 16px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.code-block-wrapper {
  position: relative;
  margin: 8px 0;
}

.code-block {
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  padding-right: 44px;
  overflow-x: auto;
}

.copy-button {
  position: absolute;
  right: 8px;
  top: 8px;
  background: var(--card-bg) !important;
  border-color: var(--border-color) !important;
  color: var(--text-color-secondary) !important;
  opacity: 0;
  transition: all 0.3s;
}

.code-block-wrapper:hover .copy-button,
.code-block-wrapper.highlight .copy-button {
  opacity: 1;
}

.code-block-wrapper.highlight .code-block {
  border-color: var(--el-color-primary-light-5);
  background: rgba(var(--el-color-primary-rgb), 0.02);
}

.copy-button:hover {
  color: var(--el-color-primary) !important;
  border-color: var(--el-color-primary) !important;
}

.code-block code {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 12px;
  color: var(--el-color-primary);
  word-break: break-all;
  white-space: pre-wrap;
}

.param-list {
  margin: 8px 0;
  padding-left: 24px;
}

.param-list li {
  margin: 6px 0;
  font-size: 13px;
  color: var(--text-color);
}

.param-list strong {
  color: var(--el-color-primary);
  font-family: "Consolas", "Monaco", "Courier New", monospace;
}

.example-section {
  margin: 12px 0;
}

.example-label {
  font-size: 13px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
}

.info-note {
  background: rgba(var(--el-color-primary-rgb), 0.05);
  border-left: 3px solid var(--el-color-primary);
  padding: 12px 16px;
  border-radius: 4px;
  margin-top: 16px;
}

.info-note p {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--text-color);
}

.info-note ol {
  margin: 8px 0 0;
  padding-left: 20px;
}

.info-note li {
  margin: 4px 0;
  font-size: 13px;
  color: var(--text-color);
}

.newapi-config-section {
  margin: 8px 0;
}

.config-description {
  font-size: 13px;
  color: var(--text-color);
  margin-bottom: 12px;
}

.config-example {
  margin: 12px 0;
}

.config-note {
  margin: 12px 0;
  padding: 8px 12px;
  background: rgba(var(--el-color-warning-rgb), 0.05);
  border-left: 3px solid var(--el-color-warning);
  border-radius: 4px;
}

.config-note p {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.config-note ul {
  margin: 6px 0 0;
  padding-left: 20px;
}

.config-note li {
  margin: 4px 0;
  font-size: 12px;
  color: var(--text-color);
}

.config-note code {
  background: rgba(var(--el-color-primary-rgb), 0.1);
  padding: 2px 6px;
  border-radius: 3px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 11px;
}

.config-steps {
  margin: 12px 0;
}

.config-steps p {
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.config-steps ol {
  margin: 8px 0 0;
  padding-left: 20px;
}

.config-steps li {
  margin: 6px 0;
  font-size: 13px;
  color: var(--text-color);
  line-height: 1.5;
}
</style>
