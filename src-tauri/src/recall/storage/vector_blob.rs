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

pub fn encode_vector(vector: &[f32]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(std::mem::size_of_val(vector));
    for value in vector {
        bytes.extend_from_slice(&value.to_le_bytes());
    }
    bytes
}

pub fn decode_vector(bytes: &[u8], dimension: usize) -> Result<Vec<f32>, String> {
    if !bytes.len().is_multiple_of(size_of::<f32>()) {
        return Err(format!("向量 BLOB 长度不是 4 的倍数: {}", bytes.len()));
    }

    let actual_dimension = bytes.len() / size_of::<f32>();
    if actual_dimension != dimension {
        return Err(format!(
            "向量维度不匹配: expected {}, got {}",
            dimension, actual_dimension
        ));
    }

    Ok(bytes
        .chunks_exact(size_of::<f32>())
        .map(|chunk| f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::{decode_vector, encode_vector};

    #[test]
    fn vector_blob_round_trip_uses_little_endian_f32() {
        let vector = vec![0.25, -1.5, f32::INFINITY];
        let encoded = encode_vector(&vector);

        assert_eq!(&encoded[0..4], &0.25_f32.to_le_bytes());
        assert_eq!(decode_vector(&encoded, vector.len()).unwrap(), vector);
    }

    #[test]
    fn vector_blob_rejects_invalid_length_and_dimension() {
        assert!(decode_vector(&[0, 1, 2], 1).is_err());
        assert!(decode_vector(&0.25_f32.to_le_bytes(), 2).is_err());
    }
}
