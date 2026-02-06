use infer;
use std::fs;
use std::io::Read;
use std::path::Path;

/// 根据文件内容和扩展名智能推断 MIME 类型
///
/// 优先使用 infer 库通过文件魔数检测，回退到扩展名映射
pub fn guess_mime_type(path: &Path) -> String {
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
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        // 默认
        _ => "application/octet-stream",
    }
    .to_string()
}
