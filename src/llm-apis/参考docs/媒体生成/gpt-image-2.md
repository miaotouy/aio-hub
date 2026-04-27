# 生成图像（Text to Image）

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ""
  description: ""
  version: 1.0.0
paths:
  /images/generations:
    post:
      summary: 生成图像（Text to Image）
      deprecated: false
      description: |
        根据文字提示词从头生成全新图像。

        **gpt-image-2 特性：**
        - 支持超高分辨率（最高 4K）
        - 支持流式传输（stream + partial_images）
        - 返回 base64 编码的图像数据
        - 不支持透明背景（background: transparent）

        **注意事项：**
        - 复杂提示词最多可能需要 2 分钟处理
        - 超过 2560x1440（3,686,400 像素）的输出为实验性功能
      operationId: createImage
      tags:
        - 图像生成
        - 图像生成
      parameters:
        - name: Authorization
          in: header
          description: ""
          required: false
          example: Bearer sk-kpzD48Ff6WAAk7jsuQKTtTMq0vLzvn49YR0rJ2SauwSPEvF5
          schema:
            type: string
      requestBody:
        content:
          application/json:
            schema:
              $ref: "#/components/schemas/ImageGenerationRequest"
            examples:
              基础生成（最简参数）:
                value:
                  model: gpt-image-2
                  prompt: >-
                    A children's book drawing of a veterinarian using a
                    stethoscope to listen to the heartbeat of a baby otter.
                summary: 最简请求示例
              完整参数（高质量方形图）:
                value:
                  model: gpt-image-2
                  prompt: >-
                    A photorealistic image of a serene mountain lake at sunrise,
                    with snow-capped peaks reflecting in the crystal-clear
                    water, surrounded by pine trees
                  "n": 1
                  size: 1024x1024
                  quality: high
                  output_format: jpeg
                  output_compression: 85
                  background: auto
                  moderation: auto
                  stream: false
                  partial_images: 0
                summary: 所有参数完整示例
              横向高清（4K 横向）:
                value:
                  model: gpt-image-2
                  prompt: >-
                    A breathtaking panoramic view of the Grand Canyon at golden
                    hour, dramatic clouds, ultra-realistic photography style
                  "n": 1
                  size: 3840x2160
                  quality: high
                  output_format: jpeg
                  output_compression: 90
                  background: auto
                  moderation: auto
                summary: 4K 横向图示例
              流式传输示例:
                value:
                  model: gpt-image-2
                  prompt: >-
                    Draw a gorgeous image of a river made of white owl feathers,
                    snaking its way through a serene winter landscape
                  "n": 1
                  size: 1024x1024
                  quality: medium
                  output_format: png
                  background: auto
                  moderation: auto
                  stream: true
                  partial_images: 2
                summary: 启用流式传输（返回中间进度图）
              低质量快速预览:
                value:
                  model: gpt-image-2
                  prompt: A cute cartoon cat sitting on a cloud
                  "n": 1
                  size: 1024x1024
                  quality: low
                  output_format: webp
                  output_compression: 70
                  background: auto
                  moderation: auto
                summary: 低质量快速草图
      responses:
        "200":
          description: 图像生成成功
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ImageResponse"
              example:
                created: 1713000000
                data:
                  - b64_json: iVBORw0KGgoAAAANSUhEUgAA...
          headers: {}
          x-apifox-name: ""
        "400":
          description: 请求参数错误
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
                x-apifox-ignore-properties: []
              example:
                error:
                  message: >-
                    Invalid value for 'size': must be one of the supported
                    sizes.
                  type: invalid_request_error
                  param: size
                  code: null
          headers: {}
          x-apifox-name: ""
        "401":
          description: API Key 无效或未提供
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
                x-apifox-ignore-properties: []
              example:
                error:
                  message: Incorrect API key provided.
                  type: invalid_request_error
          headers: {}
          x-apifox-name: ""
        "429":
          description: 超出速率限制
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
                x-apifox-ignore-properties: []
              example:
                error:
                  message: Rate limit reached for images.
                  type: rate_limit_error
          headers: {}
          x-apifox-name: ""
      security:
        - BearerAuth: []
          x-apifox:
            schemeGroups:
              - id: hHguUxx5c2ZJ0FvdOnNQo
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: hHguUxx5c2ZJ0FvdOnNQo
            scopes:
              hHguUxx5c2ZJ0FvdOnNQo:
                BearerAuth: []
      x-apifox-folder: 图像生成
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/8161229/apis/api-447974298-run
components:
  schemas:
    ImageGenerationRequest:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          enum:
            - gpt-image-2
          default: gpt-image-2
          description: 使用的模型名称，固定为 gpt-image-2
        prompt:
          type: string
          description: 描述要生成图像内容的文字提示词
          maxLength: 32000
          examples:
            - >-
              A children's book drawing of a veterinarian using a stethoscope to
              listen to the heartbeat of a baby otter.
        "n":
          type: integer
          description: 一次请求生成的图像数量，默认为 1
          default: 1
          minimum: 1
          maximum: 10
          examples:
            - 1
        size:
          type: string
          description: |
            生成图像的分辨率尺寸。
            常用尺寸：
              - 1024x1024（方形，速度最快）
              - 1536x1024（横向）
              - 1024x1536（纵向）
              - 2048x2048（2K 方形）
              - 2048x1152（2K 横向）
              - 3840x2160（4K 横向）
              - 2160x3840（4K 纵向）
              - auto（默认，由模型自动选择最佳尺寸）
            尺寸限制：
              - 最大边长 ≤ 3840px
              - 两边均为 16px 的倍数
              - 长宽比不超过 3:1
              - 总像素数在 655,360 ~ 8,294,400 之间
          default: auto
          enum:
            - auto
            - 1024x1024
            - 1536x1024
            - 1024x1536
            - 2048x2048
            - 2048x1152
            - 3840x2160
            - 2160x3840
          examples:
            - 1024x1024
        quality:
          type: string
          description: |
            图像渲染质量：
              - low：速度最快，适合草图、缩略图和快速迭代
              - medium：中等质量
              - high：高质量，适合最终输出资源
              - auto（默认）：由模型自动选择最佳质量
          default: auto
          enum:
            - auto
            - low
            - medium
            - high
          examples:
            - high
        output_format:
          type: string
          description: |
            输出图像的文件格式（Image API 返回 base64 编码数据）：
              - png（默认）
              - jpeg（速度比 png 更快，延迟敏感场景推荐）
              - webp
          default: png
          enum:
            - png
            - jpeg
            - webp
          examples:
            - png
        output_compression:
          type: integer
          description: |
            图像压缩级别，仅对 jpeg 和 webp 格式有效，范围 0-100（百分比）。
            例如：50 表示压缩 50%。
          minimum: 0
          maximum: 100
          examples:
            - 80
        background:
          type: string
          description: |
            背景设置：
              - opaque：不透明背景
              - auto（默认）：由模型自动选择
            注意：gpt-image-2 不支持 transparent（透明背景），请勿传入。
          default: auto
          enum:
            - auto
            - opaque
          examples:
            - auto
        moderation:
          type: string
          description: |
            内容审核严格程度：
              - auto（默认）：标准过滤，限制特定类别的潜在不当内容
              - low：较宽松的过滤策略
          default: auto
          enum:
            - auto
            - low
          examples:
            - auto
        stream:
          type: boolean
          description: |
            是否启用流式传输，边生成边返回部分图像。
            配合 partial_images 参数使用。
          default: false
          examples:
            - false
        partial_images:
          type: integer
          description: |
            流式传输时接收的部分图像数量（0-3）：
              - 0：仅返回最终图像
              - 1~3：返回指定数量的部分图像（中间进度图），
                     如果最终图像生成速度较快，实际收到的数量可能少于请求数量
            仅在 stream: true 时有效。
          minimum: 0
          maximum: 3
          default: 0
          examples:
            - 2
      x-apifox-orders:
        - model
        - prompt
        - "n"
        - size
        - quality
        - output_format
        - output_compression
        - background
        - moderation
        - stream
        - partial_images
      x-apifox-ignore-properties: []
      x-apifox-folder: ""
    ImageResponse:
      type: object
      properties:
        created:
          type: integer
          description: 响应创建时间（Unix 时间戳）
          examples:
            - 1713000000
        data:
          type: array
          items:
            type: object
            properties:
              b64_json:
                type: string
                description: Base64 编码的图像数据（当 response_format 为 b64_json 时）
              url:
                type: string
                description: 图像的临时 URL（当 response_format 为 url 时）
              revised_prompt:
                type: string
                description: 模型对原始提示词的修订版本（Responses API 中可见）
            x-apifox-orders:
              - b64_json
              - url
              - revised_prompt
            x-apifox-ignore-properties: []
      x-apifox-orders:
        - created
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ""
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      description: OpenAI API Key，格式：Bearer sk-xxxx
servers: []
security:
  - BearerAuth: []
    x-apifox:
      schemeGroups:
        - id: hHguUxx5c2ZJ0FvdOnNQo
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: hHguUxx5c2ZJ0FvdOnNQo
      scopes:
        hHguUxx5c2ZJ0FvdOnNQo:
          BearerAuth: []
