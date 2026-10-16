// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

use infer;
use std::fs;
use std::io::Read;
use std::path::Path;

pub const WPS_MIME: &str = "application/kswps";
pub const DOC_MIME: &str = "application/msword";
pub const DOCX_MIME: &str =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

pub fn is_wps_document(path: &Path) -> bool {
    path.extension()
        .map(|ext| ext.eq_ignore_ascii_case("wps"))
        .unwrap_or(false)
}

/// WPS 扩展名可能封装 Word 二进制、OOXML 或其他文档，读取实际容器后再选择解析流程。
fn detect_wps_mime(path: &Path) -> Option<&'static str> {
    let mut file = fs::File::open(path).ok()?;
    let mut header = [0u8; 8];
    file.read_exact(&mut header).ok()?;
    if header == [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1] {
        let mut compound = cfb::CompoundFile::open(fs::File::open(path).ok()?).ok()?;
        let mut word = compound.open_stream("/WordDocument").ok()?;
        let mut fib = [0u8; 12];
        word.read_exact(&mut fib).ok()?;
        drop(word);
        let flags = u16::from_le_bytes([fib[10], fib[11]]);
        if flags & 0x8100 != 0 {
            return None;
        }
        if fib.starts_with(&[0xec, 0xa5])
            && (compound.is_stream("/0Table") || compound.is_stream("/1Table"))
        {
            return Some(DOC_MIME);
        }
    } else if header.starts_with(b"PK\x03\x04") {
        let mut archive = zip::ZipArchive::new(fs::File::open(path).ok()?).ok()?;
        if archive.by_name("[Content_Types].xml").is_ok()
            && archive.by_name("word/document.xml").is_ok()
        {
            return Some(DOCX_MIME);
        }
    } else if header.starts_with(b"{\\rtf") {
        return Some("application/rtf");
    }
    None
}

/// 根据文件内容和扩展名智能推断 MIME 类型
///
/// 优先使用 infer 库通过文件魔数检测，回退到扩展名映射
pub fn guess_mime_type(path: &Path) -> String {
    if is_wps_document(path) {
        return detect_wps_mime(path).unwrap_or(WPS_MIME).to_string();
    }
    // Word/OOXML 和 OpenDocument 文件容易被魔数检测误分为普通二进制或 zip 容器。
    // 这里先信任明确扩展名，避免 Office 文档被归类为 other。
    if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();
        match ext_str.as_str() {
            "odt" | "ott" | "fodt" => {
                return guess_mime_type_from_filename(&path.to_string_lossy())
            }
            "doc" => return "application/msword".to_string(),
            "docx" => {
                return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    .to_string()
            }
            "xlsx" => {
                return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                    .to_string()
            }
            "pptx" => {
                return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
                    .to_string()
            }
            _ => {}
        }
    }

    // 尝试读取文件前 8KB 用于魔数检测
    if let Ok(mut file) = fs::File::open(path) {
        use std::io::Read;
        let mut buffer = vec![0; 8192];
        if let Ok(n) = file.read(&mut buffer) {
            buffer.truncate(n);

            // 使用 infer 库通过文件魔数检测
            if let Some(kind) = infer::get(&buffer) {
                return kind.mime_type().to_string();
            }
        }
    }

    // 回退到基于扩展名的检测
    if let Some(ext) = path.extension() {
        let ext_str = ext.to_string_lossy().to_lowercase();

        // 常见的文本文件扩展名
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
        ];

        if text_extensions.contains(&ext_str.as_str()) {
            return format!("text/{}", ext_str);
        }

        // 已知的特定 MIME 类型映射
        let mime = match ext_str.as_str() {
            // 图片
            "jpg" | "jpeg" => "image/jpeg",
            "png" => "image/png",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "bmp" => "image/bmp",
            "ico" => "image/x-icon",
            "tiff" | "tif" => "image/tiff",
            "avif" => "image/avif",
            // 音频
            "mp3" => "audio/mpeg",
            "wav" => "audio/wav",
            "ogg" => "audio/ogg",
            "flac" => "audio/flac",
            "aac" => "audio/aac",
            "m4a" => "audio/mp4",
            // 视频
            "mp4" => "video/mp4",
            "webm" => "video/webm",
            "avi" => "video/x-msvideo",
            "mov" => "video/quicktime",
            "mkv" => "video/x-matroska",
            "flv" => "video/x-flv",
            // 文档
            "pdf" => "application/pdf",
            "wps" => WPS_MIME,
            "doc" => "application/msword",
            "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xls" => "application/vnd.ms-excel",
            "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "ppt" => "application/vnd.ms-powerpoint",
            "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            // JSON
            "json" => "application/json",
            // JavaScript/TypeScript
            "js" | "mjs" | "cjs" => "application/javascript",
            "ts" | "tsx" => "application/typescript",
            // 其他
            _ => "application/octet-stream",
        };

        mime.to_string()
    } else {
        "application/octet-stream".to_string()
    }
}

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

