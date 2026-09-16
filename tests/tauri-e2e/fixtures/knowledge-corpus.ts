// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

/**
 * 中文 Knowledge E2E 语料的固定来源定义。
 *
 * 这里只记录不可变的来源事实（数据集、固定 revision、每个源文件的字节数与
 * sha256）。派生产物不进入 git：运行前由
 * `bun tests/tauri-e2e/scripts/prepare-knowledge-corpus.ts` 下载、校验并切片到
 * 缓存目录（默认 `.dev-data/e2e-resources/knowledge-corpus/`）。
 *
 * 上游 revision 变化时必须先人工复核切片结果，再更新本文件。
 */
export interface KnowledgeCorpusSourceFile {
  /** 在派生流程中的角色。 */
  role: "corpus" | "queries" | "qrels";
  /** HF 仓库内路径。 */
  path: string;
  sizeBytes: number;
  /** 内容 sha256；与 HF LFS oid 一致。 */
  sha256: string;
  /** 该文件的 parquet 字段（用于校验上游 schema 未变）。 */
  columns: readonly string[];
}

export interface KnowledgeCorpusSource {
  id: string;
  /** 数据集名称，用于产物与日志。 */
  dataset: string;
  /** 固定 revision（commit sha）。 */
  revision: string;
  license: string;
  homepage: string;
  attribution: string;
  files: readonly KnowledgeCorpusSourceFile[];
}

export const knowledgeCorpusSource: KnowledgeCorpusSource = {
  id: "knowledge-zh-t2retrieval-v1",
  dataset: "mteb/T2Retrieval",
  revision: "921dd3af6e78d1ae7ee0368aa8d7eaee02c8f08e",
  license: "Apache-2.0",
  homepage: "https://huggingface.co/datasets/mteb/T2Retrieval",
  attribution:
    "T2Retrieval / T2Ranking (THUIR et al.), licensed under Apache-2.0. The corpus is derived from the C-MTEB T2Retrieval dataset published on Hugging Face.",
  files: [
    {
      role: "corpus",
      path: "corpus/dev-00000-of-00001.parquet",
      sizeBytes: 156_879_982,
      sha256:
        "8f0400530c6ba664e580e2ae7bb5ed41a908b8abc17c3b3934f42cc65992ac1e",
      columns: ["_id", "text", "title"],
    },
    {
      role: "queries",
      path: "queries/dev-00000-of-00001.parquet",
      sizeBytes: 817_540,
      sha256:
        "186b4d0a13cc4d8339eccfc6d465d1b2d4d1f6572defa8d39f3c8da3b66b0210",
      columns: ["_id", "text"],
    },
    {
      role: "qrels",
      path: "data/dev-00000-of-00001.parquet",
      sizeBytes: 1_149_414,
      sha256:
        "c4c6ffd715faf151e0832a26dfcf2d7ec1edc17d9620a9aa99e721cc2436d7d2",
      columns: ["query-id", "corpus-id", "score"],
    },
  ],
};

/**
 * 切片参数。选择规则必须是语料与参数的纯函数：同一 revision + 同一参数必然
 * 产生同一份产物，否则脚本会报“上游或参数变化，需要人工复核”。
 */
export interface KnowledgeCorpusSlice {
  /** 保留的查询数量。 */
  queryCount: number;
  /** 每个查询保留的相关段落数量上限（按 qrels 顺序取前 N）。 */
  relevantPerQuery: number;
  minRelevantPerQuery: number;
  /** 正文长度（清洗后字符数）允许区间。 */
  minPassageChars: number;
  maxPassageChars: number;
  /** 非相关干扰段落数量，用于让检索结果不是唯一候选。 */
  distractorCount: number;
  /** 断言用标记的长度（正文清洗后前缀字符数）。 */
  markerChars: number;
}

export const knowledgeCorpusSlice: KnowledgeCorpusSlice = {
  queryCount: 24,
  relevantPerQuery: 3,
  minRelevantPerQuery: 2,
  minPassageChars: 200,
  maxPassageChars: 1500,
  distractorCount: 24,
  markerChars: 16,
};

export const KNOWLEDGE_CORPUS_RELATIVE_DIR = [
  ".dev-data",
  "e2e-resources",
  "knowledge-corpus",
];

/** 官方 Hugging Face 端点；网络受限时可用 `--endpoint` 指向镜像。 */
export const KNOWLEDGE_CORPUS_DEFAULT_ENDPOINT = "https://huggingface.co";

/** 常用镜像端点，便于 `--endpoint` 直接引用。 */
export const KNOWLEDGE_CORPUS_MIRROR_ENDPOINT = "https://hf-mirror.com";

export const KNOWLEDGE_CORPUS_MANIFEST_FILE = "manifest.json";
export const KNOWLEDGE_CORPUS_NOTICE_FILE = "NOTICE.md";
export const KNOWLEDGE_CORPUS_SOURCE_DIR = "source";
export const KNOWLEDGE_CORPUS_DOCUMENT_DIR = "corpus";
export const KNOWLEDGE_CORPUS_QUERY_FILE = "queries.jsonl";
export const KNOWLEDGE_CORPUS_QRELS_FILE = "qrels.tsv";
