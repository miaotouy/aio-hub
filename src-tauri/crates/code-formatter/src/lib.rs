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

use std::{borrow::Cow, str::FromStr};

use mago_allocator::LocalArena;
use mago_formatter::{
    Formatter,
    settings::{EndOfLine, FormatSettings},
};
use mago_php_version::PHPVersion;
use serde::Deserialize;

pub mod external;

#[derive(Debug, Default, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct FormatOptions {
    pub formatter_path: Option<String>,
    pub rust_edition: Option<String>,
    pub single_quote: Option<bool>,
    pub print_width: Option<usize>,
    pub tab_width: Option<usize>,
    pub use_tabs: Option<bool>,
    pub trailing_comma: Option<TrailingComma>,
    #[serde(rename = "trailingCommaPHP")]
    pub trailing_comma_php: Option<bool>,
    pub php_version: Option<String>,
    pub end_of_line: Option<EndOfLine>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TrailingComma {
    None,
    Es5,
    All,
}

/// Format in-memory code without inspecting files or launching external programs.
pub fn format_code(code: String, language: &str, options: FormatOptions) -> Result<String, String> {
    if language != "php" {
        return Err(format!("原生格式化暂未支持语言：{language}"));
    }
    if code.trim().is_empty() {
        return Ok(String::new());
    }

    let version = PHPVersion::from_str(options.php_version.as_deref().unwrap_or("8.4"))
        .map_err(|_| "PHP 版本无效，请使用明确的版本号，例如 8.4".to_owned())?;
    if version < PHPVersion::PHP70 || version > PHPVersion::LATEST {
        return Err("PHP 格式化支持的目标版本为 7.0 至 8.5".to_owned());
    }

    let print_width = options.print_width.unwrap_or(80);
    let tab_width = options.tab_width.unwrap_or(4);
    if !(1..=1000).contains(&print_width) || !(1..=16).contains(&tab_width) {
        return Err("换行宽度需为 1–1000，缩进宽度需为 1–16".to_owned());
    }
    let mut settings = FormatSettings::default();
    settings.single_quote = options.single_quote.unwrap_or(true);
    settings.print_width = print_width;
    settings.tab_width = tab_width;
    settings.use_tabs = options.use_tabs.unwrap_or(false);
    settings.trailing_comma = options
        .trailing_comma_php
        .unwrap_or(!matches!(options.trailing_comma, Some(TrailingComma::None)));
    settings.end_of_line = options.end_of_line.unwrap_or(EndOfLine::Lf);

    let arena = LocalArena::new();
    let formatter = Formatter::new(&arena, version, settings);
    let formatted = formatter
        .format_code(Cow::Borrowed(b"snippet.php"), Cow::Owned(code.into_bytes()))
        .map_err(|error| format!("PHP 语法错误：{error}"))?;
    String::from_utf8(formatted.to_vec()).map_err(|_| "格式化结果包含无效的 UTF-8 内容".to_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_php_preserving_comments_and_is_idempotent() {
        let source = "<?php\n// 中文说明\nfunction greet($name){return \"Hello \".$name;}";
        let formatted = format_code(source.into(), "php", FormatOptions::default()).unwrap();
        assert_ne!(formatted, source);
        assert!(formatted.contains("// 中文说明"));
        assert!(formatted.contains("'Hello ' . $name"));
        assert_eq!(
            format_code(formatted.clone(), "php", FormatOptions::default()).unwrap(),
            formatted
        );
    }

    #[test]
    fn rejects_invalid_php_instead_of_returning_partial_output() {
        assert!(
            format_code(
                "<?php function broken( {".into(),
                "php",
                FormatOptions::default()
            )
            .is_err()
        );
    }

    #[test]
    fn honors_public_indentation_and_line_ending_options() {
        let options = FormatOptions {
            tab_width: Some(2),
            end_of_line: Some(EndOfLine::Crlf),
            single_quote: Some(false),
            ..Default::default()
        };
        let formatted = format_code(
            "<?php function greet(){return \"hello\";}".into(),
            "php",
            options,
        )
        .unwrap();
        assert!(formatted.contains("\r\n  return \"hello\";"));
        assert!(!formatted.replace("\r\n", "").contains('\n'));
    }

    #[test]
    fn rejects_automatic_version_detection_and_invalid_layout() {
        let options = FormatOptions {
            php_version: Some("auto".into()),
            ..Default::default()
        };
        assert!(format_code("<?php echo 1;".into(), "php", options).is_err());
        let options = FormatOptions {
            print_width: Some(0),
            ..Default::default()
        };
        assert!(format_code("<?php echo 1;".into(), "php", options).is_err());
    }
}
