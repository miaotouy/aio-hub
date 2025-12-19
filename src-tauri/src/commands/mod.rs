// 命令模块汇总
pub mod clipboard;
pub mod file_operations;
pub mod directory_tree;
pub mod directory_janitor;
pub mod llm_inspector;
pub mod git_analyzer;
pub mod ocr;
pub mod window_manager;
pub mod window_config;
pub mod config_manager;
pub mod asset_manager;
pub mod agent_asset_manager;
pub mod sidecar_plugin;
pub mod native_plugin;
pub mod window_effects;
pub mod video_processor;
pub mod llmchat_search;

// 重新导出所有命令
pub use clipboard::*;
pub use file_operations::*;
pub use directory_tree::*;
pub use directory_janitor::*;
pub use llm_inspector::*;
pub use git_analyzer::*;
pub use ocr::*;
pub use window_manager::*;
pub use window_config::*;
pub use config_manager::*;
pub use asset_manager::*;
pub use agent_asset_manager::*;
pub use sidecar_plugin::*;
pub use window_effects::*;
pub use video_processor::*;
pub use llmchat_search::*;
// pub use native_plugin::*; // 不重新导出 native_plugin 的所有内容。
// native_plugin 模块包含特殊的管理函数，在 lib.rs 中通过其完全限定路径 (crate::commands::native_plugin::*) 进行精确调用，以避免与标准命令混淆。