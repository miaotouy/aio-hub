# Tesseract 语言包

本目录用于存放 Tesseract.js 的语言包文件。

## 下载语言包

请从以下仓库下载所需的语言包文件（.traineddata.gz）：

https://github.com/naptha/tessdata/tree/gh-pages/4.0.0_best_int

## 常用语言包

- `chi_sim.traineddata.gz` - 简体中文
- `chi_tra.traineddata.gz` - 繁体中文  
- `eng.traineddata.gz` - 英文

## 使用方法

1. 下载所需的语言包文件
2. 将 `.traineddata.gz` 文件直接放在本目录下
3. 语言包会在 OCR 识别时自动加载

## 示例目录结构

```
public/tesseract-lang/
├── README.md
├── chi_sim.traineddata.gz
├── chi_tra.traineddata.gz
└── eng.traineddata.gz
```

## 注意事项

- 首次使用时会加载语言包，可能需要一些时间
- 支持多语言组合，如 `chi_sim+eng` 表示同时识别中英文