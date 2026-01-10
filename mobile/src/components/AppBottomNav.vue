<script setup lang="ts">
import { ref, watch, computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "@/i18n";
import { toolManager } from "@/utils/toolManager";
import ToolIcon from "@/components/ToolIcon.vue";

const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const active = ref("home");

// 记录最后访问的工具路径
const lastToolPath = ref("");

// 获取最后访问工具的信息（用于显示在导航栏）
const lastTool = computed(() => {
  return toolManager.getToolByPath(lastToolPath.value);
});

// 根据路由更新激活状态
watch(
  () => route.path,
  (path) => {
    if (path === "/") {
      active.value = "home";
    } else if (path === "/settings") {
      active.value = "settings";
    } else {
      active.value = "tools";
      // 如果是工具路径，则记录
      const tool = toolManager.getToolByPath(path);
      if (tool) {
        lastToolPath.value = path;
      }
    }
  },
  { immediate: true }
);

const handleChange = (value: string | number) => {
  const val = String(value);
  if (val === "home") {
    router.push("/");
  } else if (val === "settings") {
    router.push("/settings");
  } else if (val === "tools") {
    // 如果有记录的工具路径，则跳回，否则跳回首页（或工具中心）
    if (lastToolPath.value && route.path !== lastToolPath.value) {
      router.push(lastToolPath.value);
    } else if (route.path !== "/") {
      router.push("/");
    }
  }
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

    <var-bottom-navigation-item
      name="tools"
      :label="lastTool ? lastTool.name : t('nav.工具')"
      :icon="!lastTool ? 'apps' : undefined"
    >
      <template v-if="lastTool" #icon>
        <ToolIcon :icon="lastTool.icon" :size="22" />
      </template>
    </var-bottom-navigation-item>

    <var-bottom-navigation-item :label="t('nav.设置')" name="settings" icon="cog" />
  </var-bottom-navigation>
</template>
