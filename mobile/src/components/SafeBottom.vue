<template>
  <div class="safe-bottom">
    <slot />
  </div>
</template>

<style scoped>
.safe-bottom {
  padding-bottom: constant(safe-area-inset-bottom);
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
