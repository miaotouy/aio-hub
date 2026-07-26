<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("rich-text-renderer/mermaid");
const errorHandler = createModuleErrorHandler("rich-text-renderer/mermaid");

const props = withDefaults(
  defineProps<{
    content: string;
    isStreaming?: boolean;
    isComplete?: boolean;
  }>(),
  {
    isStreaming: false,
    isComplete: true,
  }
);

const containerRef = ref<HTMLElement | null>(null);
const errorMessage = ref("");
const isAwaitingCompletion = computed(
  () => props.isStreaming && !props.isComplete
);
let renderRevision = 0;
const renderId = `aio-mobile-mermaid-${crypto.randomUUID()}`;

function mountSvg(svgMarkup: string) {
  if (!containerRef.value) throw new Error("Mermaid 容器尚未准备好");
  const documentNode = new DOMParser().parseFromString(
    svgMarkup,
    "image/svg+xml"
  );
  const svg = documentNode.documentElement;
  if (
    svg.nodeName.toLowerCase() !== "svg" ||
    svg.querySelector("parsererror")
  ) {
    throw new Error("Mermaid 返回了无效 SVG");
  }

  svg.querySelectorAll("script").forEach((node) => node.remove());
  [svg, ...svg.querySelectorAll("*")].forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const name = attribute.name.toLowerCase();
      const value = attribute.value.trim().toLowerCase();
      const isLinkReference = /^(href|xlink:href)$/.test(name);
      if (
        name.startsWith("on") ||
        (isLinkReference && !value.startsWith("#"))
      ) {
        node.removeAttribute(attribute.name);
      }
    }
  });
  containerRef.value.replaceChildren(document.importNode(svg, true));
}

async function renderDiagram() {
  const revision = ++renderRevision;
  errorMessage.value = "";
  const result = await errorHandler.wrapAsync(
    async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        fontFamily: "inherit",
      });
      const rendered = await mermaid.render(
        `${renderId}-${revision}`,
        props.content
      );
      if (revision !== renderRevision) return false;
      mountSvg(rendered.svg);
      return true;
    },
    { showToUser: false, context: { sourceLength: props.content.length } }
  );

  if (result === null) {
    errorMessage.value = "图表渲染失败，已保留原始 Mermaid 代码。";
    containerRef.value?.replaceChildren();
    return;
  }
  if (result) logger.debug("Mermaid 图表渲染完成");
}

function refreshDiagram() {
  if (isAwaitingCompletion.value) {
    renderRevision++;
    errorMessage.value = "";
    containerRef.value?.replaceChildren();
    return;
  }
  void renderDiagram();
}

onMounted(refreshDiagram);
watch(
  () => [props.content, props.isStreaming, props.isComplete],
  refreshDiagram
);
onBeforeUnmount(() => {
  renderRevision++;
});
</script>

<template>
  <section class="mermaid-diagram">
    <div ref="containerRef" class="mermaid-canvas" aria-label="Mermaid 图表" />
    <div v-if="isAwaitingCompletion" class="mermaid-pending" role="status">
      正在接收 Mermaid 图表…
    </div>
    <div v-else-if="errorMessage" class="mermaid-error" role="status">
      {{ errorMessage }}
    </div>
    <pre
      v-if="errorMessage"
      class="mermaid-source"
    ><code>{{ content }}</code></pre>
  </section>
</template>

<style scoped>
.mermaid-diagram {
  overflow: hidden;
  margin: 12px 0;
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--app-radius-md);
  background: var(--card-bg);
}

.mermaid-canvas {
  max-width: 100%;
  min-height: 48px;
  overflow: auto;
  padding: 12px;
}

.mermaid-canvas :deep(svg) {
  display: block;
  max-width: none;
  margin: 0 auto;
}

.mermaid-pending,
.mermaid-error {
  padding: 8px 12px;
  border-top: var(--border-width) solid var(--border-color);
  color: var(--danger-color);
  background: var(--input-bg);
}

.mermaid-source {
  max-height: 280px;
  margin: 0;
  overflow: auto;
  padding: 12px;
  color: var(--text-color);
  background: var(--input-bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.84rem;
  line-height: 1.45;
  white-space: pre;
}
</style>
