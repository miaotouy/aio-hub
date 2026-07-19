// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

pub mod commands;
mod repository;
pub mod types;

use repository::KnowledgeRepository;
use std::sync::{Arc, RwLock};

pub struct KnowledgeState {
    repository: RwLock<Option<Arc<KnowledgeRepository>>>,
}

impl KnowledgeState {
    pub fn new() -> Self {
        Self {
            repository: RwLock::new(None),
        }
    }

    pub fn set_repository(&self, repository: Arc<KnowledgeRepository>) -> Result<(), String> {
        *self
            .repository
            .write()
            .map_err(|_| "获取 Knowledge repository 写锁失败".to_string())? = Some(repository);
        Ok(())
    }

    pub fn repository(&self) -> Result<Arc<KnowledgeRepository>, String> {
        self.repository
            .read()
            .map_err(|_| "获取 Knowledge repository 读锁失败".to_string())?
            .clone()
            .ok_or_else(|| "Knowledge repository 尚未初始化".to_string())
    }

    #[cfg(test)]
    pub(crate) fn initialized_for_test(app_data_dir: &std::path::Path) -> Self {
        let state = Self::new();
        let repository = Arc::new(KnowledgeRepository::new(app_data_dir));
        repository
            .initialize()
            .expect("Knowledge test repository should initialize");
        state
            .set_repository(repository)
            .expect("Knowledge test repository should attach to state");
        state
    }
}

impl Default for KnowledgeState {
    fn default() -> Self {
        Self::new()
    }
}

pub use commands::*;
