// 命令模块汇总
pub mod agent_asset_manager;
pub mod asset_manager;
pub mod clipboard;
pub mod config_manager;
pub mod directory_janitor;
pub mod directory_tree;
pub mod file_operations;
pub mod git_analyzer;
pub mod llm_inspector;
pub mod llm_proxy;
pub mod llmchat_search;
pub mod media_generator_search;
pub mod native_plugin;
pub mod ocr;
pub mod sidecar_plugin;
pub mod ffmpeg_processor;
pub mod window_config;
pub mod window_effects;
pub mod window_manager;

// 重新导出所有命令
pub use agent_asset_manager::*;
pub use asset_manager::*;
pub use clipboard::*;
pub use config_manager::*;
pub use directory_janitor::*;
pub use directory_tree::*;
pub use file_operations::*;
pub use git_analyzer::*;
pub use llm_inspector::*;
pub use llm_proxy::*;
pub use llmchat_search::*;
pub use media_generator_search::*;
pub use ocr::*;
pub use sidecar_plugin::*;
pub use ffmpeg_processor::*;
pub use window_config::*;
pub use window_effects::*;
pub use window_manager::*;
// pub use native_plugin::*; // 不重新导出 native_plugin 的所有内容。
// native_plugin 模块包含特殊的管理函数，在 lib.rs 中通过其完全限定路径 (crate::commands::native_plugin::*) 进行精确调用，以避免与标准命令混淆。
