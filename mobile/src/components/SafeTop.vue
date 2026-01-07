<template>
  <div class="safe-top">
    <slot />
  </div>
</template>

<style scoped>
.safe-top {
  padding-top: var(--app-safe-area-top);
}
</style>