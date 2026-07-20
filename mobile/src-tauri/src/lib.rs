// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[cfg(target_os = "android")]
mod android_content;
mod asset_manager;
mod llm_file_transport;
mod token_counting;
mod validation;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    #[cfg(target_os = "android")]
    let builder = builder.plugin(android_content::init());
    builder
        .register_asynchronous_uri_scheme_protocol("aio-asset", |context, request, responder| {
            let app = context.app_handle().clone();
            tauri::async_runtime::spawn(async move {
                let response = asset_manager::asset_preview_protocol_response(app, request).await;
                responder.respond(response);
            });
        })
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .manage(asset_manager::AssetManagerState::default())
        .manage(llm_file_transport::NativeRequestState::default())
        .manage(validation::ValidationState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            asset_manager::asset_import_sources,
            asset_manager::asset_start_import_job,
            asset_manager::asset_get_import_job,
            asset_manager::asset_list_import_jobs,
            asset_manager::asset_cancel_import_job,
            asset_manager::asset_list,
            asset_manager::asset_get_detail,
            asset_manager::asset_get_preview_source,
            asset_manager::asset_revoke_preview_source,
            asset_manager::asset_export,
            asset_manager::asset_replace_entity_usages,
            asset_manager::asset_analyze_delete,
            asset_manager::asset_set_retention_policy,
            asset_manager::asset_set_library_state,
            asset_manager::asset_get_library_facets,
            asset_manager::asset_clear_rebuildable_cache,
            asset_manager::asset_delete,
            asset_manager::asset_get_storage_summary,
            asset_manager::asset_repair_library,
            llm_file_transport::send_llm_file_request,
            llm_file_transport::cancel_llm_file_request,
            token_counting::count_tokens,
            token_counting::count_tokens_batch,
            validation::run_platform_file_validation,
            validation::cleanup_platform_file_validation,
            validation::terminate_for_validation,
            validation::prepare_sqlite_crash_validation,
            validation::run_sqlite_validation,
            validation::cancel_sqlite_validation,
            validation::reset_sqlite_validation_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
