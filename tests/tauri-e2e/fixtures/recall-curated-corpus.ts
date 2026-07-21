export const RECALL_CURATED_CORPUS_SCHEMA_VERSION = 1 as const;
export const RECALL_CURATED_CORPUS_MAX_CONTENT_CHARS = 700;
export const RECALL_CURATED_CORPUS_FORBIDDEN_TERMS = [
  "咕咕",
  "姐姐",
  "miaotouy",
] as const;

export type RecallCuratedTopic =
  | "renderer-v2"
  | "tool-structure"
  | "memory-ownership"
  | "base64-image"
  | "hard-negative";

export type RecallCuratedRole = "positive" | "near-negative" | "hard-negative";

export interface RecallCuratedEntry {
  id: string;
  sourceEntryId: string;
  sourceContentHash: string;
  contentHash: string;
  title: string;
  content: string;
  tags: string[];
  topic: RecallCuratedTopic;
  role: RecallCuratedRole;
}

export interface RecallCuratedCorpus {
  schemaVersion: typeof RECALL_CURATED_CORPUS_SCHEMA_VERSION;
  source: {
    format: "aiohub.knowledge-library";
    formatVersion: 1;
    archiveSha256: string;
    expectedEntryCount: number;
  };
  maxContentChars: number;
  entries: RecallCuratedEntry[];
}

