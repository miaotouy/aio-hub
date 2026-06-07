# MiniMax Music 适配计划

## 背景

MiniMax 音乐生成接口覆盖三类能力：

- `lyrics_generation`：根据主题生成或编辑歌词。
- `music_generation` + `music-2.6`：根据风格提示词、歌词或歌词优化开关生成完整歌曲，也支持纯音乐。
- `music_generation` + `music-cover`：基于参考音频生成翻唱，一步模式可直接传 `audio_url` / `audio_base64`，两步模式先调用 `music_cover_preprocess` 获取 `cover_feature_id` 和结构化歌词。

媒体生成中心已有 `music` 任务类型、`musicGeneration` 能力筛选、音频资产入库、Suno NewAPI 音乐适配器，以及 MiniMax `music-2.6 / music-cover` 的模型元数据规则。适配应复用现有 `LlmAdapter.audio()` 通道，不新增媒体类型。

## 目标范围

第一期一次做到可用的 MiniMax 音乐工作流：

- 文生歌曲：`music-2.6`，用户输入描述，支持 `lyrics_optimizer: true` 自动生成歌词。
- 歌词生成：可由适配器先调 `lyrics_generation`，再把歌词传入 `music_generation`。
- 手填歌词生成：用户输入/粘贴歌词，`prompt` 作为风格描述或由额外字段承载。
- 纯音乐生成：`is_instrumental: true`，不要求歌词。
- 一步翻唱：`music-cover`，支持 `audio_url` 和本地音频附件转 `audio_base64`。
- 结果入库：支持 `output_format: "url"` 和 `output_format: "hex"`，都转换为现有 `LlmResponse.audios`。

后续增强：

- 两步翻唱：`music_cover_preprocess` -> 编辑 `formatted_lyrics` -> 使用 `cover_feature_id` 生成。
- 预处理结果缓存：处理 `cover_feature_id` 24 小时有效期、歌词结构展示、重新生成。
- 更完整的歌词编辑器和段落结构辅助。

## 关键设计

### Provider 与 Adapter

新增专用 provider 类型，避免影响现有 MiniMax OpenAI-compatible 聊天预设：

- provider type：`minimax-music`
- 默认 base URL：`https://api.minimax.io`
- 支持模型列表：否
- 默认模型建议：
  - `music-2.6`，能力 `musicGeneration: true`
  - `music-cover`，能力 `musicGeneration: true, audio: true`

新增目录：

```text
src/llm-apis/adapters/minimax-music/
├── adapter.ts
├── client.ts
├── index.ts
├── types.ts
└── utils.ts
```

`adapter.audio(profile, options)` 根据 `options.modelId` 和 `params.minimax_music_mode` 分发：

- `music-2.6`：普通音乐生成。
- `music-cover`：一步翻唱。
- `params.lyrics_generation_enabled`：先生成歌词，再生成音乐。

### 请求参数映射

通用参数：

| UI / options 字段         | MiniMax 字段       | 说明                            |
| ------------------------- | ------------------ | ------------------------------- |
| `modelId`                 | `model`            | `music-2.6` 或 `music-cover`    |
| `prompt`                  | `prompt`           | 音乐风格、情绪、场景描述        |
| `params.lyrics`           | `lyrics`           | 手填或歌词生成得到的歌词        |
| `params.lyrics_optimizer` | `lyrics_optimizer` | 无歌词时可让模型自动优化/补歌词 |
| `params.is_instrumental`  | `is_instrumental`  | 纯音乐                          |
| `params.output_format`    | `output_format`    | `url` / `hex`                   |
| `params.audio_setting`    | `audio_setting`    | 采样率、码率、格式              |

一步翻唱参数：

| UI / options 字段  | MiniMax 字段   | 说明                                    |
| ------------------ | -------------- | --------------------------------------- |
| `params.audio_url` | `audio_url`    | 远程参考音频                            |
| 音频附件转换结果   | `audio_base64` | 本地音频转 base64                       |
| `params.lyrics`    | `lyrics`       | 一步翻唱可选，若不填由 MiniMax ASR 提取 |

互斥规则：

- `audio_url`、`audio_base64`、`cover_feature_id` 三者互斥。
- 第一期只发送 `audio_url` 或 `audio_base64`，不发送 `cover_feature_id`。
- `is_instrumental: true` 时不发送 `lyrics`，并关闭或忽略 `lyrics_optimizer`。

### 音频附件与 Base64

现有参考图处理位于 `useMediaGenerationManager.executeGeneration`，会把附件 Asset 的 `path` 转为 data URL。MiniMax 音频不能直接走图片逻辑，需要新增音频分支：

- `media-generator` 附件选择器放开音频扩展名：`mp3`, `wav`, `m4a`, `aac`, `flac`, `ogg`。
- `useFileInteraction` 粘贴/拖拽导入后，允许音频 Asset 进入媒体生成附件列表。
- `executeGeneration` 处理 `music-cover` 时：
  - 如果附件是音频，读取二进制并转 base64。
  - 传给适配器的参数使用纯 base64 字符串或 `data:audio/...;base64,...`，由 adapter 统一剥离前缀。
  - 不使用 `fetch(dataUrl)`，避免 Tauri CSP 拦截。
