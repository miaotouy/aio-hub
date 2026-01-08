<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/i18n";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const active = ref("home");

// 根据路由更新激活状态
watch(
  () => route.path,
  (path) => {
    if (path === "/") active.value = "home";
    else if (path === "/settings") active.value = "settings";
    else active.value = "tools";
  },
  { immediate: true }
);

const handleChange = (value: string | number) => {
  const val = String(value);
  if (val === "home") router.push("/");
  else if (val === "settings") router.push("/settings");
  // 'tools' 默认留在首页或展示工具列表
};
</script>

<template>
  <var-bottom-navigation
    v-model:active="active"
    @change="handleChange"
    fixed
    safe-area
    variant
    active-color="var(--primary-color)"
  >
    <var-bottom-navigation-item :label="t('nav.首页')" name="home" icon="home" />
    <var-bottom-navigation-item :label="t('nav.工具')" name="tools" icon="magnify" />
    <var-bottom-navigation-item :label="t('nav.设置')" name="settings" icon="cog" />
  </var-bottom-navigation>
</template>