/// 仅根据文件名推断 MIME 类型（不读取文件内容）
#[allow(dead_code)]
pub fn guess_mime_type_from_filename(filename: &str) -> String {
    let extension = filename.rsplit('.').next().unwrap_or("").to_lowercase();

    match extension.as_str() {
        // 图片
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "tiff" | "tif" => "image/tiff",
        // 音频
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        "m4a" => "audio/mp4",
        "weba" => "audio/webm",
        // 视频
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "flv" => "video/x-flv",
        // 文档
        "pdf" => "application/pdf",
        "odt" => "application/vnd.oasis.opendocument.text",
        "ott" => "application/vnd.oasis.opendocument.text-template",
        "fodt" => "application/vnd.oasis.opendocument.text-flat-xml",
        "wps" => WPS_MIME,
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        // 默认
        _ => "application/octet-stream",
    }
    .to_string()
}

#[cfg(test)]
mod wps_tests {
    use super::*;
    use std::io::Write;

    fn word_compound(path: &Path, encrypted: bool) {
        let mut compound = cfb::create(path).unwrap();
        let mut fib = [0u8; 32];
        fib[..2].copy_from_slice(&[0xec, 0xa5]);
        fib[11] = u8::from(encrypted);
        compound
            .create_stream("/WordDocument")
            .unwrap()
            .write_all(&fib)
            .unwrap();
        compound
            .create_stream("/0Table")
            .unwrap()
            .write_all(&[0])
            .unwrap();
    }

    #[test]
    fn wps_identifies_word_streams_even_without_office_clsid() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("报告.WPS");
        word_compound(&path, false);
        assert_eq!(guess_mime_type(&path), DOC_MIME);
        assert!(crate::commands::document_converter::is_legacy_word_document(&path, DOC_MIME));
        word_compound(&path, true);
        assert_eq!(guess_mime_type(&path), WPS_MIME);
    }

    #[test]
    fn wps_distinguishes_ooxml_rtf_and_other_compound_formats() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("报告.wps");
        {
            let mut compound = cfb::create(&path).unwrap();
            compound
                .create_stream("/Workbook")
                .unwrap()
                .write_all(&[1])
                .unwrap();
        }
        assert_eq!(guess_mime_type(&path), WPS_MIME);
        assert!(!crate::commands::document_converter::is_legacy_word_document(&path, WPS_MIME));
        {
            let mut archive = zip::ZipWriter::new(fs::File::create(&path).unwrap());
            let options = zip::write::SimpleFileOptions::default();
            archive.start_file("[Content_Types].xml", options).unwrap();
            archive.write_all(b"<Types/>").unwrap();
            archive.start_file("word/document.xml", options).unwrap();
            archive.write_all(b"<document/>").unwrap();
            archive.finish().unwrap();
        }
        assert_eq!(guess_mime_type(&path), DOCX_MIME);
        fs::write(&path, b"{\\rtf1 Hello}").unwrap();
        assert_eq!(guess_mime_type(&path), "application/rtf");
        assert!(
            crate::commands::document_converter::is_legacy_word_document(&path, "application/rtf")
        );
    }
}
