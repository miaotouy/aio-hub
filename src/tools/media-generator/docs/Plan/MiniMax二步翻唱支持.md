# MiniMax Music 第二阶段：两步翻唱

## Summary

- 两步翻唱流程是：参考音频预处理 -> 得到 `cover_feature_id`、`formatted_lyrics`、`structure_result` -> 用户编辑歌词 -> 用 `cover_feature_id + lyrics` 调 `music_generation`。本地文档明确 `cover_feature_id` 24 小时有效，且最终生成时 `lyrics` 必填。
- 现有架构“够做基础”，但“不够直接做好”。底层 adapter 已能把 `cover_feature_id` 发给生成接口，并校验歌词必填；但缺少 `music_cover_preprocess` client 方法、预处理 UI、中间结果缓存、过期处理、歌词编辑体验，以及最终生成时避免 `audio_url/audio_base64/cover_feature_id` 冲突的显式模式。
- 交互上不要只塞进左侧 320px 参数面板。参数面板适合放开关和状态；歌词编辑、结构结果、刷新预处理更适合新增一个 MiniMax Cover 工作流面板/抽屉，挂在主工作区或输入区上方。

## Key Changes

- API/adapter：
  - 在 `minimax-music` types/client 增加 `CoverPreprocessRequest/Response` 和 `client.coverPreprocess()`，复用现有 `MINIMAX_MUSIC_PATHS.coverPreprocess`。
  - 保留现有 `adapter.audio()` 生成入口；新增显式参数 `cover_reference_mode: "audio" | "feature"`，当为 `feature` 时只发送 `cover_feature_id`，忽略/剥离 `audio_url`、`audio_base64`。
  - 继续沿用现有互斥校验和歌词必填校验，相关逻辑在 [adapter.ts](E:/rc20/allinweb/all-in-one-tools/src/llm-apis/adapters/minimax-music/adapter.ts:186)。

- 状态/数据：
  - 在音乐参数中新增：
    - `cover_workflow: "one_step" | "two_step"`
    - `cover_reference_mode`
    - `cover_preprocess_result: { sourceKey, coverFeatureId, formattedLyrics, structureResult, audioDuration, traceId, createdAt, expiresAt }`
  - 不持久化音频 base64；只持久化 `audio_url` 或附件 asset 标识/sourceKey、预处理结果和过期时间。
  - 预处理成功后写入 `params.lyrics = formattedLyrics`、`lyrics_source = "manual"`、`cover_reference_mode = "feature"`、`cover_feature_id = coverFeatureId`。

- UI/交互：
  - 在 [ModelParameterFields.vue](E:/rc20/allinweb/all-in-one-tools/src/tools/media-generator/components/ModelParameterFields.vue:508) 的 MiniMax 翻唱模式中增加“一步翻唱 / 两步翻唱”切换。
  - 两步模式显示“预处理参考音频”按钮、状态、过期时间、重新预处理按钮；歌词编辑器使用预处理返回的 `formatted_lyrics` 初始化。
  - 解析 `structure_result` 为段落列表展示；JSON 解析失败时保留原始文本，不阻断生成。
  - 最终 Ctrl+Enter 仍然是生成音乐，不把预处理伪装成媒体生成任务。

- 执行链路：
  - 从 [useMediaGenerationManager.ts](E:/rc20/allinweb/all-in-one-tools/src/tools/media-generator/composables/useMediaGenerationManager.ts:426) 抽出音频附件转 base64 的可复用工具，供“预处理”和“最终生成”共同使用。
  - 在提交生成前校验：两步模式必须有未过期 `cover_feature_id` 和非空歌词；过期则提示重新预处理。
  - 最终任务仍走现有 `submitTaskInSession -> buildTask -> executeGeneration` 链路，任务快照继续用于重试和分支。

## Test Plan

- Unit：
  - `coverPreprocess()` 请求路径、请求体、错误码处理。
  - `cover_reference_mode = "feature"` 时只发送 `cover_feature_id + lyrics`。
  - 同时存在 `audio_url` 和 `cover_feature_id` 时，一步模式报错，两步 feature 模式不报错。
  - 过期预处理结果禁止生成；刷新预处理后可生成。
  - `structure_result` 正常 JSON 和异常字符串都能稳定展示。

