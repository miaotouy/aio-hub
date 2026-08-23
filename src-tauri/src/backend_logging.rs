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

//! 后端本地日志器。
//!
//! 设计目标：
//! - 每条记录都立即 `flush`，供前端、诊断工具或外部读取器及时读取；
//! - 每次写入都按当前应用时区检查日期，进程跨午夜时切换到新的日文件；
//! - 单文件按大小归档而非覆盖，旧日志按保留期清理；
//! - 所有文件切换和写入在同一互斥锁内串行执行，避免并发日志破坏顺序或轮转竞态。

use chrono::{Local, Utc};
use chrono_tz::Tz;
use log::{Level, LevelFilter, Log, Metadata, Record};
use std::{
    error::Error,
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, SystemTime},
};

const BACKEND_LOG_MAX_FILE_SIZE: u64 = 5 * 1024 * 1024;
const BACKEND_LOG_RETENTION_DAYS: u64 = 30;
const BACKEND_LOG_PREFIX: &str = "backend-";
const BACKEND_LOG_EXTENSION: &str = "log";

#[derive(Clone, Debug)]
pub enum LogTimezone {
    SystemLocal,
    Named(Tz),
}

impl LogTimezone {
    pub fn from_setting(value: &str) -> Self {
        match value {
            "auto" => Self::SystemLocal,
            value => value
                .parse::<Tz>()
                .map(Self::Named)
                .unwrap_or(Self::SystemLocal),
        }
    }

    pub fn format_now(&self) -> String {
        self.now().timestamp
    }

    fn now(&self) -> LogMoment {
        match self {
            Self::SystemLocal => Self::format_datetime(Local::now()),
            Self::Named(timezone) => Self::format_datetime(Utc::now().with_timezone(timezone)),
        }
    }

    fn format_datetime<TzValue>(datetime: chrono::DateTime<TzValue>) -> LogMoment
    where
        TzValue: chrono::TimeZone,
        TzValue::Offset: std::fmt::Display,
    {
        LogMoment {
            date: datetime.format("%Y-%m-%d").to_string(),
            timestamp: datetime.format("%Y-%m-%d %H:%M:%S%.3f").to_string(),
            archive_time: datetime.format("%H-%M-%S-%3f").to_string(),
        }
    }
}

#[derive(Clone, Debug)]
struct LogMoment {
    date: String,
    timestamp: String,
    archive_time: String,
}

struct BackendLogWriter {
    log_dir: PathBuf,
    max_file_size: u64,
    retention: Duration,
    active_date: Option<String>,
    active_file: Option<File>,
    current_size: u64,
}

impl BackendLogWriter {
    fn new(log_dir: PathBuf, max_file_size: u64, retention: Duration) -> io::Result<Self> {
        fs::create_dir_all(&log_dir)?;

        let writer = Self {
            log_dir,
            max_file_size,
            retention,
            active_date: None,
            active_file: None,
            current_size: 0,
        };
        writer.cleanup_expired_files();
        Ok(writer)
    }

    fn write_line(&mut self, moment: &LogMoment, line: &[u8], sync_data: bool) -> io::Result<()> {
        self.switch_day_if_needed(moment)?;

        let line_size = line.len() as u64;
        if self.current_size > 0 && self.current_size.saturating_add(line_size) > self.max_file_size
        {
            self.rotate_active_file(moment)?;
        }

        let file = self
            .active_file
            .as_mut()
            .expect("active backend log file must be open before writing");
        file.write_all(line)?;
        // `flush` makes the data visible to readers immediately instead of leaving it in the
        // Rust file buffer. `sync_data` is intentionally reserved for failures and shutdown,
        // where durability is more important than the latency of every DEBUG/INFO record.
        file.flush()?;
        if sync_data {
            file.sync_data()?;
        }
        self.current_size = self.current_size.saturating_add(line_size);
        Ok(())
    }

    fn flush(&mut self, sync_data: bool) -> io::Result<()> {
        if let Some(file) = self.active_file.as_mut() {
            file.flush()?;
            if sync_data {
                file.sync_data()?;
            }
        }
        Ok(())
    }