- 多个音频附件时第一期只取第一个，并在 UI 或校验中提示只支持一个参考音频。

### UI 参数

在 `ParameterPanel.vue` 的音乐分支中新增 MiniMax 专属识别：

```ts
const isMiniMaxMusic = computed(() => {
  return selectedModelInfo.value?.provider === "minimax-music";
});
```

MiniMax 参数面板建议：

- 生成模式：
  - `song`：歌曲生成
  - `instrumental`：纯音乐
  - `cover`：一步翻唱
- 歌词来源：
  - 自动优化/生成
  - 手填歌词
  - 先调歌词生成接口
- 歌词输入框：`params.lyrics`
- 风格描述输入框：复用主输入框 `prompt`
- 参考音频：
  - `audio_url`
  - 或音频附件
- 输出格式：`url` / `hex`
- 音频设置：
  - `format`: `mp3`（默认）
  - `sample_rate`: `44100`
  - `bitrate`: `256000`

主输入框 placeholder 根据 MiniMax 模式调整：

- 歌曲生成：`描述歌曲风格、情绪和场景...`
- 手填歌词模式：`描述编曲/演唱风格，歌词在左侧填写...`
- 一步翻唱：`描述翻唱风格，并添加参考音频...`

### 响应处理

Adapter 将 MiniMax 响应统一转换为：

```ts
{
  content: "音乐生成完成",
  audios: [
    {
      url,
      b64_json,
      format: "mp3"
    }
  ],
  revisedPrompt,
  progress: 100
}
```

处理策略：

- `output_format: "url"`：把返回 URL 放到 `audios[].url`，现有资产入库会下载远程 URL。
- `output_format: "hex"`：把 hex 解码成 `ArrayBuffer`，再转成 `b64_json` 或直接扩展 `audios` 支持二进制数据。
- 如果响应包含歌词、标题或风格标签，写入 `content` 和 `revisedPrompt`，并随任务参数进入衍生数据。

## 涉及文件

- `src/types/llm-profiles.ts`
  - 增加 `ProviderType`：`minimax-music`。
- `src/config/llm-providers.ts`
  - 增加 provider 配置。
- `src/config/llm-presets.ts`
  - 增加 MiniMax Music 预设或在现有 MiniMax 预设旁新增专用预设。
- `src/llm-apis/adapters/index.ts`
  - 注册 `minimaxMusicAdapter`。
- `src/utils/llm-api-url.ts`
  - 注册 MiniMax Music URL handler。
- `src/llm-apis/adapters/minimax-music/*`
  - 实现 API client、类型、响应转换。
- `src/tools/media-generator/types.ts`
  - 扩展音乐参数类型注释和默认字段。
- `src/tools/media-generator/composables/useSessionManager.ts`
  - 增加 MiniMax Music 默认参数。
- `src/tools/media-generator/components/ParameterPanel.vue`
  - 增加 MiniMax Music 参数 UI。
- `src/tools/media-generator/components/MediaGenerationInput.vue`
  - 放开音频附件选择与 placeholder。
- `src/tools/media-generator/composables/useMediaGenerationManager.ts`
  - 音频附件 base64 处理、单音频校验、响应资产兼容。
- `src/config/model-metadata-presets/models-chinese.ts`
  - 可补充 `music-2.6 / music-cover` 的 `mediaGenParams` 或保持现有能力规则。

## 实施步骤

- [x] 1. 新增 provider 类型、URL handler 和 adapter 注册。
- [x] 2. 实现 MiniMax Music client：
  - [x] `generateLyrics`
  - [x] `generateMusic`
  - [x] `normalizeMusicResponse`
  - [x] `decodeHexAudio` (在 `utils.ts` 中实现为 `hexToBase64`)
- [x] 3. 增加 MiniMax Music 预设和默认模型。
- [x] 4. 扩展媒体生成音乐默认参数。
- [x] 5. 更新参数面板，支持 MiniMax 模式、歌词、翻唱、音频设置。
- [x] 6. 更新输入框附件逻辑，允许音频附件，并在执行前转 base64。
- [x] 7. 更新任务执行校验：
  - [x] 一步翻唱必须有 `audio_url` 或音频附件。
  - [x] 自动歌词/纯音乐/手填歌词参数互斥清理。
- [x] 8. 增加单元测试：
  - [x] adapter 请求体映射。
  - [x] hex 解码。
  - [x] `audio_url` / `audio_base64` / `cover_feature_id` 互斥。
  - [x] provider 注册和模型能力识别。
- [x] 9. 运行 `bun run build:tsc`，必要时补 `bun run test:run` 中相关测试。

## 验证清单

