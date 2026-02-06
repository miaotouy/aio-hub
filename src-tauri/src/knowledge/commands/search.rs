use crate::knowledge::core::{
    QueryPayload, RetrievalContext, RetrievalEngineInfo, SearchFilters, SearchResult,
};
use crate::knowledge::monitor::{
    emit_monitor_event, KbMonitorEvent, KbMonitorLevel, KbMonitorStep, KbStepStatus, RagMetadata,
    RagPayload, RagResult, RagStats,
};
use crate::knowledge::state::KnowledgeState;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn kb_list_engines(
    state: State<'_, KnowledgeState>,
) -> Result<Vec<RetrievalEngineInfo>, String> {
    Ok(state.engines.iter().map(|e| e.info()).collect())
}

#[tauri::command]
pub async fn kb_search(
    app: AppHandle,
    state: State<'_, KnowledgeState>,
    query: String,
    filters: SearchFilters,
    engine_id: Option<String>,
    vector_payload: Option<Vec<f32>>,
    model: Option<String>,
) -> Result<Vec<SearchResult>, String> {
    let start_time = std::time::Instant::now();
    let id = engine_id.unwrap_or_else(|| "keyword".to_string());

    log::info!(
        "[KB_SEARCH] 接收检索请求: engine={}, query='{}', kb_ids={:?}, has_vector={}",
        id,
        query,
        filters.kb_ids,
        vector_payload.is_some()
    );

    let engine = state
        .get_engine(&id)
        .ok_or_else(|| format!("找不到检索引擎: {}", id))?;

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let context = RetrievalContext {
        db: state.imdb.clone(),
        tag_pool_manager: state.tag_pool.clone(),
        app_data_dir,
    };

    // 步骤1: 查询向量生成 (如果是预向量化的则耗时极短)
    let vector_gen_start = std::time::Instant::now();
    let payload = if let Some(vector) = vector_payload.as_ref() {
        QueryPayload::Vector {
            vector: vector.clone(),
            model: model.clone().unwrap_or_default(),
            query: if query.is_empty() {
                None
            } else {
                Some(query.clone())
            },
        }
    } else {
        QueryPayload::Text(query.clone())
    };
    let vector_gen_duration = vector_gen_start.elapsed().as_millis() as u64;

    // 步骤2: 向量召回与初步过滤
    let recall_start = std::time::Instant::now();
    let results = engine.search(&payload, &filters, &context)?;
    let recall_duration = recall_start.elapsed().as_millis() as u64;

    // 推送监控事件
    let duration = start_time.elapsed().as_millis() as u64;
    let results_preview: Vec<RagResult> = results
        .iter()
        .take(10)
        .map(|r| RagResult {
            id: r.caiu.id.to_string(),
            score: r.score,
            content: r.caiu.content.chars().take(200).collect(),
            source: Some(r.kb_name.clone()),
            metadata: None,
        })
        .collect();

    let kb_ids_str: Vec<String> = filters
        .kb_ids
        .as_ref()
        .map(|ids| ids.iter().map(|id| id.to_string()).collect())
        .unwrap_or_default();

    let monitor_payload = RagPayload {
        steps: vec![
            KbMonitorStep {
                name: "查询向量生成".to_string(),
                status: KbStepStatus::Completed,
                duration: vector_gen_duration,
                details: Some(format!(
                    "查询类型: {}",
                    if vector_payload.is_some() {
                        "向量查询"
                    } else {
                        "文本查询"
                    }
                )),
            },
            KbMonitorStep {
                name: "向量召回".to_string(),
                status: KbStepStatus::Completed,
                duration: recall_duration,
                details: Some(format!("召回 {} 个结果", results.len())),
            },
            KbMonitorStep {
                name: "上下文构建".to_string(),
                status: KbStepStatus::Completed,
                duration: duration.saturating_sub(vector_gen_duration + recall_duration),
                details: Some(format!("构建检索上下文，引擎: {}", id)),
            },
        ],
        results: Some(results_preview),
        stats: RagStats {
            duration,
            token_count: None,
            hit_count: Some(results.len() as u32),
            recall_count: Some(results.len() as u32),
        },
        metadata: Some(RagMetadata {
            query: query.clone(),
            model_id: model.unwrap_or_default(),
            engine_id: id.clone(),
            kb_ids: kb_ids_str.clone(),
        }),
    };

    let _ = emit_monitor_event(
        &app,
        KbMonitorEvent::RAG(monitor_payload),
        KbMonitorLevel::Info,
        "RAG 检索完成",
        &format!(
            "在 {} 个知识库中检索到 {} 个结果",
            kb_ids_str.len(),
            results.len()
        ),
        "VectorEngine",
    );

    Ok(results)
}
