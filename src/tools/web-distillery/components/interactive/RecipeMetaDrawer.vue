<script setup lang="ts">
import { computed, ref, onMounted } from "vue";
import { Save, Info, Cookie } from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";
import { cookieProfileStore } from "../../core/cookie-profile-store";
import { customMessage } from "@/utils/customMessage";
import { invoke } from "@tauri-apps/api/core";
import type { CookieProfile } from "../../types";

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits(["update:modelValue", "saved"]);

const store = useWebDistilleryStore();

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val),
});

// 身份卡片列表
const allProfiles = ref<CookieProfile[]>([]);

onMounted(async () => {
  await cookieProfileStore.load();
  allProfiles.value = await cookieProfileStore.getAll();
});

const handleSave = async () => {
  if (!store.recipeDraft) return;

  if (!store.recipeDraft.name || !store.recipeDraft.domain) {
    customMessage.warning("请填写配方名称和域名");
    return;
  }

  try {
    // 调用后端的 upsert_recipe
    await invoke("distillery_upsert_recipe", { recipe: store.recipeDraft });

    customMessage.success("配方保存成功");
    store.isDraftDirty = false;
    visible.value = false;
    emit("saved");
  } catch (err) {
    customMessage.error("保存失败: " + err);
  }
};
</script>

<template>
  <el-drawer v-model="visible" title="保存配方" size="400px" direction="rtl" append-to-body>
    <div class="meta-drawer-content" v-if="store.recipeDraft">
      <el-form label-position="top">
        <el-form-item label="配方名称" required>
          <el-input v-model="store.recipeDraft.name" placeholder="例如：简书文章提取" />
        </el-form-item>

        <el-form-item label="目标域名 (Domain)" required>
          <el-input v-model="store.recipeDraft.domain" placeholder="例如：jianshu.com" />
        </el-form-item>

        <el-form-item label="路径匹配模式 (Path Pattern)">
          <el-input v-model="store.recipeDraft.pathPattern" placeholder="例如：/p/*" />
          <div class="form-tip">支持 Glob 模式，* 匹配所有路径</div>
        </el-form-item>

        <el-form-item label="绑定身份卡片">
          <el-select
            v-model="store.recipeDraft.cookieProfile"
            placeholder="不绑定（使用当前激活身份）"
            clearable
            style="width: 100%"
          >
            <el-option
              v-for="profile in allProfiles"
              :key="profile.id"
              :label="`${profile.name} (${profile.domain})`"
              :value="profile.id"
            >
              <div class="profile-option">
                <Cookie :size="12" class="profile-option-icon" />
                <span>{{ profile.name }}</span>
                <span class="profile-option-domain">{{ profile.domain }}</span>
              </div>
            </el-option>
          </el-select>
          <div class="form-tip">绑定后，使用此配方蒸馏时将自动携带指定身份的 Cookie</div>
        </el-form-item>

        <el-divider>规则摘要</el-divider>

        <div class="summary-stats">
          <div class="stat-item">
            <span class="stat-label">包含规则:</span>
            <span class="stat-value">{{ store.recipeDraft.extractSelectors?.length || 0 }} 条</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">排除规则:</span>
            <span class="stat-value">{{ store.recipeDraft.excludeSelectors?.length || 0 }} 条</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">动作序列:</span>
            <span class="stat-value">{{ store.recipeDraft.actions?.length || 0 }} 步</span>
          </div>
        </div>

        <div class="info-alert">
          <el-icon><Info /></el-icon>
          <span>保存后，此配方将自动应用于匹配的 URL，提升蒸馏效果。</span>
        </div>
      </el-form>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" @click="handleSave">
          <el-icon><Save /></el-icon>
          <span>确认保存</span>
        </el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.meta-drawer-content {
  padding: 0 4px;
}

.form-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}

.summary-stats {
  background-color: var(--sidebar-bg);
  padding: 12px;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 20px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.stat-label {
  color: var(--el-text-color-regular);
}

.stat-value {
  font-weight: bold;
  color: var(--el-color-primary);
}

.info-alert {
  display: flex;
  gap: 8px;
  padding: 12px;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  border-radius: 6px;
  color: var(--el-color-primary);
  font-size: 12px;
  line-height: 1.4;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.profile-option {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.profile-option-icon {
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.profile-option-domain {
  margin-left: auto;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
