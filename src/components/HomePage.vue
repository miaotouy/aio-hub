<template>
  <div class="home-page">
    <h1>欢迎使用聚合工具箱</h1>
    <p>请从左侧导航栏选择您想使用的工具。</p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'HomePage',
});
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
}

h1 {
  margin-bottom: 20px;
  color: var(--text-color);
}

p {
  color: var(--text-color-light);
}
</style>
