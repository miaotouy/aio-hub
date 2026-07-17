<template>
  <main class="knowledge-base-shell" aria-label="知识资料库">
    <section>
      <h1>知识资料库</h1>
      <p>文档资料库将在后续版本提供。</p>
    </section>
  </main>
</template>

<style scoped>
.knowledge-base-shell {
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--el-text-color-secondary);
  background: var(--card-bg);
}

section {
  max-width: 360px;
  padding: 24px;
  text-align: center;
}

h1 {
  margin: 0 0 8px;
  color: var(--el-text-color-primary);
  font-size: 20px;
  font-weight: 600;
}

p {
  margin: 0;
}
</style>
