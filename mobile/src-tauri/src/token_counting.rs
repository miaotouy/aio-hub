use serde::Serialize;
use std::sync::OnceLock;
use tiktoken_rs::{o200k_base, CoreBPE};

const TOKENIZER_NAME: &str = "o200k_base";
static TOKENIZER: OnceLock<Result<CoreBPE, String>> = OnceLock::new();

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenCountResult {
    pub count: usize,
    pub tokenizer: &'static str,
    pub estimated: bool,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenCountBatchResult {
    pub counts: Vec<usize>,
    pub total: usize,
    pub tokenizer: &'static str,
    pub estimated: bool,
}

fn tokenizer() -> Result<&'static CoreBPE, String> {
    TOKENIZER
        .get_or_init(|| {
            o200k_base().map_err(|error| format!("failed to initialize o200k_base: {error}"))
        })
        .as_ref()
        .map_err(Clone::clone)
}

fn count_texts(texts: &[String]) -> Result<TokenCountBatchResult, String> {
    let tokenizer = tokenizer()?;
    let counts = texts
        .iter()
        .map(|text| tokenizer.count_ordinary(text))
        .collect::<Vec<_>>();
    let total = counts.iter().try_fold(0usize, |sum, count| {
        sum.checked_add(*count)
            .ok_or_else(|| "token count overflow".to_string())
    })?;

    Ok(TokenCountBatchResult {
        counts,
        total,
        tokenizer: TOKENIZER_NAME,
        estimated: true,
    })
}

#[tauri::command]
pub async fn count_tokens(text: String) -> Result<TokenCountResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let batch = count_texts(&[text])?;
        Ok(TokenCountResult {
            count: batch.counts[0],
            tokenizer: batch.tokenizer,
            estimated: batch.estimated,
        })
    })
    .await
    .map_err(|error| format!("token counting task failed: {error}"))?
}

#[tauri::command]
pub async fn count_tokens_batch(texts: Vec<String>) -> Result<TokenCountBatchResult, String> {
    tauri::async_runtime::spawn_blocking(move || count_texts(&texts))
        .await
        .map_err(|error| format!("token counting task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_desktop_gpt4o_fixed_samples() {
        let samples = vec![
            "Hello, world! This is a token counting test.".to_string(),
            "你好，世界！这是一个 Token 计数测试。".to_string(),
            "AIO Hub 支持 Vue 3, TypeScript and Rust.".to_string(),
            "const total = items.reduce((sum, item) => sum + item.value, 0);".to_string(),
            "👋🌍 Café naïve 日本語 العربية".to_string(),
            String::new(),
        ];

        let result = count_texts(&samples).expect("fixed samples should encode");

        assert_eq!(result.counts, vec![11, 12, 14, 19, 10, 0]);
        assert_eq!(result.total, 66);
        assert_eq!(result.tokenizer, TOKENIZER_NAME);
        assert!(result.estimated);
    }

    #[test]
    fn preserves_batch_order_and_handles_an_empty_batch() {
        let result = count_texts(&[]).expect("empty batch should be valid");

        assert!(result.counts.is_empty());
        assert_eq!(result.total, 0);
    }

    #[test]
    fn counts_a_hundred_messages_in_one_batch() {
        let texts = (0..100)
            .map(|index| format!("Message {index}: 你好，AIO Hub token counting."))
            .collect::<Vec<_>>();

        let result = count_texts(&texts).expect("batch should encode");

        assert_eq!(result.counts.len(), texts.len());
        assert_eq!(result.total, result.counts.iter().copied().sum::<usize>());
        assert!(result.counts.iter().all(|count| *count > 0));
    }
}
