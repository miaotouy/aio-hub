use uuid::Uuid;

/// 向量矩阵，用于语义相似度计算
#[allow(dead_code)]
pub struct VectorMatrix {
    pub model_id: String,
    /// 索引顺序对应的条目 ID
    pub ids: Vec<Uuid>,
    /// 展平的向量数据 (维度 * 数量)
    pub data: Vec<f32>,
    pub dimension: usize,
    pub total_tokens: usize,
}

impl VectorMatrix {
    pub fn new() -> Self {
        Self {
            model_id: String::new(),
            ids: Vec::new(),
            data: Vec::new(),
            dimension: 0,
            total_tokens: 0,
        }
    }

    /// 清空并重建矩阵
    #[allow(dead_code)]
    pub fn rebuild(
        &mut self,
        model_id: String,
        dimension: usize,
        total_tokens: usize,
        entries: Vec<(Uuid, Vec<f32>)>,
    ) {
        self.model_id = model_id;
        self.dimension = dimension;
        self.total_tokens = total_tokens;
        self.ids.clear();
        self.data.clear();

        for (id, vector) in entries {
            if vector.len() == dimension {
                self.ids.push(id);
                self.data.extend_from_slice(&vector);
            }
        }
    }

    /// 更新或添加单个向量
    #[allow(dead_code)]
    pub fn update_vector(&mut self, id: Uuid, vector: Vec<f32>) {
        if self.dimension == 0 {
            self.dimension = vector.len();
        }

        if vector.len() != self.dimension {
            return;
        }

        if let Some(pos) = self.ids.iter().position(|&x| x == id) {
            let start = pos * self.dimension;
            let end = start + self.dimension;
            self.data[start..end].copy_from_slice(&vector);
        } else {
            self.ids.push(id);
            self.data.extend_from_slice(&vector);
        }
    }

    /// 移除单个向量
    pub fn remove_vector(&mut self, id: &Uuid) {
        if let Some(pos) = self.ids.iter().position(|x| x == id) {
            self.ids.remove(pos);
            let start = pos * self.dimension;
            let end = start + self.dimension;
            self.data.drain(start..end);
        }
    }

    /// 获取单个向量
    #[allow(dead_code)]
    pub fn get_vector(&self, index: usize) -> Option<&[f32]> {
        if index >= self.ids.len() {
            return None;
        }
        let start = index * self.dimension;
        let end = start + self.dimension;
        Some(&self.data[start..end])
    }
}