- Integration/manual：
  - MiniMax `music-cover` + URL 两步翻唱：预处理 -> 编辑歌词 -> 生成音频入库。
  - MiniMax `music-cover` + 本地音频附件两步翻唱：附件只在请求时转 base64，不写入持久化参数。
  - 重试已完成任务时，若 `cover_feature_id` 仍有效则复用；若过期则提示重新预处理。
  - 运行 `bun run test:run` 和 `bun run check:frontend`。

## Assumptions

- 第二阶段先支持“用户主动点击预处理”，不在点击生成时自动偷偷预处理。
- `cover_feature_id` 可保存用于 24 小时内复用，但过期后不自动长期复用。
- 两步翻唱的良好体验优先于最小改动：会新增一个工作流面板/抽屉，而不是只在窄参数栏堆更多输入框。

## Detailed UI/UX & Architecture Design

### 1. UI 交互设计方案 (UI/UX Design)

我们拒绝将复杂的歌词编辑、结构展示和预处理状态堆砌在窄窄的左侧参数面板（320px）中。相反，我们采用**“主工作区上方展开式面板”**的设计。

#### 1.1. 整体布局

在 `MediaWorkbench.vue` 中，我们在消息流区域（`content-body`）和输入框区域（`workbench-footer`）之间，插入一个全新的组件 [`MiniMaxCoverWorkflowPanel.vue`](src/tools/media-generator/components/MiniMaxCoverWorkflowPanel.vue)。

当且仅当满足以下条件时，该面板会以优雅的展开动画（Slide/Fade）显示在输入框上方：

- 媒体类型为 `music`
- 当前选中的是 MiniMax 音乐模型
- 生成模式为 `cover` (翻唱)
- 翻唱工作流为 `two_step` (两步精修)

```
+-----------------------------------------------------------------+
|                       Workbench Header                          |
+-----------------------------------------------------------------+
|                                                                 |
|                       Generation Stream                         |
|                       (历史生成消息流)                           |
|                                                                 |
+-----------------------------------------------------------------+
| === [展开/收起] MiniMax 两步翻唱工作流面板 ========================= |
|  状态: 预处理完成 (24小时内有效)             [重新预处理] [关闭]  |
|  +----------------------------------+-------------------------+  |
|  | 歌词精修 (ASR 提取)               | 歌曲结构分析 (可视化)   |  |
|  | [Verse 1]                        | [===][======][===][==]  |
|  | 歌曲第一行歌词...                 | 00:00 - 01:30 (90秒)    |  |
|  | 歌曲第二行歌词...                 | - Intro: 15.5秒         |  |
|  |                                  | - Verse: 29.7秒         |  |
|  | [Chorus]                         | - Chorus: 29.8秒        |  |
|  | 这是副歌高潮部分...               | - Outro: 15.0秒         |  |
|  +----------------------------------+-------------------------+  |
+-----------------------------------------------------------------+
|                       Media Generation Input                    |
|                       (输入风格描述，Ctrl+Enter 生成)            |
+-----------------------------------------------------------------+
```

#### 1.2. 核心子模块设计

##### 1.2.1. 预处理状态与控制区 (Header)

- **未开始状态**：展示“等待预处理参考音频”提示。如果输入框有音频附件或参数面板有 URL，则激活“开始预处理”按钮；否则置灰并提示“请先添加参考音频附件或填写 URL”。
- **预处理中状态**：展示优雅的加载动画（如波浪形音频动效）和“正在提取音频特征与歌词...”状态。
- **成功状态**：展示“预处理完成”，显示 `cover_feature_id`（缩略显示如 `a1b2...7890`），显示音频时长，显示 24 小时倒计时（或具体过期时间），并提供“重新预处理”按钮。
- **失败状态**：展示红色错误提示和“重新预处理”按钮。

##### 1.2.2. 歌词精修区 (Left Column)

- 提供一个高度自适应的歌词编辑器（`el-input` type="textarea"），直接绑定到 `params.lyrics`。
- 顶部提供快捷操作：
  - **重置为提取歌词**：一键恢复为 ASR 提取的原始歌词 `formatted_lyrics`。
  - **清空歌词**：一键清空。
