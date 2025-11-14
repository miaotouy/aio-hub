# 硬字幕提取器：技术设计文档

## 1. 概述

本文档概述了“硬字幕提取器”工具的技术设计，这是“All-in-One Tools”应用的一个新功能。该工具旨在通过利用原生 FFmpeg 处理和现有的 Smart OCR 服务，从视频文件的硬编码字幕中提取文本。

## 2. 核心架构

该工具将采用一种混合架构，结合 Tauri Rust 后端和 Vue 前端的优势：

-   **后端 (Tauri/Rust)**: 负责重量级任务，特别是视频处理。它将调用用户提供的本地 FFmpeg 可执行文件来处理帧提取和预处理，确保高性能和非阻塞的用户界面。
-   **前端 (Vue)**: 管理用户界面、交互逻辑、实时预览以及 OCR 流程的编排。
-   **通信**: 数据将使用 Tauri 事件以流式方式从后端流向前端。原始图像数据将通过内存管道 (`stdout`) 传递，而不是写入临时文件，以实现最高效率和最少的磁盘 I/O。

这种架构避免了捆绑庞大的 `ffmpeg.wasm` 库，防止了在视频处理过程中 UI 冻结，并提供了无缝、响应迅速的用户体验。

## 3. 工作流图

端到端的工作流程如下图所示：

```mermaid
graph TD
    subgraph 前端 (Vue)
        A[1. 加载视频 & 框选字幕区域] --> B[2. 滤镜调试];
        subgraph B
            direction LR
            B1[截取预览帧] --> B2[UI: 滑块/颜色拾取器];
            B2 --> B3[实时预览处理效果];
            B3 --> B4[保存滤镜参数];
        end
        B --> C[3. 开始提取];
        C -- Tauri Command (含视频路径、裁剪区域、滤镜参数) --> D;
        
        subgraph OCR & 字幕生成
            F[Tauri 事件监听器] -- 接收处理后的图像数据 (bytes) --> G[6a. 字节 -> Blob -> 对象 URL];
            G -- 内存 URL --> H[6b. 调用 SmartOcrService];
            H -- OCR 结果 --> I[7. 处理字幕 (去重、时间戳)];
        end
        
        I --> J[8. 实时显示 & 编辑];
        J --> K[9. 导出为 .srt 文件];
    end

    subgraph 后端 (Tauri - Rust)
        D[4. Rust 命令处理器];
        D -- std::process::Command --> E[5. 调用本地 FFmpeg, 应用滤镜并输出到 stdout];
        E -- PNG 数据流通过 stdout 管道 --> F;
    end
```

## 4. 组件与 API 设计

### 4.1. 前端组件 (Vue)

该工具将被封装在 `src/tools/hard-subtitle-extractor/` 目录中。

-   **`HardSubtitleExtractor.vue`**: 主视图组件，负责编排所有其他子组件。
-   **`components/VideoPlayer.vue`**: 用于视频预览的组件，允许用户绘制边界框以选择字幕区域。
-   **`components/FilterPanel.vue`**: 包含两个独立区域的配置面板。
    -   **区域1: 图像滤镜调试**: 用于通用图像增强，产出 `filter_string`。提供可视化模式（滑块控制亮度、对比度、二值化等）和高级模式（直接编写 FFmpeg `-vf` 参数字符串）。
    -   **区域2: 字幕颜色识别**: 在**经过滤镜处理后**的预览图上，通过颜色拾取器选择字幕颜色，并调整容差滑块，产出 `SubtitleColorProfile`。提供实时预览，高亮显示将被识别为字幕的像素区域。
-   **`components/ResultPanel.vue`**: 一个垂直的时间轴视图，用于展示合并后的字幕块。每个条目包含：可编辑的起止时间、识别出的文本、以及作为代表的字幕区域帧缩略图（已应用滤镜），以便用户进行可视化校对。
-   **`components/SettingsPanel.vue`**: 包含工具的设置，最重要的是用于输入本地 FFmpeg 可执行文件路径的输入框。
-   **`components/ControlPanel.vue`**: 提供开始、取消、暂停/恢复等流程控制按钮。

### 4.2. 后端 API (Tauri 命令)

新的命令将被添加到 Tauri 应用中。

-   **`validate_ffmpeg_path(path: String) -> Result<String, String>`**:
    -   **输入**: 代表 FFmpeg 可执行文件路径的字符串。
    -   **处理**: 检查文件是否存在、是否可执行，并尝试成功运行 `ffmpeg -version`。
    -   **输出**: 成功时返回 `Ok(version_string)`，失败时返回 `Err(error_message)`。

