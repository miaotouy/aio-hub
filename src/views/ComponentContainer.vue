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
import { shallowRef, onMounted, computed, Component } from "vue";
import { useRoute } from "vue-router";
import { createModuleLogger } from "../utils/logger";
import { createModuleErrorHandler, ErrorLevel } from "../utils/errorHandler";
import { loadDetachableComponent } from "../config/detachable-components";

const logger = createModuleLogger("ComponentContainer");
const errorHandler = createModuleErrorHandler("ComponentContainer");
const route = useRoute();
const componentToRender = shallowRef<Component | null>(null);

// 从路由参数获取组件 ID
const componentId = computed(() => route.params.componentId as string);

// 从查询参数获取组件配置
const componentConfig = computed(() => {
  const configStr = route.query.config as string;
  if (configStr) {
    try {
      return JSON.parse(decodeURIComponent(configStr));
    } catch (error) {
      errorHandler.handle(error, {
        userMessage: "解析组件配置失败",
        context: { configStr },
        showToUser: false,
        level: ErrorLevel.ERROR,
      });
      return {};
    }
  }
  return {};
});

// 从配置中提取组件 props（排除系统字段）
const componentProps = computed(() => {
  const {
    id,
    displayName,
    type,
    width,
    height,
    mouseX,
    mouseY,
    handleOffsetX,
    handleOffsetY,
    ...props
  } = componentConfig.value;
  return props;
});

onMounted(() => {
  const id = componentId.value;
  if (id) {
    logger.info("正在加载可分离组件", {
      componentId: id,
      props: componentProps.value,
    });
    const component = loadDetachableComponent(id);
    if (component) {
      componentToRender.value = component;
    } else {
      errorHandler.handle(new Error(`未找到或未注册可分离的组件: ${id}`), {
        userMessage: "未找到或未注册可分离的组件",
        context: { componentId: id },
        showToUser: false,
        level: ErrorLevel.ERROR,
      });
    }
  } else {
    errorHandler.handle(new Error("未指定组件ID"), {
      userMessage: "未指定要加载的组件ID",
      showToUser: false,
      level: ErrorLevel.ERROR,
    });
  }
});
</script>

<template>
  <div class="component-container">
    <component
      v-if="componentToRender"
      :is="componentToRender"
      v-bind="componentProps"
      :is-detached="true"
    />
    <div v-else class="error-message">
      <h2>组件加载失败</h2>
      <p v-if="componentId">
        无法找到ID为 "<strong>{{ componentId }}</strong
        >" 的组件。
      </p>
      <p v-else>未指定要加载的组件ID。</p>
    </div>
  </div>
</template>

<style scoped>
.component-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
}

.error-message {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 100%;
  color: var(--el-color-danger);
  padding: 20px;
  text-align: center;
}
</style>
