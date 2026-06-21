# Smart OCR 批量识别性能优化计划书

## 项目状态

- 模块 ID：`smart-ocr`
- 变更类型：性能专项优化（零拷贝传输 + 并行推理）
- 关联计划：[`paddle-ocr-plugin-migration.md`](../../../../../docs/Plan/paddle-ocr-plugin-migration.md)

---

## 1. 现状分析与痛点

目前 Smart OCR 在处理长图切割后的批量识别时，存在明显的性能瓶颈。当一张长图被切割为 $N$ 个子块（通常为 10~30 个）时，识别链路如下：

1. **前端切图**：[`useImageSlicer.ts`](../../composables/useImageSlicer.ts) 将 Canvas 切割为多个子块，并生成对应的 Base64 `dataUrl`。
2. **跨进程传输**：[`plugin-engine.ts`](../../platform/plugin-engine.ts) 将包含所有子块 Base64 数据的巨大 JSON 结构通过 stdio 管道发送给 `paddle-ocr` sidecar 进程。
3. **Sidecar 解码**：Sidecar 进程对每个子块的 Base64 进行解码，并重新在内存中还原为图片张量。
4. **串行推理**：Sidecar 内部使用简单的 `for` 循环，对 $N$ 个子块进行串行推理。

### 核心痛点：

- **I/O 与序列化开销极大**：大文本 Base64 在 `前端 -> 主应用 -> Sidecar` 的双重跨进程传输中，会导致严重的 CPU 编解码和内存拷贝开销，传输耗时甚至超过了推理本身。
- **重复解码开销**：Sidecar 进程在 CPU 上对 $N$ 个子块进行重复的图片解码，非常昂贵。
- **未利用多核性能**：Sidecar 内部串行推理，无法发挥现代多核 CPU 的并行计算优势。

---

## 2. 优化目标

配合 `paddle-ocr` 插件的常驻化重构，对 Smart OCR 的批量识别链路进行专项性能压榨：

1. **零拷贝临时文件传输 (Zero-Copy Temp Files)**：
   - 前端切图后，不生成 Base64，而是将 Canvas 导出为二进制 `Blob` / `ArrayBuffer`。
   - 通过主应用批量写入系统临时目录，生成本地临时图片路径（`path`）。
   - 传输协议中优先使用 `path`，彻底消除 stdio 管道中的大文本传输开销。

2. **Sidecar 侧多线程并行推理 (Rayon Parallel Inference)**：
   - 在 `paddle-ocr` 侧引入 `rayon` 库，将串行循环升级为并行通道，利用多核 CPU 并行处理多个子块的图片读取、解码与推理。

3. **完善的临时文件生命周期管理**：
   - 确保临时图片在识别完成后（无论成功、失败还是取消）都能被主应用安全、自动地清理，避免磁盘空间残留。

---

## 3. 详细设计

### 3.1 零拷贝传输链路设计

```
[前端 (Smart OCR)]
       │
       ├─ 1. Canvas 导出为 Blob/ArrayBuffer (二进制)
       │
       ▼
[主应用 (Tauri Command: write_temp_ocr_images)]
       │
       ├─ 2. 极速写入临时目录 (e.g., AppData/Local/Temp/aiohub-ocr/)
       ├─ 3. 返回本地绝对路径列表 [path_1, path_2, ...]
       │
       ▼
[前端 (plugin-engine.ts)]
       │
       ├─ 4. 组装 OcrImageInput，仅传入 path，不传 dataUrl（遵循基础设施统一临时文件规范）
       │
       ▼
[Sidecar (paddle-ocr)]
       │
       └─ 5. 直接读盘 (fs::read)，消除 stdio 管道大文本传输
```

### 3.2 协议适配

在 [`src/tools/smart-ocr/platform/types.ts`](../../platform/types.ts) 中，扩展 `OcrImageInput` 结构体，支持可选的 `path` 字段：

```typescript
export interface OcrImageInput {
  id: string;
  groupId?: string;
  /** 本地临时图片路径（零拷贝优先） */
  path?: string;
  /** 兼容现有行为：path 不存在时回退到 dataUrl */
  dataUrl?: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}
```