-   **`get_video_metadata(video_path: String) -> Result<VideoMetadata, String>`**:
    -   **输入**: 视频文件的路径。
    -   **处理**: 使用 `ffprobe` 查询视频流信息。
    -   **输出**: 成功时返回 `Ok(VideoMetadata)`，失败时返回 `Err(error_message)`。 `VideoMetadata` 结构体包含 `fps`, `duration`, `width`, `height`, `codec` 等信息。

-   **`extract_subtitle_frames(window: tauri::Window, task_id: String, video_path: String, crop_rect: Rect, color_profile: SubtitleColorProfile, filter_params: FilterParams, sampling_params: SamplingParams)`**:
    -   **输入**:
        -   `window`: 用于发射事件的 Tauri 窗口实例。
        -   `task_id`: 唯一任务ID，用于后续的控制操作（如取消）。
        -   `video_path`: 视频文件的路径。
        -   `crop_rect`: 一个用于字幕区域的结构体 `{ x, y, width, height }`。
        -   `color_profile`: 包含目标颜色和容差的 `SubtitleColorProfile` 结构体。
        -   `filter_params`: 一个 `enum FilterParams`，包含 `Visual` 或 `Advanced` 模式的滤镜配置。
        -   `sampling_params`: 包含采样率等参数的结构体。
    -   **处理**:
        1.  在 `HashMap` 中注册 `task_id` 和子进程句柄。
        2.  启动一个新的异步任务。
        3.  **动态滤镜生成**: 根据传入的 `color_profile` 和 `filter_params` 动态构建 FFmpeg 滤镜链，并加入 `showinfo`。
        4.  使用 `std::process::Command` 执行 FFmpeg，输出格式为 `image2pipe`。
        5.  捕获 `stdout` 和 `stderr` 流。
        6.  **`stdout` 处理线程**:
            a. 实现一个状态机，用于从字节流中精确分割出每一个独立的 PNG 数据块。
            b. 对每个PNG数据块计算 **dHash (差分哈希)**。
            c. 如果 dHash 与上一帧汉明距离为0，则丢弃该帧，不发送给前端。
        7.  **`stderr` 处理线程**: 实时解析 `stderr` 输出，提取 `pts_time` 和 `frame=` 进度信息。
        8.  当一个通过dHash筛选的PNG数据块和其对应的`pts_time`都获得后，通过 `frame-extracted` 事件将 `{ image_bytes: Vec<u8>, pts_time: f64 }` 发送给前端。
        9.  定期发送 `extraction-progress` 事件。
    -   **输出**: 无。操作是异步的，结果通过事件传递。

-   **`cancel_extraction(task_id: String)`**:
    -   **输入**: 要取消的任务 ID。
    -   **处理**: 从 `HashMap` 中找到对应的子进程句柄，并 `kill` 掉该 FFmpeg 进程。

## 5. 关键实现细节

### 5.1. FFmpeg 调用

我们将使用 Rust 的 `std::process::Command` 来构建和运行 FFmpeg 进程。该命令将根据用户输入动态构建。一个典型的命令可能如下所示：

```bash
ffmpeg -i "path/to/video.mp4" -vf "crop=1280:100:0:980,lutyuv=y=val*1.5,eq=contrast=2" -f image2pipe -vcodec png -
```

### 5.2. FFmpeg 路径动态验证

将实现一个三层验证机制，以确保流畅的用户体验，无需重启应用：

1.  **在设置中实时验证**: 当用户在设置面板中输入时，`validate_ffmpeg_path` 命令会被立即调用，提供即时反馈。
2.  **在工具加载时验证**: 当工具的主组件挂载时，路径会被重新验证。如果无效，UI 将引导用户前往设置。
3.  **执行前检查**: 在 Rust 后端的 `extract_subtitle_frames` 命令开始处理之前，会执行最后一次验证。

### 5.3. 前端处理流水线：颜色敏感的字幕检测与质量优先的OCR

