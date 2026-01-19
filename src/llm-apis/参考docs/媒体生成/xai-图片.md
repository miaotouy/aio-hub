#### Guides

# Image Generations

Some of the models can provide image generation capabilities. You can provide some descriptions of the image you would like to generate, and let the model generate one or multiple pictures in the output.

If you're used to interacting with the chat/image-understanding models, the image generation is a bit different from them.
You only need to send a prompt text in the request, instead of a list of messages with system/user/assistant roles.
When you sent the prompt for image generation, your prompt will be revised by a chat model, and then sent to the image generation model.

## Parameters

* `n`: Number of image(s) to generate (1-10, default to 1)
* `response_format`: `"url"` or `"b64_json"`. If `"url"` is specified, the response will return a url to the image(s) in `data[index].url`; if "b64\_json" is specified, the response will return the image(s) in base64 encoded format in `data[index].b64_json`.

> Note: `quality`, `size` or `style` are not supported by xAI API at the moment.

## Generate an image

The image generation is offered at a different endpoint `https://api.x.ai/v1/images/generations` from the chat and image-understanding models that share `https://api.x.ai/v1/chat/completions`.
The endpoint is **compatible with OpenAI SDK** (but **not with Anthropic SDK**), so you can keep using the same `base_url` of `https://api.x.ai/v1`.

You can set `"model": "grok-2-image"` in the request body to use the model. The generated image will be in `jpg` format.

```pythonXAI
import os

from xai_sdk import Client

client = Client(api_key=os.getenv('XAI_API_KEY'))

response = client.image.sample(
    model="grok-2-image",
    prompt="A cat in a tree",
    image_format="url"
)

print(response.url)
```

```pythonOpenAISDK
import os
from openai import OpenAI

XAI_API_KEY = os.getenv("XAI_API_KEY")
client = OpenAI(base_url="https://api.x.ai/v1", api_key=XAI_API_KEY)

response = client.images.generate(
    model="grok-2-image",
    prompt="A cat in a tree"
)

print(response.data[0].url)
```

```javascriptOpenAISDK
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: "<api key>",
    baseURL: "https://api.x.ai/v1",
});

const response = await openai.images.generate({
    model: "grok-2-image",
    prompt: "A cat in a tree",
});
console.log(response.data[0].url);
```

```bash
curl -X 'POST' https://api.x.ai/v1/images/generations \\
-H 'accept: application/json' \\
-H 'Authorization: Bearer <API_KEY>' \\
-H 'Content-Type: application/json' \\
-d '{
    "model": "grok-2-image",
    "prompt": "A cat in a tree"
}'
```

The Python and JavaScript examples will print out url of the image on xAI managed storage.

This is an example image generated from the above prompt:

### Base 64 JSON Output

Instead of getting an image url by default, you can choose to get a base64 encoded image instead.
To do so, you need to specify the `response_format` parameter to `"b64_json"`.

```pythonXAI
import os

from xai_sdk import Client

client = Client(api_key=os.getenv('XAI_API_KEY'))

response = client.image.sample(
    model="grok-2-image",
    prompt="A cat in a tree",
    image_format="base64"
)

print(response.image) # returns the raw image bytes
```

```pythonOpenAISDK
import os

from openai import OpenAI

XAI_API_KEY = os.getenv("XAI_API_KEY")
client = OpenAI(base_url="https://api.x.ai/v1", api_key=XAI_API_KEY)

response = client.images.generate(
    model="grok-2-image",
    prompt="A cat in a tree",
    response_format="b64_json"
)

print(response.data[0].b64_json)
```

```javascriptOpenAISDK
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: "<api key>",
    baseURL: "https://api.x.ai/v1",
});

const response = await openai.images.generate({
    model: "grok-2-image",
    prompt: "A cat in a tree",
    response_format: "b64_json"
});
console.log(response.data[0].b64_json);
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { experimental_generateImage as generateImage } from 'ai';

const result = await generateImage({
  model: xai.image('grok-2-image'),
  prompt: 'A cat in a tree',
});

console.log(result.image.base64Data);
```

```bash
curl -X 'POST' https://api.x.ai/v1/images/generations \\
-H 'accept: application/json' \\
-H 'Authorization: Bearer <API_KEY>' \\
-H 'Content-Type: application/json' \\
-d '{
    "model": "grok-2-image",
    "prompt": "A cat in a tree",
    "response_format": "b64_json"
}'
```

You will get a `b64_json` field instead of `url` in the response image object.

### Generating multiple images

You can generate up to 10 images in one request by adding a parameter `n` in your request body. For example, to generate four images:

```pythonXAI
import os

from xai_sdk import Client

client = Client(api_key=os.getenv('XAI_API_KEY'))

response = client.image.sample_batch(
    model="grok-2-image",
    prompt="A cat in a tree",
    n=4
    image_format="url",
)

for image in response:
    print(response.url)
```

```pythonOpenAISDK
import os

from openai import OpenAI

XAI_API_KEY = os.getenv("XAI_API_KEY")
client = OpenAI(base_url="https://api.x.ai/v1", api_key=XAI_API_KEY)

responses = client.images.generate(
    model="grok-2-image",
    prompt="A cat in a tree"
    n=4
)
for response in responses:
    print(response.url)
```

```javascriptOpenAISDK
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: "<api key>",
    baseURL: "https://api.x.ai/v1",
});

const response = await openai.images.generate({
    model: "grok-2-image",
    prompt: "A cat in a tree",
    n: 4
});
response.data.forEach((image) => {
    console.log(image.url);
});
```

```javascriptAISDK
import { xai } from '@ai-sdk/xai';
import { experimental_generateImage as generateImage } from 'ai';

const result = await generateImage({
  model: xai.image('grok-2-image'),
  prompt: 'A cat in a tree',
  n: 4,
});

console.log(result.images);
```

```bash
curl -X 'POST' https://api.x.ai/v1/images/generations \\
-H 'accept: application/json' \\
-H 'Authorization: Bearer <API_KEY>' \\
-H 'Content-Type: application/json' \\
-d '{
    "model": "grok-2-image",
    "prompt": "A cat in a tree",
    "n": 4
}'
```

## Revised prompt

If you inspect the response object, you can see something similar to this:

```json
{
  "data": [
    {
      "b64_json": "data:image/png;base64,...",
      "revised_prompt": "..."
    }
  ]
}
```

Before sending the prompt to the image generation model, the prompt will be revised by a chat model. The revised prompt from chat model will be used by image generation model to create the image, and returned in `revised_prompt` to the user.

To see the revised prompt with SDK:

```pythonXAI
# ... Steps to make image generation request

print(response.prompt)
```

```pythonOpenAISDK
# ... Steps to make image generation request

print(response.data[0].revised_prompt)
```

```javascriptOpenAISDK
// ... Steps to make image generation request

console.log(response.data[0].revised_prompt);
```

For example:
| Input/Output | Example |
|------------------------------------ | -------- |
| prompt (in request body) | A cat in a tree |
| revised\_prompt (in response body) | 3D render of a gray cat with green eyes perched on a thick branch of a leafy tree, set in a suburban backyard during the day. The cat's fur is slightly ruffled by a gentle breeze, and it is looking directly at the viewer. The background features a sunny sky with a few clouds and other trees, creating a natural and serene environment. The scene is focused on the cat, with no distracting foreground elements, ensuring the cat remains the central subject of the image. |