    fn switch_day_if_needed(&mut self, moment: &LogMoment) -> io::Result<()> {
        if self.active_date.as_deref() == Some(moment.date.as_str()) {
            return Ok(());
        }

        self.close_active_file(true)?;
        self.open_active_file(&moment.date)?;
        self.cleanup_expired_files();
        Ok(())
    }

    fn rotate_active_file(&mut self, moment: &LogMoment) -> io::Result<()> {
        let active_date = self
            .active_date
            .as_deref()
            .expect("active backend log date must exist before rotation")
            .to_owned();
        self.close_active_file(true)?;

        let active_path = self.active_path(&active_date);
        if active_path.exists() {
            fs::rename(&active_path, self.next_archive_path(&active_date, moment))?;
        }

        self.open_active_file(&active_date)
    }

    fn open_active_file(&mut self, date: &str) -> io::Result<()> {
        let path = self.active_path(date);
        let file = OpenOptions::new().create(true).append(true).open(&path)?;
        self.current_size = file.metadata()?.len();
        self.active_date = Some(date.to_owned());
        self.active_file = Some(file);
        Ok(())
    }

    fn close_active_file(&mut self, sync_data: bool) -> io::Result<()> {
        if let Some(mut file) = self.active_file.take() {
            file.flush()?;
            if sync_data {
                file.sync_data()?;
            }
        }
        self.current_size = 0;
        self.active_date = None;
        Ok(())
    }

    fn active_path(&self, date: &str) -> PathBuf {
        self.log_dir.join(format!(
            "{BACKEND_LOG_PREFIX}{date}.{BACKEND_LOG_EXTENSION}"
        ))
    }

    fn next_archive_path(&self, date: &str, moment: &LogMoment) -> PathBuf {
        let base_name = format!("{BACKEND_LOG_PREFIX}{date}.{}", moment.archive_time);
        let mut candidate = self
            .log_dir
            .join(format!("{base_name}.{BACKEND_LOG_EXTENSION}"));
        let mut index = 1;

        while candidate.exists() {
            candidate = self
                .log_dir
                .join(format!("{base_name}-{index}.{BACKEND_LOG_EXTENSION}"));
            index += 1;
        }

        candidate
    }

    fn cleanup_expired_files(&self) {
        let cutoff = SystemTime::now().checked_sub(self.retention);
        let Some(cutoff) = cutoff else {
            return;
        };

        let entries = match fs::read_dir(&self.log_dir) {
            Ok(entries) => entries,
            Err(error) => {
                eprintln!("[backend logger] 无法扫描日志保留期: {error}");
                return;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if !is_backend_log_file(&path) {
                continue;
            }

            let is_expired = entry
                .metadata()
                .and_then(|metadata| metadata.modified())
                .map(|modified| modified < cutoff)
                .unwrap_or(false);

            if is_expired {
                if let Err(error) = fs::remove_file(&path) {
                    eprintln!(
                        "[backend logger] 无法删除过期日志 {}: {error}",
                        path.display()
                    );
                }
            }
        }
    }
}

fn is_backend_log_file(path: &Path) -> bool {
    path.is_file()
        && path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| {
                name.starts_with(BACKEND_LOG_PREFIX)
                    && name.ends_with(&format!(".{BACKEND_LOG_EXTENSION}"))
            })
}

struct BackendLogger {
    timezone: LogTimezone,
    writer: Mutex<BackendLogWriter>,
}

impl BackendLogger {
    fn new(log_dir: PathBuf, timezone: LogTimezone) -> io::Result<Self> {
        Ok(Self {
            timezone,
            writer: Mutex::new(BackendLogWriter::new(
                log_dir,
                BACKEND_LOG_MAX_FILE_SIZE,
                Duration::from_secs(BACKEND_LOG_RETENTION_DAYS * 24 * 60 * 60),
            )?),
        })
    }

    fn accepts_target(level: Level, target: &str) -> bool {
        // Keep the existing high-volume dependency filtering behaviour while retaining all
        // application logs, including DEBUG and TRACE, for diagnosis.
        if target.starts_with("hyper") {
            level <= Level::Warn
        } else if target.starts_with("hnsw_rs") {
            level <= Level::Info
        } else {
            true
        }
    }