前端将以"字幕块"为核心，构建一个可视化的、交互式的工作流。
1.  **监听与变化检测**: 监听 `frame-extracted` 事件。对收到的每一帧，在用户框选的ROI内，执行 **颜色敏感的像素差分**，将其与当前字幕块的最后一帧比较。
2.  **字幕块逻辑**:
    -   **若变化率 < 阈值**: 判定为同一字幕。将当前帧存入当前字幕块的 **帧缓冲池 (`frameBuffer`)**（池大小限制为3-5帧），并更新 `endTime`。
    -   **若变化率 > 阈值**: 判定为新字幕出现。
        a. **触发对旧块的OCR**: 对上一个字幕块的 `frameBuffer` 中所有帧进行 **颜色感知的质量评分** (评估字幕区域清晰度、对比度等)。
        b. **选择最优帧**: 选出得分最高的一帧作为"代表帧"。
        c. **执行OCR**: **仅将这一张最优帧** 发送给 `SmartOcrService` 进行识别。
        d. **创建新块**: 创建一个新的字幕块，并将当前帧作为其缓冲池的第一帧。
3.  **文本回填与内存管理**:
    -   当OCR服务返回文本后，根据任务ID找到时间轴上对应的字幕块，并将文本填充进去。
    -   所有用于评分和OCR的 `UploadedImage` 对象，其 `dataUrl` 必须通过 `URL.revokeObjectURL()` 及时释放，以防止内存泄漏。

### 5.4. 帧采样与性能策略 (替代原背压机制)

通过主动降低采样率从根源上控制数据量，取代被动的背压机制。
1.  **采样率配置**: UI将提供“帧采样率”选项，默认为 `1.0` FPS。
2.  **FFmpeg参数**: Rust端将用户的采样率设置转换为 FFmpeg 的 `-vf "fps=1.0"` 滤镜参数，加入到滤镜链中。
3.  **智能采样 (未来)**: 可考虑引入 `select='gt(scene,0.3)'` 场景检测滤镜，实现更智能的动态采样。

### 5.5. 时间戳精确生成

1.  **数据来源**: 时间戳的唯一可信来源是 Rust 后端通过 `showinfo` 滤镜从 `stderr` 解析并随帧发送的 `pts_time`。
2.  **字幕块分组**: 前端对收到的 OCR 结果进行分组，将连续且文本内容相同（或高度相似）的帧视为一个字幕块。
3.  **时间戳计算**: 对于每个字幕块，开始时间为块中第一帧的 `pts_time`，结束时间为块中最后一帧的 `pts_time`，最后格式化为 `HH:MM:SS,ms`。

### 5.6. 安全性：命令注入防护

对于高级模式下用户输入的 `raw_vf_string`，必须进行严格的安全处理。
1.  **白名单验证**: 在 Rust 端对用户输入的滤镜字符串进行解析，只允许白名单中的滤镜名称和安全的参数格式。
2.  **路径清理**: 对所有传入的文件路径参数进行规范化和验证，防止目录遍历攻击（如 `../`）。
3.  **脚本化滤镜 (推荐)**: 最佳实践是使用 FFmpeg 的 `-filter_complex_script` 功能，将滤镜链写入临时文件，然后由 FFmpeg 读取，彻底杜绝 Shell 注入风险。

### 5.7. 错误处理

将稳健地处理 FFmpeg 进程可能发生的错误，并根据用户使用的滤镜模式提供智能的错误反馈。
1.  **Stderr 监控**: Rust 后端会专门开一个线程，持续读取 FFmpeg 进程的 `stderr` 流。
2.  **错误检测**: 若进程以非零状态码退出，后端将捕获 `stderr` 的最后内容作为错误原因。
3.  **智能错误事件**: 通过 `extraction-error` 事件，向前端发送一个结构化的错误对象，如 `{ "source": "ffmpeg", "message": "错误信息..." }`。
4.  **前端情景化反馈**:
    -   如果用户使用的是 **可视化滤镜模式**，参数错误将被视为程序内部 Bug。前端会显示通用错误提示（如“内部参数生成错误”），并引导用户提交日志。
    -   如果用户使用的是 **高级自定义模式**，错误将被视为用户输入错误。前端会将从后端接收到的 FFmpeg 原生错误信息直接展示给用户，以帮助其修正参数。

### 5.8. 未来优化方向

- **进度预估**: 解析 `stderr` 中的 `frame=` 和总时长信息，提供更精确的进度预估（已处理 X 分钟 / 共 Y 分钟）。
- **字幕后处理**: 在 `ResultPanel` 中提供批量查找替换、合并相邻字幕块等功能。
- **导出格式**: 增加对 `.vtt` 和 `.ass` 格式的导出支持。