```

# 编辑图像（Image Editing / Inpainting）

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ""
  description: ""
  version: 1.0.0
paths:
  /images/edits:
    post:
      summary: 编辑图像（Image Editing / Inpainting）
      deprecated: false
      description: |
        对已有图像进行编辑，支持：
        1. 使用多张参考图生成新图像
        2. 使用遮罩（mask）局部修改图像（Inpainting）

        **请求格式：multipart/form-data**

        **gpt-image-2 特性：**
        - 始终以高保真度处理图像输入（input_fidelity 参数不可更改）
        - 遮罩为提示词引导式，不保证精确匹配遮罩边界
        - 支持最多 16 张参考图
        - 每张图片 < 50MB，且格式与 mask 一致

        **注意：** 使用参考图会增加 input tokens 数量，从而增加费用。
      operationId: createImageEdit
      tags:
        - 图像编辑
        - 图像编辑
      parameters: []
      requestBody:
        content:
          multipart/form-data:
            encoding:
              mask:
                contentType: image/png
            schema:
              type: object
              properties:
                model:
                  type: string
                  enum:
                    - gpt-image-2
                  default: gpt-image-2
                  description: 使用的模型名称，固定为 gpt-image-2
                  example: gpt-image-2
                image:
                  type: string
                  format: binary
                  description: |
                    需要编辑的原始图像文件（支持上传多张图片作为参考）。
                    格式要求：PNG、JPEG 或 WebP；文件大小 < 50MB。
                    如提供多张图片，mask 将应用于第一张。
                  example: "@body-lotion.png"
                mask:
                  type: string
                  format: binary
                  description: |
                    遮罩图像文件，标识需要编辑的区域（白色/透明区域将被修改）。
                    要求：
                      - 格式和尺寸必须与 image 一致
                      - 必须包含 alpha 通道
                      - 文件大小 < 50MB
                    说明：gpt-image-2 的遮罩为基于提示词的引导，不保证精确匹配遮罩形状。
                  example: ""
                prompt:
                  type: string
                  description: 描述要生成或编辑内容的文字提示词
                  maxLength: 32000
                  examples:
                    - >-
                      A sunlit indoor lounge area with a pool containing a
                      flamingo
                  example: >-
                    Generate a photorealistic image of a gift basket on a white
                    background labeled 'Relax & Unwind' with a ribbon and
                    handwriting-like font, containing all the items in the
                    reference pictures.
                "n":
                  type: integer
                  description: 一次请求生成的图像数量，默认为 1
                  default: 1
                  minimum: 1
                  maximum: 10
                  examples:
                    - 1
                  example: 1
                size:
                  type: string
                  description: |
                    输出图像的分辨率尺寸（同 generations 端点）。
                  default: auto
                  enum:
                    - auto
                    - 1024x1024
                    - 1536x1024
                    - 1024x1536
                    - 2048x2048
                    - 2048x1152
                    - 3840x2160
                    - 2160x3840
                  examples:
                    - 1024x1024
                  example: 1024x1024
                quality:
                  type: string
                  description: |
                    图像渲染质量：low / medium / high / auto（默认）
                  default: auto
                  enum:
                    - auto
                    - low
                    - medium
                    - high
                  examples:
                    - high
                  example: high
                output_format:
                  type: string
                  description: 输出格式：png（默认）/ jpeg / webp
                  default: png
                  enum:
                    - png
                    - jpeg
                    - webp
                  examples:
                    - png
                  example: png
                output_compression:
                  type: integer
                  description: 压缩级别 0-100，仅对 jpeg 和 webp 有效
                  minimum: 0
                  maximum: 100
                  examples:
                    - 80
                  example: 80
                background:
                  type: string
                  description: 背景设置：auto（默认）/ opaque；gpt-image-2 不支持 transparent
                  default: auto
                  enum:
                    - auto
                    - opaque
                  examples:
                    - auto
                  example: auto
                moderation:
                  type: string
                  description: 内容审核：auto（默认）/ low
                  default: auto
                  enum:
                    - auto
                    - low
                  examples:
                    - auto
                  example: auto
              required:
                - model
                - image
                - prompt
      responses:
        "200":
          description: 图像编辑成功
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ImageResponse"
              example:
                created: 1713000000
                data:
                  - b64_json: iVBORw0KGgoAAAANSUhEUgAA...
          headers: {}
          x-apifox-name: ""
        "400":
          description: 请求参数错误（如 mask 格式不符、尺寸不匹配等）
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
                x-apifox-ignore-properties: []
              example:
                error:
                  message: Image and mask must be the same size.
                  type: invalid_request_error
          headers: {}
          x-apifox-name: ""
        "401":
          description: API Key 无效
          content:
            application/json:
              schema:
                type: object
                properties: {}
                x-apifox-orders: []
                x-apifox-ignore-properties: []
              example:
                error:
                  message: Incorrect API key provided.
                  type: invalid_request_error
          headers: {}
          x-apifox-name: ""
      security:
        - BearerAuth: []
          x-apifox:
            schemeGroups:
              - id: hHguUxx5c2ZJ0FvdOnNQo
                schemeIds:
                  - BearerAuth
            required: true
            use:
              id: hHguUxx5c2ZJ0FvdOnNQo
            scopes:
              hHguUxx5c2ZJ0FvdOnNQo:
                BearerAuth: []
      x-apifox-folder: 图像编辑
      x-apifox-status: released
      x-run-in-apifox: https://app.apifox.com/web/project/8161229/apis/api-447974299-run
components:
  schemas:
    ImageResponse:
      type: object
      properties:
        created:
          type: integer
          description: 响应创建时间（Unix 时间戳）
          examples:
            - 1713000000
        data:
          type: array
          items:
            type: object
            properties:
              b64_json:
                type: string
                description: Base64 编码的图像数据（当 response_format 为 b64_json 时）
              url:
                type: string
                description: 图像的临时 URL（当 response_format 为 url 时）
              revised_prompt:
                type: string
                description: 模型对原始提示词的修订版本（Responses API 中可见）
            x-apifox-orders:
              - b64_json
              - url
              - revised_prompt
            x-apifox-ignore-properties: []
      x-apifox-orders:
        - created
        - data
      x-apifox-ignore-properties: []
      x-apifox-folder: ""
  securitySchemes:
    BearerAuth:
      type: bearer
      scheme: bearer
      description: OpenAI API Key，格式：Bearer sk-xxxx
servers: []
security:
  - BearerAuth: []
    x-apifox:
      schemeGroups:
        - id: hHguUxx5c2ZJ0FvdOnNQo
          schemeIds:
            - BearerAuth
      required: true
      use:
        id: hHguUxx5c2ZJ0FvdOnNQo
      scopes:
        hHguUxx5c2ZJ0FvdOnNQo:
          BearerAuth: []
```