    fn format_record(&self, record: &Record<'_>, moment: &LogMoment) -> String {
        format!(
            "[{}] [{}] [{}] {}\n",
            moment.timestamp,
            record.level(),
            record.target(),
            record.args()
        )
    }
}

impl Log for BackendLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        Self::accepts_target(metadata.level(), metadata.target())
    }

    fn log(&self, record: &Record<'_>) {
        if !self.enabled(record.metadata()) {
            return;
        }

        let moment = self.timezone.now();
        let line = self.format_record(record, &moment);
        let sync_data = matches!(record.level(), Level::Error);

        // Keep stdout as a second live diagnostic target. Failure to print or persist one
        // record must never recursively emit another `log!` record.
        let mut stdout = io::stdout().lock();
        let _ = stdout.write_all(line.as_bytes());
        let _ = stdout.flush();

        let mut writer = self
            .writer
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Err(error) = writer.write_line(&moment, line.as_bytes(), sync_data) {
            eprintln!("[backend logger] 写入日志失败: {error}");
        }
    }

    fn flush(&self) {
        let mut writer = self
            .writer
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Err(error) = writer.flush(true) {
            eprintln!("[backend logger] 刷新日志失败: {error}");
        }
    }
}

pub fn install(log_dir: PathBuf, timezone: LogTimezone) -> Result<(), Box<dyn Error>> {
    let logger = BackendLogger::new(log_dir, timezone)?;
    log::set_boxed_logger(Box::new(logger))?;
    log::set_max_level(LevelFilter::Trace);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn moment(date: &str, timestamp: &str, archive_time: &str) -> LogMoment {
        LogMoment {
            date: date.to_owned(),
            timestamp: timestamp.to_owned(),
            archive_time: archive_time.to_owned(),
        }
    }

    #[test]
    fn switches_to_a_new_file_when_the_date_changes() {
        let temp_dir = tempdir().expect("create temp dir");
        let mut writer = BackendLogWriter::new(
            temp_dir.path().to_path_buf(),
            1024,
            Duration::from_secs(24 * 60 * 60),
        )
        .expect("create writer");

        writer
            .write_line(
                &moment("2026-08-23", "2026-08-23 23:59:59.999", "23-59-59-999"),
                b"before midnight\n",
                false,
            )
            .expect("write first day");
        writer
            .write_line(
                &moment("2026-08-24", "2026-08-24 00:00:00.000", "00-00-00-000"),
                b"after midnight\n",
                false,
            )
            .expect("write second day");

        assert_eq!(
            fs::read_to_string(temp_dir.path().join("backend-2026-08-23.log"))
                .expect("read first day"),
            "before midnight\n"
        );
        assert_eq!(
            fs::read_to_string(temp_dir.path().join("backend-2026-08-24.log"))
                .expect("read second day"),
            "after midnight\n"
        );
    }

    #[test]
    fn rotates_by_size_without_discarding_the_previous_log() {
        let temp_dir = tempdir().expect("create temp dir");
        let mut writer = BackendLogWriter::new(
            temp_dir.path().to_path_buf(),
            20,
            Duration::from_secs(24 * 60 * 60),
        )
        .expect("create writer");
        let log_moment = moment("2026-08-23", "2026-08-23 12:00:00.000", "12-00-00-000");

        writer
            .write_line(&log_moment, b"first log entry\n", false)
            .expect("write active file");
        writer
            .write_line(&log_moment, b"second log entry\n", false)
            .expect("rotate and write active file");

        let files = fs::read_dir(temp_dir.path())
            .expect("read temp dir")
            .flatten()
            .map(|entry| entry.file_name().to_string_lossy().into_owned())
            .collect::<Vec<_>>();

        assert!(files.iter().any(|name| name == "backend-2026-08-23.log"));
        assert!(files
            .iter()
            .any(|name| name.starts_with("backend-2026-08-23.12-00-00-000")));
        assert_eq!(
            fs::read_to_string(temp_dir.path().join("backend-2026-08-23.log"))
                .expect("read active file"),
            "second log entry\n"
        );
    }
}