- 侧边提供段落标签快捷插入按钮（如 `[Verse]`、`[Chorus]`、`[Bridge]`），点击即可在光标处插入，极大提升手填体验。

##### 1.2.3. 歌曲结构分析区 (Right Column) - **高颜值可视化设计**

为了让设计师姐姐满意，我们不只是展示枯燥的文本列表，而是设计一个**彩色条形图 (Segmented Bar)** 来可视化歌曲结构：

- **彩色条形图**：
  - 歌曲总时长为 `audio_duration` 秒。
  - 根据 `structure_result` 中的 segments，计算每个段落的百分比宽度：`width = ((end - start) / audio_duration) * 100%`。
  - 不同的段落类型（`label`）赋予不同的主题色：
    - `intro` / `silence`：淡蓝色 / 灰色 (`#909399`)
    - `verse`：清新绿 (`#67C23A`)
    - `chorus`（副歌高潮）：活力橙 / 珊瑚红 (`#E6A23C` / `#F56C6C`)
    - `bridge`（过渡桥段）：优雅紫 (`#9B5DE5`)
    - `outro`：淡灰色 (`#C0C4CC`)
    - `inst`（间奏）：明亮黄 (`#FEE440`)
  - 鼠标悬浮在色块上时，展示高颜值 Tooltip：`[00:15 - 00:45] Verse (30.0秒)`。
- **结构列表**：在条形图下方，以时间线（Timeline）形式展示段落列表，点击段落可以高亮对应的色块。

---

### 2. 状态管理与数据流 (State & Data Flow)

为了保持代码的高内聚和低耦合，我们新建一个 Vue Composable [`useMiniMaxCoverWorkflow.ts`](src/tools/media-generator/composables/useMiniMaxCoverWorkflow.ts) 来专门管理两步翻唱的状态和 API 请求。

#### 2.1. Composable 状态定义

```typescript
export function useMiniMaxCoverWorkflow() {
  const store = useMediaGenStore();
  const isPreprocessing = ref(false);
  const preprocessError = ref<string | null>(null);

  // 计算属性：当前是否处于两步翻唱模式
  const isTwoStepCoverMode = computed(() => {
    return (
      store.currentConfig.activeType === "music" &&
      store.currentConfig.types.music.modelCombo?.includes("minimax-music") &&
      store.currentConfig.types.music.params.minimax_music_mode === "cover" &&
      store.currentConfig.types.music.params.cover_workflow === "two_step"
    );
  });

  // 计算属性：获取当前的预处理结果
  const preprocessResult = computed(() => {
    return store.currentConfig.types.music.params.cover_preprocess_result;
  });

  // 计算属性：特征是否已过期 (24小时)
  const isExpired = computed(() => {
    if (!preprocessResult.value?.expiresAt) return true;
    return Date.now() > new Date(preprocessResult.value.expiresAt).getTime();
  });

  // 计算属性：解析后的歌曲结构
  const parsedStructure = computed(() => {
    const raw = preprocessResult.value?.structureResult;
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  });

  // 方法：发起预处理
  const startPreprocess = async () => { ... };

  return {
    isTwoStepCoverMode,
    isPreprocessing,
    preprocessError,
    preprocessResult,
    isExpired,
    parsedStructure,
    startPreprocess,
  };
}
```

#### 2.2. 预处理数据流向

1. 用户在输入框添加音频附件，或者在参数面板填写音频 URL。
2. 用户点击“开始预处理”按钮。
3. `startPreprocess` 触发：
   - 如果是附件，从 `store.attachments` 提取，调用 `getAssetBinary` 和 `convertArrayBufferToBase64` 转换为 Base64。
   - 如果是 URL，直接使用 `params.audio_url`。
   - 调用 `client.coverPreprocess()` 发起 API 请求。
4. 请求成功后，将结果写入 `params.cover_preprocess_result`：
   ```typescript
   params.cover_preprocess_result = {
     sourceKey: audioAttachment?.id || params.audio_url,
     coverFeatureId: res.cover_feature_id,
     formattedLyrics: res.formatted_lyrics,
     structureResult: res.structure_result,
     audioDuration: res.audio_duration,
     traceId: res.trace_id,
     createdAt: new Date().toISOString(),
     expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24小时后过期
   };
   ```
