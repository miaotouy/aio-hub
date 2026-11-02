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

use std::{
    process::{ExitStatus, Stdio},
    time::Duration,
};

use serde::Serialize;
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWriteExt},
    process::Command,
};

use crate::FormatOptions;

const INPUT_LIMIT: usize = 4 * 1024 * 1024;
const OUTPUT_LIMIT: u64 = 16 * 1024 * 1024;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatterStatus {
    pub available: bool,
    pub engine: String,
    pub version: Option<String>,
    pub error: Option<String>,
}

fn engine(language: &str) -> Result<&'static str, String> {
    match language {
        "rust" => Ok("rustfmt"),
        "c" | "cpp" => Ok("clang-format"),
        _ => Err(format!("系统格式化器暂未支持语言：{language}")),
    }
}

fn installation_hint(engine: &str) -> &'static str {
    match engine {
        "rustfmt" => "请运行 rustup component add rustfmt，或填写 rustfmt 可执行文件的绝对路径",
        _ => "请安装 LLVM / clang-format，或填写 clang-format 可执行文件的绝对路径",
    }
}

fn command(engine: &str, path: Option<&str>) -> Result<Command, String> {
    let path = path.map(str::trim).filter(|value| !value.is_empty());
    if let Some(path) = path {
        if !std::path::Path::new(path).is_absolute() {
            return Err("格式化器路径需为可执行文件的绝对路径".into());
        }
    }
    let mut command = Command::new(path.unwrap_or(engine));
    command.kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    Ok(command)
}

async fn read_output(reader: impl AsyncRead + Unpin) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    reader
        .take(OUTPUT_LIMIT + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|error| format!("读取格式化器输出失败：{error}"))?;
    if bytes.len() as u64 > OUTPUT_LIMIT {
        return Err("格式化器输出超过 16 MiB，请缩小代码片段".into());
    }
    Ok(bytes)
}

/// Concurrent pipe IO avoids deadlocks when both input and output exceed pipe capacity.
/// Keep the child owned here so every timeout/error can kill AND reap it.
async fn run(
    mut command: Command,
    input: &[u8],
    deadline: Duration,
) -> Result<(ExitStatus, Vec<u8>, Vec<u8>), String> {
    let mut child = command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("启动格式化器失败：{error}"))?;
    let mut stdin = child.stdin.take().ok_or("格式化器输入管道不可用")?;
    let stdout = child.stdout.take().ok_or("格式化器输出管道不可用")?;
    let stderr = child.stderr.take().ok_or("格式化器错误管道不可用")?;
    let task = async {
        let write = async {
            // A formatter can reject arguments/syntax before consuming all input.
            // Keep its exit status and diagnostic instead of masking it with BrokenPipe.
            let result = stdin.write_all(input).await;
            drop(stdin);
            match result {
                Err(error) if error.kind() != std::io::ErrorKind::BrokenPipe => {
                    Err(format!("写入格式化器失败：{error}"))
                }
                _ => Ok(()),
            }
        };
        let wait = async {
            child
                .wait()
                .await
                .map_err(|error| format!("等待格式化器失败：{error}"))
        };
        let (_, stdout, stderr, status) =
            tokio::try_join!(write, read_output(stdout), read_output(stderr), wait)?;
        Ok((status, stdout, stderr))
    };
    match tokio::time::timeout(deadline, task).await {
        Ok(Ok(output)) => Ok(output),
        outcome => {
            let _ = child.kill().await;
            match outcome {
                Ok(Err(error)) => Err(error),
                _ => Err("格式化器运行超时，请缩小代码片段并检查可执行文件".into()),
            }
        }
    }
}

fn diagnostics(stderr: &[u8]) -> String {
    String::from_utf8_lossy(stderr)
        .trim()
        .chars()
        .take(3000)
        .collect()
}

pub async fn status(language: &str, path: Option<&str>) -> FormatterStatus {
    let engine = match engine(language) {
        Ok(engine) => engine,
        Err(error) => {
            return FormatterStatus {
                available: false,
                engine: language.into(),
                version: None,
                error: Some(error),
            };
        }
    };
    let probe = async {
        let mut command = command(engine, path)?;
        // Isolate rustup's toolchain selection from the application's project directory.
        let scratch = tempfile::tempdir().map_err(|error| error.to_string())?;
        command.current_dir(scratch.path()).arg("--version");
        let (exit, stdout, stderr) = run(command, &[], Duration::from_secs(5)).await?;
        let version = String::from_utf8_lossy(&stdout).trim().to_owned();
        if !exit.success() || !version.to_lowercase().contains(engine) {
            return Err(format!(
                "可执行文件未返回有效的 {engine} 版本：{}",
                diagnostics(&stderr)
            ));
        }
        Ok(version.chars().take(200).collect::<String>())
    }
    .await;
    match probe {
        Ok(version) => FormatterStatus {
            available: true,
            engine: engine.into(),
            version: Some(version),
            error: None,
        },
        Err(error) => FormatterStatus {
            available: false,
            engine: engine.into(),
            version: None,
            error: Some(format!("{error}；{}", installation_hint(engine))),
        },
    }
}