# ImageGenerationRequest

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ""
  description: ""
  version: 1.0.0
paths: {}
components:
  schemas:
    ImageGenerationRequest:
      type: object
      required:
        - model
        - prompt
      properties:
        model:
          type: string
          enum:
            - gpt-image-2
          default: gpt-image-2
          description: 使用的模型名称，固定为 gpt-image-2
        prompt:
          type: string
          description: 描述要生成图像内容的文字提示词
          maxLength: 32000
          examples:
            - >-
              A children's book drawing of a veterinarian using a stethoscope to
              listen to the heartbeat of a baby otter.
        "n":
          type: integer
          description: 一次请求生成的图像数量，默认为 1
          default: 1
          minimum: 1
          maximum: 10
          examples:
            - 1
        size:
          type: string
          description: |
            生成图像的分辨率尺寸。
            常用尺寸：
              - 1024x1024（方形，速度最快）
              - 1536x1024（横向）
              - 1024x1536（纵向）
              - 2048x2048（2K 方形）
              - 2048x1152（2K 横向）
              - 3840x2160（4K 横向）
              - 2160x3840（4K 纵向）
              - auto（默认，由模型自动选择最佳尺寸）
            尺寸限制：
              - 最大边长 ≤ 3840px
              - 两边均为 16px 的倍数
              - 长宽比不超过 3:1
              - 总像素数在 655,360 ~ 8,294,400 之间
          default: auto
          enum:
            - auto
            - 1024x1024
            - 1536x1024
            - 1024x1536
            - 2048x2048
            - 2048x1152
            - 3840x2160
            - 2160x3840
          examples:
            - 1024x1024
        quality:
          type: string
          description: |
            图像渲染质量：
              - low：速度最快，适合草图、缩略图和快速迭代
              - medium：中等质量
              - high：高质量，适合最终输出资源
              - auto（默认）：由模型自动选择最佳质量
          default: auto
          enum:
            - auto
            - low
            - medium
            - high
          examples:
            - high
        output_format:
          type: string
          description: |
            输出图像的文件格式（Image API 返回 base64 编码数据）：
              - png（默认）
              - jpeg（速度比 png 更快，延迟敏感场景推荐）
              - webp
          default: png
          enum:
            - png
            - jpeg
            - webp
          examples:
            - png
        output_compression:
          type: integer
          description: |
            图像压缩级别，仅对 jpeg 和 webp 格式有效，范围 0-100（百分比）。
            例如：50 表示压缩 50%。
          minimum: 0
          maximum: 100
          examples:
            - 80
        background:
          type: string
          description: |
            背景设置：
              - opaque：不透明背景
              - auto（默认）：由模型自动选择
            注意：gpt-image-2 不支持 transparent（透明背景），请勿传入。
          default: auto
          enum:
            - auto
            - opaque
          examples:
            - auto
        moderation:
          type: string
          description: |
            内容审核严格程度：
              - auto（默认）：标准过滤，限制特定类别的潜在不当内容
              - low：较宽松的过滤策略
          default: auto
          enum:
            - auto
            - low
          examples:
            - auto
        stream:
          type: boolean
          description: |
            是否启用流式传输，边生成边返回部分图像。
            配合 partial_images 参数使用。
          default: false
          examples:
            - false
        partial_images:
          type: integer
          description: |
            流式传输时接收的部分图像数量（0-3）：
              - 0：仅返回最终图像
              - 1~3：返回指定数量的部分图像（中间进度图），
                     如果最终图像生成速度较快，实际收到的数量可能少于请求数量
            仅在 stream: true 时有效。
          minimum: 0
          maximum: 3
          default: 0
          examples:
            - 2
      x-apifox-orders:
        - model
        - prompt
        - "n"
        - size
        - quality
        - output_format
        - output_compression
        - background
        - moderation
        - stream
        - partial_images
      x-apifox-folder: ""
  securitySchemes: {}
