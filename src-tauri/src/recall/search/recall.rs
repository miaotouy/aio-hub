// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");

use crate::recall::core::{
    QueryPayload, RecallProfile, RecallResult, RecallSearchFilters, RecallSignal, RecallSignalType,
    RecallTrace, RetrievalContext, RetrievalEngine, RetrievalEngineInfo,
};
use crate::recall::search::{BlenderRetrievalEngine, LensRetrievalEngine, VectorRetrievalEngine};
use std::collections::HashMap;
use uuid::Uuid;

pub const RECALL_ALGORITHM_VERSION: &str = "recall-profile-v1";

pub struct SemanticRecallEngine {
    vector: VectorRetrievalEngine,
}

impl SemanticRecallEngine {
    pub fn new() -> Self {
        Self {
            vector: VectorRetrievalEngine::new(),
        }
    }
}

impl RetrievalEngine for SemanticRecallEngine {
    fn id(&self) -> &str {
        "semantic"
    }

    fn info(&self) -> RetrievalEngineInfo {
        RetrievalEngineInfo {
            id: self.id().to_string(),
            name: "语义召回".to_string(),
            description: "以内容向量为主、标签向量为辅的稳定 Recall profile。".to_string(),
            icon: Some("lucide:brain".to_string()),
            supported_payload_types: vec!["vector".to_string()],
            requires_embedding: true,
            parameters: Vec::new(),
        }
    }

    fn search(
        &self,
        payload: &QueryPayload,
        filters: &RecallSearchFilters,
        context: &RetrievalContext,
    ) -> Result<Vec<RecallResult>, String> {
        let mut results = self.vector.search(payload, filters, context)?;
        annotate_results(
            &mut results,
            RecallProfile::Semantic,
            self.id(),
            filters.min_score,
        );
        Ok(results)
    }
}

pub struct AssociativeRecallEngine {
    lens: LensRetrievalEngine,
    blender: BlenderRetrievalEngine,
}

impl AssociativeRecallEngine {
    pub fn new() -> Self {
        Self {
            lens: LensRetrievalEngine::new(),
            blender: BlenderRetrievalEngine::new(),
        }
    }
}

impl RetrievalEngine for AssociativeRecallEngine {
    fn id(&self) -> &str {
        "associative"
    }

    fn info(&self) -> RetrievalEngineInfo {
        RetrievalEngineInfo {
            id: self.id().to_string(),
            name: "联想召回".to_string(),
            description: "融合标签扩散、历史投射、残差挖掘与多信号共振。".to_string(),
            icon: Some("lucide:sparkles".to_string()),
            supported_payload_types: vec!["vector".to_string()],
            requires_embedding: true,
            parameters: Vec::new(),
        }
    }

    fn search(
        &self,
        payload: &QueryPayload,
        filters: &RecallSearchFilters,
        context: &RetrievalContext,
    ) -> Result<Vec<RecallResult>, String> {
        let requested_limit = filters.limit.unwrap_or(6);
        let mut candidate_filters = filters.clone();
        candidate_filters.min_score = None;
        candidate_filters.limit = Some(requested_limit.saturating_mul(4).max(20));

        let lens_results = self.lens.search(payload, &candidate_filters, context)?;
        let blender_results = self.blender.search(payload, &candidate_filters, context)?;
        let mut candidates: HashMap<(Uuid, Uuid), RecallResult> = HashMap::new();
        let mut scores: HashMap<(Uuid, Uuid), (f32, f32)> = HashMap::new();

        for result in blender_results {
            let key = (result.recall_id, result.entry.id);
            scores.entry(key).or_default().0 = result.score;
            candidates.insert(key, result);
        }
        for result in lens_results {
            let key = (result.recall_id, result.entry.id);
            scores.entry(key).or_default().1 = result.score;
            candidates
                .entry(key)
                .and_modify(|existing| existing.signals.extend(result.signals.clone()))
                .or_insert(result);
        }

        let min_score = filters.min_score.unwrap_or(0.45);
        let mut results = candidates
            .into_iter()
            .filter_map(|(key, mut result)| {
                let (blender_score, lens_score) = scores.get(&key).copied().unwrap_or_default();
                let fusion_score = blender_score * 0.65 + lens_score * 0.35;
                if fusion_score < min_score {
                    return None;
                }
                result.score = fusion_score;
                result.match_type = "multi_signal".to_string();
                result.signals.push(RecallSignal {
                    signal_type: RecallSignalType::MultiSignal,
                    score: fusion_score,
                });
                Some(result)
            })
            .collect::<Vec<_>>();
        results.sort_by(|left, right| right.score.total_cmp(&left.score));
        results.truncate(requested_limit);
        annotate_results(
            &mut results,
            RecallProfile::Associative,
            self.id(),
            Some(min_score),
        );
        Ok(results)
    }
}

pub fn annotate_results(
    results: &mut [RecallResult],
    profile: RecallProfile,
    engine_id: &str,
    min_score: Option<f32>,
) {
    for (rank, result) in results.iter_mut().enumerate() {
        let candidate_score = result
            .signals
            .iter()
            .filter(|signal| signal.signal_type != RecallSignalType::MultiSignal)
            .map(|signal| signal.score)
            .max_by(f32::total_cmp)
            .unwrap_or(result.score);
        result.trace = Some(RecallTrace {
            algorithm_version: RECALL_ALGORITHM_VERSION.to_string(),
            profile: Some(profile),
            engine_id: engine_id.to_string(),
            candidate_score,
            fusion_score: result.score,
            min_score,
            passed_min_score: min_score.is_none_or(|minimum| result.score >= minimum),
            rank: rank + 1,
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_capabilities_are_explicit() {
        assert!(SemanticRecallEngine::new().info().requires_embedding);
        assert!(AssociativeRecallEngine::new().info().requires_embedding);
        assert_eq!(RECALL_ALGORITHM_VERSION, "recall-profile-v1");
    }
}
