// 命令模块汇总
pub mod agent_asset_manager;
pub mod asset_manager;
pub mod canvas_window;
pub mod clipboard;
pub mod config_manager;
pub mod content_deduplicator;
pub mod dir_search;
pub mod directory_janitor;
pub mod directory_tree;
pub mod document_converter;
#[cfg(windows)]
pub mod external_player;
pub mod ffmpeg_processor;
pub mod file_operations;
pub mod font_list;
pub mod git_analyzer;
pub mod llm_inspector;
pub mod llm_proxy;
pub mod llmchat_search;
pub mod media_generator_search;
pub mod native_plugin;
pub mod ocr;
pub mod sidecar_plugin;
pub mod sidecar_plugin_manager;
pub mod skill_manager;
pub mod system;
pub mod system_pulse;
#[cfg(windows)]
pub mod window_automator;
pub mod window_config;
pub mod window_effects;
pub mod window_manager;

// 重新导出所有命令
pub use agent_asset_manager::*;
pub use asset_manager::*;
pub use canvas_window::*;
pub use clipboard::*;
pub use config_manager::*;
pub use content_deduplicator::*;
pub use dir_search::*;
pub use directory_janitor::*;
pub use directory_tree::*;
pub use document_converter::*;
#[cfg(windows)]
pub use external_player::*;
pub use ffmpeg_processor::*;
pub use file_operations::*;
pub use font_list::*;
pub use git_analyzer::*;
pub use llm_inspector::*;
pub use llm_proxy::*;
pub use llmchat_search::*;
pub use media_generator_search::*;
pub use ocr::*;
pub use sidecar_plugin::*;
pub use sidecar_plugin_manager::*;
pub use skill_manager::*;
pub use system::*;
pub use system_pulse::*;

#[cfg(windows)]
pub use window_automator::*;
pub use window_config::*;
pub use window_effects::*;
pub use window_manager::*;
// pub use native_plugin::*; // 不重新导出 native_plugin 的所有内容。
// native_plugin 模块包含特殊的管理函数，在 lib.rs 中通过其完全限定路径 (crate::commands::native_plugin::*) 进行精确调用，以避免与标准命令混淆。

