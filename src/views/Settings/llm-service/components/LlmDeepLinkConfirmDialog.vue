<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import { AlertTriangle, ShieldCheck, Globe, Key, Tag, Fingerprint } from "lucide-vue-next";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useDeepLinkStore } from "@/stores/deepLink";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const router = useRouter();
const deepLinkStore = useDeepLinkStore();
const { profiles, saveProfile } = useLlmProfiles();
const errorHandler = createModuleErrorHandler("DeepLinkConfirm");

const profile = computed(() => deepLinkStore.pendingProfile);

// 检查是否已存在相同的 API Key 或地址
const isDuplicate = computed(() => {
  if (!profile.value) return false;
  return profiles.value.some(
    (p) => 
      p.baseUrl.replace(/\/+$/, "") === profile.value!.baseUrl.replace(/\/+$/, "") && 
      p.apiKeys[0] === profile.value!.apiKeys[0]
  );
});

const maskKey = (key: string) => {
  if (!key) return "";
  if (key.length <= 8) return "********";
  return `${key.substring(0, 4)}****${key.substring(key.length - 4)}`;
};

const handleConfirm = async () => {
  if (!profile.value) return;

  try {
    if (isDuplicate.value) {
      customMessage.warning("该渠道已存在，不再重复添加");
      deepLinkStore.closeConfirm();
      return;
    }

    await saveProfile(profile.value);
    customMessage.success("渠道添加成功");
    deepLinkStore.closeConfirm();

    // 导航到设置页面
    router.push({ path: "/settings", query: { section: "llm-service" } });
  } catch (e) {
    errorHandler.error(e, "添加渠道失败");
  }
};

const handleCancel = () => {
  deepLinkStore.closeConfirm();
};
</script>

<template>
  <BaseDialog
    v-model="deepLinkStore.isConfirmVisible"
    :title="`为 ${profile?.name || '新渠道'} 添加 API 密钥`"
    width="480px"
    height="auto"
    @close="handleCancel"
  >
    <template #content>
      <div v-if="profile" class="confirm-container">
        <div class="alert-header">
          <el-icon class="warning-icon"><AlertTriangle /></el-icon>
          <span class="warning-text">检测到来自链接的渠道配置</span>
        </div>

        <div class="info-list">
          <div class="info-item">
            <div class="item-label">
              <el-icon><Tag /></el-icon>
              <span>服务商名称</span>
            </div>
            <div class="item-value">{{ profile.name }}</div>
          </div>

          <div class="info-item">
            <div class="item-label">
              <el-icon><Fingerprint /></el-icon>
              <span>服务商 ID</span>
            </div>
            <div class="item-value code">{{ profile.type }}</div>
          </div>

          <div class="info-item">
            <div class="item-label">
              <el-icon><Globe /></el-icon>
              <span>基础 URL</span>
            </div>
            <div class="item-value code">{{ profile.baseUrl }}</div>
          </div>

          <div class="info-item">
            <div class="item-label">
              <el-icon><Key /></el-icon>
              <span>API 密钥</span>
            </div>
            <div class="item-value code">{{ maskKey(profile.apiKeys[0]) }}</div>
          </div>
        </div>

        <div v-if="isDuplicate" class="duplicate-hint">
          <el-icon><ShieldCheck /></el-icon>
          <span>该渠道已存在相同配置，不会重复添加</span>
        </div>
        <div v-else class="confirm-hint">
          确认要将此渠道添加到您的服务列表中吗？
        </div>
      </div>
    </template>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleCancel">取消</el-button>
        <el-button type="primary" :disabled="isDuplicate" @click="handleConfirm">
          确认添加
        </el-button>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.confirm-container {
  padding: 8px 4px;
}

.alert-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  padding: 12px;
  background: rgba(var(--el-color-warning-rgb), 0.1);
  border-radius: 8px;
  border: 1px solid rgba(var(--el-color-warning-rgb), 0.2);
}

.warning-icon {
  font-size: 20px;
  color: var(--el-color-warning);
}

.warning-text {
  font-weight: 600;
  color: var(--text-color);
  font-size: 15px;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--input-bg);
  padding: 16px;
  border-radius: 8px;
  border: var(--border-width) solid var(--border-color);
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.item-label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-color-secondary);
  font-size: 13px;
  white-space: nowrap;
}

.item-value {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  word-break: break-all;
}

.item-value.code {
  font-family: var(--el-font-family-mono);
  color: var(--el-color-primary);
}

.duplicate-hint {
  margin-top: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--el-color-success);
  font-size: 13px;
  font-weight: 500;
}

.confirm-hint {
  margin-top: 20px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>