export const recallCuratedCorpus: RecallCuratedCorpus = {
  schemaVersion: RECALL_CURATED_CORPUS_SCHEMA_VERSION,
  source: {
    format: "aiohub.knowledge-library",
    formatVersion: 1,
    archiveSha256:
      "aac7dcae4edc1a7551bed31c51b7f42c66b7a2c37bc0a96fbb96902a1c29f5a0",
    expectedEntryCount: 473,
  },
  maxContentChars: RECALL_CURATED_CORPUS_MAX_CONTENT_CHARS,
  entries: [
    {
      id: "30000000-0000-4000-8000-000000000001",
      sourceEntryId: "012b5651-a169-47ac-a7e3-7dbdb5868d8c",
      sourceContentHash:
        "0282750f98d0b7ecf60a32dd8e08057e992fcfe0ca072fd38e6b0fc6b386dc96",
      contentHash:
        "1f761f4f8155c1779e704acc3d4ed999baff89bb75a405a748982d2dc324ebc1",
      title: "渲染引擎 V2 架构验证",
      content: `## 复杂 Markdown 解析链

RichTextRenderer V2 将输入递归解析为语义结构，能处理 HTML 包裹 Markdown、SVG、KaTeX 和 Mermaid 等深层嵌套。流式更新使用 AST Diff 与稳定节点 ID，已运行的动画和交互状态不会因新增文本而重置。`,
      tags: ["AIO Hub", "Markdown", "AST", "流式渲染"],
      topic: "renderer-v2",
      role: "positive",
    },
    {
      id: "30000000-0000-4000-8000-000000000002",
      sourceEntryId: "1c56447e-3938-4590-82e1-d6a71d852bc0",
      sourceContentHash:
        "9b1bfc9ea47d661e6402312598c7631b1487c21004f14415473ef892e84cb8fb",
      contentHash:
        "10bed201b04e539974c47a6057e7554eb32e83c08e2eca24b020fe9b26b68e0c",
      title: "渲染引擎 V2 架构验证",
      content: `## 流式渲染的性能边界

复杂 Markdown 流式渲染的明显停顿点不在解析算法，而在 Monaco Editor 等重型组件的初始化。优化方向是流式阶段先输出轻量占位，再异步挂载重型组件；AST Diff 和节点 ID 保持继续负责避免无关子树重建。`,
      tags: ["AIO Hub", "Markdown", "Monaco Editor", "性能"],
      topic: "renderer-v2",
      role: "positive",
    },
    {
      id: "30000000-0000-4000-8000-000000000003",
      sourceEntryId: "42c17044-4e98-48ae-b302-53267a3a3030",
      sourceContentHash:
        "d53947b4e33eee13a924ba01dc92b04bb3537710c899e72b98026e57a80c41a5",
      contentHash:
        "b7ea56414d9cd5f7675e8e94258c92da42e43c886ed85a92cf6ddec5131d5f75",
      title: "V2 渲染协议与边界检测",
      content: `## 从输入流到增量 Patch

渲染链路按“输入流 -> 语义 Token -> AST -> 增量 Patch”解耦。AstNode 作为中间协议，不与某个 Web 组件强绑定。MarkdownBoundaryDetector 只在边界完整时提交结构更新，避免流式分片截断标签后导致 UI 结构崩溃。`,
      tags: ["AIO Hub", "AST", "增量 Patch", "边界检测"],
      topic: "renderer-v2",
      role: "positive",
    },
    {
      id: "30000000-0000-4000-8000-000000000004",
      sourceEntryId: "02bf3186-2b10-48e8-8097-2cffbcdce257",
      sourceContentHash:
        "8151f25f9c236fb7278f7ea16dcae2c52000f30e96fdba1edb6d8973425dc455",
      contentHash:
        "6cbe17ce71fb684a5bd7d889fc477991a9a96b0f26b59e64fd2ba2cfb84118f1",
      title: "工具模块目录分层",
      content: `## 逻辑物理聚合

每个工具模块按职责分层：\`core/\` 存放核心算法，\`logic/\` 组织业务流程，\`components/\` 放子组件，\`config/\` 保存配置与注册信息，\`stores/\` 管理状态，\`types.ts\` 定义模块契约。原先平铺在根目录的 engine 和 logic 文件应迁入对应层级。`,
      tags: ["AIO Hub", "core", "logic", "config", "stores"],
      topic: "tool-structure",
      role: "positive",
    },
    {
      id: "30000000-0000-4000-8000-000000000005",
      sourceEntryId: "7c0854f6-bde2-4c9d-89da-2bdd578e75a4",
      sourceContentHash:
        "17a7cd79ed29e4e05c0a0c9416fc0527c9b11145217b96d4607c9bf4c8266269",
      contentHash:
        "f4ef6f6abd94ed448360932d52901d6e7d43bf5bfe3757bf4a89d4f6caccfa1e",
      title: "跨端工程目录地图",
      content: `## 模块边界

工程以工具注册和架构文档维持模块边界。富文本渲染、对话上下文流水线、移动端 LLM 迁移层和 Rust 后端命令属于不同物理区域。目录重构时应保留 registry 入口与 ARCHITECTURE 说明，避免把跨端职责重新混在单一根目录。`,
      tags: ["AIO Hub", "目录结构", "registry", "跨端"],
      topic: "tool-structure",
      role: "near-negative",
    },
    {
      id: "30000000-0000-4000-8000-000000000006",
      sourceEntryId: "0831a42a-7769-4478-9b87-da375a64f302",
      sourceContentHash:
        "324b4cda03755ff38ecda14aea538c8ef25ee6dbcc896aee4f810d2257250b03",
      contentHash:
        "3ffc39c9c2d03ab677d8056a4d4c88fc820bf158f9769b875470e7d3b2e4ef1b",
      title: "内存计算加速层的数据权属",
      content: `## 前端是数据真源

Rust 侧的内存结构是高性能计算加速层，不是业务数据库。Vue/Pinia 前端保有数据所有权和持久化决策权；前端完成文件持久化后，将副本推送到 Rust 内存。该副本只用于向量检索和大规模文本匹配，不主动修改业务数据。`,
      tags: ["AIO Hub", "Rust", "Vue", "数据所有权", "计算加速"],
      topic: "memory-ownership",
      role: "positive",
    },
    {
      id: "30000000-0000-4000-8000-000000000007",
      sourceEntryId: "470cba76-fa85-4405-b0cd-fb6b328bbb4c",
      sourceContentHash:
        "49e3d1514960f4ec6a1a6e81ed67f40e35b40dcb49d504d738e608fccdd35ffe",
      contentHash:
        "b57858acbb8869f57d6795d1b0ea0364ceec24aadfc5ffe2d4ab201ca6c68feb",
      title: "内存数据库权属的早期方案",
      content: `## 已废弃的后端真源设想

早期方案曾假设 Rust 后端是单一事实来源，由后端执行修改和持久化，前端只保留展示镜像。该方案后续被架构校准否定：当前设计中，Rust 内存副本只负责计算加速，不是数据权属真源。`,
      tags: ["AIO Hub", "Rust", "历史方案", "已废弃"],
      topic: "memory-ownership",
      role: "near-negative",
    },
    {
      id: "30000000-0000-4000-8000-000000000008",
      sourceEntryId: "09774689-9c68-44bb-ab9f-94050e6815a2",
      sourceContentHash:
        "0b0e9fd03199b9dfe92743e5ceb9d4b949588fa032f27611cdbfbbc509dfebd0",
      contentHash:
        "2cd06083da307761ab3d5f67305d0c0804d6e81a082b16715e1e7d43e9c8e87e",
      title: "Markdown Base64 图片解码失败",
      content: `## 故障定位

\`decode markdown base64 image data failed\` 表明中继层尝试解析 Markdown 图片时遇到了畸形 Base64。排查时应检查原始请求体中的 \`data:image/...;base64,...\` 是否被截断、混入非法字符或重复编码，并用脱敏 DEBUG 摘要确认错误位置，不要记录完整图片数据。`,
      tags: ["AIO Hub", "Markdown", "Base64", "data URL", "故障排查"],
      topic: "base64-image",
      role: "positive",
    },
    {
      id: "30000000-0000-4000-8000-000000000009",
      sourceEntryId: "889ca6fc-dde5-49d7-ac71-6dfa1c059206",
      sourceContentHash:
        "a2f1d968ea18d2cb7ba2001e42a9b60dc2a73aab5929d6ded27cae825efa7dcb",
      contentHash:
        "16c9564303e421f96b0b6dc0b1a76a20608767cd5a3e6ef1ee786cb576d43d01",
      title: "Base64 资源导致配置写入阻塞",
      content: `## 不要持久化完整错误资源

当 API 错误对象夹带大型 Base64 资源时，把完整响应同步写入 JSON 会造成配置文件膨胀和 IPC 阻塞。持久化前应对 Error 字段限长、移除二进制载荷，并将高频保存改为异步防抖。这是写盘与状态管理问题，不等同于 Markdown data URL 解码错误。`,
      tags: ["AIO Hub", "Base64", "JSON", "IPC", "防抖"],
      topic: "base64-image",
      role: "near-negative",
    },
    {
      id: "30000000-0000-4000-8000-000000000010",
      sourceEntryId: "3f82e96e-ba7a-4fed-96df-5cf173952828",
      sourceContentHash:
        "d6fafe737f36d443f89a7a6d5fa23fbe8ad9b8683be0a5eddc250248d0af479d",
      contentHash:
        "122eb9487f2781f9a733c2069cf94ac274ee63be8cdcc8e10cc36f0681885d57",
      title: "Gemini 多模态上传的 Base64 契约",
      content: `## 合法的 inline_data

Gemini 多模态请求可以按接口契约提交 Base64 \`inline_data\`。这类正常上传要求 MIME 类型、字段名和编码内容完整，与 Markdown 中畸形 \`data:image\` 导致的解码失败不是同一问题。`,
      tags: ["Gemini", "Base64", "inline_data", "API"],
      topic: "base64-image",
      role: "near-negative",
    },
    {
      id: "30000000-0000-4000-8000-000000000011",
      sourceEntryId: "2d301495-254c-4c3c-b545-21033abf59a6",
      sourceContentHash:
        "5d5d7b3c4e8e9639dae4da6e8684439590917607d27fbe6ded8753564000c749",
      contentHash:
        "00fb12c727d17f27c7e3587d29c8c7e8ae41229d555374914cabd065d248e360",
      title: "Tailwind CSS 与原生 CSS 的混用",
      content: `## 样式分层策略

Tailwind 原子类可与原生 CSS 共存。通用组合可用 \`@apply\` 收敛，可复用组件样式放入 \`@layer components\`；复杂动效、滤镜和高度依赖 CSS 变量的布局则保留原生 CSS。该策略解决样式复用与优先级，不涉及富文本流式渲染。`,
      tags: ["Tailwind CSS", "CSS", "前端开发"],
      topic: "hard-negative",
      role: "hard-negative",
    },
    {
      id: "30000000-0000-4000-8000-000000000012",
      sourceEntryId: "7e52aee6-54a7-4e36-8ba6-7599749602a3",
      sourceContentHash:
        "8f44011efa4cbb03666b90797dfe40a38c67d8cf700d9b18c2ba96119ae6ff80",
      contentHash:
        "b55cfa0c4d657e6593a1d13ed8c81992a7af3ec5de0312bb9527f9f90a1b427f",
      title: "神经网络修音的泛音重构",
      content: `## 音高与泛音列

神经网络修音可以先分离基频轨迹与泛音列，再在改变音高时重新计算泛音的比例关系。相比只平移音频切片，这种方法能减少基频与泛音不匹配产生的电音感。该主题属于音频信号处理，与应用架构、Base64 或 Markdown 无关。`,
      tags: ["神经网络", "修音", "泛音列", "音频"],
      topic: "hard-negative",
      role: "hard-negative",
    },
  ],
};