5. 同时自动更新生成参数，实现无缝衔接：
   - `params.lyrics = res.formatted_lyrics` (初始化歌词编辑器)
   - `params.lyrics_source = "manual"` (强制手填模式，允许编辑)
   - `params.cover_reference_mode = "feature"` (显式标记为特征模式)
   - `params.cover_feature_id = res.cover_feature_id` (绑定特征 ID)
6. 用户在面板中精修歌词，歌词实时同步到 `params.lyrics`。
7. 用户在输入框输入风格描述，按 Ctrl+Enter 提交生成。
8. 最终生成任务提交，底层 adapter 校验 `cover_reference_mode === "feature"`，只发送 `cover_feature_id` 和 `lyrics`，剥离音频数据，完美生成！

---

### 3. 底层 API 与 Adapter 扩展

为了支持上述数据流，我们需要对底层进行外科手术式的扩展：

#### 3.1. 扩展 `MinimaxMusicClient` ([`client.ts`](src/llm-apis/adapters/minimax-music/client.ts))

新增 `coverPreprocess` 方法，复用现有的 `MINIMAX_MUSIC_PATHS.coverPreprocess`：

```typescript
async coverPreprocess(
  request: CoverPreprocessRequest
): Promise<CoverPreprocessResponse> {
  const response = await minimaxMusicFetch<CoverPreprocessResponse>(
    this.config,
    MINIMAX_MUSIC_PATHS.coverPreprocess,
    request
  );
  ensureMinimaxSuccess(response, "翻唱前处理失败");
  return response;
}
```

#### 3.2. 扩展 `minimaxMusicAdapter` ([`adapter.ts`](src/llm-apis/adapters/minimax-music/adapter.ts))

在 `buildMusicRequest` 中，当 `cover_reference_mode === "feature"` 时，只发送 `cover_feature_id`，忽略并剥离 `audio_url` 和 `audio_base64`，避免参数冲突：

```typescript
function applyCoverReference(
  request: MinimaxMusicRequest,
  params: Record<string, any>
): void {
  const coverReferenceMode = params.cover_reference_mode || "audio";

  if (coverReferenceMode === "feature") {
    const coverFeatureId = normalizeString(params.cover_feature_id);
    if (!coverFeatureId) {
      throw new Error("两步翻唱模式下，必须先进行音频预处理以获取特征 ID");
    }
    if (!request.lyrics) {
      throw new Error("使用特征 ID 翻唱时必须提供歌词");
    }
    request.cover_feature_id = coverFeatureId;
    return;
  }

  // 否则走原有的一步直出逻辑 (audio_url 或 audio_base64)
  ...
}
```

---

## Implementation Notes

- 2026-06-08 已施工：新增 `CoverPreprocessRequest/Response`、`client.coverPreprocess()`、`cover_reference_mode === "feature"` 请求剥离、音乐参数默认值、两步翻唱 workflow composable、`MiniMaxCoverWorkflowPanel.vue`、输入框与执行器两层提交校验、MiniMax adapter/client 单测。
- 施工调整：MiniMax 两边文档可能不同步，预处理请求不在本地固定为 `music-cover`；若用户当前选择 `music-cover-free`，`coverPreprocess()` 也原样发送 `music-cover-free`。
- 施工中调整：附件音频 base64 复用能力落在 `mediaAttachmentUtils.ts`，预处理与最终生成共用；两步 feature 模式最终生成不再注入附件音频 base64。
- 验证记录：`bun run check:frontend` 通过；MiniMax 定向 `bun run test:run src/llm-apis/adapters/minimax-music/__tests__/adapter.test.ts src/llm-apis/adapters/minimax-music/__tests__/client.test.ts src/llm-apis/adapters/minimax-music/__tests__/utils.test.ts` 通过。
- 已知非本次阻塞：全量 `bun run test:run` 当前失败在既有 llm-chat/openai 温度期望（`0.7` vs 实际 `1`），且 Vitest 会额外扫描 `.kilo/worktrees/ninth-shoe` 下的重复测试；该失败不在本次 MiniMax 改动范围内。