servers: []
security: []
```

# ImageEditRequest

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ""
  description: ""
  version: 1.0.0
paths: {}
components:
  schemas:
    ImageEditRequest:
      type: object
      required:
        - model
        - image
        - prompt
      properties:
        model:
          type: string
          enum:
            - gpt-image-2
          default: gpt-image-2
          description: 使用的模型名称，固定为 gpt-image-2
        image:
          type: string
          format: binary
          description: |
            需要编辑的原始图像文件（支持上传多张图片作为参考）。
            格式要求：PNG、JPEG 或 WebP；文件大小 < 50MB。
            如提供多张图片，mask 将应用于第一张。
        mask:
          type: string
          format: binary
          description: |
            遮罩图像文件，标识需要编辑的区域（白色/透明区域将被修改）。
            要求：
              - 格式和尺寸必须与 image 一致
              - 必须包含 alpha 通道
              - 文件大小 < 50MB
            说明：gpt-image-2 的遮罩为基于提示词的引导，不保证精确匹配遮罩形状。
        prompt:
          type: string
          description: 描述要生成或编辑内容的文字提示词
          maxLength: 32000
          examples:
            - A sunlit indoor lounge area with a pool containing a flamingo
        "n":
          type: integer
          description: 一次请求生成的图像数量，默认为 1
          default: 1
          minimum: 1
          maximum: 10
          examples:
            - 1
        size:
          type: string
          description: |
            输出图像的分辨率尺寸（同 generations 端点）。
          default: auto
          enum:
            - auto
            - 1024x1024
            - 1536x1024
            - 1024x1536
            - 2048x2048
            - 2048x1152
            - 3840x2160
            - 2160x3840
          examples:
            - 1024x1024
        quality:
          type: string
          description: |
            图像渲染质量：low / medium / high / auto（默认）
          default: auto
          enum:
            - auto
            - low
            - medium
            - high
          examples:
            - high
        output_format:
          type: string
          description: 输出格式：png（默认）/ jpeg / webp
          default: png
          enum:
            - png
            - jpeg
            - webp
          examples:
            - png
        output_compression:
          type: integer
          description: 压缩级别 0-100，仅对 jpeg 和 webp 有效
          minimum: 0
          maximum: 100
          examples:
            - 80
        background:
          type: string
          description: 背景设置：auto（默认）/ opaque；gpt-image-2 不支持 transparent
          default: auto
          enum:
            - auto
            - opaque
          examples:
            - auto
        moderation:
          type: string
          description: 内容审核：auto（默认）/ low
          default: auto
          enum:
            - auto
            - low
          examples:
            - auto
      x-apifox-orders:
        - model
        - image
        - mask
        - prompt
        - "n"
        - size
        - quality
        - output_format
        - output_compression
        - background
        - moderation
      x-apifox-folder: ""
  securitySchemes: {}
servers: []
security: []
```

# ImageResponse

## OpenAPI Specification

```yaml
openapi: 3.0.1
info:
  title: ""
  description: ""
  version: 1.0.0
paths: {}
components:
  schemas:
    ImageResponse:
      type: object
      properties:
        created:
          type: integer
          description: 响应创建时间（Unix 时间戳）
          examples:
            - 1713000000
        data:
          type: array
          items:
            type: object
            properties:
              b64_json:
                type: string
                description: Base64 编码的图像数据（当 response_format 为 b64_json 时）
              url:
                type: string
                description: 图像的临时 URL（当 response_format 为 url 时）
              revised_prompt:
                type: string
                description: 模型对原始提示词的修订版本（Responses API 中可见）
            x-apifox-orders:
              - b64_json
              - url
              - revised_prompt
      x-apifox-orders:
        - created
        - data
      x-apifox-folder: ""
  securitySchemes: {}
servers: []
security: []
```
