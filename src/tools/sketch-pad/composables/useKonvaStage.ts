import { ref, onUnmounted } from "vue";
import Konva from "konva";

export function useKonvaStage() {
  const stage = ref<Konva.Stage | null>(null);
  const zoom = ref<number>(1);
  const panX = ref<number>(0);
  const panY = ref<number>(0);

  function initStage(container: HTMLDivElement, width: number, height: number) {
    const newStage = new Konva.Stage({
      container,
      width,
      height,
    });

    stage.value = newStage;

    // 绑定滚轮缩放事件
    newStage.on("wheel", (e) => {
      e.evt.preventDefault();
      const oldScale = newStage.scaleX();
      const pointer = newStage.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const scaleBy = 1.1;
      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;

      // 限制缩放范围 10% ~ 3000%
      const clampedScale = Math.max(0.1, Math.min(30, newScale));

      newStage.scale({ x: clampedScale, y: clampedScale });
      const newPos = {
        x: pointer.x - (pointer.x - newStage.x()) * (clampedScale / oldScale),
        y: pointer.y - (pointer.y - newStage.y()) * (clampedScale / oldScale),
      };
      newStage.position(newPos);
      newStage.batchDraw();

      zoom.value = clampedScale;
      panX.value = newPos.x;
      panY.value = newPos.y;
    });

    // 监听拖拽事件更新 panX 和 panY
    newStage.on("dragend", () => {
      panX.value = newStage.x();
      panY.value = newStage.y();
    });

    return newStage;
  }

  function setZoom(newZoom: number) {
    if (!stage.value) return;
    const clampedZoom = Math.max(0.1, Math.min(30, newZoom));
    stage.value.scale({ x: clampedZoom, y: clampedZoom });
    stage.value.batchDraw();
    zoom.value = clampedZoom;
  }

  function resetView(
    width: number,
    height: number,
    containerWidth: number,
    containerHeight: number
  ) {
    if (!stage.value) return;

    // 计算自适应缩放比例，使画布居中并完整显示
    const scaleX = containerWidth / width;
    const scaleY = containerHeight / height;
    const newZoom = Math.min(scaleX, scaleY, 1) * 0.9; // 留出 10% 边距

    const x = (containerWidth - width * newZoom) / 2;
    const y = (containerHeight - height * newZoom) / 2;

    stage.value.scale({ x: newZoom, y: newZoom });
    stage.value.position({ x, y });
    stage.value.batchDraw();

    zoom.value = newZoom;
    panX.value = x;
    panY.value = y;
  }

  function destroyStage() {
    if (stage.value) {
      stage.value.destroy();
      stage.value = null;
    }
  }

  onUnmounted(() => {
    destroyStage();
  });

  return {
    stage,
    zoom,
    panX,
    panY,
    initStage,
    setZoom,
    resetView,
    destroyStage,
  };
}