/// 统一注册所有命令处理器，精简 lib.rs
pub fn register_commands(builder: tauri::Builder<tauri::Wry>) -> tauri::Builder<tauri::Wry> {
    builder.invoke_handler(tauri::generate_handler![
        greet,
        open_url,
        get_local_ips,
        get_app_config_dir,
        update_tray_setting,
        get_tray_setting,
        exit_app,
        set_show_tray_icon,
        start_clipboard_monitor,
        stop_clipboard_monitor,
        get_clipboard_content_type,
        move_and_link,
        create_links_only,
        cancel_move_operation,
        get_latest_operation_log,
        get_all_operation_logs,
        get_image_dimensions,
        process_files_with_regex,
        validate_regex_pattern,
        generate_directory_tree,
        is_directory,
        list_directory,
        read_file_binary,
        read_file_binary_raw,
        read_app_data_file_binary,
        read_file_as_base64,
        save_uploaded_file,
        copy_file_to_app_data,
        copy_directory_in_app_data,
        delete_file_to_trash,
        delete_directory_in_app_data,
        write_file_force,
        write_text_file_force,
        append_file_force,
        create_dir_force,
        read_text_file_force,
        open_path_force,
        open_file_directory,
        validate_file_for_link,
        validate_files_for_link,
        path_exists,
        preview_skill_manifest,
        rename_skill,
        get_file_metadata,
        get_file_mime_type,
        analyze_directory_for_cleanup,
        cleanup_items,
        stop_directory_scan,
        stop_directory_cleanup,
        scan_content_duplicates,
        stop_dedup_scan,
        read_file_content_for_diff,
        delete_duplicate_files,
        // Skill 管理命令
        get_all_skill_manifests,
        list_builtin_skills,
        get_builtin_skill_version,
        install_builtin_skill,
        reset_skill_to_builtin,
        get_well_known_skill_paths,
        run_skill_script,
        read_skill_resource,
        write_skill_resource,
        list_skill_directory,
        install_skill_from_dir,
        install_skill_from_git,
        install_skill_from_zip,
        install_skill_from_zip_file,
        detect_skill_package,
        install_bundle,
        uninstall_bundle,
        get_installed_bundles,
        prepare_and_detect_package,
        clean_temp_dir,
        // LLM检查器命令
        start_llm_inspector,
        stop_llm_inspector,
        get_inspector_status,
        update_inspector_target,
        // Git分析器命令
        git_load_repository,
        git_load_repository_stream,
        git_get_branch_commits,
        git_get_branches,
        git_get_incremental_commits,
        git_load_incremental_stream,
        git_get_commit_detail,
        git_cherry_pick,
        git_revert,
        git_export_commits,
        git_format_log,
        git_update_commit_message,
        git_enrich_commits_stream,
        git_cancel_enrich,
        git_cancel_load,
        // OCR命令
        native_ocr,
        // 外部播放器透明弹幕覆盖层命令 (Windows)
        #[cfg(windows)]
        find_player_windows,
        #[cfg(windows)]
        get_player_window_rect,
        #[cfg(windows)]
        is_window_valid,
        #[cfg(windows)]
        create_danmaku_overlay_window,
        #[cfg(windows)]
        close_danmaku_overlay_window,
        #[cfg(windows)]
        set_danmaku_overlay_ignore_cursor,
        #[cfg(windows)]
        get_mpc_be_status,
        #[cfg(windows)]
        get_external_player_status,
        #[cfg(windows)]
        bring_danmaku_overlay_to_top,
        #[cfg(windows)]
        set_danmaku_overlay_zorder,
        // 窗口自动化助手 (Window Automator) 命令
        #[cfg(windows)]
        wa_capture_window,
        #[cfg(windows)]
        wa_get_client_rect,
        #[cfg(windows)]
        wa_get_pixel,
        #[cfg(windows)]
        wa_get_windows,
        #[cfg(windows)]
        wa_is_window_valid,
        #[cfg(windows)]
        wa_send_click,
        #[cfg(windows)]
        wa_send_keypress,
        // 窗口管理命令
        create_tool_window,
        focus_window,
        set_window_position,
        set_window_shadow,
        ensure_window_visible,
        // 窗口配置管理命令
        save_window_config,
        apply_window_config,
        delete_window_config,
        clear_all_window_configs,
        get_saved_window_labels,
        // 新统一分离命令
        begin_detach_session,
        update_detach_session_position,
        update_detach_session_status,
        finalize_detach_session,
        get_all_detached_windows,
        close_detached_window,
        end_drag_session,
        // 画布窗口命令
        create_canvas_window,
        close_canvas_window,
        close_all_canvas_windows,
        get_canvas_windows,
        // 窗口导航命令
        navigate_main_window_to_settings,
        // 配置管理命令
        list_config_files,
        export_all_configs_to_zip,
        import_all_configs_from_zip,
        // 资产管理命令
        check_asset_manager_document_converter,
        detect_asset_manager_document_converters,
        detect_libreoffice_path,
        convert_legacy_document,
        get_asset_base_path,
        import_asset_from_path,
        import_asset_from_bytes,
        get_asset_base64,
        get_asset_binary,
        read_text_file,
        list_all_assets,
        rebuild_hash_index,
        find_duplicate_files,
        delete_asset,
        save_asset_thumbnail,
        // Lazy loading commands
        list_assets_paginated,
        get_asset_stats,
        rebuild_catalog_index,
        // 资产来源管理命令
        remove_asset_source,
        add_asset_source,
        remove_asset_completely,
        remove_assets_completely,
        find_asset_by_hash,
        remove_asset_derived_data,
        update_asset_derived_data,
        get_asset_by_id,
        // Agent 资产管理命令
        save_agent_asset,
        read_agent_asset_binary,
        delete_agent_asset,
        batch_delete_agent_assets,
        list_agent_assets,
        delete_all_agent_assets,
        get_agent_asset_path,
        // 插件管理命令
        uninstall_plugin,
        uninstall_skill,
        install_plugin_from_zip,
        preflight_plugin_zip,
        // Sidecar 插件命令
        execute_sidecar,
        // 常驻 Sidecar 进程命令
        sidecar_spawn_resident,
        sidecar_send_command,
        sidecar_kill_resident,
        // 临时文件管理命令
        write_temp_files,
        cleanup_temp_files,
        // 原生插件命令
        native_plugin::load_native_plugin,
        native_plugin::unload_native_plugin,
        native_plugin::call_native_plugin_method,
        // 窗口特效命令
        apply_window_effect,
        list_directory_images,
        // 视频处理命令
        check_command_version,
        check_ffmpeg_availability,
        process_media,
        kill_ffmpeg_process,
        get_media_metadata,
        get_full_media_info,
        // LLM 代理命令
        start_llm_proxy_server,
        // 目录搜索命令
        dir_search,
        dir_search_cancel,
        dir_replace,
        dir_replace_single,
        dir_replace_preview,
        dir_search_copy_files,
        dir_search_move_files,
        // LLM 搜索命令
        search_llm_data,
        search_llm_data_stream,
        cancel_llm_chat_search,
        search_media_generator_data,
        // 基于 rdev 的拖拽会话命令 (仅在非 macOS 上注册)
        #[cfg(not(target_os = "macos"))]
        start_drag_session,
        // 知识库命令
        crate::knowledge::kb_initialize,
        crate::knowledge::kb_batch_import_files,
        crate::knowledge::kb_batch_upsert_entries,
        crate::knowledge::kb_check_vector_coverage,
        crate::knowledge::kb_get_library_stats,
        crate::knowledge::kb_get_tag_pool_stats,
        crate::knowledge::kb_load_model_vectors,
        crate::knowledge::kb_update_entry_vector,
        crate::knowledge::kb_clear_legacy_vectors,
        crate::knowledge::kb_clear_all_other_vectors,
        crate::knowledge::kb_get_embedding_cache,
        crate::knowledge::kb_set_embedding_cache,
        crate::knowledge::kb_clear_embedding_cache,
        crate::knowledge::kb_retrieval_cache_get,
        crate::knowledge::kb_retrieval_cache_set,
        crate::knowledge::kb_retrieval_cache_clear,
        crate::knowledge::kb_retrieval_cache_stats,
        crate::knowledge::kb_search,
        crate::knowledge::kb_upsert_entry,
        crate::knowledge::kb_delete_entry,
        crate::knowledge::kb_batch_delete_entries,
        crate::knowledge::kb_batch_patch_entries,
        crate::knowledge::kb_save_base_meta,
        crate::knowledge::kb_warmup,
        crate::knowledge::kb_list_bases,
        crate::knowledge::kb_load_base_meta,
        crate::knowledge::kb_load_entry,
        crate::knowledge::kb_get_entries,
        crate::knowledge::kb_list_entry_ids,
        crate::knowledge::kb_list_engines,
        crate::knowledge::kb_get_missing_tags,
        crate::knowledge::kb_sync_tag_vectors,
        crate::knowledge::kb_rebuild_tag_pool_index,
        crate::knowledge::kb_list_all_tags,
        crate::knowledge::kb_list_tag_pool_models,
        crate::knowledge::kb_clear_tag_pool,
        crate::knowledge::kb_clear_other_tag_pools,
        crate::knowledge::kb_flush_all_tag_pools,
        crate::knowledge::kb_clone_base,
        crate::knowledge::kb_export_base,
        crate::knowledge::monitor::kb_monitor_heartbeat,
        // 网页蒸馏室命令
        crate::web_distillery::distillery_quick_fetch,
        crate::web_distillery::distillery_start_proxy,
        crate::web_distillery::distillery_stop_proxy,
        crate::web_distillery::distillery_get_proxy_port,
        crate::web_distillery::distillery_set_proxy_cookies,
        crate::web_distillery::distillery_get_proxy_cookies,
        crate::web_distillery::distillery_set_proxy_local_storage,
        // 网页蒸馏室 - Cookie 加密命令
        crate::web_distillery::distillery_check_crypto,
        crate::web_distillery::distillery_encrypt_cookie_values,
        crate::web_distillery::distillery_decrypt_cookie_values,
        // 系统脉搏命令
        start_pulse,
        stop_pulse,
        // 字体列表命令
        get_system_fonts,
    ])
}