在 [`src/tools/smart-ocr/platform/plugin-engine.ts`](../../platform/plugin-engine.ts) 中，适配 `ocrImageToPluginImage` 转换逻辑：

```typescript
export function ocrImageToPluginImage(image: OcrImageInput) {
  return {
    blockId: image.id,
    imageId: image.groupId ?? image.id,
    path: image.path, // 优先传递本地路径
    dataUrl: image.path ? undefined : image.dataUrl, // 存在 path 时不发送 dataUrl
    width: image.width,
    height: image.height,
    metadata: image.metadata,
  };
}
```

### 3.3 Sidecar 侧并行推理设计

在 `aiohub-paddle-ocr` 侧，引入 `rayon` 库。在 `recognize_batch` 中，将串行循环：

```rust
for (index, image) in request.images.iter().enumerate() {
    results.push(recognize_single_image(&engine, image));
}
```

升级为并行通道（需确保 `PaddleOcrEngine` 的推理方法支持并发，或在内部进行线程安全同步）：

```rust
use rayon::prelude::*;

let results: Vec<PaddleOcrImageResult> = request.images
    .par_iter()
    .map(|image| recognize_single_image(&engine, image))
    .collect();
```

---

## 4. 实施步骤

### 阶段 A：主应用侧临时文件支持

1. **复用统一临时文件 Command**：使用基础设施计划（`sidecar-resident-infrastructure.md` 第 5 节）提供的 `write_temp_files` 和 `cleanup_temp_files` Command，不另造 Commands。
   - 写入目录：`${appDataDir}/temp/aiohub-shared/ocr/`（统一临时文件管理规范）。
   - 清理策略：调用 `cleanup_temp_files` 在识别完成（成功/失败/取消）后清理；临时由主应用启动时兜底清除超过 24 小时的残留文件。

### 阶段 B：前端零拷贝适配

1. **重构切图导出**：修改 [`useSmartOcrRunner.ts`](../../composables/useSmartOcrRunner.ts)，在切图后，将 Canvas 转换为二进制数据，调用 `write_temp_ocr_images` 写入本地。
2. **适配 Runner 调度**：在 `runFullOcrProcess` 中，将生成的本地路径绑定到 `ImageBlock` 的 `path` 属性上。
3. **生命周期挂钩**：在 `finally` 块中，无论识别成功、失败还是被取消，均调用 `clear_temp_ocr_images` 进行物理清理。

### 阶段 C：Sidecar 侧并行化与路径读取

1. **支持 `path` 读取**：修改 `aiohub-paddle-ocr` 的 `recognize_single_image`，若 `path` 存在则直接 `fs::read`，否则回退到 Base64 解码。
2. **引入 `rayon` 并行化**：在 `Cargo.toml` 中引入 `rayon`，重构批量识别循环为并行迭代器。

---

## 5. 依赖关系

```
smart-ocr-performance-optimization  (本计划)
    └── paddle-ocr-plugin-migration  (paddle-ocr 常驻化 + Broker 模式就绪后，
         本计划的零拷贝和并行推理才能跑通)
    └── sidecar-resident-infrastructure  (统一临时文件 Commands 就绪后，
         本计划的阶段 A 才能开工)
```

> smart-ocr 作为内置工具（非 sidecar 插件），它的调用链路是：前端 → Tauri invoke → `SidecarPluginManager` → Broker 中转 → paddle-ocr sidecar。因此基础设施的 Broker 模式和统一临时文件命令必须先就绪。

## 6. 验收清单

- [ ] 前端切图后成功生成本地临时图片，且 stdio 管道中不再传输 Base64 文本。
- [ ] paddle-ocr sidecar 通过 Broker 模式正确读取本地临时路径并完成识别，结果与 Base64 一致。
- [ ] 临时图片在识别完成（成功/失败/取消）后被物理删除，无残留。
- [ ] Sidecar 侧并行推理工作正常，多核 CPU 利用率明显提升。
- [ ] 批量识别（15 块以上）整体耗时相比优化前降低 50% 以上。