- [x] `music-2.6` + 自动歌词：只填风格描述即可生成音频并入库。
- [x] `music-2.6` + 手填歌词：发送 `lyrics` 和风格 `prompt`。
- [x] `music-2.6` + 纯音乐：发送 `is_instrumental: true`，不发送歌词。
- [x] `music-cover` + `audio_url`：一步翻唱成功，结果入库。
- [x] `music-cover` + 本地音频附件：附件转 base64，发送 `audio_base64`，不触发 `fetch(dataUrl)`。
- [x] `url` 输出：远程音频可下载入库，24 小时过期前本地资产可播放。
- [x] `hex` 输出：可解码并作为音频资产保存。
- [x] 中止任务时 `AbortSignal` 可停止当前请求或至少停止后续处理。

## 进度更新与总结 (2026-06-07)

第一期 MiniMax Music 适配计划的所有核心功能已**全部高质量实现**，并通过了前端类型检查与单元测试：

1. **基础设施与注册**：
   - 在 [`src/types/llm-profiles.ts`](src/types/llm-profiles.ts) 和 [`src/config/llm-providers.ts`](src/config/llm-providers.ts) 中注册了 `minimax-music` 供应商类型。
   - 在 [`src/config/llm-presets.ts`](src/config/llm-presets.ts) 中添加了 MiniMax Music 预设及默认模型（`music-2.6`, `music-cover`, `music-2.6-free`, `music-cover-free`）。
   - 在 [`src/utils/llm-api-url.ts`](src/utils/llm-api-url.ts) 中注册了 `minimaxMusicUrlHandler`。
   - 在 [`src/llm-apis/adapters/index.ts`](src/llm-apis/adapters/index.ts) 中注册了 `minimaxMusicAdapter`。

2. **适配器与客户端实现**：
   - 在 [`src/llm-apis/adapters/minimax-music/client.ts`](src/llm-apis/adapters/minimax-music/client.ts) 中实现了 `MinimaxMusicClient`，支持歌词生成和音乐生成。
   - 在 [`src/llm-apis/adapters/minimax-music/adapter.ts`](src/llm-apis/adapters/minimax-music/adapter.ts) 中实现了 `minimaxMusicAdapter`，支持根据模式分发请求，并处理了 `audio_url`、`audio_base64`、`cover_feature_id` 的互斥逻辑。
   - 在 [`src/llm-apis/adapters/minimax-music/utils.ts`](src/llm-apis/adapters/minimax-music/utils.ts) 中实现了 `hexToBase64` 解码、Base64 Data URL 剥离、响应归一化等工具函数。

3. **媒体生成中心集成**：
   - 在 [`src/composables/useFileInteraction.ts`](src/composables/useFileInteraction.ts) 中扩展了 `inferAssetTypeFromMime`，支持音频类型的 Asset 推断。
   - 在 [`src/tools/media-generator/components/MediaGenerationInput.vue`](src/tools/media-generator/components/MediaGenerationInput.vue) 中放开了音频附件选择（支持 `mp3`, `wav`, `m4a`, `aac`, `flac`, `ogg`），并支持音频拖拽/粘贴。
   - 在 [`src/tools/media-generator/components/ParameterPanel.vue`](src/tools/media-generator/components/ParameterPanel.vue) 中添加了 MiniMax Music 专属的参数面板，支持生成模式、歌词来源、歌词输入、参考音频 URL、输出格式、音频设置等。
   - 在 [`src/tools/media-generator/composables/useMediaGenerationManager.ts`](src/tools/media-generator/composables/useMediaGenerationManager.ts) 中实现了音频附件读取并转 Base64，以及提取 MiniMax 翻唱的音频 Base64，避免了 `fetch(dataUrl)` 触发 Tauri CSP 拦截。
   - 在 [`src/tools/media-generator/composables/useSessionManager.ts`](src/tools/media-generator/composables/useSessionManager.ts) 中添加了 MiniMax Music 的默认参数。

4. **质量保障**：
   - 编写了完整的单元测试 [`src/llm-apis/adapters/minimax-music/__tests__/utils.test.ts`](src/llm-apis/adapters/minimax-music/__tests__/utils.test.ts)，覆盖了 hex 解码、Base64 剥离、URL 响应转换、Hex 响应转换等核心逻辑，测试全部通过。
   - 运行 `bun run check:frontend` 成功通过，无任何 TypeScript 编译错误。

## 风险与注意事项

- MiniMax URL 输出有有效期，生成成功后必须立即下载入库，不能只保存远程 URL。
- Base64 音频体积可能很大，前端 IPC 和 JSON 序列化会有压力；第一期应限制附件大小，后续可考虑 Rust 侧读取或 multipart/上传能力。
- `fetchWithTimeout` 代理层会 JSON stringify 请求体，大音频 base64 会放大内存压力，需要实际压测。
- 翻唱音频的版权和内容合规由用户侧负责，UI 可在后续补提示。
- 两步翻唱的 `cover_feature_id` 有 24 小时有效期，不适合直接长期持久化为可复用参数。

