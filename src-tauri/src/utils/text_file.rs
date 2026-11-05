// Copyright 2025-2026 miaotouy(Github@miaotouy)
// Licensed under the Apache License, Version 2.0.

use std::{fs, io::Read, path::Path};

/// 启发式检测 Buffer 是否可能为文本（与前端 isBufferLikelyText 保持一致）
pub fn is_buffer_likely_text(buffer: &[u8]) -> bool {
    if buffer.is_empty() {
        return true;
    }

    // 检查前 1024 字节
    let check_length = buffer.len().min(1024);
    for &byte in &buffer[..check_length] {
        // 如果包含 NULL 字符，极大概率是二进制文件
        if byte == 0 {
            return false;
        }
        // 简单的控制字符检查（除了 TAB:9, LF:10, CR:13）
        if byte < 7 || (byte > 14 && byte < 32) {
            return false;
        }
    }

    true
}

/// 判断文件是否为文本文件
pub fn is_text_file(path: &Path) -> bool {
    // 1. 优先检查扩展名（快速路径）
    if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        let text_extensions = [
            "txt",
            "text",
            "log",
            "cfg",
            "conf",
            "ini",
            "env",
            "md",
            "markdown",
            "rst",
            "adoc",
            "asciidoc",
            "xml",
            "html",
            "htm",
            "xhtml",
            "svg",
            "json",
            "yaml",
            "yml",
            "toml",
            "csv",
            "tsv",
            "js",
            "jsx",
            "ts",
            "tsx",
            "mjs",
            "cjs",
            "py",
            "pyw",
            "pyi",
            "rb",
            "php",
            "java",
            "kt",
            "kts",
            "c",
            "cpp",
            "cc",
            "cxx",
            "h",
            "hpp",
            "hxx",
            "cs",
            "go",
            "rs",
            "swift",
            "m",
            "mm",
            "scala",
            "lua",
            "perl",
            "pl",
            "r",
            "sh",
            "bash",
            "zsh",
            "fish",
            "ps1",
            "bat",
            "cmd",
            "css",
            "scss",
            "sass",
            "less",
            "styl",
            "vue",
            "svelte",
            "astro",
            "gitignore",
            "dockerignore",
            "editorconfig",
            "makefile",
            "cmake",
            "gradle",
            "sql",
            "graphql",
            "proto",
            "thrift",
            "lrc",
            "ass",
            "ssa",
            "srt",
            "vtt",
        ];
        if text_extensions.contains(&ext_str.as_str()) {
            return true;
        }
    }

    // 2. 启发式内容检测（慢速路径，但更准）
    if let Ok(mut file) = fs::File::open(path) {
        let mut buffer = vec![0; 1024];
        if let Ok(n) = file.read(&mut buffer) {
            return is_buffer_likely_text(&buffer[..n]);
        }
    }

    false
}