pub async fn format(
    code: String,
    language: &str,
    options: FormatOptions,
) -> Result<String, String> {
    let engine = engine(language)?;
    if code.trim().is_empty() {
        return Ok(String::new());
    }
    if code.len() > INPUT_LIMIT {
        return Err("代码超过 4 MiB，请分段格式化".into());
    }
    let width = options.print_width.unwrap_or(80);
    let indent = options
        .tab_width
        .unwrap_or(if language == "rust" { 4 } else { 2 });
    if !(1..=1000).contains(&width) || !(1..=16).contains(&indent) {
        return Err("换行宽度需为 1–1000，缩进宽度需为 1–16".into());
    }
    let mut command = command(engine, options.formatter_path.as_deref())?;
    let scratch =
        tempfile::tempdir().map_err(|error| format!("创建格式化工作目录失败：{error}"))?;
    command.current_dir(scratch.path());
    if language == "rust" {
        let edition = options.rust_edition.as_deref().unwrap_or("2024");
        if !matches!(edition, "2015" | "2018" | "2021" | "2024") {
            return Err("Rust edition 支持 2015、2018、2021、2024".into());
        }
        let config = scratch.path().join("rustfmt.toml");
        std::fs::write(&config, "").map_err(|error| format!("创建格式化配置失败：{error}"))?;
        command.args(["--emit", "stdout", "--edition", edition, "--config-path"])
            .arg(config).arg("--config").arg(format!(
                "skip_children=true,max_width={width},tab_spaces={indent},hard_tabs={},newline_style=Unix",
                options.use_tabs.unwrap_or(false)
            ));
    } else {
        command.arg(if language == "c" {
            "--assume-filename=snippet.c"
        } else {
            "--assume-filename=snippet.cpp"
        });
        command.arg(format!("--style={{BasedOnStyle: LLVM, ColumnLimit: {width}, IndentWidth: {indent}, TabWidth: {indent}, UseTab: {}, UseCRLF: false}}",
            if options.use_tabs.unwrap_or(false) { "Always" } else { "Never" }));
    }
    let (exit, stdout, stderr) = run(command, code.as_bytes(), Duration::from_secs(10))
        .await
        .map_err(|error| format!("{engine}：{error}；{}", installation_hint(engine)))?;
    if !exit.success() {
        return Err(format!("{engine} 格式化失败：{}", diagnostics(&stderr)));
    }
    let formatted =
        String::from_utf8(stdout).map_err(|_| "格式化结果包含无效的 UTF-8 内容".to_owned())?;
    if formatted.trim().is_empty() {
        return Err(format!("{engine} 返回了空结果，请检查可执行文件"));
    }
    Ok(formatted)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Use this test executable as a deterministic cross-platform subprocess fixture.
    // No installed formatter or shell is required by the process contract tests.
    #[test]
    #[ignore = "subprocess fixture"]
    fn process_fixture() {
        use std::io::{Read, Write};
        match std::env::var("AIO_FORMATTER_FIXTURE").unwrap().as_str() {
            "duplex" => {
                std::io::stdout()
                    .write_all(&vec![b'x'; 256 * 1024])
                    .unwrap();
                let mut input = Vec::new();
                std::io::stdin().read_to_end(&mut input).unwrap();
                assert_eq!(input.len(), 256 * 1024);
                std::io::stderr()
                    .write_all(b"diagnostic preserved")
                    .unwrap();
            }
            "reject" => {
                std::io::stderr().write_all(b"invalid syntax").unwrap();
                std::process::exit(2);
            }
            "hang" => std::thread::sleep(Duration::from_secs(30)),
            "overflow" => {
                let _ = std::io::stdout().write_all(&vec![b'x'; OUTPUT_LIMIT as usize + 1024]);
            }
            _ => panic!("unknown fixture mode"),
        }
    }

    fn fixture(mode: &str) -> Command {
        let mut command = command(
            "fixture",
            Some(std::env::current_exe().unwrap().to_str().unwrap()),
        )
        .unwrap();
        command
            .args([
                "--ignored",
                "--exact",
                "external::tests::process_fixture",
                "--nocapture",
            ])
            .env("AIO_FORMATTER_FIXTURE", mode);
        command
    }

    #[tokio::test]
    async fn drains_output_while_writing_input_and_preserves_failure_diagnostics() {
        let (status, stdout, stderr) = run(
            fixture("duplex"),
            &vec![b'y'; 256 * 1024],
            Duration::from_secs(5),
        )
        .await
        .unwrap();
        assert!(status.success());
        assert!(stdout.len() >= 256 * 1024);
        assert_eq!(stderr, b"diagnostic preserved");
        let (status, _, stderr) = run(
            fixture("reject"),
            &vec![b'y'; 256 * 1024],
            Duration::from_secs(5),
        )
        .await
        .unwrap();
        assert_eq!(status.code(), Some(2));
        assert_eq!(stderr, b"invalid syntax");
    }

    #[tokio::test]
    async fn bounds_runtime_and_output() {
        let command = fixture("hang");
        // The call must return well before the fixture finishes its 30s sleep.
        let start = std::time::Instant::now();
        let error = run(command, b"", Duration::from_millis(100))
            .await
            .unwrap_err();
        assert!(error.contains("超时"));
        assert!(start.elapsed() < Duration::from_secs(5));
        let error = run(fixture("overflow"), b"", Duration::from_secs(5))
            .await
            .unwrap_err();
        assert!(error.contains("16 MiB"));
    }

    #[tokio::test]
    async fn validates_options_and_reports_missing_executable() {
        let error = format(
            "fn main() {}".into(),
            "rust",
            FormatOptions {
                rust_edition: Some("2099".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
        assert!(error.contains("edition"));
        let error = format(
            "int main() {}".into(),
            "c",
            FormatOptions {
                formatter_path: Some("relative.exe".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
        assert!(error.contains("绝对路径"));
        let scratch = tempfile::tempdir().unwrap();
        let path = scratch
            .path()
            .join("missing-formatter")
            .to_string_lossy()
            .into_owned();
        let result = status("cpp", Some(&path)).await;
        assert!(!result.available);
        assert_eq!(result.engine, "clang-format");
        assert!(result.error.unwrap().contains("安装"));
    }
}
